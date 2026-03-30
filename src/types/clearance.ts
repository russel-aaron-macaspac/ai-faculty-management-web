export interface Clearance {
  id: string;
  employeeId: string;
  employeeName: string;
  requiredDocument: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  submissionDate?: string;
  validationWarning?: string;
  dlrcReviewNotes?: string;
  previousStatus?: 'pending' | 'submitted' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  additionalNotes?: string;
  documentType?: string;
  officeCategory?: string;
}

export interface ClearanceNote {
  id: string;
  clearance_id: string;
  content: string;
  author_id: string;
  author_name: string;
  note_type: 'remark' | 'followup' | 'validation';
  created_at: string;
  updated_at?: string;
}

export interface ClearanceNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'clearance_submitted' | 'clearance_approved' | 'clearance_rejected' | 'clearance_note_added';
  related_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface ClearanceAuditLog {
  id: string;
  clearance_id: string;
  action: 'submitted' | 'approved' | 'rejected' | 'note_added' | 'status_changed';
  performed_by: string;
  performer_role: string;
  details: string;
  created_at: string;
}

export class ClearanceCategory {
  id: string;
  name: string;
  description?: string;
  is_required?: boolean;
  sort_order?: number;
}
