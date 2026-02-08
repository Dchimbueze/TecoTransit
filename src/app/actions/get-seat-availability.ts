
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { PriceRule, Trip, SeatAvailability } from "@/lib/types";
import { vehicleOptions } from "@/lib/constants";

export async function getSeatAvailability(
    pickup: string,
    destination: string,
    vehicleType: string,
    date: string
): Promise<SeatAvailability> {
    const admin = getFirebaseAdmin();
    const db = admin?.firestore();
    if (!db) {
        throw new Error("Database connection failed.");
    }

    const priceRuleId = `${pickup}_${destination}_${vehicleType}`.toLowerCase().replace(/\s+/g, '-');
    const now = Date.now();

    try {
        const priceRuleRef = db.collection('prices').doc(priceRuleId);
        const priceRuleSnap = await priceRuleRef.get();

        // If no price rule exists, or vehicle count is explicitly 0, return no availability.
        if (!priceRuleSnap.exists) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const priceRule = priceRuleSnap.data() as PriceRule;
        
        if (priceRule.vehicleCount === 0) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const vehicleKey = Object.keys(vehicleOptions).find(
            key => vehicleOptions[key as keyof typeof vehicleOptions].name === priceRule.vehicleType
        ) as keyof typeof vehicleOptions | undefined;

        if (!vehicleKey) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
        const totalCapacity = (priceRule.vehicleCount || 0) * capacityPerVehicle;

        // Query all trips for this route and date to aggregate occupied seats
        const tripsQuery = db.collection('trips')
            .where('priceRuleId', '==', priceRuleId)
            .where('date', '==', date);

        const tripsSnapshot = await tripsQuery.get();
        let occupiedSeatsCount = 0;

        tripsSnapshot.forEach(doc => {
            const trip = doc.data() as Trip;
            // Only count passengers whose hold hasn't expired, or who are confirmed (no heldUntil)
            const activePassengers = (trip.passengers || []).filter(p => {
                if (p.heldUntil && p.heldUntil < now) {
                    return false;
                }
                return true;
            });
            occupiedSeatsCount += activePassengers.length;
        });

        const availableSeatsCount = Math.max(0, totalCapacity - occupiedSeatsCount);

        // DEBUG LOGGING
        console.log(`[getSeatAvailability] Route: ${pickup}->${destination}, Vehicle: ${vehicleType}, Date: ${date}, Occupied: ${occupiedSeatsCount}, Capacity: ${totalCapacity}, Available: ${availableSeatsCount}`);

        return {
            availableSeats: availableSeatsCount,
            totalCapacity,
            isFull: availableSeatsCount <= 0,
        };

    } catch (error) {
        console.error("Error calculating seat availability:", error);
        throw new Error("Failed to fetch seat availability.");
    }
}
