# Clearance Module - Full Functionality Documentation

## Overview

The Clearance Module has been fully implemented with a complete workflow enabling faculty to submit clearance documents, approval officers to review and approve/reject them with remarks, and real-time notifications for all status changes.

---

## Architecture & Components

### Backend API Endpoints

#### 1. **GET & POST /api/clearances**
- **GET**: Fetch all clearances (optionally filtered by userId)
- **POST**: Submit a new clearance document

#### 2. **PATCH /api/clearances/[id]**
- Update clearance status with basic workflow

#### 3. **POST /api/clearances/[id]/approve** ⭐ NEW
- Approve a clearance with optional remarks
- Creates audit log entry
- Sends automatic notification to faculty
- **Parameters**: `remarks`, `reviewedBy`, `reviewedByName`, `reviewedByRole`

#### 4. **POST /api/clearances/[id]/reject** ⭐ NEW
- Reject a clearance with mandatory rejection reason
- Creates audit log entry  
- Sends automatic notification to faculty
- **Parameters**: `rejectionReason`, `reviewedBy`, `reviewedByName`, `reviewedByRole`

#### 5. **GET & POST /api/clearances/[id]/notes** ⭐ NEW
- **GET**: Fetch all remarks and notes for a clearance
- **POST**: Add new remark/note with type classification
- **Parameters**: `content`, `authorId`, `authorName`, `noteType` (remark|followup|validation)

#### 6. **GET & PATCH /api/notifications** ⭐ NEW
- **GET**: Fetch notifications for a user (with optional filtering)
- **PATCH**: Mark notification(s) as read
- **Parameters**: `userId`, `notificationId`, `markAsRead`

#### 7. **POST /api/clearances/categories**
- Create/fetch clearance office categories

---

## Database Schema (Expected)

### New Tables Required

#### `clearance_notes`
```sql
id (UUID)
clearance_id (FK to clearance_documents)
content (TEXT)
author_id (UUID)
author_name (VARCHAR)
note_type (ENUM: 'remark', 'followup', 'validation')
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `clearance_audit_log`
```sql
id (UUID)
clearance_id (FK to clearance_documents)
action (ENUM: 'submitted', 'approved', 'rejected', 'note_added', 'status_changed')
performed_by (VARCHAR)
performer_role (VARCHAR)
details (TEXT)
created_at (TIMESTAMP)
```

#### `notifications`
```sql
id (UUID)
user_id (FK to users)
title (VARCHAR)
message (TEXT)
type (ENUM: 'clearance_submitted', 'clearance_approved', 'clearance_rejected', 'clearance_note_added')
related_id (UUID) - FK to clearance_documents
is_read (BOOLEAN)
created_at (TIMESTAMP)
```

### Updated Tables

#### `clearance_documents` (add fields)
- `rejection_reason` (TEXT) - Reason for rejection
- `additional_notes` (TEXT) - General remarks/notes
- `document_type` (VARCHAR) - Office category/document type

---

## Service Layer (clearanceService)

### New Methods

```typescript
// Approval workflow
approveClearance(id, remarks, reviewedBy, reviewedByName, reviewedByRole)
rejectClearance(id, rejectionReason, reviewedBy, reviewedByName, reviewedByRole)

// Remarks/notes management
addClearanceNote(clearanceId, content, authorId, authorName, noteType)
getClearanceNotes(clearanceId) // Returns ClearanceNote[]

// Notifications
getNotifications(userId, unreadOnly?)
markNotificationAsRead(notificationId)
markAllNotificationsAsRead(userId)
```

---

## Frontend Components

### 1. **Faculty Clearance Page** (`src/app/clearance/[officeSlug]/page.tsx`)

**Features:**
- ✅ View current clearance status
- ✅ See real-time officer remarks and notes
- ✅ Submit documents to office
- ✅ Run OCR scanning for document validation
- ✅ Add personal notes for office follow-up

**New UI Sections:**
- **Status & Officer Remarks Card**: Shows approval status with live remarks from officers
- **Remarks History**: Displays all officer comments with author, timestamp, and note type
- **Rejection Reason Display**: Shows why clearance was rejected

**Key Props/State:**
- `notes`: ClearanceNote[] - All remarks from officers
- `loadingNotes`: Boolean - Loading state for remarks
- `unreadCount`: Number - Badge count from notifications hook

---

### 2. **Officer Approval Page** (`src/app/clearance/faculty/[employeeId]/page.tsx`)

**Features:**
- ✅ Review faculty clearance submissions
- ✅ View submitted documents
- ✅ Run OCR verification
- ✅ Approve with optional remarks
- ✅ Reject with mandatory reason
- ✅ See all historical notes and remarks

**New UI Elements:**
- **Approval Dialog**: Modal for approval with remarks textarea
- **Rejection Dialog**: Modal for rejection with required reason field
- **Remarks History**: Shows all previous notes in reverse chronological order
- **Status Indicator**: Visual badge showing approval/rejection status

**Workflow:**
1. Officer clicks "Approve/Reject Clearance"
2. Dialog opens asking for remarks/reason
3. Officer submits decision
4. System creates audit log, notification, and note entry
5. Faculty receives automatic notification
6. Page updates with new status and note

---

### 3. **Notification Center Component** (`src/components/NotificationCenter.tsx`) ⭐ NEW

**Features:**
- Bell icon with unread count badge
- Dropdown panel showing all notifications
- Mark individual or all as read
- Type-specific icons and styling
- Relative timestamps
- Auto-closes on click outside

**Usage:**
```tsx
import { NotificationCenter } from '@/components/NotificationCenter';

// Add to navbar/header
<NotificationCenter userId={currentUser?.id} />
```

---

## Hooks & Utilities

### `useClearanceNotifications` Hook

```typescript
const {
  notifications,      // ClearanceNotification[]
  unreadCount,        // number
  loading,            // boolean
  markAsRead,         // (id: string) => Promise<void>
  markAllAsRead,      // () => Promise<void>
  refresh             // (unreadOnly?: boolean) => Promise<void>
} = useClearanceNotifications(userId);
```

**Features:**
- Auto-fetches notifications on mount
- Polls every 30 seconds for new notifications
- Real-time unread count tracking
- Mark read functionality

---

## Types & Interfaces

### ClearanceNote
```typescript
interface ClearanceNote {
  id: string;
  clearance_id: string;
  content: string;
  author_id: string;
  author_name: string;
  note_type: 'remark' | 'followup' | 'validation';
  created_at: string;
  updated_at?: string;
}
```

### ClearanceNotification
```typescript
interface ClearanceNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'clearance_submitted' | 'clearance_approved' | 'clearance_rejected' | 'clearance_note_added';
  related_id?: string;
  is_read: boolean;
  created_at: string;
}
```

### ClearanceAuditLog
```typescript
interface ClearanceAuditLog {
  id: string;
  clearance_id: string;
  action: 'submitted' | 'approved' | 'rejected' | 'note_added' | 'status_changed';
  performed_by: string;
  performer_role: string;
  details: string;
  created_at: string;
}
```

---

## User Workflows

### Faculty Workflow

1. **View Clearance Status**
   - Navigate to `/clearance` → Click office name
   - See current status (pending/submitted/approved/rejected)

2. **Submit Document**
   - Upload file via "Document Submission" card
   - System processes and creates submission record

3. **Monitor Status**
   - Real-time display of officer remarks
   - Notification bell shows new remarks
   - Rejection reasons displayed clearly

4. **Resubmit if Rejected**
   - Read rejection reason
   - Prepare corrected document
   - Upload new submission

5. **Receive Approval**
   - Notification appears when approved
   - Status changes to "Approved"
   - Optional approval remarks visible

---

### Approval Officer Workflow

1. **View Pending Clearances**
   - Navigate to `/clearance`
   - See list of faculty with their statuses

2. **Review Faculty Details**
   - Click faculty name
   - View submitted documents
   - Run OCR verification
   - Read internal notes

3. **Make Decision**
   - Click "Approve Clearance" or "Reject Clearance"
   - Enter remarks/reason in dialog
   - Confirm action

4. **Add Follow-up Notes**
   - Add internal review notes
   - Notes persist in database
   - Visible to other officers

5. **Track History**
   - View all previous remarks
   - See who made changes and when
   - Audit trail for compliance

---

## Real-time Features

### Automatic Notifications
- ✅ Faculty notified when document approved
- ✅ Faculty notified when document rejected with reason
- ✅ Faculty notified when officer adds remarks
- ✅ Notification bell shows unread count

### Polling
- Notifications checked every 30 seconds
- Can be customized in `useClearanceNotifications` hook

### Remarks Display
- Notes fetched on component mount
- Updates when officer adds remarks
- Shows author, timestamp, and type

---

## Security & Role-Based Access

### Faculty Restrictions ✅
- Cannot approve their own or other clearances
- Cannot change approvals made by officers
- Can only submit for their own clearance
- Cannot see internal officer notes (only remarks addressed to them)

### Officer Restrictions ✅
- Cannot submit clearance documents
- Can only approve/reject (cannot override decisions)
- Role-based access via `isApprovalOfficer()` check
- Prevented from accessing faculty dashboard

### Admin Access ✅
- Full access to all clearances
- Can view all notes and remarks
- Can perform any action

---

## Integration Steps

### 1. Create Database Tables
```sql
-- Run migrations for the new tables:
-- clearance_notes
-- clearance_audit_log  
-- notifications
-- Add columns to clearance_documents
```

### 2. Update Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### 3. Add Notification Center to Layout
```tsx
// In src/components/layout/Navbar.tsx or similar
import { NotificationCenter } from '@/components/NotificationCenter';

<NotificationCenter userId={currentUser?.id} />
```

### 4. Test Workflows
- Faculty submits document
- Officer approves with remarks
- Faculty receives notification
- Check database audit logs

---

##  Potential Enhancements

1. **Email Notifications**
   - Send email when approved/rejected
   - Daily digest of pending clearances

2. **Bulk Operations**
   - Bulk approve multiple clearances
   - Batch rejection with reason template

3. **Clearance Templates**
   - Pre-defined requirement checklists
   - Document guidelines per office

4. **Expiration Management**
   - Set clearance validity period
   - Automatic renewal reminders
   - Expired status tracking

5. **Advanced Filtering**
   - Filter by date range
   - Filter by office category
   - Filter by status
   - Export to CSV/PDF

6. **Integrations**
   - Email notifications
   - SMS alerts
   - Calendar reminders
   - Report generation

---

## Testing Checklist

- [ ] Faculty can view clearance status
- [ ] Faculty can submit documents
- [ ] Officer can view pending clearances
- [ ] Officer can add remarks
- [ ] Officer can approve with remarks
- [ ] Officer can reject with reason
- [ ] Faculty receives approval notification
- [ ] Faculty receives rejection notification
- [ ] Faculty sees officer remarks in real-time
- [ ] Notification badge shows unread count
- [ ] Marking as read updates badge
- [ ] Audit log records all actions
- [ ] Role-based access enforced
- [ ] No XSS vulnerabilities in remarks
- [ ] Notes persist after page refresh

---

## Troubleshooting

### Remarks Not Appearing
- Check that `clearance_notes` table exists
- Verify Supabase service role key is correct
- Check browser console for API errors

### Notifications Not Updating
- Check polling interval in `useClearanceNotifications`
- Verify notifications table has correct data
- Clear browser cache and refresh

### Approval Fails
- Verify current user has reviewer role
- Check that rejection reason is provided for rejections
- Verify database permissions

---

## API Error Responses

All endpoints return standardized error format:
```json
{
  "error": "error_message"
}
```

Status codes:
- 200: Success
- 201: Created (for POST)
- 400: Bad request (missing fields)
- 401: Unauthorized
- 500: Server error

---

## Summary

The Clearance Module now provides:
✅ Full approval workflow with remarks
✅ Real-time notifications
✅ Comprehensive audit logging
✅ Role-based access control
✅ Persistent notes and comments
✅ Intuitive faculty & officer UIs
✅ Automatic status updates
✅ Document validation with OCR

Faculty and Officers can now seamlessly collaborate on clearance requests with full transparency and accountability.
