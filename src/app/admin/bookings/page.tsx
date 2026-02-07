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
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, MapPin, Car, Bus, Calendar as CalendarIcon, CheckCircle, Download, RefreshCw, Trash2, Search, HandCoins, Ban, CircleDot, Check, CreditCard, Sparkles, History, Briefcase, Ticket, X, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getAllBookings } from "@/lib/data";
import { getStatusVariant } from "@/lib/utils";
import { deleteBooking, deleteBookingsInRange, manuallyRescheduleBooking, cancelBooking } from "@/app/actions/booking-actions";
import { synchronizeAndCreateTrips } from "@/app/actions/synchronize-bookings";

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
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead><Skeleton className="h-5 w-24" /></TableHead>
                                <TableHead><Skeleton className="h-5 w-32" /></TableHead>
                                <TableHead><Skeleton className="h-5 w-24" /></TableHead>
                                <TableHead className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...Array(10)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
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
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
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
    try {
        const { bookings, error } = await getAllBookings();
        if (error) throw new Error(error);
        setAllBookings(bookings);
    } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
        setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const openDialog = (bookingId: string) => {
    const booking = allBookings.find(b => b.id === bookingId);
    if (booking) {
        setSelectedBooking(booking);
        setIsManageDialogOpen(true);
    }
  }

  const handleDeleteBooking = async () => {
    if (!selectedBooking) return;
    setIsProcessing(prev => ({...prev, delete: true}));
    try {
      await deleteBooking(selectedBooking.id);
      toast({ title: "Booking Deleted" });
      setIsManageDialogOpen(false);
      fetchBookings();
    } catch (error) {
       toast({ variant: "destructive", title: "Delete Failed" });
    } finally {
        setIsProcessing(prev => ({...prev, delete: false}));
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    setIsProcessing(prev => ({...prev, cancel: true}));
    try {
        const result = await cancelBooking(selectedBooking.id);
        if (result.success) {
            toast({ title: "Booking Cancelled" });
            setIsManageDialogOpen(false);
            fetchBookings();
        } else { throw new Error(result.error); }
    } catch (error: any) {
        toast({ variant: "destructive", title: "Cancellation Failed", description: error.message });
    } finally {
        setIsProcessing(prev => ({...prev, cancel: false}));
    }
  }
  
  const handleBulkDelete = async (mode: BulkDeleteMode) => {
    let from: Date | null = null;
    let to: Date | null = new Date();

    if (mode === 'all') { from = null; to = null; }
    else if (mode === '7d') { from = subDays(to, 7); }
    else if (mode === '30d') { from = subDays(to, 30); }
    else if (mode === 'custom') {
        if (!deleteDateRange?.from || !deleteDateRange?.to) return;
        from = deleteDateRange.from;
        to = deleteDateRange.to;
    }

    setIsProcessing(prev => ({...prev, bulkDelete: true}));
    try {
        const count = await deleteBookingsInRange(from, to);
        toast({ title: "Bulk Delete Successful", description: `${count} records deleted.` });
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Bulk Delete Failed", description: e.message });
    } finally {
        setIsProcessing(prev => ({...prev, bulkDelete: false}));
        setIsCustomDeleteOpen(false);
    }
  };

  const handleSyncAll = async () => {
    setIsProcessing(prev => ({...prev, syncAll: true}));
    try {
        const result = await synchronizeAndCreateTrips();
        toast({ title: "Sync Complete", description: `${result.succeeded} updated.` });
        fetchBookings();
    } catch (e: any) {
        toast({ variant: "destructive", title: "Sync Error", description: e.message });
    } finally {
        setIsProcessing(prev => ({...prev, syncAll: false}));
    }
  }

  const handleManualReschedule = async () => {
    if (!selectedBooking || !newRescheduleDate) return;
    setIsProcessing(prev => ({...prev, reschedule: true}));
    try {
        const result = await manuallyRescheduleBooking(selectedBooking.id, format(newRescheduleDate, 'yyyy-MM-dd'));
        if (result.success) {
            toast({ title: "Booking Rescheduled" });
            setIsManageDialogOpen(false);
            fetchBookings();
        } else { throw new Error(result.error); }
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
      .filter(b => statusFilter === 'All' || b.status === statusFilter)
      .filter(b => {
        const t = searchTerm.toLowerCase();
        return !t || b.name.toLowerCase().includes(t) || b.email.toLowerCase().includes(t) || b.id.toLowerCase().includes(t);
      });
  }, [allBookings, statusFilter, searchTerm]);

  const downloadCSV = () => {
    const headers = ["ID", "Name", "Email", "Phone", "Route", "Date", "Vehicle", "Fare", "Status"];
    const csv = [headers.join(','), ...filteredBookings.map(b => [b.id, `"${b.name}"`, b.email, b.phone, `"${b.pickup} to ${b.destination}"`, b.intendedDate, b.vehicleType, b.totalFare, b.status].join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };
  
  if (loading) return <BookingsPageSkeleton />;

  return (
    <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Manage Bookings</h1>
                <p className="text-muted-foreground">Monitor reservations and trip allocations.</p>
            </div>
             <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={fetchBookings}><RefreshCw className="h-4 w-4" /></Button>
                <AlertDialog open={isCustomDeleteOpen} onOpenChange={setIsCustomDeleteOpen}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                             <AlertDialog>
                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}>Delete All</DropdownMenuItem></AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This permanently deletes ALL records.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleBulkDelete('all')} className={cn(buttonVariants({variant: 'destructive'}))}>Delete All</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <DropdownMenuItem onClick={() => handleBulkDelete('7d')}>Last 7 Days</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkDelete('30d')}>Last 30 Days</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}>Custom Range...</DropdownMenuItem></AlertDialogTrigger>
                        </DropdownMenuContent>
                    </DropdownMenu>
                     <AlertDialogContent className="max-w-3xl">
                        <AlertDialogHeader className="mb-4"><AlertDialogTitle className="text-2xl">Delete Custom Range</AlertDialogTitle><AlertDialogDescription>Select dates to permanently delete records.</AlertDialogDescription></AlertDialogHeader>
                        <div className="flex justify-center p-4 border rounded-md bg-muted/20"><Calendar mode="range" selected={deleteDateRange} onSelect={setDeleteDateRange} numberOfMonths={2} /></div>
                        <AlertDialogFooter className="mt-6"><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleBulkDelete('custom')} className={cn(buttonVariants({variant: 'destructive'}))}>Delete Selected</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
      
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <CardTitle>Bookings ({filteredBookings.length})</CardTitle>
                     <div className="flex items-center gap-2 w-full lg:w-auto">
                        <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={isProcessing.syncAll}><Sparkles className="mr-2 h-4 w-4" /> Sync All</Button>
                        <Button variant="outline" size="sm" onClick={downloadCSV}><Download className="mr-2 h-4 w-4" /> CSV</Button>
                    </div>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative w-full sm:max-w-xs"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                    <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="All">All Statuses</SelectItem><SelectItem value="Confirmed">Confirmed</SelectItem><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Cancelled">Cancelled</SelectItem><SelectItem value="Refunded">Refunded</SelectItem></SelectContent></Select>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader><TableRow><TableHead className="pl-4">Customer</TableHead><TableHead>Route</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {filteredBookings.map(b => (
                            <TableRow key={b.id}>
                                <TableCell className="pl-4"><div>{b.name}</div><div className="text-xs text-muted-foreground">{b.email}</div></TableCell>
                                <TableCell className="text-sm">{b.pickup} → {b.destination}</TableCell>
                                <TableCell className="text-sm">{format(parseISO(b.intendedDate), 'MMM dd, yyyy')}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(b.status)} className="gap-1">{getStatusIcon(b.status)} {b.status}</Badge></TableCell>
                                <TableCell className="pr-4 text-right"><Button variant="ghost" size="sm" onClick={() => openDialog(b.id)}>Manage</Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

      {selectedBooking && (
        <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
            <DialogContent className="p-0 max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border-none shadow-2xl">
                <DialogHeader className="p-6 bg-card border-b">
                    <div className="flex items-center justify-between">
                        <div><DialogTitle className="text-2xl font-bold">Manage Booking: {selectedBooking.id.substring(0,8)}</DialogTitle><DialogDescription>Created on {format(selectedBooking.createdAt, 'PPp')}</DialogDescription></div>
                        <Badge variant={getStatusVariant(selectedBooking.status)} className="px-4 py-1 text-sm gap-2"><div className={cn("w-2 h-2 rounded-full", selectedBooking.status === 'Paid' ? "bg-blue-500" : selectedBooking.status === 'Confirmed' ? "bg-green-500" : selectedBooking.status === 'Pending' ? "bg-amber-500 animate-pulse" : "bg-destructive")}></div>{selectedBooking.status}</Badge>
                    </div>
                </DialogHeader>
                <div className="grid md:grid-cols-3 flex-1 overflow-y-auto bg-background">
                     <div className="md:col-span-2 p-8 space-y-10">
                        <div className="grid sm:grid-cols-2 gap-12">
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold">Customer</h3>
                                <div className="space-y-3 text-sm font-medium"><div className="flex items-center gap-3"><User className="h-5 w-5 text-muted-foreground" /> {selectedBooking.name}</div><div className="flex items-center gap-3"><Mail className="h-5 w-5 text-muted-foreground" /> {selectedBooking.email}</div><div className="flex items-center gap-3"><Phone className="h-5 w-5 text-muted-foreground" /> {selectedBooking.phone}</div></div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold">Trip</h3>
                                <div className="space-y-3 text-sm font-medium"><div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-muted-foreground" /> {selectedBooking.pickup} → {selectedBooking.destination}</div><div className="flex items-center gap-3">{selectedBooking.vehicleType.includes('Bus') ? <Bus className="h-5 w-5" /> : <Car className="h-5 w-5" />} {selectedBooking.vehicleType}</div><div className="flex items-center gap-3"><Briefcase className="h-5 w-5 text-muted-foreground" /> {selectedBooking.luggageCount} bag(s)</div></div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold">Preferences</h3>
                            <div className="grid sm:grid-cols-2 gap-6 text-sm font-medium"><div className="flex items-center gap-3"><CalendarIcon className="h-5 w-5 text-muted-foreground" /> <div><div className="text-xs text-muted-foreground">Intended Date</div>{format(parseISO(selectedBooking.intendedDate), 'PPP')}</div></div><div className="flex items-center gap-3"><History className="h-5 w-5 text-muted-foreground" /> <div><div className="text-xs text-muted-foreground">Rescheduled</div>{selectedBooking.rescheduledCount || 0} time(s)</div></div></div>
                        </div>
                    </div>
                    <div className="md:col-span-1 bg-muted/40 p-8 space-y-10 border-l">
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold">Payment Summary</h3>
                            <div className="space-y-1"><p className="text-xs text-muted-foreground font-semibold uppercase">Total Fare</p><p className="text-5xl font-black text-primary">₦{selectedBooking.totalFare.toLocaleString()}</p></div>
                        </div>
                        <div className="space-y-4 pt-6 border-t">
                            <h3 className="text-lg font-bold">Manual Reschedule</h3>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><CalendarIcon className="mr-2 h-4 w-4" />{newRescheduleDate ? format(newRescheduleDate, 'PPP') : "Select new date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={newRescheduleDate} onSelect={setNewRescheduleDate} initialFocus /></PopoverContent></Popover>
                            <Button className="w-full font-bold" disabled={!newRescheduleDate || isProcessing.reschedule} onClick={() => setIsRescheduleConfirmOpen(true)}>{isProcessing.reschedule ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <History className="mr-2 h-4 w-4" />} Reschedule</Button>
                        </div>
                    </div>
                </div>
                <DialogFooter className="p-6 border-t bg-card flex justify-between items-center">
                     <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive hover:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button></AlertDialogTrigger>
                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This permanently removes the booking. Seats will be freed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={handleDeleteBooking} className={cn(buttonVariants({variant:'destructive'}))}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                    </AlertDialog>
                    <div className="flex items-center gap-3">
                         <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="secondary" className="font-bold" disabled={selectedBooking.status === 'Cancelled' || isProcessing.cancel}><Ban className="mr-2 h-4 w-4" /> Cancel Booking</Button></AlertDialogTrigger>
                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancel this booking?</AlertDialogTitle><AlertDialogDescription>This marks the booking as cancelled and frees the seat.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Go Back</AlertDialogCancel><AlertDialogAction onClick={handleCancelBooking}>Confirm Cancellation</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" onClick={() => setIsManageDialogOpen(false)}><X className="h-4 w-4" /></Button>
                    </div>
                </DialogFooter>
            </DialogContent>
            <AlertDialog open={isRescheduleConfirmOpen} onOpenChange={setIsRescheduleConfirmOpen}>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reschedule Passenger?</AlertDialogTitle><AlertDialogDescription>Moving to {newRescheduleDate ? format(newRescheduleDate, 'PPP') : ''}. The customer will be notified.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abort</AlertDialogCancel><AlertDialogAction onClick={handleManualReschedule}>Confirm Change</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
        </Dialog>
      )}
    </div>
  );
}
