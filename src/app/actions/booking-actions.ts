
'use server';

import { query, collection, where, Timestamp, writeBatch } from 'firebase/firestore';
import { sendManualRescheduleEmail } from './send-email';
import { cleanupTrips } from './cleanup-trips';
import type { Booking } from '@/lib/types';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { assignBookingToTrip } from './create-booking-and-assign-trip';

export async function deleteBooking(id: string): Promise<void> {
  const db = getFirebaseAdmin()?.firestore();
  if (!db) {
    throw new Error("Database not available");
  }
  const bookingDocRef = db.collection('bookings').doc(id);
  const bookingSnap = await bookingDocRef.get();
  
  if (bookingSnap.exists) {
      const bookingData = bookingSnap.data();
      // Use Firestore Admin to delete doc
      await bookingDocRef.delete();
      
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
    
    // We use a basic collection reference for deletion logic
    const bookingsRef = db.collection('bookings');
    let snapshot;

    if (startDate && endDate) {
        const startTimestamp = Timestamp.fromDate(startDate);
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        const endTimestamp = Timestamp.fromDate(endOfDay);
        
        const q = bookingsRef
          .where('createdAt', '>=', startTimestamp)
          .where('createdAt', '<=', endTimestamp);
        
        snapshot = await q.get();
    } else {
        snapshot = await bookingsRef.get();
    }
    
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
