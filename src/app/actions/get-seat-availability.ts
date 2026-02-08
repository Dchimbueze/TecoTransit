
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { PriceRule, Trip, SeatAvailability } from "@/lib/types";
import { vehicleOptions } from "@/lib/constants";

/**
 * Calculates real-time seat availability for a specific route, vehicle, and date.
 * Now filters by date in memory to avoid the need for complex composite indexes.
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

    try {
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

        const vehicleKey = Object.keys(vehicleOptions).find(
            key => vehicleOptions[key as keyof typeof vehicleOptions].name === priceRule.vehicleType
        ) as keyof typeof vehicleOptions | undefined;

        if (!vehicleKey) {
            return { availableSeats: 0, totalCapacity: 0, isFull: true };
        }

        const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
        const totalCapacity = (priceRule.vehicleCount || 0) * capacityPerVehicle;

        // Query all trips for this specific route.
        // We filter by date in memory to avoid requiring a composite index.
        const tripsRef = db.collection('trips');
        const tripsSnapshot = await tripsRef.where('priceRuleId', '==', priceRuleId).get();
        
        let occupiedSeatsCount = 0;
        let tripsFound = 0;

        tripsSnapshot.forEach(doc => {
            const trip = doc.data() as Trip;
            
            // Only process trips for the requested date
            if (trip.date === date) {
                tripsFound++;
                const activePassengers = (trip.passengers || []).filter(p => {
                    // A passenger is active if they don't have a hold (Confirmed/Paid) 
                    // or if their hold hasn't expired yet.
                    if (p.heldUntil) {
                        const holdTimestamp = Number(p.heldUntil);
                        return holdTimestamp > now;
                    }
                    return true;
                });
                occupiedSeatsCount += activePassengers.length;
            }
        });

        const availableSeatsCount = Math.max(0, totalCapacity - occupiedSeatsCount);

        console.log(`[getSeatAvailability] LOGIC CHECK:
            Route: ${pickup} -> ${destination}
            Vehicle: ${vehicleType} (${priceRuleId})
            Date: ${date}
            Trips Found for Date: ${tripsFound}
            Occupied/Held Seats: ${occupiedSeatsCount}
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
