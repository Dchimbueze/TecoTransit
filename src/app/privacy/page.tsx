
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

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
            <p className="leading-relaxed">
                Welcome to TecoTransit. We are committed to protecting your personal information and your right to privacy. If you have any questions or concerns about our policy, or our practices with regards to your personal information, please contact us at <Link href="mailto:tecotransportservices@gmail.com" className="text-primary hover:underline font-semibold">tecotransportservices@gmail.com</Link>
            </p>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">1. What Information Do We Collect?</h2>
                <p className="leading-relaxed">We collect personal information that you voluntarily provide to us when you make a booking on our website. The personal information we collect includes the following:</p>
                <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                    <li><strong>Personal Information:</strong> Name, email address, and phone number.</li>
                    <li><strong>Booking Information:</strong> Pickup location, destination, intended and alternative departure dates, vehicle type, and luggage count.</li>
                </ul>
            </div>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">2. How Do We Use Your Information?</h2>
                <p className="leading-relaxed">We use the information we collect or receive for the following purposes:</p>
                <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                    <li><strong>To facilitate the booking process.</strong> We use your information to process your booking requests, manage your trip, and communicate with you about your booking status.</li>
                    <li><strong>To send administrative information to you.</strong> We may use your personal information to send you service and new feature information and/or information about changes to our terms, conditions, and policies.</li>
                    <li><strong>To protect our Services.</strong> We may use your information as part of our efforts to keep our website safe and secure.</li>
                </ul>
            </div>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">3. Will Your Information Be Shared?</h2>
                <p className="leading-relaxed">We only share information with your consent, to comply with laws, to provide you with services, to protect your rights, or to fulfill business obligations. Your information is shared with our administrative team to confirm and manage your booking. We do not sell your personal information to third parties.</p>
            </div>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">4. How Long Do We Keep Your Information?</h2>
                <p className="leading-relaxed">We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy policy, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements).</p>
            </div>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">5. How Do We Keep Your Information Safe?</h2>
                <p className="leading-relaxed">We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure.</p>
            </div>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">6. What Are Your Privacy Rights?</h2>
                <p className="leading-relaxed">In accordance with the Nigeria Data Protection Act (NDPA), you have certain rights regarding your personal data. These may include the right to:</p>
                <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                    <li>Request access and obtain a copy of your personal information.</li>
                    <li>Request correction of any inaccurate or incomplete data.</li>
                    <li>Request erasure of your personal data.</li>
                    <li>Withdraw your consent at any time.</li>
                </ul>
                <p className="leading-relaxed">To make such a request, please use the contact details provided below.</p>
            </div>

            <Separator />

            <div className="space-y-4">
                <h2 className="text-2xl font-playfair font-semibold text-foreground">7. How Can You Contact Us?</h2>
                <p className="leading-relaxed">If you have questions or comments about this policy, you may email us at <Link href="mailto:tecotransportservices@gmail.com" className="text-primary hover:underline font-semibold">tecotransportservices@gmail.com</Link> or by post to:</p>
                <p className="pt-2 leading-relaxed">
                    <strong>TecoTransit</strong><br />
                    KM. 8.5, Afe Babalola Way<br />
                    Ado Ekiti, Nigeria
                </p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
