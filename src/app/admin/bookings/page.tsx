
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO, startOfMonth, subDays } from "date-fns";
import type { Booking } from "@/lib/types";
import { DateRange } from "react-day-picker";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, MapPin, Car, Bus, Briefcase, Calendar as CalendarIcon, CheckCircle, Download, RefreshCw, Trash2, AlertCircle, Loader2, Ticket, History, Search, HandCoins, Ban, CircleDot, Check, CreditCard, EllipsisVertical, Sparkles, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { getAllBookings } from "@/lib/data";
import { getStatusVariant } from "@/lib/utils";
import { updateBookingStatus, deleteBooking, deleteBookingsInRange, requestRefund, manuallyRescheduleBooking } from "@/app/actions/booking-actions";
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
            </div>
            <Card>
                <CardHeader>
                     <Skeleton className="h-6 w-56" />
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
                            {[...Array(5)].map((_, i) => (
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
  const [isReschedulePopoverOpen, setIsReschedulePopoverOpen] = useState(false);
  
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
        if (error) throw new Error(error);
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

  const handleUpdateBooking = async (status: 'Cancelled') => {
    if (!selectedBooking) return;
    setIsProcessing(prev => ({...prev, [selectedBooking.id]: true}));
    try {
        await updateBookingStatus(selectedBooking.id, status);
        toast({ title: "Booking Updated", description: `Booking has been successfully ${status.toLowerCase()}.` });
        fetchBookings();
        setIsManageDialogOpen(false);
    } catch (error) {
        toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : '' });
    } finally {
        setIsProcessing(prev => ({...prev, [selectedBooking.id]: false}));
    }
  };
  
  const handleRequestRefund = async () => {
    if (!selectedBooking) return;
    setIsProcessing(prev => ({ ...prev, refund: true }));
    try {
        const result = await requestRefund(selectedBooking.id);
        if (result.success) {
            toast({ title: "Refund Request Sent", description: "Admin has been notified." });
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Refund Request Failed", description: error instanceof Error ? error.message : 'An error occurred.' });
    } finally {
        setIsProcessing(prev => ({ ...prev, refund: false }));
    }
  };

  const handleDeleteBooking = async () => {
    if (!selectedBooking) return;
    setIsDeleting(true);
    try {
      await deleteBooking(selectedBooking.id);
      toast({ title: "Booking Deleted", description: "Permanent deletion successful." });
      setIsManageDialogOpen(false);
      fetchBookings();
    } catch (error) {
       toast({ variant: "destructive", title: "Delete Failed", description: "Please try again." });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleBulkDelete = async (mode: BulkDeleteMode) => {
    let from: Date | null = null;
    let to: Date | null = new Date();
    switch (mode) {
        case 'all': from = null; to = null; break;
        case '7d': from = subDays(to, 7); break;
        case '30d': from = subDays(to, 30); break;
        case 'custom':
            if (!deleteDateRange?.from || !deleteDateRange?.to) {
                toast({ variant: "destructive", title: "Invalid Date Range" });
                return;
            }
            from = deleteDateRange.from; to = deleteDateRange.to; break;
    }
    setIsBulkDeleting(true);
    try {
        const count = await deleteBookingsInRange(from, to);
        toast({ title: "Bulk Delete Successful", description: `${count} records removed.` });
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
        toast({ title: "Sync Result", description: `${result.succeeded} successful, ${result.failed} failed.` });
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Sync Error", description: e.message });
    } finally {
        setIsSyncing(false);
    }
  }

  const handleManualReschedule = async () => {
    if (!selectedBooking || !newRescheduleDate) return;
    setIsProcessing(prev => ({...prev, reschedule: true}));
    try {
        const result = await manuallyRescheduleBooking(selectedBooking.id, format(newRescheduleDate, 'yyyy-MM-dd'));
        if (result.success) {
            toast({ title: "Rescheduled", description: `Group moved to ${format(newRescheduleDate, 'PPP')}.` });
            setIsManageDialogOpen(false);
            fetchBookings();
        } else throw new Error(result.error);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed", description: error.message });
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

  if (loading) return <BookingsPageSkeleton />;

  return (
    <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Group Bookings</h1>
                <p className="text-muted-foreground">Manage and track all group travel requests.</p>
            </div>
             <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={fetchBookings} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                <Button variant="outline" onClick={handleSync} disabled={isSyncing} className="hidden sm:flex">
                    <Sparkles className="mr-2 h-4 w-4" /> Sync Trips
                </Button>
            </div>
        </div>
      
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search groups..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                        <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Statuses</SelectItem>
                            <SelectItem value="Confirmed">Confirmed</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-4">Lead Contact</TableHead>
                            <TableHead>Route</TableHead>
                            <TableHead>Travel Date</TableHead>
                            <TableHead>Group Size</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="pr-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredBookings.length > 0 ? filteredBookings.map(booking => (
                            <TableRow key={booking.id}>
                                <TableCell className="pl-4">
                                    <div className="font-medium">{booking.name}</div>
                                    <div className="text-xs text-muted-foreground">{booking.phone}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">{booking.pickup} → {booking.destination}</div>
                                    <div className="text-xs text-muted-foreground">{booking.vehicleType}</div>
                                </TableCell>
                                <TableCell>{format(parseISO(booking.intendedDate), 'MMM dd, yyyy')}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3"/>{booking.passengers?.length || 1}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(booking.status)}>{booking.status}</Badge>
                                </TableCell>
                                <TableCell className="pr-4 text-right">
                                    <Button variant="ghost" size="sm" onClick={() => openDialog(booking.id)}>Manage</Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={6} className="text-center h-24">No bookings found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

      {selectedBooking && (
        <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden" key={selectedBooking.id}>
                <DialogHeader className="p-6 border-b">
                    <div className="flex items-center justify-between">
                        <DialogTitle>Group Booking: {selectedBooking.id.substring(0,8)}</DialogTitle>
                        <Badge variant={getStatusVariant(selectedBooking.status)}>{selectedBooking.status}</Badge>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-0">
                    <div className="p-6 space-y-8">
                        <div>
                            <h3 className="font-semibold mb-4 flex items-center gap-2 text-primary"><Users className="h-4 w-4"/>Passengers ({selectedBooking.passengers?.length || 1})</h3>
                            <div className="space-y-3">
                                {(selectedBooking.passengers || []).map((p, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                                        <div className="text-sm">
                                            <div className="font-medium">{p.name}</div>
                                            <div className="text-xs text-muted-foreground">{p.phone}</div>
                                        </div>
                                        {i === 0 && <Badge variant="outline" className="text-[10px]">Lead</Badge>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-muted/20 border-l space-y-6">
                        <div>
                            <h3 className="font-semibold mb-4">Route Info</h3>
                            <ul className="space-y-3 text-sm">
                                <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-muted-foreground"/>{selectedBooking.pickup} to {selectedBooking.destination}</li>
                                <li className="flex items-center gap-3"><Car className="h-4 w-4 text-muted-foreground"/>{selectedBooking.vehicleType}</li>
                                <li className="flex items-center gap-3"><CalendarIcon className="h-4 w-4 text-muted-foreground"/>{format(parseISO(selectedBooking.intendedDate), 'PPP')}</li>
                            </ul>
                        </div>
                        <Separator/>
                        <div>
                            <h3 className="font-semibold mb-2">Finance</h3>
                            <div className="text-3xl font-bold text-primary">₦{selectedBooking.totalFare.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">Paid via Paystack Ref: {selectedBooking.paymentReference || 'N/A'}</p>
                        </div>
                        
                        <div className="space-y-4 pt-4">
                            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Admin Actions</h3>
                            <div className="grid gap-2">
                                <Popover open={isReschedulePopoverOpen} onOpenChange={setIsReschedulePopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start h-11"><History className="mr-2 h-4 w-4"/> {newRescheduleDate ? format(newRescheduleDate, 'PPP') : 'Reschedule Group'}</Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end" onPointerDownOutside={(e) => e.preventDefault()}>
                                        <Calendar mode="single" selected={newRescheduleDate} onSelect={(d) => { setNewRescheduleDate(d); setIsReschedulePopoverOpen(false); }} disabled={(date) => date < new Date()} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                {newRescheduleDate && (
                                    <Button className="w-full" onClick={handleManualReschedule} disabled={isProcessing['reschedule']}>
                                        {isProcessing['reschedule'] ? <Loader2 className="animate-spin h-4 w-4"/> : 'Confirm New Date'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 border-t bg-muted/30">
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive">Delete Record</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete this booking?</AlertDialogTitle><AlertDialogDescription>This will remove all travelers from manifests.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteBooking} className={cn(buttonVariants({variant: 'destructive'}))}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <div className="flex gap-2">
                        {selectedBooking.status !== 'Cancelled' && <Button variant="secondary" onClick={() => handleUpdateBooking('Cancelled')}>Cancel Booking</Button>}
                        <Button variant="outline" onClick={() => setIsManageDialogOpen(false)}>Close</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
