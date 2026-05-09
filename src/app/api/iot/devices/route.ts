import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: devices, error } = await supabase
      .from('rfid_devices')
      .select('*')
      .order('last_seen', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      devices: devices || [],
      count: devices?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_id, name, location, firmware_version } = body;

    if (!device_id || !name || !location) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: device_id, name, location',
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: device, error } = await supabase
      .from('rfid_devices')
      .insert({
        device_id,
        name,
        location,
        firmware_version,
        status: 'offline',
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      device,
    });
  } catch (error) {
    console.error('Error creating device:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
