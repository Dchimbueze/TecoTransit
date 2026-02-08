import { NextResponse } from 'next/server';
import { getSeatAvailability } from '@/app/actions/get-seat-availability';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const pickup = searchParams.get('pickup');
    const destination = searchParams.get('destination');
    const vehicleType = searchParams.get('vehicleType');
    const date = searchParams.get('date');

    if (!pickup || !destination || !vehicleType || !date) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        const availability = await getSeatAvailability(pickup, destination, vehicleType, date);
        return NextResponse.json(availability);
    } catch (error: any) {
        console.error("Seat availability API error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
