export interface Faculty {
  id: string;
  fullName: string;
  email: string;
  department: string;
  phone: string;
  status: 'active' | 'on_leave' | 'inactive';
  statusOfAppointment: 'full-time' | 'part-time';
}
