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
  return (
    <Html>
      <Head />
      <Preview>Your TecoTransit booking is {status}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Booking {status}</Heading>
          <Text style={text}>Hello {name}, your booking {bookingId.substring(0,8)} is {status.toLowerCase()}.</Text>
          {status === 'Confirmed' && confirmedDate && (
             <Section style={highlight}>
                <Text style={text}>Confirmed for: {format(new Date(confirmedDate), 'EEEE, MMMM dd, yyyy')}</Text>
             </Section>
          )}
          <Hr style={hr} />
          <Text style={footer}>TecoTransit | Contact: tecotransportservices@gmail.com</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: 'sans-serif' };
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '20px', border: '1px solid #f0f0f0' };
const h1 = { color: '#333', fontSize: '24px', textAlign: 'center' as const };
const text = { color: '#555', fontSize: '16px' };
const highlight = { backgroundColor: '#fffbe6', padding: '10px', borderRadius: '4px' };
const hr = { borderColor: '#cccccc', margin: '20px 0' };
const footer = { color: '#8898aa', fontSize: '12px', textAlign: 'center' as const };
