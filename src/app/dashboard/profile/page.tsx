'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { User } from '@/types/user';
import { isApprovalOfficer, isFacultyLikeRole } from '@/lib/roleConfig';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (user) {
      setPhoneInput((user as any).phone || '');
      setAddressInput((user as any).address || '');
    }
  }, [user]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-slate-500">No profile data found. Please login again.</div>
      </div>
    );
  }

  let department = 'Operations';
  let position = 'System Administrator';

  if (isFacultyLikeRole(user.role)) {
    department = 'Computer Science';
    position = user.role === 'program_chair' ? 'Program Chair' : 'Associate Professor';
  } else if (isApprovalOfficer(user.role)) {
    department = 'Administration';
    position = 'Officer';
  }

  const profileDetails = {
    employeeId: user.id,
    department,
    position,
    phone: (user as any).phone || '+63 917 123 4567',
    address: (user as any).address || '123 Main St, Springfield, ST 12345',
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{user.name}</CardTitle>
              <CardDescription className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span>
                  Role: <span className="font-medium capitalize">{user.role}</span>
                </span>
                <span className="hidden sm:inline-block">•</span>
                <span>Department: <span className="font-medium">{profileDetails.department}</span></span>
              </CardDescription>
            </div>

            <div>
                <Button variant="outline" onClick={() => setIsEditOpen(true)}>Edit</Button>
                <Dialog open={isEditOpen} onOpenChange={(open) => setIsEditOpen(open)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Contact Details</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-500 uppercase">Phone</label>
                      <Input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 uppercase">Address</label>
                      <Input value={addressInput} onChange={(e) => setAddressInput(e.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                      <Button onClick={async () => {
                        if (!user) return;
                        setSaving(true);
                        try {
                          const res = await fetch('/api/users/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: user.id, phone: phoneInput, address: addressInput }),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json?.error || 'Failed to update');

                          // Update localStorage and state
                          const updatedUser = { ...(user as any), phone: phoneInput, address: addressInput } as User & { phone?: string; address?: string };
                          localStorage.setItem('user', JSON.stringify(updatedUser));
                          setUser(updatedUser);
                          toast({ title: 'Saved', description: 'Profile updated.', type: 'success' });
                          setIsEditOpen(false);
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Failed to save';
                          toast({ title: 'Save Failed', description: msg, type: 'error' });
                        } finally {
                          setSaving(false);
                        }
                      }} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Email</div>
            <div className="text-sm text-slate-900 wrap-break-word">{user.email}</div>
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
