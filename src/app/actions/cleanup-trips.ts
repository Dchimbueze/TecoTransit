'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { Trip } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Removes passengers from trips if their booking ID is in the provided list
 * OR if their temporary seat hold has expired.
 * @param deletedBookingIds - An array of booking IDs that have been deleted.
 */
export async function cleanupTrips(deletedBookingIds: string[] = []) {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        throw new Error("Database connection failed.");
    }
    
    const now = Date.now();
    const deletedIdsSet = new Set(deletedBookingIds);

    try {
        const tripsRef = db.collection('trips');
        const tripsSnapshot = await tripsRef.get();

        if (tripsSnapshot.empty) {
            return { success: true, message: "No trips to clean." };
        }

        const batch = db.batch();
        let updatedTripsCount = 0;

        tripsSnapshot.forEach(doc => {
            const trip = doc.data() as Trip;
            const initialPassengerCount = trip.passengers.length;

            const updatedPassengers = trip.passengers.filter(passenger => {
                if (deletedIdsSet.has(passenger.bookingId)) return false;
                if (passenger.heldUntil && passenger.heldUntil < now) return false;
                return true;
            });

            if (updatedPassengers.length < initialPassengerCount) {
                updatedTripsCount++;
                const isFull = updatedPassengers.length >= trip.capacity;
                batch.update(doc.ref, { 
                    passengers: updatedPassengers,
                    isFull: isFull 
                });
            }
        });

        if (updatedTripsCount > 0) {
            await batch.commit();
        }

        return { success: true, updatedTrips: updatedTripsCount };

    } catch (error: any) {
        console.error("An error occurred during trip cleanup:", error);
        return { success: false, error: "Failed to clean up trips." };
    }
}
