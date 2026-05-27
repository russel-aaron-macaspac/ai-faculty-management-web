import { Faculty } from '@/types/faculty';
import { delay } from './api';

let mockFacultyData: Faculty[] = [
  { id: 'f1', fullName: 'Dr. Alice Brown', email: 'alice@university.edu', department: 'Computer Science', phone: '+1234567890', status: 'active' },
  { id: 'f2', fullName: 'Prof. Bob Wilson', email: 'bob@university.edu', department: 'Mathematics', phone: '+1987654321', status: 'on_leave' },
  { id: 'f3', fullName: 'Dr. Charlie Davis', email: 'charlie@university.edu', department: 'Physics', phone: '+1122334455', status: 'active' },
];

export const facultyService = {
  // Fetch faculty list from server if available. Falls back to in-memory mock data.
  getFaculty: async (): Promise<Faculty[]> => {
    try {
      const res = await fetch('/api/users/faculty');
      if (!res.ok) throw new Error('Network response was not ok');
      const payload = await res.json();
      const data = payload?.data || [];

      // Map server result to local Faculty shape (fill missing fields with sensible defaults)
      const mapped: Faculty[] = data.map((u: any) => ({
        id: String(u.id),
        fullName: u.name || '',
        email: u.email || '',
        department: u.department || '',
        phone: u.phone || '',
        status: u.status || 'active',
      }));

      return mapped;
    } catch (err) {
      // On any failure, return the mock dataset so UI remains functional.
      console.warn('[facultyService.getFaculty] fetch failed', err);
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
        body: JSON.stringify({ fullName: data.fullName, email: data.email, department: data.department, phone: data.phone, status: data.status }),
      });
      if (!res.ok) throw new Error('Failed to create faculty');
      const payload = await res.json();
      const created = payload?.data || null;

      const newFaculty: Faculty = {
        id: String(created?.id || `f${Date.now()}`),
        fullName: data.fullName,
        email: data.email || '',
        department: data.department || '',
        phone: data.phone || '',
        status: data.status || 'active',
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
        body: JSON.stringify({ fullName: data.fullName, email: data.email, department: data.department, phone: data.phone, status: data.status }),
      });
      if (!res.ok) throw new Error('Failed to update faculty');
      const payload = await res.json();
      const updated = payload?.data || null;

      const updatedFaculty: Faculty = {
        id: String(updated?.id || id),
        fullName: data.fullName || (mockFacultyData.find(f => f.id === id)?.fullName ?? ''),
        email: data.email || (mockFacultyData.find(f => f.id === id)?.email ?? ''),
        department: data.department || (mockFacultyData.find(f => f.id === id)?.department ?? ''),
        phone: data.phone || (mockFacultyData.find(f => f.id === id)?.phone ?? ''),
        status: data.status || (mockFacultyData.find(f => f.id === id)?.status ?? 'active'),
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
    try {
      const res = await fetch(`/api/users/faculty/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete faculty');
      // soft-delete on server; remove from local mock as well
      mockFacultyData = mockFacultyData.filter(f => f.id !== id);
    } catch (err) {
      console.warn('[facultyService.deleteFaculty] failed, removing locally', err);
      await delay(400);
      mockFacultyData = mockFacultyData.filter(f => f.id !== id);
    }
  }
};
