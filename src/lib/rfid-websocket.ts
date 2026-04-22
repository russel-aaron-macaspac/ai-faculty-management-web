import { Server as SocketIOServer } from 'socket.io';
import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import {
  analyzeScanWithSchedule,
  logValidationAlert,
} from '@/lib/attendance/aiSchedulerValidation';

// Store active devices and sockets
const activeDevices = new Map();
let ioInstance: SocketIOServer | null = null;

// Get or create Socket.IO instance
export function getSocketIOInstance() {
  ioInstance ??= new SocketIOServer({
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });
  return ioInstance;
}

// Register device
export async function registerDevice(socket: any, deviceData: any) {
  const { deviceId, name, location, firmware_version } = deviceData;

  const supabase = createSupabaseAdminClient();

  // Check if device exists
  let device = activeDevices.get(deviceId);

  if (device === undefined) {
    // Create new device in database
    const { data, error } = await supabase
      .from('rfid_devices')
      .insert({
        device_id: deviceId,
        name,
        location,
        firmware_version,
        status: 'online',
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error registering device:', error);
      socket.emit('device_registration_failed', { error: error.message });
      return;
    }

    device = data;
  } else {
    // Update device status to online
    await supabase
      .from('rfid_devices')
      .update({
        status: 'online',
        last_seen: new Date().toISOString(),
        firmware_version,
      })
      .eq('device_id', deviceId);
  }

  activeDevices.set(deviceId, {
    ...device,
    connectedAt: new Date().toISOString(),
  });

  socket.join(`device:${deviceId}`);
  socket.emit('device_registered', { deviceId, success: true });

  // Broadcast device online status
  socket.broadcast.emit('device_status_update', {
    deviceId,
    status: 'online',
    timestamp: new Date().toISOString(),
  });

  console.log(`Device registered: ${deviceId} (${name})`);
}

// Handle RFID scan
export async function handleRFIDScan(socket: any, scanData: any) {
  const { deviceId, uid } = scanData;
  const supabase = createSupabaseAdminClient();

  const normalizedUID = uid.trim().toUpperCase();
  const scanTimestamp = scanData.timestamp || new Date().toISOString();

  try {
    // Find user by RFID UID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_id, first_name, middle_name, last_name, role, status, employee_no, office_id')
      .eq('rfid_card_uid', normalizedUID)
      .eq('status', 'active')
      .single();

    if (userError || !user) {
      // Invalid or unregistered card
      const failedScan = {
        deviceId,
        uid: normalizedUID,
        timestamp: scanTimestamp,
        status: 'not_registered',
        reason: 'Card not registered or user inactive',
      };

      // Save to database
      await supabase.from('rfid_scans').insert(failedScan);

      // Emit to device and listeners
      socket.emit('scan_result', {
        ...failedScan,
        success: false,
      });

      socket.broadcast.emit('rfid_scan', failedScan);
      return;
    }

    const today = new Date(scanTimestamp).toISOString().split('T')[0];
    const aiResponse = await analyzeScanWithSchedule({
      supabase,
      userId: user.user_id,
      deviceId,
      scanTimestamp,
    });

    const status = aiResponse.status === 'late' ? 'late' : 'present';

    const { data: openAttendance, error: openAttendanceError } = await supabase
      .from('attendance')
      .select('id, time_in, time_out, status')
      .eq('user_id', user.user_id)
      .eq('date', today)
      .is('time_out', null)
      .order('time_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openAttendanceError) throw openAttendanceError;

    if (openAttendance) {
      const { error: updateError } = await supabase
        .from('attendance')
        .update({ time_out: scanTimestamp })
        .eq('id', openAttendance.id);

      if (updateError) throw updateError;
    } else {
      const { error: attendanceError } = await supabase
        .from('attendance')
        .insert({
          user_id: user.user_id,
          date: today,
          time_in: scanTimestamp,
          device_id: deviceId,
          status,
        });

      if (attendanceError) throw attendanceError;
    }

    // Record scan event
    const successfulScan = {
      deviceId,
      uid: normalizedUID,
      timestamp: scanTimestamp,
      userId: user.user_id,
      userName: `${user.first_name} ${user.last_name}`,
      status: 'success',
      attendanceStatus: status,
    };

    const successfulScanEvent = {
      ...successfulScan,
      analysis: aiResponse,
    };

    await supabase.from('rfid_scans').insert(successfulScan);
    await logValidationAlert(supabase, {
      userId: user.user_id,
      deviceId,
      aiResponse,
    });

    // Emit to device and listeners
    socket.emit('scan_result', {
      ...successfulScanEvent,
      success: true,
    });

    // Broadcast to all connected clients (live page, dashboard, etc.)
    socket.broadcast.emit('rfid_scan', successfulScanEvent);

    console.log(
      `RFID Scan: ${user.first_name} ${user.last_name} at ${scanTimestamp} from device ${deviceId}`
    );
  } catch (error) {
    console.error('Error processing RFID scan:', error);

    const failedScan = {
      deviceId,
      uid: normalizedUID,
      timestamp: scanTimestamp,
      status: 'failed',
      reason: (error as Error).message,
    };

    await supabase.from('rfid_scans').insert(failedScan);

    socket.emit('scan_result', {
      ...failedScan,
      success: false,
    });

    socket.broadcast.emit('rfid_scan', failedScan);
  }
}

// Handle device disconnect
export async function handleDeviceDisconnect(deviceId: string) {
  const supabase = createSupabaseAdminClient();

  activeDevices.delete(deviceId);

  // Update device status to offline
  await supabase
    .from('rfid_devices')
    .update({
      status: 'offline',
      last_seen: new Date().toISOString(),
    })
    .eq('device_id', deviceId);

  console.log(`Device disconnected: ${deviceId}`);
}

// Get active devices
export function getActiveDevices() {
  return Array.from(activeDevices.values());
}

// Get device by ID
export function getDeviceById(deviceId: string) {
  return activeDevices.get(deviceId);
}
