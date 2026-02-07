'use server';

import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

interface InitializeTransactionArgs {
  email: string;
  amount: number;
  metadata: Record<string, any>;
  bookingData: any; 
}

/**
 * Initializes a Paystack transaction after creating a 'Pending' booking to hold the seat.
 * Uses direct fetch for maximum reliability in Server Actions.
 */
export const initializeTransaction = async ({ email, amount, metadata, bookingData }: InitializeTransactionArgs) => {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured on the server.');
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error('NEXT_PUBLIC_BASE_URL is not configured.');
    }

    // 1. Create the pending booking first to reserve the seat
    const { createPendingBooking } = await import('./create-booking-and-assign-trip');
    const pendingResult = await createPendingBooking(bookingData);
    if (!pendingResult.success || !pendingResult.booking) {
        throw new Error(pendingResult.error || 'Failed to hold seat for booking.');
    }

    const updatedMetadata = {
        ...metadata,
        booking_id: pendingResult.booking.id,
    };

    // 2. Initialize with Paystack via direct API
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email,
            amount: Math.round(amount),
            metadata: updatedMetadata,
            callback_url: `${baseUrl}/payment/callback`
        }),
    });

    const result = await response.json();

    if (!result.status || !result.data) {
        throw new Error(result.message || 'Paystack initialization failed.');
    }

    return { status: true, data: result.data };
  } catch (error: any) {
    console.error('Paystack initialization error:', error.message);
    return { status: false, message: error.message };
  }
};

/**
 * Verifies the transaction and updates the held booking to 'Paid'.
 * Uses direct fetch to ensure transaction metadata is correctly parsed.
 */
export const verifyTransactionAndCreateBooking = async (reference: string) => {
    try {
        console.log(`Starting payment verification for reference: ${reference}`);
        
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) {
            throw new Error('PAYSTACK_SECRET_KEY is not configured on the server.');
        }

        // Direct API call for verification
        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
            },
        });

        const verificationData = await response.json();

        if (!verificationData.status || verificationData.data.status !== 'success') {
            console.error('Paystack verification failed:', verificationData);
            throw new Error(verificationData.data?.gateway_response || verificationData.message || 'Payment verification failed.');
        }

        const data = verificationData.data;
        
        // Metadata can sometimes be a JSON string depending on how it was passed/stored
        let metadata = data.metadata;
        if (typeof metadata === 'string' && metadata.trim() !== '') {
            try {
                metadata = JSON.parse(metadata);
            } catch (e) {
                console.error('Failed to parse Paystack metadata string:', e);
            }
        }

        const bookingId = metadata?.booking_id;
        
        if (!bookingId) {
            console.error('Metadata check failed. Full data:', data);
            throw new Error('Booking ID is missing from transaction metadata.');
        }

        const admin = getFirebaseAdmin();
        const db = admin?.firestore();
        
        if (!db) {
            throw new Error('Database connection failed during verification process.');
        }
        
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
            throw new Error(`Booking with ID ${bookingId} not found.`);
        }

        // Atomic update to mark as paid
        await bookingRef.update({
            status: 'Paid',
            paymentReference: reference,
            updatedAt: FieldValue.serverTimestamp(),
        });

        const updatedBookingData = bookingSnap.data();
        if (updatedBookingData && updatedBookingData.tripId) {
            try {
                const { checkAndConfirmTrip } = await import('./create-booking-and-assign-trip');
                await checkAndConfirmTrip(db, updatedBookingData.tripId);
            } catch (confirmError) {
                console.error('Non-critical error: Booking paid but trip confirm failed.', confirmError);
            }
        }

        return { success: true, bookingId: bookingId };

    } catch (error: any) {
        console.error('Verification failed critically:', error);
        return { 
            success: false, 
            error: error.message || 'An internal error occurred during verification.' 
        };
    }
};