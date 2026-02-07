
'use server';

import { doc, updateDoc, deleteDoc, getDoc, getDocs, query, collection, where, Timestamp, writeBatch } from 'firebase/firestore';
import { sendBookingStatusEmail, sendManualRescheduleEmail, sendRefundRequestEmail } from './send-email';
import { cleanupTrips } from './cleanup-trips';
import type { Booking } from '@/lib/types';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { assignBookingToTrip } from './create-booking-and-assign-trip';
import Paystack from 'paystack';

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY is not set in environment variables.');
}

const paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);


export async function updateBookingStatus(bookingId: string, status: Booking['status']): Promise<void> {
  const adminDb = getFirebaseAdmin()?.firestore();
  if (!adminDb) {
    throw new Error("Database connection failed.");
  }
  
  const bookingDocRef = adminDb.collection('bookings').doc(bookingId);
  const bookingSnap = await bookingDocRef.get();

  if (!bookingSnap.exists) {
    throw new Error("Booking not found");
  }
  
  const bookingToUpdate = bookingSnap.data() as Booking;
  const oldStatus = bookingToUpdate.status;

  await bookingDocRef.update({ 
      status,
      updatedAt: FieldValue.serverTimestamp()
  });

  // If cancelling or refunding, we must free the seat
  if (status === 'Cancelled' || status === 'Refunded') {
    if (bookingToUpdate.tripId) {
      await cleanupTrips([bookingId]);
    }
  }

  // If manually confirming or paying, trigger the check for full trip
  if ((status === 'Confirmed' || status === 'Paid') && bookingToUpdate.tripId) {
      const { checkAndConfirmTrip } = await import('./create-booking-and-assign-trip');
      await checkAndConfirmTrip(adminDb, bookingToUpdate.tripId);
  }

  // Send notification for major status changes
  if (status === 'Confirmed' || status === 'Cancelled' || status === 'Refunded') {
    try {
        await sendBookingStatusEmail({
            name: bookingToUpdate.name,
            email: bookingToUpdate.email,
            status: status as any,
            bookingId: bookingId,
            pickup: bookingToUpdate.pickup,
            destination: bookingToUpdate.destination,
            vehicleType: bookingToUpdate.vehicleType,
            totalFare: bookingToUpdate.totalFare,
        });
      } catch (emailError) {
        console.error("Failed to send status update email:", emailError);
      }
  }
}

export async function requestRefund(bookingId: string): Promise<{success: boolean, message: string}> {
    const adminDb = getFirebaseAdmin()?.firestore();
    if (!adminDb) {
      return { success: false, message: "Database connection failed." };
    }
    
    const bookingDocRef = adminDb.collection('bookings').doc(bookingId);
    const bookingSnap = await bookingDocRef.get();

    if (!bookingSnap.exists) {
        return { success: false, message: "Booking not found" };
    }

    const booking = bookingSnap.data() as Booking;
    if (booking.status !== 'Cancelled') {
        return { success: false, message: "Refunds can only be requested for cancelled bookings." };
    }
    if (!booking.paymentReference) {
        return { success: false, message: "This booking has no payment reference, so a refund cannot be processed automatically." };
    }

    try {
        await sendRefundRequestEmail({
            customerName: booking.name,
            customerEmail: booking.email,
            bookingId: bookingId,
            totalFare: booking.totalFare,
            paymentReference: booking.paymentReference,
        });
        return { success: true, message: "Refund request email sent to admin." };
    } catch(error: any) {
        console.error("Failed to send refund request email:", error);
        return { success: false, message: "Failed to send refund request email to admin." };
    }
}

export async function deleteBooking(id: string): Promise<void> {
  const db = getFirebaseAdmin()?.firestore();
  if (!db) {
    throw new Error("Database not available");
  }
  const bookingDocRef = db.collection('bookings').doc(id);
  const bookingSnap = await bookingDocRef.get();
  
  if (bookingSnap.exists) {
      const bookingData = bookingSnap.data();
      await deleteDoc(bookingDocRef);
      
      if (bookingData && bookingData.tripId) {
          await cleanupTrips([id]);
      }
  }
}


export async function deleteBookingsInRange(startDate: Date | null, endDate: Date | null): Promise<number> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
      throw new Error("Database not available");
    }
    
    let bookingsQuery = query(collection(db, 'bookings'));

    if (startDate && endDate) {
        const startTimestamp = Timestamp.fromDate(startDate);
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        const endTimestamp = Timestamp.fromDate(endOfDay);
        
        bookingsQuery = query(
          collection(db, 'bookings'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        );
    }
    
    const snapshot = await getDocs(bookingsQuery);
    if (snapshot.empty) {
        return 0;
    }
    
    const deletedBookingIds: string[] = [];
    const batches = [];
    let currentBatch = writeBatch(db);
    let currentBatchSize = 0;

    for (const doc of snapshot.docs) {
        if (doc.data().tripId) {
            deletedBookingIds.push(doc.id);
        }
        currentBatch.delete(doc.ref);
        currentBatchSize++;

        if (currentBatchSize === 500) {
            batches.push(currentBatch);
            currentBatch = writeBatch(db);
            currentBatchSize = 0;
        }
    }

    if (currentBatchSize > 0) {
        batches.push(currentBatch);
    }

    await Promise.all(batches.map(batch => batch.commit()));

    if (deletedBookingIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < deletedBookingIds.length; i += chunkSize) {
        const chunk = deletedBookingIds.slice(i, i + chunkSize);
        await cleanupTrips(chunk);
      }
    }
    
    return snapshot.size;
}


export async function manuallyRescheduleBooking(bookingId: string, newDate: string): Promise<{success: boolean; error?: string}> {
    const adminDb = getFirebaseAdmin()?.firestore();
    if (!adminDb) {
        return { success: false, error: "Database connection failed." };
    }

    const bookingRef = adminDb.collection('bookings').doc(bookingId);

    try {
        let oldTripId: string | undefined;
        let bookingForAssignment: any;

        await adminDb.runTransaction(async (transaction) => {
            const bookingDoc = await transaction.get(bookingRef);
            if (!bookingDoc.exists) {
                throw new Error(`Booking ${bookingId} not found.`);
            }
            const bookingData = bookingDoc.data() as Booking;
            oldTripId = bookingData.tripId;

            bookingForAssignment = {
                ...bookingData,
                id: bookingDoc.id,
                intendedDate: newDate,
                createdAt: (bookingData.createdAt as any), 
            };

            if (oldTripId) {
                const oldTripRef = adminDb.collection('trips').doc(oldTripId);
                const passengerToRemove = {
                    bookingId: bookingId,
                    name: bookingData.name,
                    phone: bookingData.phone
                };
                transaction.update(oldTripRef, {
                    passengers: FieldValue.arrayRemove(passengerToRemove)
                });
            }

            transaction.update(bookingRef, {
                intendedDate: newDate,
                tripId: FieldValue.delete(),
                rescheduledCount: FieldValue.increment(bookingData.rescheduledCount ? 1 : 1) 
            });
        });

        await assignBookingToTrip(bookingForAssignment);

        await sendManualRescheduleEmail({
            name: bookingForAssignment.name,
            email: bookingForAssignment.email,
            bookingId: bookingForAssignment.id,
            newDate: newDate,
            pickup: bookingForAssignment.pickup,
            destination: bookingForAssignment.destination,
        });

        return { success: true };

    } catch (error: any) {
        console.error(`Manual reschedule failed for booking ${bookingId}:`, error);
        return { success: false, error: error.message };
    }
}
