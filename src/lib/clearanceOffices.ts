export const FACULTY_REQUIRED_OFFICES = [
  'Dominican Learning Resource Center',
  'Property Management Office',
  'Laboratory',
  'Information & Communications Technology Office',
  'Community Extension Services Office',
  'Program Chair',
  'Dean',
  'Registrar Office',
  'Office of the Vice President for Research, Extension & Linkages',
  'Office of the Vice President for Academic Affairs',
  'Accounting Office',
  'Treasury Office',
  'Human Resources Office',
];

export const toOfficeSlug = (office: string) =>
  office
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');

export const fromOfficeSlug = (slug: string) =>
  FACULTY_REQUIRED_OFFICES.find((office) => toOfficeSlug(office) === slug);