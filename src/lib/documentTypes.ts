/**
 * Represents a submitted document with metadata
 */
export type SubmittedDocument = {
  name: string;
  submittedAt: string;
};

/**
 * Available clearance document types
 */
export const DOCUMENT_TYPES = [
  'ICT Device Return Slip',
  'Library Clearance Form',
  'Laboratory Tools Return Checklist',
  'CESO Completion Certificate',
  'Financial Clearance',
  'PMO Equipment Return',
  'Program Chair Clearance',
  'Borrowed Book Slip',
];
