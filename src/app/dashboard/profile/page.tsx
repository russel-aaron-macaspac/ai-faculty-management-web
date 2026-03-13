'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User } from '@/types/user';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(JSON.parse(userStr));
      } catch {
        setUser(null);
      }
    }
  }, []);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-slate-500">No profile data found. Please login again.</div>
      </div>
    );
  }

  const profileDetails = {
    employeeId: user.id,
    department:
      user.role === 'faculty'
        ? 'Computer Science'
        : user.role === 'staff'
        ? 'Administration'
        : 'Operations',
    position:
      user.role === 'faculty'
        ? 'Associate Professor'
        : user.role === 'staff'
        ? 'Office Manager'
        : 'System Administrator',
    phone: '(555) 123-4567',
    address: '123 Main St, Springfield, ST 12345',
    hireDate: 'Aug 15, 2022',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Profile</h1>
        <p className="text-slate-500 mt-1">Review and see your account details.</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span>
              Role: <span className="font-medium capitalize">{user.role}</span>
            </span>
            <span className="hidden sm:inline-block">•</span>
            <span>Department: <span className="font-medium">{profileDetails.department}</span></span>
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Email</div>
            <div className="text-sm text-slate-900 break-words">{user.email}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Employee ID</div>
            <div className="text-sm text-slate-900">{profileDetails.employeeId}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Position</div>
            <div className="text-sm text-slate-900">{profileDetails.position}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Hire Date</div>
            <div className="text-sm text-slate-900">{profileDetails.hireDate}</div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Phone</div>
            <div className="text-sm text-slate-900">{profileDetails.phone}</div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Address</div>
            <div className="text-sm text-slate-900">{profileDetails.address}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
