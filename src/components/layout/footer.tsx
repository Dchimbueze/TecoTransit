
'use client';

import { useState, useEffect } from "react";
import { Route } from "lucide-react";
import Link from "next/link";

export default function Footer() {
    const [year, setYear] = useState<number | null>(null);

    useEffect(() => {
        setYear(new Date().getFullYear());
    }, []);

    return (
        <footer className="bg-card shadow-sm">
            <div className="container mx-auto px-4 py-6">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary">
                        <Route className="h-6 w-6" />
                        <span className="font-headline">TecoTransit</span>
                    </Link>
                     <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                         <p className="text-center sm:text-left">
                            © {year || ''} TecoTransit. All rights reserved.
                        </p>
                        <span className="hidden sm:inline">|</span>
                        <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                        <span className="hidden sm:inline">|</span>
                        <Link href="/feedback" className="hover:text-primary transition-colors">Leave Feedback</Link>
                     </div>
                </div>
            </div>
        </footer>
    );
}
