"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO, subDays, startOfDay, endOfDay } from "date-fns";
import type { Booking } from "@/lib/types";
import { DateRange } from "react-day-picker";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, MapPin, Car, Bus, Briefcase, Calendar as CalendarIcon, CheckCircle, RefreshCw, Trash2, AlertCircle, Loader2, Ticket, History, Search, Sparkles, Users, UserCircle, Eraser, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { getAllBookings } from "@/lib/data";
import { getStatusVariant } from "@/lib/utils";
import { updateBookingStatus, deleteBooking, deleteBookingsInRange, manuallyRescheduleBooking } from "@/app/actions/booking-actions";
import { synchronizeAndCreateTrips } from "@/app/actions/synchronize-bookings";

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

export default function AdminBookingsPage() {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isReschedulePopoverOpen, setIsReschedulePopoverOpen] = useState(false);
  const [isCleanupDialogOpen, setIsCleanupDialogOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<Booking['status'] | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Individual' | 'Group'>('All');

  const [newRescheduleDate, setNewRescheduleDate] = useState<Date | undefined>();
  const [cleanupRange, setCleanupRange] = useState<'7days' | '1month' | 'custom'>('7days');
  const [customCleanupRange, setCustomCleanupRange] = useState<DateRange | undefined>();

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
        setNewRescheduleDate(undefined);
        setIsManageDialogOpen(true);
    }
  }

  const handleUpdateBooking = async (status: 'Cancelled') => {
    if (!selectedBooking) return;
    setIsProcessing(prev => ({...prev, [selectedBooking.id]: true}));
    try {
        await updateBookingStatus(selectedBooking.id, status);
        toast({ title: "Booking Updated", description: `Booking has been successfully cancelled.` });
        fetchBookings();
        setIsManageDialogOpen(false);
    } catch (error) {
        toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : '' });
    } finally {
        setIsProcessing(prev => ({...prev, [selectedBooking.id]: false}));
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

  const handleSync = async () => {
    setIsSyncing(true);
    try {
        const result = await synchronizeAndCreateTrips();
        toast({ title: "Sync Result", description: `${result.processed} processed: ${result.succeeded} successful, ${result.failed} failed.` });
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Sync Error", description: e.message });
    } finally {
        setIsSyncing(false);
    }
  }

  const handleCleanup = async () => {
    setIsCleaning(true);
    let start: Date | null = null;
    let end: Date | null = null;

    if (cleanupRange === '7days') {
        start = startOfDay(subDays(new Date(), 7));
        end = endOfDay(new Date());
    } else if (cleanupRange === '1month') {
        start = startOfDay(subDays(new Date(), 30));
        end = endOfDay(new Date());
    } else if (cleanupRange === 'custom' && customCleanupRange?.from && customCleanupRange?.to) {
        start = startOfDay(customCleanupRange.from);
        end = endOfDay(customCleanupRange.to);
    }

    if (!start || !end) {
        toast({ variant: "destructive", title: "Invalid Range", description: "Please select a valid date range." });
        setIsCleaning(false);
        return;
    }

    try {
        const deletedCount = await deleteBookingsInRange(start, end);
        toast({ title: "Cleanup Successful", description: `Successfully deleted ${deletedCount} booking records.` });
        setIsCleanupDialogOpen(false);
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Cleanup Failed", description: e.message });
    } finally {
        setIsCleaning(false);
    }
  };

  const handleManualReschedule = async () => {
    if (!selectedBooking || !newRescheduleDate) return;
    setIsProcessing(prev => ({...prev, reschedule: true}));
    try {
        const result = await manuallyRescheduleBooking(selectedBooking.id, format(newRescheduleDate, 'yyyy-MM-dd'));
        if (result.success) {
            toast({ title: "Rescheduled", description: `Traveler(s) moved to ${format(newRescheduleDate, 'PPP')}.` });
            setIsManageDialogOpen(false);
            fetchBookings();
        } else throw new Error(result.error);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed", description: error.message });
    } finally {
        setIsProcessing(prev => ({...prev, reschedule: false}));
        setNewRescheduleDate(undefined);
    }
  };
  
  const filteredBookings = useMemo(() => {
    return allBookings
      .filter(booking => statusFilter === 'All' || booking.status === statusFilter)
      .filter(booking => typeFilter === 'All' || booking.type === typeFilter)
      .filter(booking => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return booking.name.toLowerCase().includes(term) ||
               booking.email.toLowerCase().includes(term) ||
               booking.id.toLowerCase().includes(term);
      });
  }, [allBookings, statusFilter, typeFilter, searchTerm]);

  if (loading) return <BookingsPageSkeleton />;

  return (
    <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Manage Bookings</h1>
                <p className="text-muted-foreground">Monitor and manage all individual and group travel requests.</p>
            </div>
             <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={fetchBookings} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                <Dialog open={isCleanupDialogOpen} onOpenChange={setIsCleanupDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="hidden sm:flex text-destructive hover:text-destructive">
                            <Eraser className="mr-2 h-4 w-4" /> Cleanup
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md p-0 overflow-hidden">
                        <DialogHeader className="p-6 pb-2">
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <Eraser className="h-5 w-5 text-destructive" />
                                Cleanup Old Bookings
                            </DialogTitle>
                            <DialogDescription className="text-sm pt-2">
                                Select a timeframe to permanently remove records. This will also clear their presence in trip manifests.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="p-6 space-y-6">
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">Select Deletion Period</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button 
                                        type="button"
                                        variant={cleanupRange === '7days' ? 'default' : 'outline'} 
                                        onClick={() => setCleanupRange('7days')}
                                        className="w-full"
                                    >
                                        7 Days
                                    </Button>
                                    <Button 
                                        type="button"
                                        variant={cleanupRange === '1month' ? 'default' : 'outline'} 
                                        onClick={() => setCleanupRange('1month')}
                                        className="w-full"
                                    >
                                        1 Month
                                    </Button>
                                </div>
                                <Button 
                                    type="button"
                                    variant={cleanupRange === 'custom' ? 'default' : 'outline'} 
                                    onClick={() => setCleanupRange('custom')}
                                    className="w-full mt-2"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    Custom Range
                                </Button>
                            </div>

                            {cleanupRange === 'custom' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <Label className="text-sm font-semibold">Choose Date Range</Label>
                                    <div className="border rounded-md p-2 bg-muted/20">
                                        <Calendar 
                                            mode="range" 
                                            selected={customCleanupRange} 
                                            onSelect={setCustomCleanupRange} 
                                            numberOfMonths={1} 
                                            className="mx-auto" 
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter className="p-6 bg-muted/30 border-t flex-col sm:flex-row gap-3">
                            <Button variant="ghost" onClick={() => setIsCleanupDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="w-full sm:w-auto font-semibold" disabled={isCleaning}>
                                        {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                        Purge Records
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            You are about to permanently delete matching booking records and manifests. This action is irreversible.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Go Back</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleCleanup} className={cn(buttonVariants({ variant: "destructive" }))}>
                                            Confirm Purge
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={handleSync} disabled={isSyncing} className="hidden sm:flex">
                    <Sparkles className="mr-2 h-4 w-4" /> Sync Trips
                </Button>
            </div>
        </div>
      
        <Card>
            <CardHeader>
                <div className="flex flex-col lg:flex-row items-center gap-4">
                    <div className="relative w-full lg:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search by name or email..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Statuses</SelectItem>
                                <SelectItem value="Confirmed">Confirmed</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as any)}>
                            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Booking Type" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Types</SelectItem>
                                <SelectItem value="Individual">Individual</SelectItem>
                                <SelectItem value="Group">Group</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-4">Lead Contact</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Route</TableHead>
                            <TableHead>Travel Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="pr-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredBookings.length > 0 ? filteredBookings.map(booking => (
                            <TableRow key={booking.id}>
                                <TableCell className="pl-4">
                                    <div className="font-medium">{booking.name}</div>
                                    <div className="text-xs text-muted-foreground">{booking.email}</div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="gap-1">
                                        {booking.type === 'Group' ? <Users className="h-3 w-3"/> : <UserCircle className="h-3 w-3"/>}
                                        {booking.type} ({booking.passengers?.length || 1})
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">{booking.pickup} → {booking.destination}</div>
                                    <div className="text-xs text-muted-foreground">{booking.vehicleType}</div>
                                </TableCell>
                                <TableCell>{format(parseISO(booking.intendedDate), 'MMM dd, yyyy')}</TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(booking.status)}>{booking.status}</Badge>
                                </TableCell>
                                <TableCell className="pr-4 text-right">
                                    <Button variant="ghost" size="sm" onClick={() => openDialog(booking.id)}>Manage</Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={6} className="text-center h-24">No bookings found matching your filters.</TableCell></TableRow>
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
                        <DialogTitle>{selectedBooking.type} Booking: {selectedBooking.id.substring(0,8)}</DialogTitle>
                        <Badge variant={getStatusVariant(selectedBooking.status)}>{selectedBooking.status}</Badge>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-0">
                    <div className="p-6 space-y-8">
                        <div>
                            <h3 className="font-semibold mb-4 flex items-center gap-2 text-primary">
                                {selectedBooking.type === 'Group' ? <Users className="h-4 w-4"/> : <UserCircle className="h-4 w-4"/>}
                                Passengers ({selectedBooking.passengers?.length || 1})
                            </h3>
                            <div className="space-y-3">
                                {(selectedBooking.passengers || []).map((p, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                                        <div className="text-sm">
                                            <div className="font-medium">{p.name}</div>
                                            <div className="text-xs text-muted-foreground">{p.email} • {p.phone}</div>
                                        </div>
                                        {selectedBooking.type === 'Group' && i === 0 && <Badge variant="outline" className="text-[10px]">Lead</Badge>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-muted/20 border-l space-y-6">
                        <div>
                            <h3 className="font-semibold mb-4">Trip Information</h3>
                            <ul className="space-y-3 text-sm">
                                <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-muted-foreground"/>{selectedBooking.pickup} to {selectedBooking.destination}</li>
                                <li className="flex items-center gap-3"><Car className="h-4 w-4 text-muted-foreground"/>{selectedBooking.vehicleType}</li>
                                <li className="flex items-center gap-3"><CalendarIcon className="h-4 w-4 text-muted-foreground"/>{format(parseISO(selectedBooking.intendedDate), 'PPP')}</li>
                            </ul>
                        </div>
                        <Separator/>
                        <div>
                            <h3 className="font-semibold mb-2">Financials</h3>
                            <div className="text-3xl font-bold text-primary">₦{selectedBooking.totalFare.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground mt-1">Ref: {selectedBooking.paymentReference || 'No payment reference'}</p>
                        </div>
                        
                        <div className="space-y-4 pt-4">
                            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Admin Controls</h3>
                            <div className="grid gap-2">
                                <Popover open={isReschedulePopoverOpen} onOpenChange={setIsReschedulePopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start h-11"><History className="mr-2 h-4 w-4"/> {newRescheduleDate ? format(newRescheduleDate, 'PPP') : 'Change Travel Date'}</Button>
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
                            <AlertDialogHeader><AlertDialogTitle>Delete this booking?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the record and traveler(s) from manifests.</AlertDialogDescription></AlertDialogHeader>
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
