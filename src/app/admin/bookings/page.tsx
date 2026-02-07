
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO, startOfMonth, subDays } from "date-fns";
import type { Booking } from "@/lib/types";
import { DateRange } from "react-day-picker";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, MapPin, Car, Bus, Calendar as CalendarIcon, CheckCircle, Download, RefreshCw, Trash2, Search, HandCoins, Ban, CircleDot, Check, CreditCard, Sparkles, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getAllBookings } from "@/lib/data";
import { getStatusVariant } from "@/lib/utils";
import { deleteBooking, deleteBookingsInRange, manuallyRescheduleBooking } from "@/app/actions/booking-actions";
import { synchronizeAndCreateTrips } from "@/app/actions/synchronize-bookings";
import { rescheduleUnderfilledTrips } from "@/app/actions/reschedule-bookings";

type BulkDeleteMode = 'all' | '7d' | '30d' | 'custom';

function BookingsPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div>
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-72 mt-2" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-9" />
                </div>
            </div>
            <Card>
                <CardHeader>
                    <div className="flex justify-between">
                         <Skeleton className="h-6 w-56" />
                         <Skeleton className="h-6 w-32" />
                    </div>
                     <div className="mt-4 flex items-center gap-2">
                        <Skeleton className="h-9 w-64" />
                        <Skeleton className="h-9 w-40" />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead><Skeleton className="h-5 w-24" /></TableHead>
                                <TableHead><Skeleton className="h-5 w-32" /></TableHead>
                                <TableHead><Skeleton className="h-5 w-24" /></TableHead>
                                <TableHead><Skeleton className="h-5 w-16" /></TableHead>
                                <TableHead className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...Array(10)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

const getStatusIcon = (status: Booking['status']) => {
    switch (status) {
        case 'Confirmed': return <CheckCircle className="h-4 w-4 text-green-500" />;
        case 'Cancelled': return <Ban className="h-4 w-4 text-destructive" />;
        case 'Paid': return <HandCoins className="h-4 w-4 text-blue-500" />;
        case 'Pending': return <CircleDot className="h-4 w-4 text-amber-500" />;
        case 'Refunded': return <CreditCard className="h-4 w-4 text-slate-500" />;
        default: return <Check className="h-4 w-4" />;
    }
};

export default function AdminBookingsPage() {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<Booking['status'] | 'All'>('All');
  
  const [deleteDateRange, setDeleteDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [isCustomDeleteOpen, setIsCustomDeleteOpen] = useState(false);

  const [newRescheduleDate, setNewRescheduleDate] = useState<Date | undefined>();
  const [isRescheduleConfirmOpen, setIsRescheduleConfirmOpen] = useState(false);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
        const { bookings, error } = await getAllBookings();
        if (error) {
            throw new Error(error);
        }
        setAllBookings(bookings);
    } catch (e: any) {
        setError(e.message);
        toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
        setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const openDialog = (bookingId: string) => {
    const booking = allBookings.find(b => b.id === bookingId);
    if (booking) {
        setSelectedBooking(booking);
        setIsManageDialogOpen(true);
    }
  }

  const handleDeleteBooking = async () => {
    if (!selectedBooking) return;
    setIsDeleting(true);
    try {
      await deleteBooking(selectedBooking.id);
      toast({
        title: "Booking Deleted",
        description: `Booking has been permanently deleted.`,
      });
      setIsManageDialogOpen(false);
      fetchBookings();
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not delete the booking. Please try again.",
      });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleBulkDelete = async (mode: BulkDeleteMode) => {
    let from: Date | null = null;
    let to: Date | null = new Date();
    let description = '';

    switch (mode) {
        case 'all':
            from = null;
            to = null;
            description = 'all bookings';
            break;
        case '7d':
            from = subDays(to, 7);
            description = `bookings from the last 7 days`;
            break;
        case '30d':
            from = subDays(to, 30);
            description = `bookings from the last 30 days`;
            break;
        case 'custom':
            if (!deleteDateRange?.from || !deleteDateRange?.to) {
                toast({ variant: "destructive", title: "Invalid Date Range" });
                return;
            }
            from = deleteDateRange.from;
            to = deleteDateRange.to;
            description = `bookings from ${format(from, 'PPP')} to ${format(to, 'PPP')}`;
            break;
    }

    setIsBulkDeleting(true);
    try {
        const count = await deleteBookingsInRange(from, to);
        toast({
            title: "Bulk Delete Successful",
            description: `${count} ${description} have been deleted.`,
        });
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Bulk Delete Failed", description: e.message });
    } finally {
        setIsBulkDeleting(false);
        setIsCustomDeleteOpen(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
        const result = await synchronizeAndCreateTrips();
        if (result.failed > 0) {
             toast({
                variant: "destructive",
                title: `Synchronization Partially Failed`,
                description: `${result.succeeded} succeeded, but ${result.failed} failed.`,
            });
        } else if (result.succeeded > 0) {
             toast({
                title: "Synchronization Complete",
                description: `${result.succeeded} booking(s) assigned to trips.`,
            });
        } else {
             toast({
                title: "Nothing to Synchronize",
                description: "All bookings are already assigned.",
            });
        }
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Synchronization Error", description: e.message });
    } finally {
        setIsSyncing(false);
    }
  }

  const handleRunReschedule = async () => {
    setIsRescheduling(true);
    try {
        const result = await rescheduleUnderfilledTrips();
        if (result.failedCount > 0) {
             toast({
                variant: "destructive",
                title: `Reschedule Job Partially Failed`,
                description: `Rescheduled ${result.rescheduledCount}, but ${result.failedCount} failed.`,
            });
        } else {
            toast({
                title: "Reschedule Job Complete",
                description: `Successfully processed ${result.rescheduledCount} passenger(s).`,
            });
        }
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Reschedule Error", description: e.message });
    } finally {
        setIsRescheduling(false);
    }
  };

  const handleManualReschedule = async () => {
    if (!selectedBooking || !newRescheduleDate) return;
    
    setIsProcessing(prev => ({...prev, reschedule: true}));
    try {
        const result = await manuallyRescheduleBooking(selectedBooking.id, format(newRescheduleDate, 'yyyy-MM-dd'));
        if (result.success) {
            toast({ title: "Booking Rescheduled", description: `Booking moved to ${format(newRescheduleDate, 'PPP')}.` });
            setIsManageDialogOpen(false);
            fetchBookings();
        } else {
            throw new Error(result.error);
        }
    } catch (error: any) {
        toast({ variant: "destructive", title: "Reschedule Failed", description: error.message });
    } finally {
        setIsProcessing(prev => ({...prev, reschedule: false}));
        setIsRescheduleConfirmOpen(false);
        setNewRescheduleDate(undefined);
    }
  };
  
  const filteredBookings = useMemo(() => {
    return allBookings
      .filter(booking => statusFilter === 'All' || booking.status === statusFilter)
      .filter(booking => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return booking.name.toLowerCase().includes(term) ||
               booking.email.toLowerCase().includes(term) ||
               booking.id.toLowerCase().includes(term);
      });
  }, [allBookings, statusFilter, searchTerm]);

  const downloadCSV = () => {
    if (filteredBookings.length === 0) return;
    const headers = ["ID", "Name", "Email", "Phone", "Route", "Date", "Vehicle", "Fare", "Status"];
    const csvContent = [
        headers.join(','),
        ...filteredBookings.map(b => [
            b.id,
            `"${b.name}"`,
            b.email,
            b.phone,
            `"${b.pickup} to ${b.destination}"`,
            b.intendedDate,
            b.vehicleType,
            b.totalFare,
            b.status
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };
  
  if (loading) return <BookingsPageSkeleton />;

  const VehicleIcon = selectedBooking?.vehicleType.includes('Bus') ? Bus : Car;

  return (
    <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Manage Bookings</h1>
                <p className="text-muted-foreground">Monitor customer reservations and trip allocations.</p>
            </div>
             <div className="flex items-center gap-2 self-start sm:self-center">
                <Button variant="outline" size="icon" onClick={fetchBookings}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
                <AlertDialog open={isCustomDeleteOpen} onOpenChange={setIsCustomDeleteOpen}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Delete All</DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently delete ALL booking records. This action cannot be undone.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleBulkDelete('all')} disabled={isBulkDeleting} className={cn(buttonVariants({variant: 'destructive'}))}>
                                            Delete All
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <DropdownMenuItem onClick={() => handleBulkDelete('7d')}>Last 7 Days</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkDelete('30d')}>Last 30 Days</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialogTrigger asChild>
                               <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Custom Range...</DropdownMenuItem>
                            </AlertDialogTrigger>
                        </DropdownMenuContent>
                    </DropdownMenu>
                     <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete Custom Range</AlertDialogTitle></AlertDialogHeader>
                        <div className="py-4">
                            <Calendar mode="range" selected={deleteDateRange} onSelect={setDeleteDateRange} numberOfMonths={2} />
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleBulkDelete('custom')} className={cn(buttonVariants({variant: 'destructive'}))}>Delete Selected</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
      
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <CardTitle>Bookings ({filteredBookings.length})</CardTitle>
                     <div className="flex items-center gap-2 w-full lg:w-auto">
                        <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
                            <Sparkles className="mr-2 h-4 w-4" /> Sync
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleRunReschedule} disabled={isRescheduling}>
                            <History className="mr-2 h-4 w-4" /> Run Rescheduler
                        </Button>
                        <Button variant="outline" size="sm" onClick={downloadCSV}><Download className="mr-2 h-4 w-4" /> CSV</Button>
                    </div>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search name/email/ID..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Statuses</SelectItem>
                            <SelectItem value="Confirmed">Confirmed</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                            <SelectItem value="Refunded">Refunded</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-4">Customer</TableHead>
                            <TableHead>Route</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="pr-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredBookings.map(booking => (
                            <TableRow key={booking.id}>
                                <TableCell className="pl-4">
                                    <div className="font-medium">{booking.name}</div>
                                    <div className="text-xs text-muted-foreground">{booking.email}</div>
                                </TableCell>
                                <TableCell className="text-sm">
                                    {booking.pickup} → {booking.destination}
                                </TableCell>
                                <TableCell className="text-sm">
                                    {format(parseISO(booking.intendedDate), 'MMM dd, yyyy')}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(booking.status)} className="gap-1">
                                        {getStatusIcon(booking.status)} {booking.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="pr-4 text-right">
                                    <Button variant="ghost" size="sm" onClick={() => openDialog(booking.id)}>Manage</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

      {selectedBooking && (
        <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
            <DialogContent className="p-0 max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader className="p-6 border-b">
                    <div className="flex items-center justify-between">
                        <DialogTitle>Booking Details: {selectedBooking.id.substring(0,8)}</DialogTitle>
                        <Badge variant={getStatusVariant(selectedBooking.status)}>{selectedBooking.status}</Badge>
                    </div>
                </DialogHeader>
                <div className="grid md:grid-cols-3 flex-1 overflow-y-auto">
                     <div className="md:col-span-2 p-6 space-y-6">
                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Customer</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2"><User className="h-4 w-4" /> {selectedBooking.name}</div>
                                    <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {selectedBooking.email}</div>
                                    <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {selectedBooking.phone}</div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Trip</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {selectedBooking.pickup} to {selectedBooking.destination}</div>
                                    <div className="flex items-center gap-2"><VehicleIcon className="h-4 w-4" /> {selectedBooking.vehicleType}</div>
                                    <div className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> {format(parseISO(selectedBooking.intendedDate), 'PPP')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="md:col-span-1 bg-muted/30 p-6 space-y-6">
                        <div className="space-y-4">
                            <h3 className="font-semibold">Financials</h3>
                            <div className="bg-background p-4 rounded-lg border shadow-sm">
                                <p className="text-xs text-muted-foreground">Total Fare</p>
                                <p className="text-2xl font-bold">₦{selectedBooking.totalFare.toLocaleString()}</p>
                            </div>
                            {selectedBooking.paymentReference && (
                                <div className="text-xs font-mono break-all opacity-70">
                                    Ref: {selectedBooking.paymentReference}
                                </div>
                            )}
                        </div>
                        <Separator />
                        <div className="space-y-4">
                            <h3 className="font-semibold">Manual Reschedule</h3>
                            <Calendar mode="single" selected={newRescheduleDate} onSelect={setNewRescheduleDate} />
                            <Button className="w-full" disabled={!newRescheduleDate} onClick={() => setIsRescheduleConfirmOpen(true)}>Update Date</Button>
                        </div>
                    </div>
                </div>
                <DialogFooter className="p-6 border-t bg-muted/10 flex justify-between items-center sm:justify-between">
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" className="text-destructive">Delete Permanently</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This removes the booking and frees any seats. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteBooking} className={cn(buttonVariants({variant:'destructive'}))}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button variant="secondary" onClick={() => setIsManageDialogOpen(false)}>Done</Button>
                </DialogFooter>
            </DialogContent>
            
            <AlertDialog open={isRescheduleConfirmOpen} onOpenChange={setIsRescheduleConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reschedule Passenger?</AlertDialogTitle>
                        <AlertDialogDescription>Moving to {newRescheduleDate ? format(newRescheduleDate, 'PPP') : ''}. The customer will be notified.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Abort</AlertDialogCancel>
                        <AlertDialogAction onClick={handleManualReschedule}>Confirm Change</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
      )}
    </div>
  );
}
