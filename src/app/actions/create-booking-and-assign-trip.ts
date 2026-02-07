'use server';

import type { Booking, BookingFormData, Passenger, PriceRule, Trip } from '@/lib/types';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { format } from 'date-fns';
import { vehicleOptions } from '@/lib/constants';
import { sendBookingStatusEmail } from './send-email';
import { Resend } from 'resend';

type CreateBookingResult = {
    success: boolean;
    booking?: Booking;
    error?: string;
}

const ADMIN_EMAIL = 'tecotransportservices@gmail.com';

/**
 * Creates a 'Pending' booking and holds a seat on a trip for 7 minutes.
 */
export const createPendingBooking = async (data: Omit<BookingFormData, 'privacyPolicy'> & { totalFare: number }): Promise<CreateBookingResult> => {
    const admin = getFirebaseAdmin();
    const db = admin?.firestore();
    if (!db) return { success: false, error: "Database connection failed." };
    
    const newBookingRef = db.collection('bookings').doc();
    const bookingId = newBookingRef.id;

    const firestoreBooking = {
        ...data,
        id: bookingId,
        createdAt: FieldValue.serverTimestamp(),
        status: 'Pending' as const,
        intendedDate: format(data.intendedDate, 'yyyy-MM-dd'),
    };
    
    try {
        await newBookingRef.set(firestoreBooking);
        
        // Convert data for the internal assign function
        // Note: FieldValue.serverTimestamp() won't be resolved until after the set, 
        // so we pass a numeric timestamp for the immediate assignment logic.
        const bookingForAssignment = { 
            ...firestoreBooking, 
            createdAt: Date.now() 
        } as any;

        await assignBookingToTrip(bookingForAssignment);

        const createdDoc = await newBookingRef.get();
        const createdData = createdDoc.data();
        
        if (!createdData) return { success: false, error: 'Failed to retrieve booking.' };

        return { 
            success: true, 
            booking: { ...createdData, createdAt: (createdData.createdAt as any).toMillis() } as Booking
        };
    } catch (error: any) {
        console.error("Error creating pending booking:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Atomically assigns a booking to a trip, handling temporary 7-minute holds.
 */
export async function assignBookingToTrip(bookingData: Booking) {
    const admin = getFirebaseAdmin();
    const db = admin?.firestore();
    if (!db) throw new Error("Database connection failed.");

    const { id: bookingId, name, phone, pickup, destination, vehicleType, intendedDate, status } = bookingData;
    const priceRuleId = `${pickup}_${destination}_${vehicleType}`.toLowerCase().replace(/\s+/g, '-');
    
    const HOLD_DURATION_MS = 7 * 60 * 1000; // 7 minutes window
    const now = Date.now();

    try {
        let assignedTripId: string | null = null;
        
        await db.runTransaction(async (transaction) => {
            const priceRuleRef = db.doc(`prices/${priceRuleId}`);
            const priceRuleSnap = await transaction.get(priceRuleRef);
            if (!priceRuleSnap.exists) throw new Error("Price rule not found.");
            
            const priceRule = priceRuleSnap.data() as PriceRule;
            const vehicleKey = Object.keys(vehicleOptions).find(k => vehicleOptions[k as keyof typeof vehicleOptions].name === priceRule.vehicleType) as keyof typeof vehicleOptions;
            const capacity = vehicleOptions[vehicleKey].capacity;

            const tripsQuery = db.collection('trips')
                .where('priceRuleId', '==', priceRuleId)
                .where('date', '==', intendedDate)
                .orderBy('vehicleIndex');
            
            const tripsSnapshot = await transaction.get(tripsQuery);
            let assigned = false;
            
            // Define passenger with a hold if status is Pending
            const passenger: Passenger = { 
                bookingId, 
                name, 
                phone,
                heldUntil: status === 'Pending' ? now + HOLD_DURATION_MS : undefined
            };

            for (const doc of tripsSnapshot.docs) {
                const trip = doc.data() as Trip;
                
                // Filter out expired holds for accurate count
                const activePassengers = (trip.passengers || []).filter(p => {
                    if (p.heldUntil && p.heldUntil < now) return false; 
                    return true;
                });

                if (activePassengers.length < capacity) {
                    const updatedPassengers = [...activePassengers, passenger];
                    const isFull = updatedPassengers.length >= capacity;
                    
                    transaction.update(doc.ref, { 
                        passengers: updatedPassengers,
                        isFull: isFull 
                    });
                    
                    assigned = true;
                    assignedTripId = doc.id;
                    break;
                }
            }

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
                    passengers: [passenger],
                    isFull: capacity <= 1,
                };
                transaction.set(db.collection('trips').doc(newTripId), newTrip);
                assigned = true;
                assignedTripId = newTripId;
            }

            if (!assigned) throw new Error("Trip is currently full.");
            if (assignedTripId) transaction.update(db.collection('bookings').doc(bookingId), { tripId: assignedTripId });
        });
        
        if (assignedTripId) await checkAndConfirmTrip(db, assignedTripId);
    } catch (error: any) {
        console.error(`Transaction failed for booking ${bookingId}:`, error);
        await sendOverflowEmail(bookingData, error.message);
        throw error;
    }
}

async function sendOverflowEmail(bookingDetails: any, reason: string) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
        await resend.emails.send({
            from: 'TecoTransit Alert <alert@tecotransit.org>',
            to: [ADMIN_EMAIL],
            subject: 'Urgent: Vehicle Capacity Alert',
            html: `<p>Booking ${bookingDetails.id} assignment failed: ${reason}</p>`,
        });
    } catch(e) { console.error("Failed alert email:", e); }
}

export async function checkAndConfirmTrip(db: any, tripId: string) {
    const tripRef = db.collection('trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) return;

    const trip = tripSnap.data() as Trip;
    const passengerIds = trip.passengers.map(p => p.bookingId);
    if (passengerIds.length === 0) return;

    const bookingsSnapshot = await db.collection('bookings').where(FieldPath.documentId(), 'in', passengerIds).get();
    const paidBookings = bookingsSnapshot.docs.filter((d: any) => d.data().status === 'Paid');
    const confirmedBookings = bookingsSnapshot.docs.filter((d: any) => d.data().status === 'Confirmed');
    
    const totalConfirmedOrPaid = paidBookings.length + confirmedBookings.length;

    if (totalConfirmedOrPaid < trip.capacity) return;
    
    const bookingsToConfirm = paidBookings;

    if (bookingsToConfirm.length === 0) return;

    const batch = db.batch();
    bookingsToConfirm.forEach((d: any) => batch.update(d.ref, { status: 'Confirmed', confirmedDate: trip.date }));
    await batch.commit();

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
        }).catch(e => console.error("Email failed:", e));
    }
}
