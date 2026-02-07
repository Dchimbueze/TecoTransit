'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyTransactionAndCreateBooking } from '@/app/actions/paystack';
import { CheckCircle, AlertCircle, Loader2, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ClientOnly } from '@/components/client-only';

function PaymentCallback() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your payment, please wait...');
  
  // Use a ref to ensure verification only runs once
  const verificationStarted = useRef(false);

  useEffect(() => {
    const reference = searchParams.get('reference');

    if (!reference) {
      setStatus('error');
      setMessage('No payment reference found. Your payment may not have been processed correctly.');
      return;
    }
    
    // Prevent the effect from running twice in React Strict Mode (development)
    if (verificationStarted.current) {
        return;
    }
    
    verificationStarted.current = true;

    const verify = async () => {
      try {
        const result = await verifyTransactionAndCreateBooking(reference);
        if (result.success) {
          setStatus('success');
          setMessage(`Booking confirmed! Your booking ID is ${result.bookingId?.substring(0, 8)}. You will receive a confirmation email shortly.`);
        } else {
          setStatus('error');
          setMessage(result.error || 'An unknown error occurred while confirming your booking.');
        }
      } catch (error: any) {
        console.error('Verification error caught in UI:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'A network or server error occurred. Please contact support if your payment was successful.');
      }
    };

    verify();
  }, [searchParams]);


  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
      {status === 'loading' && (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <h1 className="text-2xl font-bold font-headline">Processing Payment</h1>
          <p className="text-muted-foreground mt-2 max-w-md">{message}</p>
        </>
      )}
      {status === 'success' && (
        <>
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
          <h1 className="text-2xl font-bold font-headline">Payment Successful!</h1>
          <p className="text-muted-foreground mt-2 max-w-md">{message}</p>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h1 className="text-2xl font-bold font-headline">An Error Occurred</h1>
          <p className="text-muted-foreground mt-2 max-w-md">{message}</p>
        </>
      )}
      <Button asChild className="mt-8">
        <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            Back to Home
        </Link>
      </Button>
    </div>
  );
}

export default function PaymentCallbackPage() {
    return (
        <ClientOnly>
          <Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <h1 className="text-2xl font-bold font-headline">Loading...</h1>
              </div>
          }>
              <PaymentCallback />
          </Suspense>
        </ClientOnly>
    )
}
