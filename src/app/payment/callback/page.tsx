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
  const [message, setMessage] = useState('Verifying your payment...');
  
  const verificationStarted = useRef(false);

  useEffect(() => {
    const reference = searchParams.get('reference');

    if (!reference) {
      setStatus('error');
      setMessage('Payment was not successful.');
      return;
    }
    
    if (verificationStarted.current) return;
    verificationStarted.current = true;

    const verify = async () => {
      try {
        const result = await verifyTransactionAndCreateBooking(reference);
        if (result.success) {
          setStatus('success');
          setMessage(`Booking confirmed! Your reference ID is ${result.bookingId?.substring(0, 8)}.`);
        } else {
          setStatus('error');
          setMessage(result.error || 'Payment was not successful.');
        }
      } catch (error: any) {
        console.error('Verification error:', error);
        setStatus('error');
        setMessage('Payment was not successful.');
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-[#0c0c0e] text-center p-6">
      <div className="w-full max-w-sm">
        {status === 'loading' && (
          <div className="flex flex-col items-center animate-in fade-in duration-500">
            <Loader2 className="h-16 w-16 animate-spin text-primary mb-8" />
            <h1 className="text-2xl font-bold text-white mb-2">Verifying Payment</h1>
            <p className="text-muted-foreground">{message}</p>
          </div>
        )}
        
        {status === 'success' && (
          <div className="flex flex-col items-center animate-in zoom-in-95 duration-500">
            <CheckCircle className="h-20 w-20 text-green-500 mb-8" />
            <h1 className="text-3xl font-bold text-white mb-4">Payment Successful!</h1>
            <p className="text-gray-400 mb-10 leading-relaxed">{message}</p>
            <Button asChild className="w-full h-12 font-bold text-lg bg-primary hover:bg-primary/90 text-primary-foreground" size="lg">
              <Link href="/">
                  <Home className="mr-2 h-5 w-5" />
                  Back to Home
              </Link>
            </Button>
          </div>
        )}
        
        {status === 'error' && (
          <div className="flex flex-col items-center animate-in zoom-in-95 duration-500">
            <div className="flex items-center justify-center h-20 w-20 rounded-full bg-destructive/10 border-4 border-destructive/20 mb-8">
               <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">An Error Occurred</h1>
            <p className="text-gray-400 mb-10 leading-relaxed">{message}</p>
            <Button asChild className="w-full h-12 font-bold text-lg bg-primary hover:bg-primary/90 text-primary-foreground" size="lg">
              <Link href="/">
                  <Home className="mr-2 h-5 w-5" />
                  Back to Home
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
    return (
        <ClientOnly>
          <Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-[80vh] bg-[#0c0c0e] text-center p-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <h1 className="text-xl font-bold text-white">Loading...</h1>
              </div>
          }>
              <PaymentCallback />
          </Suspense>
        </ClientOnly>
    )
}
