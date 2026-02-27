
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { PriceRule, SeatAvailability } from "@/lib/types";
import { vehicleOptions } from "@/lib/constants";

/**
 * Calculates seat availability by summing passenger counts in the bookings collection.
 */
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

        if (!vehicleKey || (priceRule.vehicleCount || 0) <= 0) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
        const totalCapacity = (priceRule.vehicleCount || 1) * capacityPerVehicle;

        // Query all relevant bookings for this route and vehicle
        const bookingsQuery = db.collection('bookings')
            .where('pickup', '==', pickup)
            .where('destination', '==', destination)
            .where('vehicleType', '==', vehicleType);

        const bookingsSnapshot = await bookingsQuery.get();
        
        const now = Date.now();
        const HOLD_WINDOW_MS = 7 * 60 * 1000; // 7 minutes seat hold

        let occupiedSeats = 0;

        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            
            // Only count if it's the right date
            if (booking.intendedDate !== date) return;

            // Only count if it's not cancelled
            if (booking.status === 'Cancelled' || booking.status === 'Refunded') return;

            // Determine if the booking is currently active/occupying a seat
            let isActive = false;
            if (booking.status === 'Paid' || booking.status === 'Confirmed') {
                isActive = true;
            } else if (booking.status === 'Pending' && booking.createdAt) {
                const createdAtMs = booking.createdAt.toMillis ? booking.createdAt.toMillis() : booking.createdAt;
                if (now - createdAtMs < HOLD_WINDOW_MS) {
                    isActive = true;
                }
            }

            if (isActive) {
                // For group bookings, count the length of the passengers array.
                // Fallback to 1 if the array doesn't exist (legacy data).
                occupiedSeats += (booking.passengers?.length || 1);
            }
        });

        const availableSeats = Math.max(0, totalCapacity - occupiedSeats);

        console.log(`[getSeatAvailability] ${pickup}->${destination} (${vehicleType}) on ${date}: Occupied=${occupiedSeats}, Total=${totalCapacity}, Available=${availableSeats}`);

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
