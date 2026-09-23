import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

function normalizeRoomName(value) {
  const name = String(value || "").trim();
  return /^(tba|tbd)(\s*[-: ].*)?$/i.test(name) ? "TBA" : name;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity, equipment_type")
      .order("name", { ascending: true });

    if (error) {
      console.error("[ROOMS GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
    }

    return NextResponse.json({ data: (data || []).map((room) => ({ ...room, name: normalizeRoomName(room.name) })) });
  } catch (err) {
    console.error("[ROOMS GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = normalizeRoomName(body?.name);
    const capacity = Number(body?.capacity);
    const equipmentType = body?.equipmentType === null || body?.equipmentType === undefined || body?.equipmentType === "" ? null : String(body.equipmentType).trim().toLowerCase();

    if (!name || Number.isNaN(capacity) || capacity <= 0) {
      return NextResponse.json({ error: "name and valid capacity are required" }, { status: 400 });
    }

    if (equipmentType !== null && !["computer", "networking_tools"].includes(equipmentType)) {
      return NextResponse.json({ error: "equipmentType must be computer or networking_tools" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ name, capacity, equipment_type: equipmentType })
      .select("id, name, capacity, equipment_type")
      .single();

    if (error) {
      console.error("[ROOMS POST ERROR]", error);
      return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
    }

    // Attempt to link any RFID devices that reported this room name as their location
    try {
      const roomId = data?.id;
      if (roomId && name) {
        // Update devices whose `location` loosely matches the room name and haven't been linked yet
        const { data: updatedDevices, error: updateError } = await supabase
          .from('rfid_devices')
          .update({ room_id: roomId })
          .ilike('location', `%${name}%`)
          .is('room_id', null)
          .select('device_id, room_id');

        if (updateError) {
          console.warn('[ROOMS POST] failed to attach devices to new room', updateError);
        } else if (Array.isArray(updatedDevices) && updatedDevices.length) {
          console.info(`[ROOMS POST] linked ${updatedDevices.length} device(s) to room ${roomId}`);
        }
      }
    } catch (err) {
      console.warn('[ROOMS POST] error while linking devices to room', err);
    }

    return NextResponse.json({ message: "Room created", data }, { status: 201 });
  } catch (err) {
    console.error("[ROOMS POST ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
