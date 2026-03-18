'use client';

import { useState, useEffect } from 'react';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Loader2, Search } from 'lucide-react';

export default function ClearancePage() {
  const [records, setRecords] = useState<Clearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Mock form state
  const [empId] = useState('f1');
  const [empName] = useState('Dr. Alice Brown');
  const [docName, setDocName] = useState('Safety Training Certificate');

  const loadData = async () => {
    setLoading(true);
    const data = await clearanceService.getClearances();
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    await clearanceService.uploadDocument(empId, empName, docName);
    setUploading(false);
    setIsUploadOpen(false);
    loadData();
  };

  const filtered = records.filter(r => 
    r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.requiredDocument.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Clearance & Compliance</h1>
          <p className="text-slate-500 mt-1">Track and validate required employee documents.</p>
        </div>
        
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
             <Button className="bg-red-600 hover:bg-red-700">
               <UploadCloud className="mr-2 h-4 w-4" /> Upload Document
             </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
             <DialogHeader>
                <DialogTitle>Submit Clearance Document</DialogTitle>
             </DialogHeader>
             <form onSubmit={handleUpload} className="space-y-4 pt-4">
               <div className="space-y-2">
                 <label className="text-sm font-medium">Document Name</label>
                 <Input value={docName} onChange={e => setDocName(e.target.value)} required />
               </div>
               <div className="space-y-2">
                 <label className="text-sm font-medium">File Upload</label>
                 <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer">
                    <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <span className="text-sm text-red-600 font-medium">Click to upload</span>
                    <span className="text-sm text-slate-500"> or drag and drop</span>
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX up to 10MB</p>
                 </div>
               </div>
               <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={uploading}>
                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit for Review
                  </Button>
               </div>
             </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
           <Search className="h-5 w-5 text-slate-400" />
           <Input 
             placeholder="Search by employee or document..." 
             className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Employee</TableHead>
              <TableHead>Requirement</TableHead>
              <TableHead>Submission Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
                  Loading clearance data...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                   No documents found.
                 </TableCell>
              </TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium text-slate-900">{r.employeeName}</div>
                  <div className="text-xs text-slate-500">ID: {r.employeeId}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    {r.requiredDocument}
                  </div>
                  {r.validationWarning && (
                     <div className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                       <AlertTriangle className="h-3 w-3" /> AI Flag: {r.validationWarning}
                     </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {r.submissionDate || 'Not submitted'}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                    r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 
                    r.status === 'submitted' ? 'bg-red-100 text-red-800' : 
                    r.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {r.status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
                    {r.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
