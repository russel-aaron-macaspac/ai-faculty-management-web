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

export const HUMAN_RESOURCES_OFFICE = 'Human Resources Office';

type ClearanceOfficeRecord = {
  requiredDocument?: string;
  status?: string;
};

const normalizeOfficeName = (name: string | undefined) =>
  name?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';

export const isHumanResourcesOffice = (officeName: string | undefined) =>
  normalizeOfficeName(officeName) === normalizeOfficeName(HUMAN_RESOURCES_OFFICE);

export const hasApprovedOtherOfficeClearances = (records: ClearanceOfficeRecord[]) => {
  const approvedOffices = new Set(
    records
      .filter((record) => record.status === 'approved')
      .map((record) => normalizeOfficeName(record.requiredDocument))
  );

  return FACULTY_REQUIRED_OFFICES
    .filter((office) => !isHumanResourcesOffice(office))
    .every((office) => approvedOffices.has(normalizeOfficeName(office)));
};