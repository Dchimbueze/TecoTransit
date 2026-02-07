'use server';

import Paystack from 'paystack';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  console.warn('PAYSTACK_SECRET_KEY is not set. Paystack features will be limited.');
}

const paystack = PAYSTACK_SECRET_KEY ? Paystack(PAYSTACK_SECRET_KEY) : null;

interface InitializeTransactionArgs {
  email: string;
  amount: number;
  metadata: Record<string, any>;
  bookingData: any; 
}

/**
 * Initializes a Paystack transaction after creating a 'Pending' booking to hold the seat.
 */
export const initializeTransaction = async ({ email, amount, metadata, bookingData }: InitializeTransactionArgs) => {
  try {
    if (!paystack) {
      throw new Error('Paystack is not configured on the server.');
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error('NEXT_PUBLIC_BASE_URL is not configured.');
    }

    const { createPendingBooking } = await import('./create-booking-and-assign-trip');
    const pendingResult = await createPendingBooking(bookingData);
    if (!pendingResult.success || !pendingResult.booking) {
        throw new Error(pendingResult.error || 'Failed to hold seat for booking.');
    }

    const updatedMetadata = {
        ...metadata,
        booking_id: pendingResult.booking.id,
    };

    const response = await paystack.transaction.initialize({
      email,
      amount: Math.round(amount),
      metadata: updatedMetadata,
      callback_url: `${baseUrl}/payment/callback`
    });

    if (!response || !response.data) {
        throw new Error('Paystack initialization failed - No data returned from Paystack.');
    }

    return { status: true, data: response.data };
  } catch (error: any) {
    console.error('Paystack initialization error:', error.message);
    return { status: false, message: error.message };
  }
};

/**
 * Verifies the transaction and updates the held booking to 'Paid'.
 */
export const verifyTransactionAndCreateBooking = async (reference: string) => {
    try {
        if (!paystack) {
            throw new Error('Paystack is not configured on the server.');
        }

        const verificationResponse = await paystack.transaction.verify(reference);
        if (!verificationResponse || !verificationResponse.data || verificationResponse.data.status !== 'success') {
            throw new Error(verificationResponse?.message || 'Payment verification failed.');
        }

        const metadata = verificationResponse.data.metadata;
        const bookingId = metadata.booking_id;
        
        if (!bookingId) {
            throw new Error('Booking ID is missing from transaction metadata.');
        }

        const admin = getFirebaseAdmin();
        const db = admin?.firestore();
        
        if (!db) {
            throw new Error('Database connection failed during verification.');
        }
        
        const bookingRef = db.collection('bookings').doc(bookingId);
        await bookingRef.update({
            status: 'Paid',
            paymentReference: reference,
            updatedAt: FieldValue.serverTimestamp(),
        });

        const bookingSnap = await bookingRef.get();
        const bookingData = bookingSnap.data();
        if (bookingData && bookingData.tripId) {
            const { checkAndConfirmTrip } = await import('./create-booking-and-assign-trip');
            await checkAndConfirmTrip(db, bookingData.tripId);
        }

        return { success: true, bookingId: bookingId };

    } catch (error: any) {
        console.error('Verification and booking update failed:', error);
        return { success: false, error: error.message || 'An internal server error occurred during payment verification.' };
    }
};
