
'use server';

import Paystack from 'paystack';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { assignBookingToTrip } from './create-booking-and-assign-trip';

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY is not set in environment variables.');
}

const paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);

interface InitializeTransactionArgs {
  email: string;
  amount: number;
  metadata: Record<string, any>;
}

export const initializeTransaction = async ({ email, amount, metadata }: InitializeTransactionArgs) => {
  try {
    const response = await paystack.transaction.initialize({
      email,
      amount: Math.round(amount),
      metadata,
      callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/callback`
    });
    return { status: true, data: response.data };
  } catch (error: any) {
    console.error('Paystack initialization error:', error.message);
    return { status: false, message: error.message };
  }
};

export const verifyTransactionAndCreateBooking = async (reference: string) => {
    try {
        const verificationResponse = await paystack.transaction.verify(reference);
        if (verificationResponse.data?.status !== 'success') {
            throw new Error('Payment was not successful.');
        }

        const metadata = verificationResponse.data.metadata;
        if (!metadata || !metadata.booking_details) {
            throw new Error('Booking metadata is missing from transaction.');
        }
        
        const bookingDetails = JSON.parse(metadata.booking_details);

        const db = getFirebaseAdmin().firestore();
        
        const result = await db.runTransaction(async (transaction) => {
            const newBookingRef = db.collection('bookings').doc();
            const newBookingData = {
                ...bookingDetails,
                createdAt: FieldValue.serverTimestamp(),
                status: 'Paid' as const,
                paymentReference: reference,
            };
            
            transaction.set(newBookingRef, newBookingData);
            return { id: newBookingRef.id, ...newBookingData };
        });
        
        await assignBookingToTrip({
            ...result,
            createdAt: Date.now()
        } as any);

        return { success: true, bookingId: result.id };

    } catch (error: any) {
        console.error('Verification and booking creation failed:', error);
        return { success: false, error: error.message };
    }
};
