
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
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        throw new Error("Database connection failed.");
    }

    const priceRuleId = `${pickup}_${destination}_${vehicleType}`.toLowerCase().replace(/\s+/g, '-');

    try {
        const priceRuleRef = db.collection('prices').doc(priceRuleId);
        const priceRuleSnap = await priceRuleRef.get();

        if (!priceRuleSnap.exists) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const priceRule = priceRuleSnap.data() as PriceRule;
        const vehicleKey = Object.keys(vehicleOptions).find(
            key => vehicleOptions[key as keyof typeof vehicleOptions].name === priceRule.vehicleType
        ) as keyof typeof vehicleOptions | undefined;

        if (!vehicleKey) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
        const totalCapacity = (priceRule.vehicleCount || 1) * capacityPerVehicle;

        const tripsQuery = db.collection('trips')
            .where('priceRuleId', '==', priceRuleId)
            .where('date', '==', date);

        const tripsSnapshot = await tripsQuery.get();
        let bookedSeats = 0;

        tripsSnapshot.forEach(doc => {
            const trip = doc.data() as Trip;
            bookedSeats += (trip.passengers || []).length;
        });

        const availableSeats = Math.max(0, totalCapacity - bookedSeats);

        return {
            availableSeats,
            totalCapacity,
            isFull: availableSeats <= 0,
        };

    } catch (error) {
        console.error("Error fetching seat availability:", error);
        throw new Error("Failed to fetch seat availability.");
    }
}
