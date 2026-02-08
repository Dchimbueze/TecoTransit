import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const BookingForm = dynamic(() => import('@/components/booking-form'), {
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-[400px] w-full rounded-lg" />
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  ),
});

export default function BookPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold font-headline text-primary tracking-tight">
          Book Your Trip with TecoTransit
        </h1>
        <p className="text-lg md:text-xl text-foreground mt-2 max-w-2xl mx-auto">
          Fast, reliable, and comfortable rides to your destination.
        </p>
      </div>
      <div className="max-w-3xl mx-auto">
        <BookingForm />
      </div>
    </div>
  );
}
