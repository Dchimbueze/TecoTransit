
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, TestTube2, Loader2, Calendar as CalendarIcon, Wallet } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";

const paymentSettingsDocRef = doc(db, "settings", "payment");
const bookingSettingsDocRef = doc(db, "settings", "booking");

export default function AdminSettingsPage() {
  const [isOPayEnabled, setIsOPayEnabled] = useState(true);
  const [bookingDateRange, setBookingDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unsubPayment = onSnapshot(paymentSettingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setIsOPayEnabled(docSnap.data().isOPayEnabled ?? true);
      } else {
        setDoc(paymentSettingsDocRef, { isOPayEnabled: true });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching payment settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch payment settings.",
      });
      setLoading(false);
    });

    const unsubBooking = onSnapshot(bookingSettingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const range: DateRange = {};
            if (data.startDate) range.from = data.startDate.toDate();
            if (data.endDate) range.to = data.endDate.toDate();
            setBookingDateRange(range);
        }
    }, (error) => {
        console.error("Error fetching booking settings:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not fetch booking settings.",
        });
    });

    return () => {
        unsubPayment();
        unsubBooking();
    };
  }, [toast]);

  const handleTogglePayment = async (enabled: boolean) => {
    try {
      await setDoc(paymentSettingsDocRef, { isOPayEnabled: enabled });
      toast({
        title: "Settings Updated",
        description: `OPay integration is now ${enabled ? "enabled" : "disabled"}.`,
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update payment settings.",
      });
    }
  };

  const handleSaveBookingWindow = async () => {
    if (!bookingDateRange?.from || !bookingDateRange?.to) {
        toast({ variant: "destructive", title: "Invalid Range", description: "Please select a start and end date." });
        return;
    }
    setIsSaving(true);
    try {
        await setDoc(bookingSettingsDocRef, {
            startDate: Timestamp.fromDate(bookingDateRange.from),
            endDate: Timestamp.fromDate(bookingDateRange.to),
        });
        toast({ title: "Settings Saved", description: "The booking window has been updated." });
    } catch (error) {
        console.error("Error saving booking window:", error);
        toast({ variant: "destructive", title: "Save Failed", description: "Could not save the booking window." });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Application Settings</h1>
        <p className="text-muted-foreground">Manage integrations and other application settings.</p>
      </div>

       <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Booking Window Settings</CardTitle>
          <CardDescription>
            Define the range of dates for which customers can make bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             <div className="grid gap-2">
                <Label>Select Available Date Range</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                        "w-full justify-start text-left font-normal",
                        !bookingDateRange && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookingDateRange?.from ? (
                        bookingDateRange.to ? (
                            <>
                            {format(bookingDateRange.from, "LLL dd, y")} -{" "}
                            {format(bookingDateRange.to, "LLL dd, y")}
                            </>
                        ) : (
                            format(bookingDateRange.from, "LLL dd, y")
                        )
                        ) : (
                        <span>Pick a date range</span>
                        )}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={bookingDateRange?.from}
                        selected={bookingDateRange}
                        onSelect={setBookingDateRange}
                        numberOfMonths={2}
                    />
                    </PopoverContent>
                </Popover>
            </div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleSaveBookingWindow} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Window
            </Button>
        </CardFooter>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Developer Settings</CardTitle>
          <CardDescription>
            These settings are for testing and development purposes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="opay-toggle" className="text-base font-semibold">
                Enable OPay Merchant Payments
              </Label>
              <p className="text-sm text-muted-foreground">
                When disabled, the booking form will bypass OPay and create a 'Pending' booking for testing.
              </p>
            </div>
            {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <div className="flex items-center space-x-2">
                {isOPayEnabled ? (
                    <Wallet className="h-5 w-5 text-primary" />
                ) : (
                    <TestTube2 className="h-5 w-5 text-amber-500" />
                )}
                <Switch
                    id="opay-toggle"
                    checked={isOPayEnabled}
                    onCheckedChange={handleTogglePayment}
                />
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
