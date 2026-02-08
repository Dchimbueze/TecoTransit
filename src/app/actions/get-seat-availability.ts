
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { PriceRule, Booking, SeatAvailability } from "@/lib/types";
import { vehicleOptions } from "@/lib/constants";

/**
 * Calculates real-time seat availability by counting bookings directly.
 * This satisfies the requirement to fetch all relevant bookings and perform a count.
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
    const now = Date.now();
    const HOLD_DURATION_MS = 7 * 60 * 1000; // 7 minutes window

    try {
        // 1. Get the Price Rule to determine total allowed capacity
        const priceRuleRef = db.collection('prices').doc(priceRuleId);
        const priceRuleSnap = await priceRuleRef.get();

        if (!priceRuleSnap.exists) {
            console.warn(`[getSeatAvailability] Price rule not found: ${priceRuleId}`);
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const priceRule = priceRuleSnap.data() as PriceRule;
        
        if (!priceRule.vehicleCount || priceRule.vehicleCount <= 0) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        // 2. Identify vehicle capacity
        const vehicleKey = Object.keys(vehicleOptions).find(
            key => vehicleOptions[key as keyof typeof vehicleOptions].name === priceRule.vehicleType
        ) as keyof typeof vehicleOptions | undefined;

        if (!vehicleKey) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
        const totalCapacity = (priceRule.vehicleCount || 0) * capacityPerVehicle;

        // 3. Query BOOKINGS directly for this specific date
        // We filter by date in the query and other fields in-memory to avoid index overhead.
        const bookingsRef = db.collection('bookings');
        const bookingsSnapshot = await bookingsRef.where('intendedDate', '==', date).get();
        
        let occupiedSeatsCount = 0;

        bookingsSnapshot.forEach(doc => {
            const booking = doc.data() as Booking;
            
            // Only count if it's the right route and vehicle
            const isSameRoute = booking.pickup === pickup && 
                              booking.destination === destination && 
                              booking.vehicleType === vehicleType;

            if (isSameRoute) {
                // Determine if this booking is "occupying" a seat
                const isConfirmedOrPaid = booking.status === 'Paid' || booking.status === 'Confirmed';
                
                // If pending, check if it's within the 7-minute hold window
                let isActivePending = false;
                if (booking.status === 'Pending' && booking.createdAt) {
                    const createdAtMillis = typeof (booking.createdAt as any).toMillis === 'function' 
                        ? (booking.createdAt as any).toMillis() 
                        : Number(booking.createdAt);
                    
                    if (now - createdAtMillis < HOLD_DURATION_MS) {
                        isActivePending = true;
                    }
                }

                if (isConfirmedOrPaid || isActivePending) {
                    occupiedSeatsCount++;
                }
            }
        });

        const availableSeatsCount = Math.max(0, totalCapacity - occupiedSeatsCount);

        console.log(`[getSeatAvailability] COUNT LOGIC:
            Route: ${pickup} -> ${destination}
            Vehicle: ${vehicleType}
            Date: ${date}
            Total Bookings on Date: ${bookingsSnapshot.size}
            Active/Occupied Count: ${occupiedSeatsCount}
            Total Allowed Capacity: ${totalCapacity}
            Resulting Available: ${availableSeatsCount}
        `);

        return {
            availableSeats: availableSeatsCount,
            totalCapacity,
            isFull: availableSeatsCount <= 0,
        };

    } catch (error: any) {
        console.error("Error calculating seat availability:", error);
        throw new Error(`Failed to fetch seat availability: ${error.message}`);
    }
}
