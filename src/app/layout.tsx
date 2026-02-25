
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/context/auth-context';
import { SettingsProvider } from '@/context/settings-context';
import { ThemeProvider } from '@/components/theme-provider';
import { PT_Sans, Playfair_Display } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LayoutWrapper } from '@/components/layout-wrapper';
import type { Metadata, Viewport } from 'next';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair-display',
});

export const metadata: Metadata = {
  title: 'TecoTransit',
  description: 'Book Your Trip with TecoTransit. Fast, reliable, and comfortable rides.',
};

export const viewport: Viewport = {
  themeColor: '#D4AF37',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body
        suppressHydrationWarning
        className={`${ptSans.variable} ${playfairDisplay.variable} font-body antialiased flex flex-col h-full bg-background`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <SettingsProvider>
              <LayoutWrapper>
                {children}
              </LayoutWrapper>
              <Toaster />
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
