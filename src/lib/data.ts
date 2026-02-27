
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { Trip, Booking } from '@/lib/types';
import { Query } from 'firebase-admin/firestore';

/**
 * Converts Firestore Timestamps to plain numbers (milliseconds)
 * to allow serialization across the server/client boundary.
 */
function sanitizeData(data: any) {
    const sanitized = { ...data };
    for (const key in sanitized) {
        if (sanitized[key] && typeof sanitized[key] === 'object') {
            if (typeof sanitized[key].toMillis === 'function') {
                sanitized[key] = sanitized[key].toMillis();
            } else if ('_seconds' in sanitized[key]) {
                sanitized[key] = sanitized[key]._seconds * 1000;
            }
        }
    }
    return sanitized;
}

export async function getAllTrips(): Promise<{ trips: Trip[]; error: string | null; }> {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { trips: [], error: 'Database connection failed.' };
    }

    try {
        const tripsQuery = db.collection("trips").orderBy('date', 'asc').orderBy('vehicleIndex', 'asc');
        const tripsSnapshot = await tripsQuery.get();
        const trips = tripsSnapshot.docs.map(doc => sanitizeData(doc.data()) as Trip);

        return { trips, error: null };

    } catch (error: any) {
        console.error("API Error fetching trips data:", error);
        return { trips: [], error: 'An internal server error occurred while fetching trips.' };
    }
}

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
            const sanitized = sanitizeData(data);
            return {
                id: doc.id,
                ...sanitized,
            } as Booking;
        });

        return { bookings, error: null };

    } catch (e: any) {
        console.error("API Error fetching all bookings:", e);
        return { bookings: [], error: 'Failed to fetch all bookings.' };
    }
}
