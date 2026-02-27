
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { Booking, Trip } from '@/lib/types';
import { startOfToday, format } from 'date-fns';

/**
 * Converts Firestore Timestamps to plain numbers (milliseconds)
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

export async function getDashboardSummary() {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { stats: null, recentActivity: null, error: 'Database connection failed.' };
    }

    try {
        const todayStr = format(startOfToday(), 'yyyy-MM-dd');

        // Queries
        const upcomingTripsQuery = db.collection('trips').where('date', '>=', todayStr).get();
        const pendingBookingsQuery = db.collection('bookings').where('status', '==', 'Pending').get();
        const confirmedBookingsQuery = db.collection('bookings').where('status', '==', 'Confirmed').get();
        const recentTripsQuery = db.collection('trips').where('date', '>=', todayStr).orderBy('date', 'asc').orderBy('vehicleIndex', 'asc').limit(5).get();
        const recentBookingsQuery = db.collection('bookings').orderBy('createdAt', 'desc').limit(5).get();

        const [
            upcomingTripsSnapshot,
            pendingBookingsSnapshot,
            confirmedBookingsSnapshot,
            recentTripsSnapshot,
            recentBookingsSnapshot
        ] = await Promise.all([
            upcomingTripsQuery,
            pendingBookingsQuery,
            confirmedBookingsQuery,
            recentTripsQuery,
            recentBookingsQuery
        ]);

        // Calculate stats
        const upcomingTrips = upcomingTripsSnapshot.docs.map(doc => doc.data() as Trip);
        const totalPassengers = upcomingTrips.reduce((sum, trip) => sum + trip.passengers.length, 0);

        const stats = {
            upcomingTrips: upcomingTripsSnapshot.size,
            totalPassengers: totalPassengers,
            pendingBookings: pendingBookingsSnapshot.size,
            confirmedBookings: confirmedBookingsSnapshot.size,
        };

        // Format recent activity
        const recentTrips = recentTripsSnapshot.docs.map(doc => sanitizeData(doc.data()) as Trip);
        const recentBookings = recentBookingsSnapshot.docs.map(doc => {
            const data = doc.data();
            const sanitized = sanitizeData(data);
            return {
                id: doc.id,
                ...sanitized,
            } as Booking;
        });

        const recentActivity = {
            trips: recentTrips,
            bookings: recentBookings,
        };
        
        return { stats, recentActivity, error: null };

    } catch (error: any) {
        console.error("API Error fetching dashboard summary:", error);
        return { stats: null, recentActivity: null, error: 'An internal server error occurred while fetching dashboard summary.' };
    }
}
