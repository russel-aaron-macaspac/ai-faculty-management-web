import { FacultyAvailability, Schedule } from '@/types/schedule';

interface CreateSchedulePayload {
  facultyId: string;
  subjectId: string;
  roomId: string;
  day: string;
  startTime: string;
  endTime: string;
  createdBy: string;
  creatorRole: string;
}

interface SubjectPayload {
  code: string;
  name: string;
}

interface RoomPayload {
  name: string;
  capacity: number;
}

interface SchedulingConflictResponse {
  error: string;
  conflict_type: 'faculty' | 'room' | 'availability';
  conflicts: Array<{ conflict_type: string; details: unknown[] }>;
  suggestions: {
    suggested_rooms: Array<{ id: string; name: string; capacity: number }>;
    suggested_time_slots: Array<{ day: string; start_time: string; end_time: string }>;
  };
}

export const scheduleService = {
  async getSchedules(facultyId?: string): Promise<Schedule[]> {
    const query = facultyId ? `?facultyId=${encodeURIComponent(facultyId)}` : '';
    const res = await fetch(`/api/scheduling${query}`);

    if (!res.ok) {
      console.error('[scheduleService.getSchedules]', await res.text());
      return [];
    }

    const { data } = await res.json();
    return data;
  },

  async getMetadata(): Promise<{
    faculties: Array<{ id: string; name: string; role: string }>;
    subjects: Array<{ id: string; code: string; name: string }>;
    rooms: Array<{ id: string; name: string; capacity: number }>;
  }> {
    const res = await fetch('/api/scheduling/meta');

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to fetch scheduling metadata');
    }

    return res.json();
  },

  async createSchedule(values: CreateSchedulePayload): Promise<
    | { success: true; id: string }
    | { success: false; conflict: SchedulingConflictResponse }
  > {
    const res = await fetch('/api/scheduling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (res.status === 409) {
      const conflict = (await res.json()) as SchedulingConflictResponse;
      return { success: false, conflict };
    }

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to create schedule');
    }

    const data = await res.json();
    return { success: true, id: data.id as string };
  },

  async getFacultyAvailability(facultyId: string): Promise<FacultyAvailability[]> {
    const res = await fetch(`/api/scheduling/availability?facultyId=${encodeURIComponent(facultyId)}`);

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to fetch faculty availability');
    }

    const { data } = await res.json();
    return data;
  },

  async saveFacultyAvailability(facultyId: string, entries: Array<{ day: string; startTime: string; endTime: string }>) {
    const res = await fetch('/api/scheduling/availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facultyId, entries }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to save faculty availability');
    }

    return res.json();
  },

  async getPendingApprovals(role: string): Promise<Schedule[]> {
    const res = await fetch(`/api/scheduling/pending?role=${encodeURIComponent(role)}`);

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to fetch pending approvals');
    }

    const { data } = await res.json();
    return data;
  },

  async submitApprovalDecision(values: {
    scheduleId: string;
    role: string;
    action: 'approve' | 'reject';
    remarks?: string;
    actorId?: string;
  }) {
    const { scheduleId, ...payload } = values;
    const res = await fetch(`/api/scheduling/${scheduleId}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to process approval decision');
    }

    return res.json();
  },

  async createSubject(values: SubjectPayload) {
    const res = await fetch('/api/scheduling/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to create subject');
    }

    return res.json();
  },

  async updateSubject(id: string, values: Partial<SubjectPayload>) {
    const res = await fetch(`/api/scheduling/subjects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to update subject');
    }

    return res.json();
  },

  async deleteSubject(id: string) {
    const res = await fetch(`/api/scheduling/subjects/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to delete subject');
    }

    return res.json();
  },

  async createRoom(values: RoomPayload) {
    const res = await fetch('/api/scheduling/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to create room');
    }

    return res.json();
  },

  async updateRoom(id: string, values: Partial<RoomPayload>) {
    const res = await fetch(`/api/scheduling/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to update room');
    }

    return res.json();
  },

  async deleteRoom(id: string) {
    const res = await fetch(`/api/scheduling/rooms/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to delete room');
    }

    return res.json();
  },
};