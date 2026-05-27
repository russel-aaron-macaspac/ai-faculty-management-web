/**
 * Normalizes a string by trimming whitespace, converting to lowercase, and collapsing multiple spaces
 * @param value - The string to normalize
 * @returns Normalized string
 */
export const normalize = (value: string): string => 
  value.trim().toLowerCase().split(/\s+/).join(' ');

/**
 * Represents a stored user object from local storage
 */
export type StoredUser = {
  id?: string | number;
  supabase_id?: string;
  role?: string;
  name?: string;
  full_name?: string;
};
