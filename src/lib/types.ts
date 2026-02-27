
export type Booking = {
  id: string;
  name: string; // Lead Passenger Name
  email: string; // Lead Passenger Email
  phone: string; // Lead Passenger Phone
  passengers: Passenger[]; // All passengers in the group (including the lead)
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
    email: string;
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

export type BookingFormData = Omit<Booking, 'id' | 'status' | 'createdAt' | 'tripId' | 'intendedDate' | 'rescheduledCount' | 'passengers'> & {
    intendedDate: Date;
    privacyPolicy: boolean;
    allowReschedule: boolean;
    passengers: Array<{ name: string; email: string; phone: string }>;
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
