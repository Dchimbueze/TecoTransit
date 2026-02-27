
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
 * the entire group (booking) to a trip on the current day.
 * 
 * This processes UNIQUE bookings within the trip manifest to ensure groups stay together.
 */
export async function rescheduleUnderfilledTrips(): Promise<RescheduleResult> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        throw new Error("Database connection failed.");
    }

    const yesterday = subDays(startOfDay(new Date()), 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
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
            
            // Get unique booking IDs from this trip manifest
            const uniqueBookingIds = Array.from(new Set(trip.passengers.map(p => p.bookingId)));
            result.totalPassengersToProcess += trip.passengers.length;

            for (const bookingId of uniqueBookingIds) {
                const bookingRef = db.collection('bookings').doc(bookingId);
                const oldTripRef = tripDoc.ref;
                let emailProps: any = null;
                let bookingForAssignment: any = null;

                try {
                    await db.runTransaction(async (transaction) => {
                        const bookingDoc = await transaction.get(bookingRef);
                        if (!bookingDoc.exists) {
                            throw new Error(`Booking ${bookingId} not found during transaction.`);
                        }
                        const bookingData = { id: bookingDoc.id, ...bookingDoc.data() } as any;
                        
                        // Skip if user opted out, booking was cancelled, or already rescheduled once
                        if (!bookingData.allowReschedule || bookingData.status === 'Cancelled') {
                            result.skippedCount += (bookingData.passengers?.length || 1);
                            return;
                        }
                        
                        if ((bookingData.rescheduledCount || 0) >= 1) {
                            result.skippedCount += (bookingData.passengers?.length || 1);
                            await sendRescheduleFailedEmail(bookingData as Booking);
                            return;
                        }

                        // Update booking to new date, remove old tripId, and increment reschedule count
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

                    // If transaction was successful, re-assign group to a new trip and send email
                    if (bookingForAssignment && emailProps) {
                       await assignBookingToTrip(bookingForAssignment);
                       await sendBookingRescheduledEmail(emailProps);
                       result.rescheduledCount += (bookingForAssignment.passengers?.length || 1);
                    }

                } catch (e: any) {
                    result.failedCount++;
                    const errorMessage = `Failed to process booking ${bookingId}: ${e.message}`;
                    result.errors.push(errorMessage);
                    console.error(errorMessage, e);
                }
            }

            // After processing all unique bookings for the trip, delete the old trip document.
            try {
                await tripDoc.ref.delete();
            } catch (deleteError: any) {
                console.error(`Failed to delete old trip ${tripDoc.id}:`, deleteError);
            }
        }
        
        return result;

    } catch (error: any) {
        console.error("A critical error occurred during the rescheduling process:", error);
        throw new Error("Failed to execute reschedule job due to a server error.");
    }
}
