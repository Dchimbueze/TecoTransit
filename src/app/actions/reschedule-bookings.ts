'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { format, subDays, startOfDay } from 'date-fns';
import { assignBookingToTrip } from "./create-booking-and-assign-trip";
import type { Booking, Trip, Passenger } from "@/lib/types";
import { sendBookingRescheduledEmail, sendRescheduleFailedEmail } from "./send-email";
import { FieldValue } from 'firebase-admin/firestore';

type RescheduleResult = {
    totalTripsScanned: number;
    totalPassengersToProcess: number;
    rescheduledCount: number;
    skippedCount: number;
    failedCount: number;
    errors: string[];
};

/**
 * Finds all trips from the previous day that were not full, attempts to reschedule
 * the passengers to a trip on the current day, and then deletes the old, empty trip.
 * 
 * This action ensures that the process of moving a passenger from an old trip to a new one
 * is handled using stable YYYY-MM-DD date strings.
 */
export async function rescheduleUnderfilledTrips(): Promise<RescheduleResult> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        throw new Error("Database connection failed.");
    }

    // Use UTC/Server time for consistency in the cron job
    const now = new Date();
    const yesterday = subDays(now, 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    const todayStr = format(now, 'yyyy-MM-dd');
    
    const result: RescheduleResult = {
        totalTripsScanned: 0,
        totalPassengersToProcess: 0,
        rescheduledCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errors: [],
    };

    console.log(`[RescheduleJob] Starting job for Yesterday: ${yesterdayStr} -> Today: ${todayStr}`);

    try {
        const underfilledTripsQuery = db.collection('trips')
            .where('date', '==', yesterdayStr)
            .where('isFull', '==', false);
        
        const snapshot = await underfilledTripsQuery.get();
        result.totalTripsScanned = snapshot.size;

        if (snapshot.empty) {
            console.log(`[RescheduleJob] No underfilled trips found for ${yesterdayStr}`);
            return result;
        }

        for (const tripDoc of snapshot.docs) {
            const trip = tripDoc.data() as Trip;
            const passengersToProcess = [...trip.passengers];
            result.totalPassengersToProcess += passengersToProcess.length;

            for (const passenger of passengersToProcess) {
                const bookingRef = db.collection('bookings').doc(passenger.bookingId);
                let bookingForAssignment: any = null;

                try {
                    await db.runTransaction(async (transaction) => {
                        const bookingDoc = await transaction.get(bookingRef);
                        if (!bookingDoc.exists) return;

                        const bookingData = bookingDoc.data() as Booking;
                        
                        // 1. Skip if user opted out or booking was cancelled
                        if (!bookingData.allowReschedule || bookingData.status === 'Cancelled') {
                            result.skippedCount++;
                            return;
                        }
                        
                        // 2. Prevent infinite rescheduling (limit to 1 auto-move)
                        if ((bookingData.rescheduledCount || 0) >= 1) {
                            result.skippedCount++;
                            // Alert admin that this passenger is stuck and needs manual attention
                            await sendRescheduleFailedEmail(bookingData);
                            return; 
                        }

                        // 3. Update booking doc
                        transaction.update(bookingRef, { 
                            intendedDate: todayStr, 
                            tripId: FieldValue.delete(),
                            rescheduledCount: FieldValue.increment(1),
                            updatedAt: FieldValue.serverTimestamp()
                        });

                        bookingForAssignment = {
                            ...bookingData,
                            id: bookingDoc.id,
                            intendedDate: todayStr,
                            createdAt: (bookingData.createdAt as any).toMillis?.() || bookingData.createdAt
                        };
                    });

                    // 4. Assign to new trip if transaction succeeded
                    if (bookingForAssignment) {
                       await assignBookingToTrip(bookingForAssignment);
                       await sendBookingRescheduledEmail({
                           name: bookingForAssignment.name,
                           email: bookingForAssignment.email,
                           bookingId: bookingForAssignment.id,
                           oldDate: yesterdayStr,
                           newDate: todayStr,
                       });
                       result.rescheduledCount++;
                    }

                } catch (e: any) {
                    result.failedCount++;
                    result.errors.push(`Booking ${passenger.bookingId}: ${e.message}`);
                }
            }

            // Cleanup the old trip document
            await tripDoc.ref.delete().catch(e => console.error("Failed to delete trip doc:", e));
        }
        
        return result;

    } catch (error: any) {
        console.error("Critical error in reschedule job:", error);
        throw error;
    }
}
