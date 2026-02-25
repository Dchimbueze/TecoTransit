
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { PriceRule, SeatAvailability } from "@/lib/types";
import { vehicleOptions } from "@/lib/constants";

/**
 * Calculates seat availability by counting actual records in the bookings collection.
 * This is the source of truth for seat subtraction.
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

        // Query all relevant bookings. We filter by route and vehicle, 
        // then filter by date in memory to avoid needing complex composite indexes.
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

            // If it's Paid or Confirmed, it's occupied
            if (booking.status === 'Paid' || booking.status === 'Confirmed') {
                occupiedSeats++;
                return;
            }

            // If it's Pending, only count if it was created recently (still on hold)
            if (booking.status === 'Pending' && booking.createdAt) {
                const createdAtMs = booking.createdAt.toMillis ? booking.createdAt.toMillis() : booking.createdAt;
                if (now - createdAtMs < HOLD_WINDOW_MS) {
                    occupiedSeats++;
                }
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
