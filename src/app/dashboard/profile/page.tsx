'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { User } from '@/types/user';
import { isApprovalOfficer, isFacultyLikeRole } from '@/lib/roleConfig';
import { Badge } from '@/components/ui/badge';

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
        <div className="rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">No profile data found. Please login again.</div>
      </div>
    );
  }

  let department = 'Operations';

  if (isFacultyLikeRole(user.role)) {
    department = 'Computer Science';
  } else if (isApprovalOfficer(user.role)) {
    department = 'Administration';
  }

  const profileDetails = {
    employeeId: user.id,
    department,
    statusOfAppointment: user.statusOfAppointment || 'Not set',
    phone: (user as any).phone || '+63 917 123 4567',
    address: (user as any).address || '123 Main St, Springfield, ST 12345',
    hireDate: 'Aug 15, 2022',
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Faculty profile</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">My Profile</h1>
        <p className="text-slate-500">Review and update your account details.</p>
      </div>

      <Card className="surface-panel w-full max-w-5xl border-0 shadow-none">
        <CardHeader className="border-b border-slate-200/80 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-2xl">{user.name}</CardTitle>
              <CardDescription className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">{user.role.replaceAll('_', ' ')}</Badge>
              </CardDescription>
            </div>

            <div>
              <Button
                className="bg-[#D4A017] text-[#0F172A] hover:bg-[#B8860B]"
                onClick={() => setIsEditOpen(true)}
              >
                Edit profile
              </Button>
              <Dialog open={isEditOpen} onOpenChange={(open) => setIsEditOpen(open)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Contact Details</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="profile-phone" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
                      <Input id="profile-phone" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} className="mt-2" />
                    </div>
                    <div>
                      <label htmlFor="profile-address" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
                      <Input id="profile-address" value={addressInput} onChange={(e) => setAddressInput(e.target.value)} className="mt-2" />
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

        <CardContent className="grid gap-6 py-6 sm:grid-cols-2">
          <div className="space-y-2 pb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</div>
            <div className="text-sm text-slate-900" style={{ wordBreak: 'break-word' }}>{user.email}</div>
          </div>

          <div className="space-y-2 pb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee ID</div>
            <div className="text-sm text-slate-900">{profileDetails.employeeId}</div>
          </div>

          <div className="space-y-2 pb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status of Appointment</div>
            <div className="text-sm capitalize text-slate-900">{profileDetails.statusOfAppointment}</div>
          </div>

          <div className="space-y-2 pb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hire Date</div>
            <div className="text-sm text-slate-900">{profileDetails.hireDate}</div>
          </div>

          <div className="space-y-2 pb-2 sm:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</div>
            <div className="text-sm text-slate-900">{profileDetails.phone}</div>
          </div>

          <div className="space-y-2 pb-2 sm:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</div>
            <div className="text-sm text-slate-900">{profileDetails.address}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
