
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
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          isPaystackEnabled: data.isPaystackEnabled ?? true,
          bookingDateRange: data.bookingDateRange ? {
            from: new Date(data.bookingDateRange.from),
            to: new Date(data.bookingDateRange.to),
          } : undefined,
          loading: false,
        });
      } else {
        setSettings(prev => ({ ...prev, loading: false }));
      }
    }, (error) => {
      console.error("Error fetching settings:", error);
      setSettings(prev => ({ ...prev, loading: false }));
    });

    return () => unsub();
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
