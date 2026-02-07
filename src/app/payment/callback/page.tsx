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
  
  // Use a ref to ensure verification only runs once per mount
  const verificationStarted = useRef(false);

  useEffect(() => {
    const reference = searchParams.get('reference');

    if (!reference) {
      setStatus('error');
      setMessage('No payment reference found. Your payment may not have been processed correctly.');
      return;
    }
    
    if (verificationStarted.current) return;
    verificationStarted.current = true;

    const verify = async () => {
      try {
        const result = await verifyTransactionAndCreateBooking(reference);
        if (result.success) {
          setStatus('success');
          setMessage(`Booking confirmed! Your reference ID is ${result.bookingId?.substring(0, 8)}. A confirmation email will be sent once your trip is full.`);
        } else {
          setStatus('error');
          setMessage(result.error || 'Payment was not successful. Please contact support if your bank was debited.');
        }
      } catch (error: any) {
        console.error('Verification error caught in UI:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'A network error occurred. Please contact us at tecotransportservices@gmail.com.');
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="bg-card p-8 rounded-xl shadow-2xl max-w-md w-full border border-border/50">
        {status === 'loading' && (
          <>
            <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-6" />
            <h1 className="text-3xl font-bold font-headline mb-2">Processing...</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            <h1 className="text-3xl font-bold font-headline mb-2">Payment Successful!</h1>
            <p className="text-muted-foreground mb-8">{message}</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
            <h1 className="text-3xl font-bold font-headline mb-2 text-foreground">An Error Occurred</h1>
            <p className="text-muted-foreground mb-8">{message}</p>
          </>
        )}

        <Button asChild className="w-full font-bold" size="lg">
          <Link href="/">
              <Home className="mr-2 h-5 w-5" />
              Back to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
    return (
        <ClientOnly>
          <Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <h1 className="text-2xl font-bold font-headline mt-4">Loading...</h1>
              </div>
          }>
              <PaymentCallback />
          </Suspense>
        </ClientOnly>
    )
}