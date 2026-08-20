'use client';

import { useEffect, useMemo, useState } from 'react';
import { facultyService } from '@/services/facultyService';
import { Faculty } from '@/types/faculty';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { ArrowUpDown, ChevronDown, ChevronUp, Loader2, Pencil, Search, Trash2, Users } from 'lucide-react';
import { toast } from '@/lib/toast';

const facultySchema = z.object({
  fullName: z.string().trim().min(1, { message: 'Enter the faculty member’s full name.' }).min(2, { message: 'Full name should include at least 2 characters.' }),
  email: z
    .string()
    .trim()
    .min(1, { message: 'Enter a faculty email address.' })
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Enter a valid email address.',
    }),
  department: z.string().trim().min(1, { message: 'Enter the department or college.' }),
  phone: z.string().trim().min(1, { message: 'Enter a contact number.' }),
  status: z.enum(['active', 'on_leave', 'inactive']),
  statusOfAppointment: z.enum(['full-time', 'part-time']),
});

type SortKey = 'fullName' | 'email' | 'status';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 8;

export default function FacultyPage() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('fullName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const form = useForm<z.infer<typeof facultySchema>>({
    resolver: zodResolver(facultySchema),
    defaultValues: {
      fullName: '',
      email: '',
      department: '',
      phone: '',
      status: 'active',
      statusOfAppointment: 'full-time',
    },
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await facultyService.getFaculty();
      setFaculty(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onSubmit = async (values: z.infer<typeof facultySchema>) => {
    setFormError(null);

    try {
      if (editingId) {
        await facultyService.updateFaculty(editingId, values);
        toast({ title: 'Faculty Updated', description: 'Faculty record saved successfully.', type: 'success' });
      } else {
        await facultyService.createFaculty(values);
        toast({ title: 'Faculty Created', description: 'New faculty record added.', type: 'success' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to save this faculty record. Please review the form and try again.';
      setFormError(msg);
      toast({ title: 'Save Failed', description: msg, type: 'error' });
      return;
    }

    setIsAddOpen(false);
    setEditingId(null);
    form.reset();
    loadData();
  };

  const handleEdit = (record: Faculty) => {
    setEditingId(record.id);
    form.reset({
      fullName: record.fullName,
      email: record.email,
      department: record.department,
      phone: record.phone,
      status: record.status,
      statusOfAppointment: record.statusOfAppointment,
    });
    setIsAddOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this faculty member?')) {
      try {
        await facultyService.deleteFaculty(id);
        toast({ title: 'Deleted', description: 'Faculty record deleted.', type: 'info' });
      } catch (err) {
        toast({ title: 'Delete Failed', description: err instanceof Error ? err.message : 'Failed to delete faculty.', type: 'error' });
      }
      loadData();
    }
  };

  const filteredFaculty = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return faculty.filter((record) => {
      const fullName = record.fullName.toLowerCase();
      const email = (record.email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [faculty, searchTerm]);

  const sortedFaculty = useMemo(() => {
    const sorted = [...filteredFaculty].sort((left, right) => {
      const leftValue = (left[sortKey] || '').toString().toLowerCase();
      const rightValue = (right[sortKey] || '').toString().toLowerCase();

      if (leftValue < rightValue) return sortDirection === 'asc' ? -1 : 1;
      if (leftValue > rightValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredFaculty, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedFaculty.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortKey, sortDirection]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageRecords = sortedFaculty.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (field: SortKey) => {
    if (sortKey === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(field);
    setSortDirection('asc');
  };

  const renderSortIcon = (field: SortKey) => {
    if (sortKey !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }

    return sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  const getStatusBadge = (status: Faculty['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="success" className="capitalize">Active</Badge>;
      case 'on_leave':
        return <Badge variant="warning" className="capitalize">On leave</Badge>;
      default:
        return <Badge variant="secondary" className="capitalize">Inactive</Badge>;
    }
  };

  const openChange = (open: boolean) => {
    setIsAddOpen(open);
    if (!open) {
      setEditingId(null);
      setFormError(null);
      form.reset({ fullName: '', email: '', department: '', phone: '', status: 'active', statusOfAppointment: 'full-time' });
    }
  };

  const resultsLabel = `${sortedFaculty.length} faculty member${sortedFaculty.length === 1 ? '' : 's'}`;
  let tableBody: React.ReactNode;

  if (loading) {
    tableBody = (
      <TableRow>
        <TableCell colSpan={4} className="py-16 text-center text-slate-500">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
          Loading faculty data...
        </TableCell>
      </TableRow>
    );
  } else if (pageRecords.length === 0) {
    tableBody = (
      <TableRow>
        <TableCell colSpan={4} className="p-6">
          <EmptyState
            icon={Users}
            title="No faculty members found"
            description="Try a different search term or create a new record to start building the roster."
            actionLabel="Add Faculty"
            onAction={() => setIsAddOpen(true)}
          />
        </TableCell>
      </TableRow>
    );
  } else {
    tableBody = (
      <>
        {pageRecords.map((record) => (
          <TableRow key={record.id}>
            <TableCell>
              <div className="font-medium text-slate-900">{record.fullName}</div>
              <div className="mt-1 text-xs text-slate-500 md:hidden">{record.email}</div>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <div className="text-sm text-slate-700">{record.email}</div>
              <div className="text-xs text-slate-500">{record.phone}</div>
            </TableCell>
            <TableCell>{getStatusBadge(record.status)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(record)} aria-label={`Edit ${record.fullName}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(record.id)} aria-label={`Delete ${record.fullName}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Faculty Management</h1>
          <p className="max-w-2xl text-slate-500">Manage faculty records, search by name or email, sort the roster, and keep records up to date.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={openChange}>
          <Button onClick={() => setIsAddOpen(true)} className="self-start lg:self-auto">
            Add Faculty
          </Button>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Faculty' : 'Add New Faculty'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {formError && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {formError}
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Computer Science" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+63 9xx xxx xxxx" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_leave">On Leave</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="statusOfAppointment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status of Appointment</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select appointment status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="full-time">Full-time</SelectItem>
                          <SelectItem value="part-time">Part-time</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => openChange(false)}>
                    Cancel
                  </Button>
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

      <div className="surface-panel space-y-5 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Roster</p>
              <p className="text-sm text-slate-500">{resultsLabel} found</p>
            </div>
          </div>

          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search faculty by name or email"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto px-0 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-transparent hover:text-slate-900" onClick={() => toggleSort('fullName')}>
                    <span className="mr-2">Instructor</span>
                    {renderSortIcon('fullName')}
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" size="sm" className="h-auto px-0 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-transparent hover:text-slate-900" onClick={() => toggleSort('email')}>
                    <span className="mr-2">Email</span>
                    {renderSortIcon('email')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto px-0 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-transparent hover:text-slate-900" onClick={() => toggleSort('status')}>
                    <span className="mr-2">Status</span>
                    {renderSortIcon('status')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{tableBody}</TableBody>
          </Table>
        </div>

        {!loading && sortedFaculty.length > 0 && totalPages > 1 && (
          <Pagination className="flex-col gap-4 sm:flex-row">
            <p className="text-sm text-slate-500">
              Page {currentPage} of {totalPages}
            </p>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious disabled={currentPage === 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationButton active={pageNumber === currentPage} onClick={() => setCurrentPage(pageNumber)}>
                    {pageNumber}
                  </PaginationButton>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext disabled={currentPage === totalPages} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}