'use client';

import { useState, useEffect, useMemo } from 'react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarPlus, Trash2, Loader2, Search, AlertTriangle, Key, AlertCircle, Edit2 } from 'lucide-react';
import { User } from '@/types/user';
import { parseTimeToMinutes, formatTimeToTwelveHour, subtractMinutesFromTime } from '@/lib/timeUtils';

interface RoomAccessTask {
  id: string;
  room: string;
  professor: string;
  prepTime: string;
  classTime: string;
  subject: string;
}

const scheduleSchema = z.object({
  employeeId: z.string().min(1, { message: 'Employee is required' }),
  employeeName: z.string().min(1, { message: 'Name is required' }),
  type: z.enum(['class', 'shift']),
  subjectOrRole: z.string().min(2, { message: 'Subject or Role is required' }),
  room: z.string().optional(),
  dayOfWeek: z.string().min(1, { message: 'Day is required' }),
  startTime: z.string().min(4, { message: 'Start time is required' }),
  endTime: z.string().min(4, { message: 'End time is required' }),
});

const editScheduleSchema = z.object({
  type: z.enum(['class', 'shift']),
  subjectOrRole: z.string().min(2, { message: 'Subject or Role is required' }),
  room: z.string().optional(),
  dayOfWeek: z.string().min(1, { message: 'Day is required' }),
  startTime: z.string().min(4, { message: 'Start time is required' }),
  endTime: z.string().min(4, { message: 'End time is required' }),
});

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(userStr));
    }
  }, []);

  const form = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      employeeId: '',
      employeeName: '',
      type: 'class',
      subjectOrRole: '',
      room: '',
      dayOfWeek: 'Monday',
      startTime: '',
      endTime: '',
    },
  });

  const editForm = useForm<z.infer<typeof editScheduleSchema>>({
    resolver: zodResolver(editScheduleSchema),
    defaultValues: {
      type: 'class',
      subjectOrRole: '',
      room: '',
      dayOfWeek: 'Monday',
      startTime: '',
      endTime: '',
    },
  });

  const loadData = async () => {
    setLoading(true);
    const data = await scheduleService.getSchedules();
    setSchedules(data);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const onSubmit = async (values: z.infer<typeof scheduleSchema>) => {
    await scheduleService.createSchedule(values);
    setIsAddOpen(false);
    form.reset();
    loadData();
  };

  const onEditSubmit = async (values: z.infer<typeof editScheduleSchema>) => {
    if (!editingScheduleId) return;
    await scheduleService.updateSchedule(editingScheduleId, values);
    setIsEditOpen(false);
    editForm.reset();
    setEditingScheduleId(null);
    loadData();
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    editForm.reset({
      type: schedule.type,
      subjectOrRole: schedule.subjectOrRole,
      room: schedule.room || '',
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    });
    setIsEditOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this schedule?')) {
      await scheduleService.deleteSchedule(id);
      loadData();
    }
  };

  const filtered = schedules.filter(s => {
    // If the user is not an admin, they can only see their own schedules
    if (user && user.role !== 'admin' && s.employeeName !== user.name) {
      return false;
    }

    return s.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
           s.subjectOrRole.toLowerCase().includes(searchTerm.toLowerCase()) ||
           s.dayOfWeek.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const roomAccessTasks = useMemo(() => {
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    return schedules
      .filter((schedule) => schedule.type === 'class' && schedule.dayOfWeek === currentDay)
      .sort((a, b) => (parseTimeToMinutes(a.startTime) ?? 0) - (parseTimeToMinutes(b.startTime) ?? 0))
      .map((classSchedule, index) => {
        const prepTime = subtractMinutesFromTime(classSchedule.startTime, 5);
        return {
          id: `room-${index}`,
          room: classSchedule.room || `Room ${index + 1}`,
          professor: classSchedule.employeeName || 'Professor',
          prepTime: formatTimeToTwelveHour(prepTime),
          classTime: formatTimeToTwelveHour(classSchedule.startTime),
          subject: classSchedule.subjectOrRole || 'Class',
        } as RoomAccessTask;
      });
  }, [schedules]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{user?.role === 'admin' ? 'Master Schedule' : 'My Schedule'}</h1>
          <p className="text-slate-500 mt-1">See your scheduled classes and shifts.</p>
        </div>
        
        {user?.role === 'admin' && (
          <Dialog open={isAddOpen} onOpenChange={(open) => {
            setIsAddOpen(open);
            if (!open) form.reset();
          }}>
            <DialogTrigger>
               <Button className="bg-red-600 hover:bg-red-700">
                 <CalendarPlus className="mr-2 h-4 w-4" /> Add Schedule
               </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
               <DialogHeader>
                  <DialogTitle>Add New Schedule</DialogTitle>
               </DialogHeader>
               <Form {...form}>
                 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="employeeId" render={({ field }) => (
                        <FormItem><FormLabel>Employee ID (Mock)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="employeeName" render={({ field }) => (
                        <FormItem><FormLabel>Employee Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                   </div>
                   
                   <FormField control={form.control} name="type" render={({ field }) => (
                     <FormItem>
                       <FormLabel>Schedule Type</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                         <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                         <SelectContent>
                           <SelectItem value="class">Class (Faculty)</SelectItem>
                           <SelectItem value="shift">Shift (Staff)</SelectItem>
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                   )} />

                   <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="subjectOrRole" render={({ field }) => (
                        <FormItem><FormLabel>Subject / Role</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="room" render={({ field }) => (
                        <FormItem><FormLabel>Room (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                   </div>

                   <FormField control={form.control} name="dayOfWeek" render={({ field }) => (
                     <FormItem>
                       <FormLabel>Day of Week</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                         <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                         <SelectContent>
                           {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                   )} />

                   <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="startTime" render={({ field }) => (
                        <FormItem><FormLabel>Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="endTime" render={({ field }) => (
                        <FormItem><FormLabel>End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                   </div>

                   <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add to Schedule
                      </Button>
                   </div>
                 </form>
               </Form>
            </DialogContent>
          </Dialog>
        )}

        {user?.role === 'admin' && (
          <Dialog open={isEditOpen} onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) {
              editForm.reset();
              setEditingScheduleId(null);
            }
          }}>
            <DialogContent className="sm:max-w-[425px]">
               <DialogHeader>
                  <DialogTitle>Edit Schedule</DialogTitle>
               </DialogHeader>
               <Form {...editForm}>
                 <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                   <FormField control={editForm.control} name="type" render={({ field }) => (
                     <FormItem>
                       <FormLabel>Schedule Type</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value}>
                         <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                         <SelectContent>
                           <SelectItem value="class">Class (Faculty)</SelectItem>
                           <SelectItem value="shift">Shift (Staff)</SelectItem>
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                   )} />

                   <div className="grid grid-cols-2 gap-4">
                      <FormField control={editForm.control} name="subjectOrRole" render={({ field }) => (
                        <FormItem><FormLabel>Subject / Role</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={editForm.control} name="room" render={({ field }) => (
                        <FormItem><FormLabel>Room (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                   </div>

                   <FormField control={editForm.control} name="dayOfWeek" render={({ field }) => (
                     <FormItem>
                       <FormLabel>Day of Week</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value}>
                         <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                         <SelectContent>
                           {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                   )} />

                   <div className="grid grid-cols-2 gap-4">
                      <FormField control={editForm.control} name="startTime" render={({ field }) => (
                        <FormItem><FormLabel>Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={editForm.control} name="endTime" render={({ field }) => (
                        <FormItem><FormLabel>End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                   </div>

                   <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={editForm.formState.isSubmitting}>
                        {editForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                      </Button>
                   </div>
                 </form>
               </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {user?.role === 'staff' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Key className="h-5 w-5 text-red-600" />
              Room Access Schedule
            </h2>
            <p className="text-sm text-slate-500 mt-1">Open rooms 5 minutes before each faculty class.</p>
          </div>

          <div className="p-4 space-y-3">
            {roomAccessTasks.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <AlertCircle className="h-5 w-5 text-slate-400" />
                <p className="text-sm text-slate-600">No faculty classes scheduled for today.</p>
              </div>
            ) : (
              roomAccessTasks.map((task) => (
                <div key={task.id} className="flex justify-between items-center p-4 rounded-lg border border-slate-100 hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-900">{task.room}</p>
                    <p className="text-sm text-slate-600">{task.subject} - Prof. {task.professor}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-red-600">{task.prepTime}</p>
                    <p className="text-xs text-slate-500">Open room (5 min before)</p>
                    <p className="text-xs text-slate-500 mt-1">Class: {task.classTime}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
           <Search className="h-5 w-5 text-slate-400" />
           <Input 
             placeholder="Search by name, subject, or day..." 
             className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Employee</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Time / Location</TableHead>
              <TableHead>Status</TableHead>
              {user?.role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
                  Loading schedules...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                   No schedules found.
                 </TableCell>
              </TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id} className={s.conflictWarning ? 'bg-rose-50/50' : ''}>
                <TableCell>
                  <div className="font-medium text-slate-900">{s.employeeName}</div>
                  <div className="text-xs text-slate-500 capitalize">{s.type}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{s.subjectOrRole}</div>
                  <div className="text-xs text-slate-500">{s.dayOfWeek}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatTimeToTwelveHour(s.startTime)} - {formatTimeToTwelveHour(s.endTime)}</div>
                  <div className="text-xs text-slate-500">{s.room || 'N/A'}</div>
                </TableCell>
                <TableCell>
                  {s.conflictWarning ? (
                     <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                        <AlertTriangle className="h-3 w-3" /> Conflict
                     </div>
                  ) : (
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Clear
                     </span>
                  )}
                </TableCell>
                {user?.role === 'admin' && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}>
                        <Edit2 className="h-4 w-4 text-slate-500 hover:text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
