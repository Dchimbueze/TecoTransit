
'use server';

import { doc, updateDoc, deleteDoc, getDoc, getDocs, query, collection, where, Timestamp, writeBatch } from 'firebase/firestore';
import { sendBookingStatusEmail, sendManualRescheduleEmail, sendRefundRequestEmail } from './send-email';
import { cleanupTrips } from './cleanup-trips';
import type { Booking, Trip } from '@/lib/types';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { assignBookingToTrip } from './create-booking-and-assign-trip';
import Paystack from 'paystack';

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY is not set in environment variables.');
}

const paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);

/**
 * Updates a booking status. If cancelled, it cleans up the associated trip manifest.
 */
export async function updateBookingStatus(bookingId: string, status: 'Cancelled'): Promise<void> {
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

  await bookingDocRef.update({ status });

  // If assigned to a trip, we need to remove all group members from the manifest
  if (bookingToUpdate.tripId) {
    await cleanupTrips([bookingId]);
  }

  try {
    await sendBookingStatusEmail({
        name: bookingToUpdate.name,
        email: bookingToUpdate.email,
        status: status,
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

/**
 * Initiates a refund request to the admin.
 */
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
        return { success: false, message: "This booking has no payment reference for automatic refund processing." };
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

/**
 * Deletes a booking record and cleans its trip manifest.
 */
export async function deleteBooking(id: string): Promise<void> {
  const db = getFirebaseAdmin()?.firestore();
  if (!db) {
    throw new Error("Database not available");
  }
  const bookingDocRef = db.collection('bookings').doc(id);
  const bookingSnap = await bookingDocRef.get();
  
  if (bookingSnap.exists) {
      const bookingData = bookingSnap.data();
      await bookingDocRef.delete();
      
      if (bookingData && bookingData.tripId) {
          await cleanupTrips([id]);
      }
  }
}

/**
 * Deletes all bookings within a date range (Maintenance utility).
 */
export async function deleteBookingsInRange(startDate: Date | null, endDate: Date | null): Promise<number> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
      throw new Error("Database not available");
    }
    
    let bookingsQuery = db.collection('bookings');

    if (startDate && endDate) {
        const startTimestamp = Timestamp.fromDate(startDate);
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        const endTimestamp = Timestamp.fromDate(endOfDay);
        
        bookingsQuery = db.collection('bookings')
          .where('createdAt', '>=', startTimestamp)
          .where('createdAt', '<=', endTimestamp);
    }
    
    const snapshot = await bookingsQuery.get();
    if (snapshot.empty) {
        return 0;
    }
    
    const deletedBookingIds: string[] = [];
    const batches = [];
    let currentBatch = db.batch();
    let currentBatchSize = 0;

    for (const doc of snapshot.docs) {
        if (doc.data().tripId) {
            deletedBookingIds.push(doc.id);
        }
        currentBatch.delete(doc.ref);
        currentBatchSize++;

        if (currentBatchSize === 500) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            currentBatchSize = 0;
        }
    }

    if (currentBatchSize > 0) {
        batches.push(currentBatch);
    }

    await Promise.all(batches.map(batch => batch.commit()));

    if (deletedBookingIds.length > 0) {
        await cleanupTrips(deletedBookingIds);
    }
    
    return snapshot.size;
}

/**
 * Manually moves a group booking to a new date and re-assigns them.
 */
export async function manuallyRescheduleBooking(bookingId: string, newDate: string): Promise<{success: boolean; error?: string}> {
    const adminDb = getFirebaseAdmin()?.firestore();
    if (!adminDb) {
        return { success: false, error: "Database connection failed." };
    }

    const bookingRef = adminDb.collection('bookings').doc(bookingId);

    try {
        let bookingForAssignment: any;

        await adminDb.runTransaction(async (transaction) => {
            const bookingDoc = await transaction.get(bookingRef);
            if (!bookingDoc.exists) {
                throw new Error(`Booking ${bookingId} not found.`);
            }
            const bookingData = bookingDoc.data() as Booking;
            const oldTripId = bookingData.tripId;

            bookingForAssignment = {
                ...bookingData,
                id: bookingDoc.id,
                intendedDate: newDate,
                createdAt: (bookingData.createdAt as any), 
            };

            // CLEANUP: Remove ALL group members from the old manifest
            if (oldTripId) {
                const oldTripRef = adminDb.collection('trips').doc(oldTripId);
                const oldTripDoc = await transaction.get(oldTripRef);
                
                if (oldTripDoc.exists) {
                    const oldTripData = oldTripDoc.data() as Trip;
                    // Filter out ALL manifest entries associated with this bookingId
                    const updatedPassengers = oldTripData.passengers.filter(p => p.bookingId !== bookingId);
                    
                    transaction.update(oldTripRef, {
                        passengers: updatedPassengers,
                        isFull: updatedPassengers.length >= oldTripData.capacity
                    });
                }
            }

            // Reset booking for fresh assignment
            transaction.update(bookingRef, {
                intendedDate: newDate,
                tripId: FieldValue.delete(),
                rescheduledCount: FieldValue.increment(1) 
            });
        });

        // Re-assign to a new manifest for the new date (as an atomic unit)
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
