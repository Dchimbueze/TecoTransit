
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { PriceRule, SeatAvailability } from "@/lib/types";
import { vehicleOptions } from "@/lib/constants";

/**
 * Calculates seat availability by directly counting individual passengers 
 * across all active groups in the bookings collection.
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
            console.warn(`[getSeatAvailability] Price rule not found: ${priceRuleId}`);
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const priceRule = priceRuleSnap.data() as PriceRule;
        const vehicleKey = Object.keys(vehicleOptions).find(
            key => vehicleOptions[key as keyof typeof vehicleOptions].name === priceRule.vehicleType
        ) as keyof typeof vehicleOptions | undefined;

        if (!vehicleKey || (priceRule.vehicleCount || 0) <= 0) {
            console.warn(`[getSeatAvailability] Invalid vehicle config for: ${priceRuleId}`);
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
        const totalCapacity = (priceRule.vehicleCount || 1) * capacityPerVehicle;

        // Query bookings for this route and vehicle. 
        // We filter by priceRuleId to stay efficient, then by date in-memory 
        // to avoid complex index requirements.
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
            
            // 1. Date Check
            if (booking.intendedDate !== date) return;

            // 2. Cancellation Check
            if (booking.status === 'Cancelled' || booking.status === 'Refunded') return;

            // 3. Activity Check (Paid, Confirmed, or active Pending hold)
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
                // Count individual passengers in the group
                const passengerCount = (booking.passengers && Array.isArray(booking.passengers)) 
                    ? booking.passengers.length 
                    : 1;
                occupiedSeats += passengerCount;
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
