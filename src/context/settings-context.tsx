"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

interface SettingsContextType {
  isPaystackEnabled: boolean;
  bookingDateRange: DateRange | undefined;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<SettingsContextType>({
    isPaystackEnabled: true,
    bookingDateRange: undefined,
    loading: true,
  });

  useEffect(() => {
    // Listen to payment settings
    const unsubPayment = onSnapshot(doc(db, 'settings', 'payment'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(prev => ({
          ...prev,
          isPaystackEnabled: snapshot.data().isPaystackEnabled ?? true,
          loading: false,
        }));
      } else {
        setSettings(prev => ({ ...prev, loading: false }));
      }
    });

    // Listen to booking window settings
    const unsubBooking = onSnapshot(doc(db, 'settings', 'booking'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings(prev => ({
          ...prev,
          bookingDateRange: {
            from: data.startDate?.toDate(),
            to: data.endDate?.toDate(),
          },
        }));
      }
    });

    return () => {
      unsubPayment();
      unsubBooking();
    };
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
