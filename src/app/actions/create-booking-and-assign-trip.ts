
'use server';

import type { Booking, BookingFormData, Passenger, PriceRule, Trip } from '@/lib/types';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { format } from 'date-fns';
import { vehicleOptions } from '@/lib/constants';
import { sendBookingStatusEmail } from './send-email';
import { Resend } from 'resend';

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

type CreateBookingResult = {
    success: boolean;
    booking?: Booking;
    error?: string;
}

/**
 * Creates a pending booking and immediately attempts to assign it to a trip.
 */
export const createPendingBooking = async (data: Omit<BookingFormData, 'privacyPolicy'> & { totalFare: number }): Promise<CreateBookingResult> => {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) return { success: false, error: "Database connection failed." };
    
    const newBookingRef = db.collection('bookings').doc();
    const bookingId = newBookingRef.id;

    const firestoreBooking = {
        ...data,
        id: bookingId,
        createdAt: FieldValue.serverTimestamp(),
        status: 'Pending' as const,
        intendedDate: typeof data.intendedDate === 'string' ? data.intendedDate : format(data.intendedDate, 'yyyy-MM-dd'),
    };
    
    try {
        await newBookingRef.set(firestoreBooking);
        
        // Orchestrate assignment
        await assignBookingToTrip({
            ...firestoreBooking,
            createdAt: Date.now() // Mock for the local object
        } as any);

        const createdDoc = await newBookingRef.get();
        const createdData = createdDoc.data();
        
        if (!createdData) return { success: false, error: 'Failed to retrieve booking.' };

        const sanitized = sanitizeData(createdData);

        return { 
            success: true, 
            booking: { id: createdDoc.id, ...sanitized } as Booking
        };
    } catch (error: any) {
        console.error("Error creating pending booking:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Assigns a booking (individual or group) to a trip manifest.
 * Crucially, it treats the entire group as an atomic unit.
 */
export async function assignBookingToTrip(bookingData: Booking) {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) throw new Error("Database connection failed.");

    const { id: bookingId, passengers, pickup, destination, vehicleType, intendedDate } = bookingData;
    const priceRuleId = `${pickup}_${destination}_${vehicleType}`.toLowerCase().replace(/\s+/g, '-');
    
    try {
        let assignedTripId: string | null = null;
        
        await db.runTransaction(async (transaction) => {
            const priceRuleRef = db.doc(`prices/${priceRuleId}`);
            const priceRuleSnap = await transaction.get(priceRuleRef);
            if (!priceRuleSnap.exists) throw new Error("Route/Price configuration not found.");
            
            const priceRule = priceRuleSnap.data() as PriceRule;
            const vehicleKey = Object.keys(vehicleOptions).find(k => vehicleOptions[k as keyof typeof vehicleOptions].name === priceRule.vehicleType) as keyof typeof vehicleOptions;
            const capacity = vehicleOptions[vehicleKey].capacity;

            const tripsQuery = db.collection('trips')
                .where('priceRuleId', '==', priceRuleId)
                .where('date', '==', intendedDate)
                .orderBy('vehicleIndex');
            
            const tripsSnapshot = await transaction.get(tripsQuery);
            let assigned = false;
            
            // Map the group members to manifest passengers
            const manifestPassengers: Passenger[] = passengers.map(p => ({
                bookingId,
                name: p.name,
                phone: p.phone,
                email: p.email
            }));

            // ATOMIC CHECK: Can the entire group fit in an existing trip?
            for (const doc of tripsSnapshot.docs) {
                const trip = doc.data() as Trip;
                const currentCount = (trip.passengers || []).length;
                
                if (currentCount + manifestPassengers.length <= capacity) {
                    const newCount = currentCount + manifestPassengers.length;
                    const updates: any = { 
                        passengers: FieldValue.arrayUnion(...manifestPassengers) 
                    };
                    if (newCount >= capacity) updates.isFull = true;
                    
                    transaction.update(doc.ref, updates);
                    assigned = true;
                    assignedTripId = doc.id;
                    break;
                }
            }

            // If it doesn't fit in existing cars, start a new one if limit allows
            if (!assigned && (tripsSnapshot.size < (priceRule.vehicleCount || 1))) {
                const newIndex = tripsSnapshot.size + 1;
                const newTripId = `${priceRuleId}_${intendedDate}_${newIndex}`;
                
                const newTrip: Trip = {
                    id: newTripId,
                    priceRuleId,
                    pickup, destination, vehicleType,
                    date: intendedDate,
                    vehicleIndex: newIndex,
                    capacity,
                    passengers: manifestPassengers,
                    isFull: manifestPassengers.length >= capacity,
                };
                transaction.set(db.collection('trips').doc(newTripId), newTrip);
                assigned = true;
                assignedTripId = newTripId;
            }

            if (!assigned) throw new Error("No available vehicles or seats for this route on this date.");
            
            // Link the booking to the trip
            if (assignedTripId) {
                transaction.update(db.collection('bookings').doc(bookingId), { tripId: assignedTripId });
            }
        });
        
        // After transaction, check if we need to flip the status to 'Confirmed'
        if (assignedTripId) {
            await checkAndConfirmTrip(db, assignedTripId);
        }
    } catch (error: any) {
        console.error(`Assignment failed for booking ${bookingId}:`, error);
        await sendOverflowEmail(bookingData, error.message);
        throw error;
    }
}

/**
 * Alerts admin if a booking couldn't be assigned automatically.
 */
async function sendOverflowEmail(bookingDetails: any, reason: string) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
        await resend.emails.send({
            from: 'TecoTransit Alert <alert@tecotransit.org>',
            to: ['chimdaveo@gmail.com'],
            subject: 'Urgent: Trip Assignment Failure',
            html: `<p>Booking ${bookingDetails.id} for ${bookingDetails.name} failed assignment: <strong>${reason}</strong></p>`,
        });
    } catch(e) { console.error("Failed alert email:", e); }
}

/**
 * Scans a trip manifest. If full, it confirms all associated 'Paid' bookings.
 */
export async function checkAndConfirmTrip(db: any, tripId: string) {
    const tripRef = db.collection('trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) return;

    const trip = tripSnap.data() as Trip;
    if (!trip.isFull) return;
    
    // Get unique booking IDs that contributed to this manifest
    const passengerBookingIds = Array.from(new Set(trip.passengers.map(p => p.bookingId)));
    if (passengerBookingIds.length === 0) return;

    // Fetch all relevant bookings
    const bookingsSnapshot = await db.collection('bookings')
        .where(FieldPath.documentId(), 'in', passengerBookingIds)
        .get();
        
    // We only confirm those that are actually paid
    const bookingsToConfirm = bookingsSnapshot.docs.filter((d: any) => d.data().status === 'Paid');

    if (bookingsToConfirm.length === 0) return;

    const batch = db.batch();
    bookingsToConfirm.forEach((d: any) => {
        batch.update(d.ref, { 
            status: 'Confirmed', 
            confirmedDate: trip.date 
        });
    });
    
    await batch.commit();

    // Notify each lead traveler
    for (const d of bookingsToConfirm) {
        const data = d.data();
        await sendBookingStatusEmail({
            name: data.name,
            email: data.email,
            status: 'Confirmed',
            bookingId: d.id,
            pickup: data.pickup,
            destination: data.destination,
            vehicleType: data.vehicleType,
            totalFare: data.totalFare,
            confirmedDate: trip.date,
        }).catch(e => console.error("Confirmation email failed:", e));
    }
}
