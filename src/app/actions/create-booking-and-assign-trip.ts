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

export const createPendingBooking = async (data: Omit<BookingFormData, 'privacyPolicy'> & { totalFare: number }): Promise<CreateBookingResult> => {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        return { success: false, error: "Could not connect to the database." };
    }
    
    const newBookingRef = db.collection('bookings').doc();
    const bookingId = newBookingRef.id;

    // This is now a more complete Booking object from the start
    const firestoreBooking = {
        ...data,
        id: bookingId,
        createdAt: FieldValue.serverTimestamp(),
        status: 'Pending' as const,
        intendedDate: format(data.intendedDate, 'yyyy-MM-dd'),
    };
    
    try {
        // Step 1: Create the 'Pending' booking document first.
        await newBookingRef.set(firestoreBooking);

        // Step 2: Now, attempt to assign this new booking to a trip.
        // This function is now the single source of truth for assignment logic.
        await assignBookingToTrip(firestoreBooking);

        // Retrieve the final booking data after assignment
        const createdBookingDoc = await newBookingRef.get();
        const createdBookingData = createdBookingDoc.data();
        
        if (!createdBookingData) {
            return { success: false, error: 'Failed to retrieve created booking.' };
        }

        // Convert Firestore Timestamp to millis for client-side compatibility
        const finalBooking = {
            ...createdBookingData,
            createdAt: (createdBookingData.createdAt as FirebaseFirestore.Timestamp).toMillis(),
        } as Booking;

        return { 
            success: true, 
            booking: finalBooking
        };

    } catch (error: any) {
        console.error("Error in createPendingBooking:", error);
        // The booking will still exist as 'Pending' and an overflow email will have been sent
        // by `assignBookingToTrip` if that was the cause of the failure.
        return { success: false, error: error.message || 'An unknown error occurred while creating booking.' };
    }
};


/**
 * Assigns a booking to an available trip. This is the core logic for trip assignment.
 * It will try to find an existing trip with space, or create a new one if possible.
 * If no space is available, it sends an alert email to the admin.
 * This function is designed to be run within a transaction for data consistency.
 * @param bookingData - The full booking object.
 */
export async function assignBookingToTrip(
    bookingData: Omit<Booking, 'createdAt'> & { createdAt: any }
) {
    const db = getFirebaseAdmin()?.firestore();
    if (!db) {
        throw new Error("Database connection not available in assignBookingToTrip");
    }

    const { id: bookingId, name, phone, pickup, destination, vehicleType, intendedDate } = bookingData;
    const priceRuleId = `${pickup}_${destination}_${vehicleType}`.toLowerCase().replace(/\s+/g, '-');
    
    try {
        let assignedTripId: string | null = null;
        
        await db.runTransaction(async (transaction) => {
            const priceRuleRef = db.doc(`prices/${priceRuleId}`);
            const priceRuleSnap = await transaction.get(priceRuleRef);
            if (!priceRuleSnap.exists) {
                throw new Error(`Price rule ${priceRuleId} not found.`);
            }
            const priceRule = { id: priceRuleSnap.id, ...priceRuleSnap.data() } as PriceRule;
            
            // --- SERVER-SIDE CHECK FOR VEHICLE COUNT ---
            if (priceRule.vehicleCount <= 0) {
                throw new Error("This route is currently disabled as no vehicles are assigned.");
            }
            // --- END CHECK ---

            const vehicleKey = Object.keys(vehicleOptions).find(key => vehicleOptions[key as keyof typeof vehicleOptions].name === priceRule.vehicleType) as keyof typeof vehicleOptions | undefined;
            
            if (!vehicleKey) {
                throw new Error(`Vehicle type '${priceRule.vehicleType}' not found in vehicleOptions.`);
            }

            const capacityPerVehicle = vehicleOptions[vehicleKey].capacity;
            
            if (capacityPerVehicle === 0) {
                throw new Error(`Vehicle capacity for ${priceRule.vehicleType} is zero.`);
            }

            const tripsQuery = db.collection('trips')
                .where('priceRuleId', '==', priceRuleId)
                .where('date', '==', intendedDate)
                .orderBy('vehicleIndex');
            
            const tripsSnapshot = await transaction.get(tripsQuery);
            let assigned = false;
            
            const passenger: Passenger = { bookingId, name, phone };

            // 1. Try to find a non-full, existing trip
            for (const doc of tripsSnapshot.docs) {
                const trip = doc.data() as Trip;
                if (!trip.isFull) {
                    const newPassengerCount = trip.passengers.length + 1;
                    const updates: { passengers: FirebaseFirestore.FieldValue; isFull?: boolean } = {
                        passengers: FieldValue.arrayUnion(passenger),
                    };

                    if (newPassengerCount >= trip.capacity) {
                        updates.isFull = true;
                    }
                    
                    transaction.update(doc.ref, updates);
                    
                    assigned = true;
                    assignedTripId = doc.id;
                    break;
                }
            }

            // 2. If not assigned, check if we can create a new trip
            if (!assigned && tripsSnapshot.size < priceRule.vehicleCount) {
                const newVehicleIndex = tripsSnapshot.size + 1;
                const newTripId = `${priceRuleId}_${intendedDate}_${newVehicleIndex}`;
                
                const newTrip: Trip = {
                    id: newTripId,
                    priceRuleId: priceRule.id,
                    pickup: priceRule.pickup,
                    destination: priceRule.destination,
                    vehicleType: priceRule.vehicleType,
                    date: intendedDate,
                    vehicleIndex: newVehicleIndex,
                    capacity: capacityPerVehicle,
                    passengers: [passenger],
                    isFull: capacityPerVehicle <= 1,
                };
                
                transaction.set(db.collection('trips').doc(newTripId), newTrip);

                assigned = true;
                assignedTripId = newTripId;
            }

            // If still not assigned after trying everything, throw an error to rollback transaction.
            if (!assigned) {
                throw new Error("All vehicles for this route and date are full.");
            }
             
            // Associate the booking with the trip ID.
            if (assignedTripId) {
                const bookingRef = db.collection('bookings').doc(bookingId);
                transaction.update(bookingRef, { tripId: assignedTripId });
            }
        });
        
        // After transaction is successful, check for trip confirmation
        if (assignedTripId) {
            await checkAndConfirmTrip(db, assignedTripId);
        }
    } catch (error: any) {
        console.error(`Transaction failed for booking ${bookingId}:`, error);
        
        // Now, we can reliably send an overflow email if the error message contains the specific string
        // or for any other transaction failure.
        const reason = error.message || "An unknown error occurred during trip assignment.";
        await sendOverflowEmail(bookingData, reason);

        // Re-throw the error to ensure the calling function knows the transaction failed.
        throw error;
    }
}

async function sendOverflowEmail(bookingDetails: any, reason: string) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { pickup, destination, vehicleType, intendedDate, name, email } = bookingDetails;
    try {
        await resend.emails.send({
            from: 'TecoTransit Alert <alert@tecotransit.org>',
            to: ['chimdaveo@gmail.com'],
            subject: 'Urgent: Vehicle Capacity Exceeded or Booking Assignment Failed',
            html: `
                <h1>Vehicle Capacity Alert</h1>
                <p>A new booking could not be automatically assigned to a trip.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <h3>Booking Details:</h3>
                <ul>
                    <li><strong>Booking ID:</strong> ${bookingDetails.id}</li>
                    <li><strong>Passenger:</strong> ${name} (${email})</li>
                    <li><strong>Route:</strong> ${pickup} to ${destination}</li>
                    <li><strong>Vehicle:</strong> ${vehicleType}</li>
                    <li><strong>Date:</strong> ${intendedDate}</li>
                </ul>
                <p>The booking has been created but does not have a tripId. Please take immediate action to arrange for more vehicle space or contact the customer, and manually update the booking record.</p>
            `,
        });
    } catch(e) {
        console.error("Failed to send overflow email:", e);
    }
}


export async function checkAndConfirmTrip(
    db: FirebaseFirestore.Firestore,
    tripId: string,
) {
    const tripRef = db.collection('trips').doc(tripId);
    const tripDoc = await tripRef.get();

    if (!tripDoc.exists) {
        console.warn(`Trip with ID ${tripId} not found for confirmation check.`);
        return;
    }

    const trip = tripDoc.data() as Trip;

    // Only proceed if the trip is marked as full
    if (!trip.isFull) {
        return;
    }
    
    const passengerIds = trip.passengers.map(p => p.bookingId);
    if (passengerIds.length === 0) return;

    const bookingsQuery = db.collection('bookings').where(FieldPath.documentId(), 'in', passengerIds);
    const bookingsSnapshot = await bookingsQuery.get();

    // Only confirm bookings that are 'Paid' and not already 'Cancelled' or 'Confirmed'
    const bookingsToConfirm = bookingsSnapshot.docs.filter(doc => doc.data().status === 'Paid');

    if (bookingsToConfirm.length === 0) return;

    const batch = db.batch();
    bookingsToConfirm.forEach(doc => {
        batch.update(doc.ref, { status: 'Confirmed', confirmedDate: trip.date });
    });
    
    await batch.commit();

    // After committing the batch, send the notification emails
    for (const doc of bookingsToConfirm) {
        const bookingData = doc.data();
        try {
            await sendBookingStatusEmail({
                name: bookingData.name,
                email: bookingData.email,
                status: 'Confirmed',
                bookingId: doc.id,
                pickup: bookingData.pickup,
                destination: bookingData.destination,
                vehicleType: bookingData.vehicleType,
                totalFare: bookingData.totalFare,
                confirmedDate: trip.date,
            });
        } catch (e) {
            console.error(`Failed to send confirmation email for booking ${doc.id}:`, e);
        }
    }
}