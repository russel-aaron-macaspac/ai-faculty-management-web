'use client';

import { useState, useEffect } from 'react';
import { staffService } from '@/services/staffService';
import { Staff } from '@/types/staff';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';

const staffSchema = z.object({
  name: z.string().min(2, { message: 'Name is required' }),
  department: z.string().min(2, { message: 'Department is required' }),
  role: z.string().min(2, { message: 'Role is required' }),
  contactInfo: z.string().email({ message: 'Invalid email' }),
  employmentDate: z.string().min(5, { message: 'Date is required' }),
  status: z.enum(['active', 'inactive']),
});

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: '',
      department: '',
      role: '',
      contactInfo: '',
      employmentDate: new Date().toISOString().split('T')[0],
      status: 'active',
    },
  });

  const loadData = async () => {
    setLoading(true);
    const data = await staffService.getStaff();
    setStaff(data);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const onSubmit = async (values: z.infer<typeof staffSchema>) => {
    if (editingId) {
      await staffService.updateStaff(editingId, values);
    } else {
      await staffService.createStaff(values);
    }
    setIsAddOpen(false);
    setEditingId(null);
    form.reset();
    loadData();
  };

  const handleEdit = (s: Staff) => {
    setEditingId(s.id);
    form.reset({
      name: s.name,
      department: s.department,
      role: s.role,
      contactInfo: s.contactInfo,
      employmentDate: s.employmentDate,
      status: s.status,
    });
    setIsAddOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to remove this staff member?')) {
      await staffService.deleteStaff(id);
      loadData();
    }
  };

  const filtered = staff.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Staff Management</h1>
          <p className="text-slate-500 mt-1">Manage administrative and support staff records.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
             setEditingId(null);
             form.reset({ name: '', department: '', role: '', contactInfo: '', employmentDate: new Date().toISOString().split('T')[0], status: 'active' });
          }
        }}>
          <DialogTrigger asChild>
             <Button className="bg-red-600 hover:bg-red-700">
               <Plus className="mr-2 h-4 w-4" /> Add Staff
             </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
             <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Staff Details' : 'Add New Staff'}</DialogTitle>
             </DialogHeader>
             <Form {...form}>
               <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                 <FormField control={form.control} name="name" render={({ field }) => (
                   <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                 )} />
                 <FormField control={form.control} name="role" render={({ field }) => (
                   <FormItem><FormLabel>Job Title / Role</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                 )} />
                 <FormField control={form.control} name="department" render={({ field }) => (
                   <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                 )} />
                 <FormField control={form.control} name="contactInfo" render={({ field }) => (
                   <FormItem><FormLabel>Email Contact</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                 )} />
                 <FormField control={form.control} name="employmentDate" render={({ field }) => (
                   <FormItem><FormLabel>Employment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                 )} />
                 <FormField control={form.control} name="status" render={({ field }) => (
                   <FormItem>
                     <FormLabel>Status</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                       <FormControl>
                         <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                       </FormControl>
                       <SelectContent>
                         <SelectItem value="active">Active</SelectItem>
                         <SelectItem value="inactive">Inactive</SelectItem>
                       </SelectContent>
                     </Select>
                     <FormMessage />
                   </FormItem>
                 )} />
                 <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingId ? 'Save Changes' : 'Create Staff'}
                    </Button>
                 </div>
               </form>
             </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
           <Search className="h-5 w-5 text-slate-400" />
           <Input 
             placeholder="Search staff by name or role..." 
             className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Employee</TableHead>
              <TableHead>Role & Dept</TableHead>
              <TableHead className="hidden md:table-cell">Employed Since</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
                  Loading staff data...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                   No staff members found.
                 </TableCell>
              </TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.contactInfo}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{s.role}</div>
                  <div className="text-xs text-slate-500">{s.department}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{s.employmentDate}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    s.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {s.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}>
                      <Pencil className="h-4 w-4 text-slate-500 hover:text-red-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
