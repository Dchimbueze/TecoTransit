"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function PrivacyPolicyPage() {
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    setLastUpdated(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <Card className="max-w-3xl mx-auto shadow-lg">
        <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold font-headline text-primary">Privacy Policy</CardTitle>
            <p className="text-muted-foreground pt-2">Last updated: {lastUpdated}</p>
        </CardHeader>
        
        <CardContent className="space-y-8 text-base text-muted-foreground">
            <p>Welcome to TecoTransit. Contact us at tecotransportservices@gmail.com for any questions.</p>
            <Separator />
            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">1. Data Collection</h2>
                <p>We collect personal information like name, email, and booking details voluntarily provided by you.</p>
            </div>
            <Separator />
            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">2. Contact</h2>
                <p>Email us at: <strong>tecotransportservices@gmail.com</strong></p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
