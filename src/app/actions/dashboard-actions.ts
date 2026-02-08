
'use server';

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import type { Booking, Trip } from '@/lib/types';
import { startOfToday, format } from 'date-fns';

/**
 * Fetches and sanitizes data for the admin dashboard.
 * Explicit mapping is used to ensure all returned data is serializable by Next.js Server Actions.
 */
export async function getDashboardSummary() {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { stats: null, recentActivity: null, error: 'Database connection failed.' };
    }

    try {
        const todayStr = format(startOfToday(), 'yyyy-MM-dd');

        // Define queries
        const upcomingTripsQuery = db.collection('trips').where('date', '>=', todayStr).get();
        const pendingBookingsQuery = db.collection('bookings').where('status', '==', 'Pending').get();
        const confirmedBookingsQuery = db.collection('bookings').where('status', '==', 'Confirmed').get();
        
        // Note: Ordering across multiple fields in Firestore requires a composite index in production.
        const recentTripsQuery = db.collection('trips')
            .where('date', '>=', todayStr)
            .orderBy('date', 'asc')
            .orderBy('vehicleIndex', 'asc')
            .limit(5)
            .get();
            
        const recentBookingsQuery = db.collection('bookings')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

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

        // Calculate stats with safety checks
        const totalPassengers = upcomingTripsSnapshot.docs.reduce((sum, doc) => {
            const data = doc.data();
            return sum + (Array.isArray(data.passengers) ? data.passengers.length : 0);
        }, 0);

        const stats = {
            upcomingTrips: upcomingTripsSnapshot.size,
            totalPassengers: totalPassengers,
            pendingBookings: pendingBookingsSnapshot.size,
            confirmedBookings: confirmedBookingsSnapshot.size,
        };

        // Sanitize trips for client-side serialization
        const recentTrips = recentTripsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
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

        // Sanitize bookings for client-side serialization
        const recentBookings = recentBookingsSnapshot.docs.map(doc => {
            const data = doc.data();
            
            // Handle different types of Firestore Timestamps safely
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

        const recentActivity = {
            trips: recentTrips,
            bookings: recentBookings,
        };
        
        return { stats, recentActivity, error: null };

    } catch (error: any) {
        console.error("API Error fetching dashboard summary:", error);
        return { 
            stats: null, 
            recentActivity: null, 
            error: error.message || 'An internal server error occurred while fetching dashboard summary.' 
        };
    }
}
