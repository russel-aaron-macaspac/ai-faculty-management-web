import { Faculty } from '@/types/faculty';
import { delay } from './api';

let mockFacultyData: Faculty[] = [
  { id: 'f1', fullName: 'Dr. Alice Brown', email: 'alice@university.edu', department: 'Computer Science', phone: '+1234567890', status: 'active', statusOfAppointment: 'full-time' },
  { id: 'f2', fullName: 'Prof. Bob Wilson', email: 'bob@university.edu', department: 'Mathematics', phone: '+1987654321', status: 'on_leave', statusOfAppointment: 'part-time' },
  { id: 'f3', fullName: 'Dr. Charlie Davis', email: 'charlie@university.edu', department: 'Physics', phone: '+1122334455', status: 'active', statusOfAppointment: 'full-time' },
];

type FacultyApiUser = {
  id: string | number;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  phone?: string | null;
  status?: Faculty['status'];
  statusOfAppointment?: Faculty['statusOfAppointment'];
};

export const facultyService = {
  // Fetch faculty list from server if available. Falls back to in-memory mock data.
  getFaculty: async (departmentId?: number): Promise<Faculty[]> => {
    try {
      const query = departmentId === undefined ? '' : `?departmentId=${encodeURIComponent(departmentId)}`;
      const res = await fetch(`/api/users/faculty${query}`);
      if (!res.ok) throw new Error('Network response was not ok');
      const payload = await res.json();
      const data = payload?.data || [];

      // Map server result to local Faculty shape (fill missing fields with sensible defaults)
      const mapped: Faculty[] = data.map((u: FacultyApiUser) => ({
        id: String(u.id),
        fullName: u.name || '',
        email: u.email || '',
        department: u.department || '',
        phone: u.phone || '',
        status: u.status || 'active',
        statusOfAppointment: u.statusOfAppointment || 'full-time',
      }));

      return mapped;
    } catch (err) {
      // On any failure, return the mock dataset so UI remains functional.
      console.warn('[facultyService.getFaculty] fetch failed', err);
      if (departmentId !== undefined) return [];
      await delay(300);
      return [...mockFacultyData];
    }
  },
  
  getFacultyById: async (id: string): Promise<Faculty | undefined> => {
    await delay(300);
    return mockFacultyData.find(f => f.id === id);
  },

  createFaculty: async (data: Omit<Faculty, 'id'>): Promise<Faculty> => {
    try {
      const res = await fetch('/api/users/faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: data.fullName, email: data.email, department: data.department, phone: data.phone, status: data.status, statusOfAppointment: data.statusOfAppointment }),
      });
      if (!res.ok) throw new Error('Could not create faculty.');
      const payload = await res.json();
      const created = payload?.data || null;

      const newFaculty: Faculty = {
        id: String(created?.id || `f${Date.now()}`),
        fullName: data.fullName,
        email: data.email || '',
        department: data.department || '',
        phone: data.phone || '',
        status: data.status || 'active',
        statusOfAppointment: data.statusOfAppointment,
      };

      // Keep local mock in sync for fallbacks
      mockFacultyData.push(newFaculty);
      return newFaculty;
    } catch (err) {
      console.warn('[facultyService.createFaculty] failed, falling back to mock', err);
      await delay(600);
      const newFaculty: Faculty = {
        ...data,
        id: `f${Date.now()}`,
      };
      mockFacultyData.push(newFaculty);
      return newFaculty;
    }
  },

  updateFaculty: async (id: string, data: Partial<Faculty>): Promise<Faculty> => {
    try {
      const res = await fetch(`/api/users/faculty/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: data.fullName, email: data.email, department: data.department, phone: data.phone, status: data.status, statusOfAppointment: data.statusOfAppointment }),
      });
      if (!res.ok) throw new Error('Could not update faculty.');
      const payload = await res.json();
      const updated = payload?.data || null;

      const updatedFaculty: Faculty = {
        id: String(updated?.id || id),
        fullName: data.fullName || (mockFacultyData.find(f => f.id === id)?.fullName ?? ''),
        email: data.email || (mockFacultyData.find(f => f.id === id)?.email ?? ''),
        department: data.department || (mockFacultyData.find(f => f.id === id)?.department ?? ''),
        phone: data.phone || (mockFacultyData.find(f => f.id === id)?.phone ?? ''),
        status: data.status || (mockFacultyData.find(f => f.id === id)?.status ?? 'active'),
        statusOfAppointment: data.statusOfAppointment || (mockFacultyData.find(f => f.id === id)?.statusOfAppointment ?? 'full-time'),
      };

      const index = mockFacultyData.findIndex(f => f.id === id);
      if (index !== -1) mockFacultyData[index] = updatedFaculty;
      return updatedFaculty;
    } catch (err) {
      console.warn('[facultyService.updateFaculty] failed, applying local mock update', err);
      await delay(600);
      const index = mockFacultyData.findIndex(f => f.id === id);
      if (index === -1) throw new Error('Faculty not found');
      mockFacultyData[index] = { ...mockFacultyData[index], ...data };
      return mockFacultyData[index];
    }
  },

  deleteFaculty: async (id: string): Promise<void> => {
    const res = await fetch(`/api/users/faculty/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Could not delete faculty.');
    }

    // Keep local mock data in sync for environments using the fallback dataset.
    mockFacultyData = mockFacultyData.filter(f => f.id !== id);
  }
};
