
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { Trip, Booking } from '@/lib/types';
import { Query } from 'firebase-admin/firestore';

/**
 * Fetches and sanitizes all trips.
 * Ensures Firestore Timestamp objects are converted to serializable primitives.
 */
export async function getAllTrips(): Promise<{ trips: Trip[]; error: string | null; }> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { trips: [], error: 'Database connection failed.' };
    }

    try {
        const tripsQuery = db.collection("trips").orderBy('date', 'asc').orderBy('vehicleIndex', 'asc');
        const tripsSnapshot = await tripsQuery.get();
        
        const trips = tripsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                priceRuleId: data.priceRuleId || '',
                pickup: data.pickup || '',
                destination: data.destination || '',
                vehicleType: data.vehicleType || '',
                date: data.date || '',
                vehicleIndex: data.vehicleIndex || 0,
                capacity: data.capacity || 0,
                isFull: !!data.isFull,
                passengers: (data.passengers || []).map((p: any) => ({
                    bookingId: p.bookingId || '',
                    name: p.name || '',
                    phone: p.phone || '',
                    heldUntil: typeof p.heldUntil === 'number' ? p.heldUntil : undefined
                }))
            } as Trip;
        });

        return { trips, error: null };

    } catch (error: any) {
        console.error("API Error fetching trips data:", error);
        return { trips: [], error: 'An internal server error occurred while fetching trips.' };
    }
}

/**
 * Fetches and sanitizes bookings based on status.
 * Ensures Firestore Timestamp objects are converted to serializable primitives.
 */
export async function getAllBookings(status?: Booking['status']): Promise<{ bookings: Booking[], error: string | null }> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { bookings: [], error: 'Database connection failed.' };
    }
    
    try {
        let q: Query = db.collection("bookings");
        
        if (status) {
            q = q.where('status', '==', status);
        }
        
        q = q.orderBy('createdAt', 'desc');

        const snapshot = await q.get();
        
        const bookings = snapshot.docs.map(doc => {
            const data = doc.data();
            
            let createdAtMillis = Date.now();
            if (data.createdAt && typeof (data.createdAt as any).toMillis === 'function') {
                createdAtMillis = (data.createdAt as any).toMillis();
            } else if (typeof data.createdAt === 'number') {
                createdAtMillis = data.createdAt;
            }

            return {
                id: doc.id,
                name: data.name || '',
                email: data.email || '',
                phone: data.phone || '',
                pickup: data.pickup || '',
                destination: data.destination || '',
                intendedDate: data.intendedDate || '',
                vehicleType: data.vehicleType || '',
                luggageCount: data.luggageCount || 0,
                totalFare: data.totalFare || 0,
                status: data.status || 'Pending',
                allowReschedule: !!data.allowReschedule,
                createdAt: createdAtMillis,
                tripId: data.tripId,
                rescheduledCount: data.rescheduledCount,
                paymentReference: data.paymentReference,
                confirmedDate: data.confirmedDate,
            } as Booking;
        });

        return { bookings, error: null };

    } catch (e: any) {
        console.error("API Error fetching all bookings:", e);
        return { bookings: [], error: 'Failed to fetch all bookings.' };
    }
}
