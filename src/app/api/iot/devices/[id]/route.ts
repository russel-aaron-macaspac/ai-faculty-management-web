import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, _ctx: any) {
  try {
  const params = (arguments[1] && (arguments[1] as any).params) || {};
  const { id } = params;
    const supabase = createSupabaseAdminClient();

    const { data: device, error } = await supabase
      .from('rfid_devices')
      .select('*')
      .eq('device_id', id)
      .single();

    if (error || !device) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      device,
    });
  } catch (error) {
    console.error('Error fetching device:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, _ctx: any) {
  try {
  const params = (arguments[1] && (arguments[1] as any).params) || {};
  const { id } = params;
    const body = await request.json();

    const supabase = createSupabaseAdminClient();

    const { data: device, error } = await supabase
      .from('rfid_devices')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      device,
    });
  } catch (error) {
    console.error('Error updating device:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, _ctx: any) {
  try {
  const params = (arguments[1] && (arguments[1] as any).params) || {};
  const { id } = params;
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from('rfid_devices').delete().eq('device_id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Device deleted',
    });
  } catch (error) {
    console.error('Error deleting device:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
