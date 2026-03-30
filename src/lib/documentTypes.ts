import { normalize } from './stringUtils';

/**
 * Represents the result of document validation
 */
export type DocumentValidationResult = {
  isMatch: boolean;
  confidence: number;
  matchedKeywords: string[];
};

/**
 * Represents a submitted document with metadata
 */
export type SubmittedDocument = {
  name: string;
  submittedAt: string;
};

/**
 * Rules for validating document types based on OCR-extracted text
 * Each document type maps to an array of keywords that should appear in the text
 */
export const DOCUMENT_TYPE_RULES: Record<string, string[]> = {
  'ICT Device Return Slip': ['device return', 'ict office', 'asset tag'],
  'Library Clearance Form': ['library', 'borrowed books', 'return slip'],
  'Laboratory Tools Return Checklist': ['laboratory', 'tools', 'checklist'],
  'CESO Completion Certificate': ['ceso', 'completion certificate', 'completed'],
  'Financial Clearance': ['financial clearance', 'cashier', 'no outstanding balance'],
  'PMO Equipment Return': ['pmo', 'equipment return', 'property management office'],
  'Program Chair Clearance': ['program chair', 'clearance', 'department'],
  'Borrowed Book Slip': ['borrowed book slip', 'borrowed books slip', 'borrowed book', 'library', 'book return', 'dlrc'],
};

/**
 * Available document types (keys from DOCUMENT_TYPE_RULES)
 */
export const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_RULES);

/**
 * Validates a document by checking if the extracted OCR text contains expected keywords
 * @param selectedType - The document type to validate against
 * @param extractedText - The OCR-extracted text from the document
 * @returns Validation result with match status and confidence score
 */
export function validateDocument(
  selectedType: string,
  extractedText: string
): DocumentValidationResult {
  const normalizedText = normalize(extractedText);
  const expectedKeywords = DOCUMENT_TYPE_RULES[selectedType] || [];

  if (expectedKeywords.length === 0) {
    return {
      isMatch: false,
      confidence: 0,
      matchedKeywords: [],
    };
  }

  const matchedKeywords = expectedKeywords.filter((keyword) =>
    normalizedText.includes(normalize(keyword))
  );
  const confidence = Math.round((matchedKeywords.length / expectedKeywords.length) * 100);
  const requiredMatches = Math.ceil(expectedKeywords.length * 0.6);

  return {
    isMatch: matchedKeywords.length >= requiredMatches,
    confidence,
    matchedKeywords,
  };
}
