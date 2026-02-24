
'use server';

import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Booking } from '@/lib/types';
import crypto from 'crypto';

/**
 * Generates the HMAC-SHA512 signature required by OPay.
 */
function generateSignature(payload: any, secretKey: string): string {
    return crypto
        .createHmac('sha512', secretKey)
        .update(JSON.stringify(payload))
        .digest('hex');
}

/**
 * Initializes an OPay transaction after creating a 'Pending' booking to hold the seat.
 */
export const initializeOPayTransaction = async ({ email, amount, metadata, bookingData }: {
  email: string;
  amount: number; // In Naira (decimal)
  metadata: Record<string, any>;
  bookingData: any;
}) => {
  try {
    const merchantId = process.env.OPAY_MERCHANT_ID;
    const publicKey = process.env.OPAY_PUBLIC_KEY;
    const secretKey = process.env.OPAY_SECRET_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!merchantId || !publicKey || !secretKey || !baseUrl) {
        throw new Error('OPay configuration is missing.');
    }

    // 1. Create the pending booking first to reserve the seat
    const { createPendingBooking } = await import('./create-booking-and-assign-trip');
    const pendingResult = await createPendingBooking(bookingData);
    if (!pendingResult.success || !pendingResult.booking) {
        throw new Error(pendingResult.error || 'Failed to hold seat.');
    }

    const bookingId = pendingResult.booking.id;

    // 2. Prepare OPay Payload
    // OPay expects amount in a string format with 2 decimal places.
    const opayPayload = {
        amount: amount.toFixed(2),
        currency: "NGN",
        merchantId: merchantId,
        reference: `TECO_${bookingId}_${Date.now()}`,
        returnUrl: `${baseUrl}/payment/callback`,
        callbackUrl: `${baseUrl}/api/opay/webhook`, // Optional webhook for reliability
        cancelUrl: `${baseUrl}/book`,
        userEmail: email,
        productName: `TecoTransit Trip: ${bookingData.pickup} to ${bookingData.destination}`,
        productDescription: `Travel booking for ${bookingData.name}`,
        metadata: {
            booking_id: bookingId
        }
    };

    const signature = generateSignature(opayPayload, secretKey);

    // 3. Initialize with OPay
    // Use sandbox or production URL based on your environment. 
    // Defaulting to production-like endpoint.
    const response = await fetch('https://api.opaycheckout.com/api/v1/international/cashier/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Merchant-Id': merchantId,
            'Authorization': `Bearer ${publicKey}`,
            'Signature': signature
        },
        body: JSON.stringify(opayPayload),
    });

    const result = await response.json();

    if (result.code !== '00000' || !result.data?.cashierUrl) {
        throw new Error(result.message || 'OPay initialization failed.');
    }

    return { 
        status: true, 
        data: { 
            authorization_url: result.data.cashierUrl,
            reference: opayPayload.reference 
        } 
    };
  } catch (error: any) {
    console.error('OPay initialization error:', error.message);
    return { status: false, message: error.message };
  }
};

/**
 * Verifies the OPay transaction status.
 */
export const verifyOPayTransaction = async (reference: string | null) => {
    if (!reference) {
        return { success: false, error: 'No payment reference provided.' };
    }

    try {
        const merchantId = process.env.OPAY_MERCHANT_ID;
        const publicKey = process.env.OPAY_PUBLIC_KEY;
        const secretKey = process.env.OPAY_SECRET_KEY;

        if (!merchantId || !publicKey || !secretKey) throw new Error('OPay keys not configured.');

        const verifyPayload = {
            merchantId: merchantId,
            reference: reference
        };

        const signature = generateSignature(verifyPayload, secretKey);

        const response = await fetch('https://api.opaycheckout.com/api/v1/international/cashier/status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Merchant-Id': merchantId,
                'Authorization': `Bearer ${publicKey}`,
                'Signature': signature
            },
            body: JSON.stringify(verifyPayload),
        });

        const result = await response.json();

        if (result.code !== '00000') {
            throw new Error(result.message || 'Verification failed.');
        }

        const data = result.data;
        // OPay status 'INITIAL' or 'PENDING' means not successful yet. 
        // We look for 'SUCCESSFUL'.
        if (data.status !== 'SUCCESSFUL') {
            throw new Error(`Transaction status: ${data.status}`);
        }

        // Extract bookingId from reference (we formatted it as TECO_{bookingId}_...)
        const referenceParts = reference.split('_');
        const bookingId = referenceParts[1];

        if (!bookingId) throw new Error('Booking ID could not be extracted from reference.');

        const admin = getFirebaseAdmin();
        const db = admin?.firestore();
        if (!db) throw new Error('Internal server error: Database connection failed.');
        
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
            throw new Error(`Booking record (${bookingId}) not found.`);
        }

        const bookingData = bookingSnap.data() as Booking;

        if (bookingData.status === 'Pending') {
            await bookingRef.update({
                status: 'Paid',
                paymentReference: reference,
                updatedAt: FieldValue.serverTimestamp(),
            });

            if (bookingData.tripId) {
                const { checkAndConfirmTrip } = await import('./create-booking-and-assign-trip');
                await checkAndConfirmTrip(db, bookingData.tripId);
            }
        }

        return { success: true, bookingId };
    } catch (error: any) {
        console.error('OPay Verification failed:', error.message);
        return { success: false, error: error.message || 'Verification failed.' };
    }
};
