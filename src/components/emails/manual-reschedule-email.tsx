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

interface ManualRescheduleEmailProps {
  name: string;
  bookingId: string;
  newDate: string;
  pickup: string;
  destination: string;
}

export default function ManualRescheduleEmail({
  name,
  bookingId,
  newDate,
  pickup,
  destination,
}: ManualRescheduleEmailProps) {
  const previewText = `Your TecoTransit Booking Has Been Updated`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoContainer}>
            <Text style={logoText}>TecoTransit</Text>
          </Section>
          <Heading style={h1}>Your Booking Has Been Rescheduled by Admin</Heading>
          <Text style={text}>
            Hello {name},
          </Text>
          <Text style={text}>
            This is an update for your booking with reference number{' '}
            <strong>{bookingId.substring(0, 8)}</strong>. Our administrative team has rescheduled your trip.
          </Text>

          <Hr style={hr} />

          <Heading as="h2" style={h2}>Your New Trip Details</Heading>
          <Section style={detailsContainer}>
            <Text style={detailItem}><strong>New Travel Date:</strong> <strong style={{color: '#16a34a'}}>{format(new Date(newDate), 'EEEE, MMMM dd, yyyy')}</strong></Text>
            <Text style={detailItem}><strong>Route:</strong> {pickup} to {destination}</Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            Your booking is now set for this new date. The details of your specific vehicle and driver will be sent via a group chat the day before departure. If this new date is not suitable, please contact us immediately so we can assist you.
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
