
export type Booking = {
  id: string;
  name: string;
  email: string;
  phone: string;
  pickup: string;
  destination: string;
  intendedDate: string;
  vehicleType: string;
  luggageCount: number;
  totalFare: number;
  allowReschedule: boolean;
  paymentReference?: string;
  status: 'Pending' | 'Paid' | 'Confirmed' | 'Cancelled' | 'Refunded';
  createdAt: number;
  confirmedDate?: string;
  tripId?: string;
  rescheduledCount?: number;
};

export type Passenger = {
    bookingId: string;
    name: string;
    phone: string;
    heldUntil?: number; // Timestamp (ms) until which the seat is temporarily held
};

export type Trip = {
    id: string;
    priceRuleId: string;
    pickup: string;
    destination: string;
    vehicleType: string;
    date: string;
    vehicleIndex: number;
    capacity: number;
    passengers: Passenger[];
    isFull: boolean;
};

export type SeatAvailability = {
    availableSeats: number;
    totalCapacity: number;
    isFull: boolean;
};

export type BookingFormData = Omit<Booking, 'id' | 'status' | 'createdAt' | 'tripId' | 'intendedDate' | 'rescheduledCount'> & {
    intendedDate: Date;
    privacyPolicy: boolean;
    allowReschedule: boolean;
};

export type PriceRule = {
    id: string;
    pickup: string;
    destination: string;
    vehicleType: string;
    price: number;
    vehicleCount: number;
}

export type PriceAlert = {
    display: boolean;
    alertType: 'alert' | 'dialog';
    content?: string;
    font?: string;
    fontSize?: string;
    bold?: boolean;
    italic?: boolean;
    dialogImageUrl?: string;
    updatedAt: number;
}
