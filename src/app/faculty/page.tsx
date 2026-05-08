'use client';

import { useState, useEffect } from 'react';
import { facultyService } from '@/services/facultyService';
import { Faculty } from '@/types/faculty';
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

const facultySchema = z.object({
  fullName: z.string().trim().min(1, { message: 'Enter the faculty member’s full name.' }).min(2, { message: 'Full name should include at least 2 characters.' }),
  email: z
    .string()
    .trim()
    .min(1, { message: 'Enter a faculty email address.' })
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Enter a valid email address.',
    }),
  department: z.string().trim().min(1, { message: 'Enter the faculty department.' }).min(2, { message: 'Department should include at least 2 characters.' }),
  phone: z.string().trim().min(1, { message: 'Enter a contact number.' }).min(5, { message: 'Contact number should include at least 5 characters.' }),
  status: z.enum(['active', 'on_leave', 'inactive']),
});

export default function FacultyPage() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof facultySchema>>({
    resolver: zodResolver(facultySchema),
    defaultValues: {
      fullName: '',
      email: '',
      department: '',
      phone: '',
      status: 'active',
    },
  });

  const loadData = async () => {
    setLoading(true);
    const data = await facultyService.getFaculty();
    setFaculty(data);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const onSubmit = async (values: z.infer<typeof facultySchema>) => {
    setFormError(null);

    try {
      if (editingId) {
        await facultyService.updateFaculty(editingId, values);
      } else {
        await facultyService.createFaculty(values);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save this faculty record. Please review the form and try again.');
      return;
    }

    setIsAddOpen(false);
    setEditingId(null);
    form.reset();
    loadData();
  };

  const handleEdit = (f: Faculty) => {
    setEditingId(f.id);
    form.reset({
      fullName: f.fullName,
      email: f.email,
      department: f.department,
      phone: f.phone,
      status: f.status,
    });
    setIsAddOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this faculty member?')) {
      await facultyService.deleteFaculty(id);
      loadData();
    }
  };

  const filtered = faculty.filter(f => 
    f.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Faculty Management</h1>
          <p className="text-slate-500 mt-1">Manage university faculty records and statuses.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
             setEditingId(null);
             setFormError(null);
             form.reset({ fullName: '', email: '', department: '', phone: '', status: 'active' });
          }
        }}>
           <DialogTrigger>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium flex items-center gap-2">
               <Plus className="mr-2 h-4 w-4" /> Add Faculty
            </button>
          </DialogTrigger>
            <DialogContent className="sm:max-w-106.25">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Faculty' : 'Add New Faculty'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {formError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {formError}
                  </div>
                )}
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
                        <SelectItem value="on_leave">On Leave</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex justify-end pt-4">
                   <Button type="submit" disabled={form.formState.isSubmitting}>
                     {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {editingId ? 'Save Changes' : 'Create Faculty'}
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
             placeholder="Search faculty by name or department..." 
             className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Instructor</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              if (loading) {
                return (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
                      Loading faculty data...
                    </TableCell>
                  </TableRow>
                );
              }

              if (filtered.length === 0) {
                return (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                      No faculty members found.
                    </TableCell>
                  </TableRow>
                );
              }

              return filtered.map((f) => {
              let statusClassName = 'bg-slate-100 text-slate-800';
              if (f.status === 'active') {
                statusClassName = 'bg-emerald-100 text-emerald-800';
              } else if (f.status === 'on_leave') {
                statusClassName = 'bg-amber-100 text-amber-800';
              }
              
              return (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium text-slate-900">{f.fullName}</div>
                  <div className="text-xs text-slate-500 md:hidden mt-1">{f.email}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="text-sm">{f.email}</div>
                  <div className="text-xs text-slate-500">{f.phone}</div>
                </TableCell>
                <TableCell>{f.department}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusClassName}`}>
                    {f.status.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(f)}>
                      <Pencil className="h-4 w-4 text-slate-500 hover:text-red-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}>
                      <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
              });
            })()}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
