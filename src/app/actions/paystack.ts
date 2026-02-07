'use server';

import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Booking } from '@/lib/types';

/**
 * Initializes a Paystack transaction after creating a 'Pending' booking to hold the seat.
 */
export const initializeTransaction = async ({ email, amount, metadata, bookingData }: {
  email: string;
  amount: number;
  metadata: Record<string, any>;
  bookingData: any;
}) => {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured.');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) throw new Error('NEXT_PUBLIC_BASE_URL is not configured.');

    // 1. Create the pending booking first to reserve the seat
    const { createPendingBooking } = await import('./create-booking-and-assign-trip');
    const pendingResult = await createPendingBooking(bookingData);
    if (!pendingResult.success || !pendingResult.booking) {
        throw new Error(pendingResult.error || 'Failed to hold seat.');
    }

    const updatedMetadata = {
        ...metadata,
        booking_id: pendingResult.booking.id,
    };

    // 2. Initialize with Paystack via direct fetch for better reliability
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
 * This function explicitly calls the Paystack server to check transaction success.
 */
export const verifyTransactionAndCreateBooking = async (reference: string | null) => {
    if (!reference) {
        return { success: false, error: 'No payment reference provided.' };
    }

    try {
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured.');

        // Calling Paystack server directly to verify the transaction status
        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Paystack API responded with status: ${response.status}`);
        }

        const verificationData = await response.json();

        if (!verificationData.status || verificationData.data.status !== 'success') {
            throw new Error(verificationData.data?.gateway_response || verificationData.message || 'Payment was not successful.');
        }

        const data = verificationData.data;
        let metadata = data.metadata;
        if (typeof metadata === 'string') {
            try { metadata = JSON.parse(metadata); } catch (e) { console.error('Metadata parse error:', e); }
        }

        const bookingId = metadata?.booking_id;
        if (!bookingId) throw new Error('Booking ID missing from payment metadata.');

        const admin = getFirebaseAdmin();
        const db = admin?.firestore();
        if (!db) throw new Error('Internal server error: Database connection failed.');
        
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
            throw new Error(`Booking record (${bookingId}) not found. Please contact tecotransportservices@gmail.com.`);
        }

        const bookingData = bookingSnap.data() as Booking;

        // Only update if not already processed to avoid redundant operations
        if (bookingData.status === 'Pending') {
            await bookingRef.update({
                status: 'Paid',
                paymentReference: reference,
                updatedAt: FieldValue.serverTimestamp(),
            });

            if (bookingData.tripId) {
                try {
                    const { checkAndConfirmTrip } = await import('./create-booking-and-assign-trip');
                    await checkAndConfirmTrip(db, bookingData.tripId);
                } catch (e) { 
                    console.error('Trip confirmation sync error:', e); 
                }
            }
        }

        return { success: true, bookingId };
    } catch (error: any) {
        console.error('Verification failed for reference', reference, ':', error.message);
        return { success: false, error: error.message || 'Verification failed.' };
    }
};
