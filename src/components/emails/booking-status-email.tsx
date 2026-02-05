import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from '@react-email/components';
import { format } from 'date-fns';

interface BookingStatusEmailProps {
  name: string;
  status: 'Confirmed' | 'Cancelled';
  bookingId: string;
  pickup: string;
  destination: string;
  vehicleType: string;
  totalFare: number;
  confirmedDate?: string;
}

export default function BookingStatusEmail({
  name,
  status,
  bookingId,
  pickup,
  destination,
  vehicleType,
  totalFare,
  confirmedDate,
}: BookingStatusEmailProps) {
  const previewText = `Your TecoTransit booking is ${status}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoContainer}>
            <Text style={logoText}>TecoTransit</Text>
          </Section>
          <Heading style={h1}>Booking {status}</Heading>
          <Text style={text}>
            Hello {name},
          </Text>
          <Text style={text}>
            This email is to inform you that your booking with reference number{' '}
            <strong>{bookingId.substring(0,8)}</strong> has been{' '}
            <strong>{status.toLowerCase()}</strong>.
          </Text>

          {status === 'Confirmed' && confirmedDate && (
             <Section style={highlightSection}>
                <Text style={highlightText}>
                    Your trip is confirmed for: <strong>{format(new Date(confirmedDate), 'EEEE, MMMM dd, yyyy')}</strong>. Please be at the assembly point on or before 7:00am. The details of your specific vehicle and driver will be sent via a group chat the day before departure.
                </Text>
             </Section>
          )}

           {status === 'Cancelled' && (
             <Section style={highlightSectionRed}>
                <Text style={highlightText}>
                    Unfortunately, your booking has been cancelled. To request a refund, please contact our support team via WhatsApp for the quickest resolution. If you have any questions, you can also reach us at <Link href="mailto:chimdaveo@gmail.com" style={link}>chimdaveo@gmail.com</Link>.
                </Text>
             </Section>
          )}

          <Hr style={hr} />

          <Heading as="h2" style={h2}>Booking Summary</Heading>
          <Section style={detailsContainer}>
            <Text style={detailItem}><strong>Route:</strong> {pickup} to {destination}</Text>
            <Text style={detailItem}><strong>Vehicle:</strong> {vehicleType}</Text>
            <Text style={detailItem}><strong>Total Fare:</strong> ₦{totalFare.toLocaleString()}</Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            Thank you for choosing TecoTransit.
          </Text>

          <Text style={footer}>
            TecoTransit, Your reliable travel partner. <br />
            KM. 8.5, Afe Babalola Way, Ado Ekiti <br />
            Contact us at <Link href="mailto:chimdaveo@gmail.com" style={link}>chimdaveo@gmail.com</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  border: '1px solid #f0f0f0',
  borderRadius: '4px',
};

const logoContainer = {
    padding: '0 20px',
    textAlign: 'center' as const,
    paddingBottom: '20px',
    borderBottom: '1px solid #f0f0f0',
};

const logoText = {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#D4AF37',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  padding: '0 30px',
};

const h2 = {
    color: '#333',
    fontSize: '20px',
    fontWeight: 'bold',
    padding: '0 30px',
}

const text = {
  color: '#555',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 30px',
};

const link = {
  color: '#D4AF37',
  textDecoration: 'underline',
}

const highlightSection = {
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '4px',
    margin: '20px 30px',
    padding: '10px 20px',
};

const highlightSectionRed = {
    backgroundColor: '#fff1f2',
    border: '1px solid #fecdd3',
    borderRadius: '4px',
    margin: '20px 30px',
    padding: '10px 20px',
};


const highlightText = {
    ...text,
    padding: 0,
};

const detailsContainer = {
    padding: '0 30px',
};

const detailItem = {
    ...text,
    padding: 0,
    lineHeight: '22px',
};

const hr = {
  borderColor: '#cccccc',
  margin: '20px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
};