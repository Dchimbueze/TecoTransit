
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { format, subDays, startOfDay } from 'date-fns';
import { assignBookingToTrip } from "./create-booking-and-assign-trip";
import type { Booking, Trip } from "@/lib/types";
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
 * the entire group (booking) to a trip on the current day.
 */
export async function rescheduleUnderfilledTrips(): Promise<RescheduleResult> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        throw new Error("Database connection failed.");
    }

    // Use startOfDay to ensure we are comparing midnight-to-midnight snapshots
    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);
    
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');
    
    const result: RescheduleResult = {
        totalTripsScanned: 0,
        totalPassengersToProcess: 0,
        rescheduledCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errors: [],
    };

    try {
        const underfilledTripsQuery = db.collection('trips')
            .where('date', '==', yesterdayStr)
            .where('isFull', '==', false);
        
        const snapshot = await underfilledTripsQuery.get();
        result.totalTripsScanned = snapshot.size;

        if (snapshot.empty) {
            return result;
        }

        for (const tripDoc of snapshot.docs) {
            const trip = tripDoc.data() as Trip;
            
            // Get unique booking IDs from this trip manifest to process groups as units
            const uniqueBookingIds = Array.from(new Set(trip.passengers.map(p => p.bookingId)));
            result.totalPassengersToProcess += trip.passengers.length;

            for (const bookingId of uniqueBookingIds) {
                const bookingRef = db.collection('bookings').doc(bookingId);
                let bookingForAssignment: any = null;
                let emailProps: any = null;

                try {
                    await db.runTransaction(async (transaction) => {
                        const bookingDoc = await transaction.get(bookingRef);
                        if (!bookingDoc.exists) return;

                        const bookingData = { id: bookingDoc.id, ...bookingDoc.data() } as any;
                        
                        // Skip if user opted out, booking was cancelled, or already rescheduled once
                        if (!bookingData.allowReschedule || bookingData.status === 'Cancelled') {
                            result.skippedCount += (bookingData.passengers?.length || 1);
                            return;
                        }
                        
                        // Prevent infinite rescheduling loops (limit to 1 auto-reschedule)
                        if ((bookingData.rescheduledCount || 0) >= 1) {
                            result.skippedCount += (bookingData.passengers?.length || 1);
                            // Notify admin that this specific booking needs manual eyes
                            await sendRescheduleFailedEmail(bookingData as Booking);
                            return;
                        }

                        // Update booking to today's date, remove old tripId link, and increment count
                        transaction.update(bookingRef, { 
                            intendedDate: todayStr, 
                            tripId: FieldValue.delete(),
                            rescheduledCount: FieldValue.increment(1)
                        });
                        
                        emailProps = {
                            name: bookingData.name,
                            email: bookingData.email,
                            bookingId: bookingData.id,
                            oldDate: yesterdayStr,
                            newDate: todayStr,
                        };

                        bookingForAssignment = {
                            ...bookingData,
                            intendedDate: todayStr
                        };
                    });

                    if (bookingForAssignment && emailProps) {
                       // Re-assign the entire group to today's manifest
                       await assignBookingToTrip(bookingForAssignment);
                       await sendBookingRescheduledEmail(emailProps);
                       result.rescheduledCount += (bookingForAssignment.passengers?.length || 1);
                    }

                } catch (e: any) {
                    result.failedCount++;
                    result.errors.push(`Failed to process booking ${bookingId}: ${e.message}`);
                }
            }

            // Cleanup: delete the old trip document as it is no longer valid
            await tripDoc.ref.delete().catch(console.error);
        }
        
        return result;

    } catch (error: any) {
        console.error("Critical error in rescheduling job:", error);
        throw new Error("Failed to execute reschedule job.");
    }
}
