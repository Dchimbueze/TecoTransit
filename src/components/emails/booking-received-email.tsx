import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Link,
} from '@react-email/components';
import { format } from 'date-fns';

interface BookingReceivedEmailProps {
  name: string;
  bookingId: string;
  pickup: string;
  destination: string;
  intendedDate: string;
  totalFare: number;
}

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export default function BookingReceivedEmail({
  name,
  bookingId,
  pickup,
  destination,
  intendedDate,
  totalFare,
}: BookingReceivedEmailProps) {
  const previewText = `Your TecoTransit Reservation for ${format(new Date(intendedDate), 'PPP')} is Received`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoContainer}>
            <Text style={logoText}>TecoTransit</Text>
          </Section>
          <Heading style={h1}>Your Reservation is Received!</Heading>
          <Text style={text}>
            Hello {name},
          </Text>
          <Text style={text}>
            Thank you for booking with TecoTransit! We have successfully received your reservation with reference number{' '}
            <strong>{bookingId.substring(0,8)}</strong>.
          </Text>

          <Section style={highlightSection}>
            <Text style={highlightText}>
                The details of your trip vehicle will be sent to you as soon as the vehicle is filled. Please note that if the vehicle is not filled 16 hours before departure time (2pm before the day of travel) your booking may be rescheduled.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            We'll be in touch soon with your final trip confirmation.
          </Text>

          <Text style={footer}>
            TecoTransit, Your reliable travel partner. <br />
            KM. 8.5, Afe Babalola Way, Ado Ekiti <br />
            Contact us at <Link href="mailto:tecotransportservices@gmail.com" style={link}>tecotransportservices@gmail.com</Link>
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
    backgroundColor: '#fffbe6',
    border: '1px solid #fde047',
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
