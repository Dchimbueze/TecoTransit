
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { locations, vehicleOptions as allVehicleOptions, LUGGAGE_FARE } from '@/lib/constants';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, User, Mail, Phone, Loader2, MessageCircle, HelpCircle, CreditCard, Send, Users, Plus, Trash2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from './ui/checkbox';
import BookingConfirmationDialog from './booking-confirmation-dialog';
import { initializeTransaction } from '@/app/actions/paystack';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/context/settings-context';
import { createPendingBooking } from '@/app/actions/create-booking-and-assign-trip';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PriceRule, SeatAvailability } from '@/lib/types';
import { Separator } from './ui/separator';

const bookingSchema = z.object({
  name: z.string().min(2, { message: 'Lead passenger name is required.' }),
  email: z.string().email({ message: 'A valid email address is required.' }),
  phone: z.string().min(10, { message: 'Please enter a valid phone number.' }),
  pickup: z.string({ required_error: 'Please select a pickup location.' }),
  destination: z.string({ required_error: 'Please select a destination.' }),
  intendedDate: z.date({ required_error: 'A departure date is required.' }),
  vehicleType: z.string({ required_error: 'You need to select a vehicle type.' }),
  luggageCount: z.coerce.number().min(0).max(10),
  passengers: z.array(z.object({
    name: z.string().min(2, { message: 'Passenger name is required.' }),
    email: z.string().email({ message: 'Valid email is required.' }),
    phone: z.string().min(10, { message: 'Phone number is required.' }),
  })).min(1, 'At least one passenger is required.'),
  privacyPolicy: z.literal(true, {
    errorMap: () => ({ message: "You must accept the privacy policy to continue." }),
  }),
  allowReschedule: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the reschedule policy to continue." }),
  }),
}).refine(data => data.pickup !== data.destination, {
  message: "Pickup and destination cannot be the same.",
  path: ["destination"],
});

const contactOptions = [
    { name: 'Tolu', link: 'https://wa.me/qr/VNXLPTJVCSHQF1' },
    { name: 'Esther', link: 'https://wa.me/message/OD5WZAO2CUCIF1' },
    { name: 'Abraham', link: 'https://wa.me/+2348104050628' },
];

export default function BookingForm() {
  const { toast } = useToast();
  const [prices, setPrices] = useState<PriceRule[]>([]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const { isPaystackEnabled, bookingDateRange, loading: settingsLoading } = useSettings();
  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isIntendedDatePopoverOpen, setIsIntendedDatePopoverOpen] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  
  const [seatAvailability, setSeatAvailability] = useState<SeatAvailability | null>(null);
  const [fetchingSeats, setFetchingSeats] = useState(false);

  const form = useForm<z.infer<typeof bookingSchema>>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      luggageCount: 0,
      privacyPolicy: false,
      allowReschedule: false,
      passengers: [{ name: '', email: '', phone: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "passengers",
  });

  useEffect(() => {
    const q = query(collection(db, "prices"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const pricesData: PriceRule[] = [];
      querySnapshot.forEach((doc) => {
        pricesData.push({ id: doc.id, ...doc.data() } as PriceRule);
      });
      setPrices(pricesData);
      setPricesLoading(false);
    }, (error) => {
      console.error("Error fetching prices: ", error);
      toast({
        variant: "destructive",
        title: "Could not load prices",
        description: "There was an issue fetching pricing data.",
      });
      setPricesLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const { watch, setValue, handleSubmit: formHandleSubmit } = form;
  const pickup = watch("pickup");
  const destination = watch("destination");
  const vehicleType = watch("vehicleType");
  const luggageCount = watch("luggageCount");
  const intendedDate = watch("intendedDate");
  const passengers = watch("passengers");

  // Synchronize lead passenger info with the first passenger in the list
  useEffect(() => {
      if (passengers.length > 0) {
          setValue('name', passengers[0].name);
          setValue('email', passengers[0].email || '');
          setValue('phone', passengers[0].phone);
      }
  }, [passengers, setValue]);

  const availableVehicles = useMemo(() => {
    if (pickup && destination && prices) {
      return prices.filter(
        (p) => p.pickup === pickup && p.destination === destination && (p.vehicleCount || 0) > 0
      );
    }
    return [];
  }, [pickup, destination, prices]);
  
  const selectedVehicleConfig = useMemo(() => {
    return Object.values(allVehicleOptions).find(v => v.name === vehicleType);
  }, [vehicleType]);

  const vehicleCapacity = selectedVehicleConfig?.capacity || 0;

  useEffect(() => {
    const isVehicleStillValid = availableVehicles.some(p => p.vehicleType === vehicleType);
    if (pickup && destination && vehicleType && !isVehicleStillValid) {
        setValue('vehicleType', '', { shouldValidate: true });
    }
  }, [pickup, destination, vehicleType, setValue, availableVehicles]);

  useEffect(() => {
    async function fetchSeats() {
        if (pickup && destination && vehicleType && intendedDate) {
            setFetchingSeats(true);
            try {
                const dateStr = format(intendedDate, 'yyyy-MM-dd');
                const response = await fetch(`/api/seats?pickup=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(destination)}&vehicleType=${encodeURIComponent(vehicleType)}&date=${dateStr}`);
                const data = await response.json();
                if (response.ok) {
                    console.log(`[BookingForm] Seat Availability Received:`, data);
                    setSeatAvailability(data);
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                console.error("Failed to fetch seat availability:", error);
                setSeatAvailability(null);
            } finally {
                setFetchingSeats(false);
            }
        } else {
            setSeatAvailability(null);
        }
    }
    fetchSeats();
  }, [pickup, destination, vehicleType, intendedDate]);

  const { totalFare, baseFarePerPerson } = useMemo(() => {
    const vehicleRule = availableVehicles.find(v => v.vehicleType === vehicleType);
    const farePerPerson = vehicleRule ? vehicleRule.price : 0;
    const passengerCount = passengers?.length || 1;
    const newTotalFare = (farePerPerson * passengerCount) + ((luggageCount ?? 0) * LUGGAGE_FARE);
    return { totalFare: newTotalFare, baseFarePerPerson: farePerPerson };
  }, [availableVehicles, vehicleType, luggageCount, passengers]);

  const canAddPassenger = useMemo(() => {
    if (!vehicleType || !seatAvailability) return false;
    const currentCount = passengers.length;
    // Cannot exceed vehicle's fixed capacity OR total remaining seats in the fleet
    return currentCount < vehicleCapacity && currentCount < seatAvailability.availableSeats;
  }, [vehicleType, vehicleCapacity, seatAvailability, passengers.length]);

  const onBookingSubmit = async (formData: z.infer<typeof bookingSchema>) => {
    if (baseFarePerPerson <= 0) {
      toast({ variant: 'destructive', title: 'Route Unavailable', description: 'This route is currently not available.' });
      return;
    }

    if (formData.passengers.length > vehicleCapacity) {
        toast({
            variant: 'destructive',
            title: 'Group Too Large',
            description: `A single ${vehicleType} can only accommodate up to ${vehicleCapacity} passengers.`,
        });
        return;
    }

    if (seatAvailability && formData.passengers.length > seatAvailability.availableSeats) {
        toast({
            variant: 'destructive',
            title: 'Not Enough Seats',
            description: `Only ${seatAvailability.availableSeats} seats are available for this slot.`,
        });
        return;
    }
    
    setIsProcessing(true);

    try {
        const dateStr = format(formData.intendedDate, 'yyyy-MM-dd');
        const priceRuleId = `${formData.pickup}_${formData.destination}_${formData.vehicleType}`.toLowerCase().replace(/\s+/g, '-');
        
        const cleanBookingData = {
          ...formData,
          intendedDate: dateStr,
          totalFare,
        };

        if (isPaystackEnabled) {
            const result = await initializeTransaction({
                email: formData.email,
                amount: totalFare * 100, 
                metadata: {
                    priceRuleId,
                    booking_details: JSON.stringify(cleanBookingData),
                }
            });
            
            if (result.status && result.data?.authorization_url) {
                router.push(result.data.authorization_url);
            } else {
                throw new Error(result.message || 'Failed to initialize payment.');
            }
        } else {
            await createPendingBooking({
                ...cleanBookingData,
                intendedDate: dateStr // Ensure string is used
            } as any);
            setIsConfirmationOpen(true);
            form.reset();
        }

    } catch (error) {
        console.error("Booking error:", error);
        toast({
            variant: "destructive",
            title: "Something went wrong.",
            description: error instanceof Error ? error.message : "Please try again.",
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const luggageOptions = selectedVehicleConfig ? 
    [...Array((selectedVehicleConfig.maxLuggages ?? 0) + 1).keys()] : 
    [];

  return (
    <>
    <Card className="w-full shadow-2xl shadow-primary/10">
       <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
                <CardTitle className="font-headline text-2xl md:text-3xl text-primary">Travel Reservation</CardTitle>
                <CardDescription className="mt-2">Groups must fit within one vehicle ({vehicleCapacity || '?'} seats).</CardDescription>
            </div>
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0"><HelpCircle className="mr-2 h-4 w-4" />Help</Button>
                </DialogTrigger>
                 <DialogContent className="max-w-md p-6">
                    <DialogHeader className="text-center">
                        <DialogTitle>Customer Support</DialogTitle>
                        <DialogDescription>Need help with your group booking?</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {contactOptions.map(contact => (
                            <Button asChild key={contact.name} className="w-full" size="lg">
                                <Link href={contact.link} target="_blank"><MessageCircle className="mr-2 h-5 w-5" />Chat with {contact.name}</Link>
                            </Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={formHandleSubmit(onBookingSubmit)}>
          <CardContent className="space-y-8 pt-6">
            
            {/* Step 1: Route & Date */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">1</div>
                    <h3>Route Details</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 bg-muted/20 p-6 rounded-xl border border-dashed">
                    <FormField control={form.control} name="pickup" render={({ field }) => (
                        <FormItem>
                        <FormLabel>Pickup Point</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                            <SelectContent>{locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="destination" render={({ field }) => (
                        <FormItem>
                        <FormLabel>Destination</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''} disabled={!pickup}>
                            <FormControl><SelectTrigger><SelectValue placeholder={!pickup ? 'Select pickup first' : 'Select'} /></SelectTrigger></FormControl>
                            <SelectContent>{locations.filter(loc => loc !== pickup).map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="intendedDate" render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Departure Date</FormLabel>
                        <Popover open={isIntendedDatePopoverOpen} onOpenChange={setIsIntendedDatePopoverOpen}>
                            <PopoverTrigger asChild><FormControl>
                                <Button variant={"outline"} className={cn("w-full justify-start pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                                </Button>
                            </FormControl></PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setIsIntendedDatePopoverOpen(false); }} fromDate={bookingDateRange?.from} toDate={bookingDateRange?.to} disabled={(date) => date <= new Date(new Date().setHours(0,0,0,0))} initialFocus />
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="vehicleType" render={({ field }) => (
                        <FormItem>
                        <FormLabel>Vehicle Preference</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={pricesLoading || availableVehicles.length === 0}>
                            <FormControl><SelectTrigger><SelectValue placeholder={!pickup || !destination ? 'Select route first' : 'Select vehicle'} /></SelectTrigger></FormControl>
                            <SelectContent>{availableVehicles.map((v) => <SelectItem key={v.id} value={v.vehicleType}>{v.vehicleType}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )} />
                </div>
            </div>

            {/* Step 2: Passengers */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">2</div>
                        <h3>Travelers</h3>
                    </div>
                    {seatAvailability && (
                        <div className={cn("text-xs font-bold px-3 py-1 rounded-full border", seatAvailability.availableSeats > 0 ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200")}>
                            {seatAvailability.availableSeats} seats available in total
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {fields.map((field, index) => (
                        <Card key={field.id} className="relative group overflow-hidden border-primary/10">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/30" />
                            {index > 0 && (
                                <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                            <CardContent className="p-6">
                                <div className="grid sm:grid-cols-3 gap-6">
                                    <FormField control={form.control} name={`passengers.${index}.name`} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{index === 0 ? 'Lead Passenger' : `Traveler ${index + 1}`}</FormLabel>
                                            <FormControl><div className="relative"><User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/50" /><Input placeholder="Full Name" {...field} className="pl-8" /></div></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name={`passengers.${index}.phone`} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mobile Phone</FormLabel>
                                            <FormControl><div className="relative"><Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/50" /><Input type="tel" placeholder="080..." {...field} className="pl-8" /></div></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name={`passengers.${index}.email`} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email Address</FormLabel>
                                            <FormControl><div className="relative"><Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/50" /><Input type="email" placeholder="you@email.com" {...field} className="pl-8" /></div></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    
                    <div className="flex flex-col gap-2">
                        <Button type="button" variant="outline" className="w-full border-dashed h-12" onClick={() => append({ name: '', email: '', phone: '' })} disabled={!canAddPassenger}>
                            <Plus className="mr-2 h-4 w-4" />
                            {passengers.length >= vehicleCapacity && vehicleType ? `Capacity Limit Reached (${vehicleCapacity} seats)` : 'Add Friend / Companion'}
                        </Button>
                        {!canAddPassenger && vehicleType && seatAvailability && seatAvailability.availableSeats > 0 && passengers.length >= vehicleCapacity && (
                            <p className="text-[10px] text-amber-600 flex items-center gap-1 px-1">
                                <Info className="h-3 w-3" /> Note: For groups larger than {vehicleCapacity}, please make separate bookings.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Step 3: Preferences */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">3</div>
                    <h3>Policies</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-6">
                    <FormField control={form.control} name="luggageCount" render={({ field }) => (
                        <FormItem>
                        <FormLabel>Heavy Luggage Count (Group Total)</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value, 10))} value={String(field.value || 0)} disabled={!vehicleType}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Bags" /></SelectTrigger></FormControl>
                            <SelectContent>{luggageOptions.map(i => <SelectItem key={i} value={String(i)}>{i === 0 ? 'No large bags' : `${i} heavy bag${i > 1 ? 's' : ''}`}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <div className="space-y-3">
                        <FormField control={form.control} name="allowReschedule" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-card">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                <div className="space-y-1 leading-none"><FormLabel className="text-sm">Allow auto-rescheduling if vehicle isn't full</FormLabel></div>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="privacyPolicy" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-card">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                <div className="space-y-1 leading-none"><FormLabel className="text-sm">I agree to the <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link></FormLabel></div>
                            </FormItem>
                        )} />
                    </div>
                </div>
            </div>

            {fetchingSeats && (
                <div className="flex items-center gap-2 p-4 bg-primary/5 rounded-lg text-sm border border-primary/10">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="animate-pulse">Checking seat availability...</span>
                </div>
            )}
          </CardContent>
          <CardFooter className="bg-primary/5 px-6 py-6 flex flex-col sm:flex-row items-center justify-between border-t border-primary/20">
            <div className="mb-4 sm:mb-0 text-center sm:text-left">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Total Group Fare</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-primary">₦{totalFare.toLocaleString()}</span>
                    <span className="text-sm font-medium text-muted-foreground">({passengers.length} seat{passengers.length > 1 ? 's' : ''})</span>
                </div>
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto h-14 px-12 text-lg font-bold shadow-xl shadow-primary/20" disabled={isProcessing || settingsLoading || (seatAvailability !== null && passengers.length > seatAvailability.availableSeats)}>
              {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5" />}
              {isProcessing ? 'Confirming...' : 'Secure Booking'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>

    <BookingConfirmationDialog isOpen={isConfirmationOpen} onClose={() => setIsConfirmationOpen(false)} />
    </>
  );
}
