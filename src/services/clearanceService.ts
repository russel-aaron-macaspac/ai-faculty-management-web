import { Clearance } from '@/types/clearance';
import { delay } from './api';

const mockClearanceData: Clearance[] = [
  { id: 'c1', employeeId: 'f1', employeeName: 'Dr. Alice Brown', requiredDocument: 'Annual Medical Certificate', status: 'approved', submissionDate: '2023-01-10' },
  { id: 'c2', employeeId: 'f3', employeeName: 'Dr. Charlie Davis', requiredDocument: 'Contract Renewal Form', status: 'pending', validationWarning: 'Signature missing on page 2' }, // AI Alert: Validation warning
  { id: 'c3', employeeId: 's2', employeeName: 'Michael Johnson', requiredDocument: 'NDA Agreement', status: 'submitted', submissionDate: '2023-10-05' },
];

export const clearanceService = {
  getClearances: async (): Promise<Clearance[]> => {
    await delay(500);
    return [...mockClearanceData];
  },
  
  uploadDocument: async (employeeId: string, employeeName: string, documentName: string): Promise<Clearance> => {
    await delay(1200); // Simulate upload
    const newClearance: Clearance = {
      id: `c${Date.now()}`,
      employeeId,
      employeeName,
      requiredDocument: documentName,
      status: 'submitted',
      submissionDate: new Date().toISOString().split('T')[0]
    };
    mockClearanceData.push(newClearance);
    return newClearance;
  }
};
