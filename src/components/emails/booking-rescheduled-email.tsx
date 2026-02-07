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

interface BookingRescheduledEmailProps {
  name: string;
  bookingId: string;
  oldDate: string;
  newDate: string;
}

export default function BookingRescheduledEmail({
  name,
  bookingId,
  oldDate,
  newDate,
}: BookingRescheduledEmailProps) {
  const previewText = `Your TecoTransit Booking Has Been Rescheduled`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoContainer}>
            <Text style={logoText}>TecoTransit</Text>
          </Section>
          <Heading style={h1}>Your Trip Has Been Rescheduled</Heading>
          <Text style={text}>
            Hello {name},
          </Text>
          <Text style={text}>
            This is an important update regarding your booking with reference number{' '}
            <strong>{bookingId.substring(0, 8)}</strong>.
          </Text>

          <Section style={highlightSection}>
            <Text style={highlightText}>
                As the vehicle for your intended travel date was not filled, your trip has been automatically rescheduled in accordance with our policy.
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading as="h2" style={h2}>Reschedule Details</Heading>
          <Section style={detailsContainer}>
            <Text style={detailItem}><strong>Previous Date:</strong> {format(new Date(oldDate), 'EEEE, MMMM dd, yyyy')}</Text>
            <Text style={detailItem}><strong>New Intended Date:</strong> <strong>{format(new Date(newDate), 'EEEE, MMMM dd, yyyy')}</strong></Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            Your booking has been moved to the new date above. You will receive a final confirmation email once this new trip is full. If this new date does not work for you, please contact us immediately.
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
