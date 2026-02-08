'use server';

import { query, collection, where, Timestamp, writeBatch } from 'firebase/firestore';
import { sendManualRescheduleEmail, sendBookingStatusEmail } from './send-email';
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

export async function cancelBooking(id: string): Promise<{success: boolean; error?: string}> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { success: false, error: "Database not available" };
    }

    try {
        const bookingRef = db.collection('bookings').doc(id);
        const bookingSnap = await bookingRef.get();
        
        if (!bookingSnap.exists) {
            throw new Error("Booking not found.");
        }

        const bookingData = bookingSnap.data() as Booking;
        
        await bookingRef.update({
            status: 'Cancelled',
            updatedAt: FieldValue.serverTimestamp()
        });

        if (bookingData.tripId) {
            await cleanupTrips([id]);
        }

        await sendBookingStatusEmail({
            name: bookingData.name,
            email: bookingData.email,
            status: 'Cancelled',
            bookingId: id,
            pickup: bookingData.pickup,
            destination: bookingData.destination,
            vehicleType: bookingData.vehicleType,
            totalFare: bookingData.totalFare
        });

        return { success: true };
    } catch (error: any) {
        console.error("Cancel booking error:", error);
        return { success: false, error: error.message };
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

/**
 * Manually reschedules a booking to a specific new date string.
 * This function handles removing the passenger from their old manifest
 * and re-assigning them to a new trip on the specified date.
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
                createdAt: (bookingData.createdAt as any).toMillis?.() || bookingData.createdAt, 
            };

            // 1. Remove from old trip manifest if it exists
            if (oldTripId) {
                const oldTripRef = adminDb.collection('trips').doc(oldTripId);
                const oldTripDoc = await transaction.get(oldTripRef);
                
                if (oldTripDoc.exists) {
                    const oldTripData = oldTripDoc.data();
                    const updatedPassengers = (oldTripData?.passengers || []).filter((p: any) => p.bookingId !== bookingId);
                    transaction.update(oldTripRef, {
                        passengers: updatedPassengers,
                        isFull: updatedPassengers.length >= (oldTripData?.capacity || 0)
                    });
                }
            }

            // 2. Update the booking document
            transaction.update(bookingRef, {
                intendedDate: newDate,
                tripId: FieldValue.delete(),
                rescheduledCount: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        // 3. Re-assign to a trip on the new date
        // Note: assignBookingToTrip has its own internal transaction
        await assignBookingToTrip(bookingForAssignment);

        // 4. Notify the customer
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
