export interface Schedule {
  id: string;
  facultyId: string;
  facultyName: string;
  subjectId: string;
  roomId: string;
  day: string;
  startTime: string;
  endTime: string;
  status:
    | 'pending_program_chair'
    | 'pending_dean'
    | 'pending_ovpaa'
    | 'pending_registrar'
    | 'approved'
    | 'rejected';
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  remarks?: string | null;
  subject: {
    id: string;
    code: string;
    name: string;
  };
  room: {
    id: string;
    name: string;
    capacity?: number;
  };

  // Backward-compatible fields still used by dashboard widgets.
  employeeName?: string;
  dayOfWeek?: string;
  subjectOrRole?: string;
  type?: 'class' | 'shift';
  conflictWarning?: boolean;
}

export interface FacultyAvailability {
  id: string;
  facultyId: string;
  day: string;
  startTime: string;
  endTime: string;
}

export interface SchedulingConflict {
  conflict_type: 'faculty' | 'room' | 'availability';
  details: unknown[];
}

export interface SchedulingSuggestion {
  suggested_rooms: Array<{ id: string; name: string; capacity: number }>;
  suggested_time_slots: Array<{ day: string; start_time: string; end_time: string }>;
}
