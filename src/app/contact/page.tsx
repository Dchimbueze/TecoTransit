
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle } from "lucide-react";
import Link from "next/link";
import { customerService } from "@/lib/constants";

const contactOptions = [
    { name: 'Tolu', link: 'https://wa.me/qr/VNXLPTJVCSHQF1' },
    { name: 'Esther', link: 'https://wa.me/message/OD5WZAO2CUCIF1' },
    { name: 'Abraham', link: 'https://wa.me/+2348104050628' },
];

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
            <h1 className="text-3xl font-bold font-headline text-primary">Help Center</h1>
            <p className="text-muted-foreground mt-1">Need assistance? Here's how you can reach us.</p>
        </div>
        
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Contact Customer Service</CardTitle>
                <CardDescription>Reach out to our team for booking assistance or questions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">WhatsApp Support</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {contactOptions.map(contact => (
                            <Button asChild key={contact.name} className="w-full" size="lg" variant="outline">
                                <Link href={contact.link} target="_blank">
                                    <MessageCircle className="mr-2 h-5 w-5" />
                                    {contact.name}
                                </Link>
                            </Button>
                        ))}
                    </div>
                </div>

                 <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Email Support</h3>
                     <Button asChild key="email" className="w-full sm:w-auto" size="lg" variant="outline">
                        <Link href={`mailto:${customerService.email}`} target="_blank">
                            <Mail className="mr-2 h-5 w-5" />
                            {customerService.email}
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
