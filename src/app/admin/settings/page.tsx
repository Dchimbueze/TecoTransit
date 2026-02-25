
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, TestTube2, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";

const globalSettingsDocRef = doc(db, "settings", "global");

export default function AdminSettingsPage() {
  const [isPaystackEnabled, setIsPaystackEnabled] = useState(true);
  const [bookingDateRange, setBookingDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(globalSettingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIsPaystackEnabled(data.isPaystackEnabled ?? true);
        
        if (data.bookingDateRange) {
            setBookingDateRange({
                from: data.bookingDateRange.from ? new Date(data.bookingDateRange.from) : undefined,
                to: data.bookingDateRange.to ? new Date(data.bookingDateRange.to) : undefined,
            });
        }
      } else {
        setDoc(globalSettingsDocRef, { isPaystackEnabled: true });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching settings:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch settings." });
      setLoading(false);
    });

    return () => unsub();
  }, [toast]);

  const handleTogglePayment = async (enabled: boolean) => {
    try {
      await setDoc(globalSettingsDocRef, { isPaystackEnabled: enabled }, { merge: true });
      toast({ title: "Settings Updated", description: `Paystack is now ${enabled ? "enabled" : "disabled"}.` });
    } catch (error) {
      console.error("Error updating payment settings:", error);
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update payment settings." });
    }
  };

  const handleSaveBookingWindow = async () => {
    if (!bookingDateRange?.from || !bookingDateRange?.to) {
        toast({ variant: "destructive", title: "Invalid Range", description: "Please select start and end dates." });
        return;
    }
    setIsSaving(true);
    try {
        await setDoc(globalSettingsDocRef, {
            bookingDateRange: {
                from: bookingDateRange.from.toISOString(),
                to: bookingDateRange.to.toISOString(),
            },
        }, { merge: true });
        toast({ title: "Settings Saved", description: "The booking window has been updated." });
    } catch (error) {
        console.error("Error saving booking window:", error);
        toast({ variant: "destructive", title: "Save Failed", description: "Could not save settings." });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Application Settings</h1>
        <p className="text-muted-foreground">Manage Paystack integration and booking windows.</p>
      </div>

       <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Booking Window</CardTitle>
          <CardDescription>Define when customers can travel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             <div className="grid gap-2">
                <Label>Date Range</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className={cn("w-full justify-start text-left", !bookingDateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookingDateRange?.from ? (
                            bookingDateRange.to ? (
                                <>{format(bookingDateRange.from, "LLL dd, y")} - {format(bookingDateRange.to, "LLL dd, y")}</>
                            ) : (format(bookingDateRange.from, "LLL dd, y"))
                        ) : (<span>Pick a range</span>)}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="range" selected={bookingDateRange} onSelect={setBookingDateRange} numberOfMonths={2} />
                    </PopoverContent>
                </Popover>
            </div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleSaveBookingWindow} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
            </Button>
        </CardFooter>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Payment Integration</CardTitle>
          <CardDescription>Manage Paystack gateway status.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label className="text-base font-semibold">Enable Paystack Payments</Label>
              <p className="text-sm text-muted-foreground">If disabled, bookings will be created as 'Pending' without payment.</p>
            </div>
            {loading ? (<Loader2 className="h-5 w-5 animate-spin" />) : (
                <div className="flex items-center space-x-2">
                    {isPaystackEnabled ? <CreditCard className="h-5 w-5 text-primary" /> : <TestTube2 className="h-5 w-5 text-amber-500" />}
                    <Switch checked={isPaystackEnabled} onCheckedChange={handleTogglePayment} />
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
