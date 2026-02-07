import { Car, Bus } from 'lucide-react';

export const locations = [
  "ABUAD",
  "Abeokuta",
  "Ajah Lagos",
  "FESTAC Lagos",
  "Ibadan",
  "Iyana Paja Lagos",
  "Ojota Lagos"
];

export const vehicleOptions = {
    '4-seater-sienna': { name: '4-Seater Sienna', icon: Car, maxLuggages: 4, capacity: 4 },
    '5-seater-sienna': { name: '5-Seater Sienna', icon: Car, maxLuggages: 2, capacity: 5 },
    '7-seater-bus': { name: '7-Seater Bus', icon: Bus, maxLuggages: 2, capacity: 7 },
};

export const customerService = {
  phone: '2348104050628',
  email: 'tecotransportservices@gmail.com',
};

export const bankAccountDetails = {
    bankName: "Fidelity Bank",
    accountName: "Ogundipe Toluwalase Cherish",
    accountNumber: "6173080473",
};

export const LUGGAGE_FARE = 0;
