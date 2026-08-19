alter table public.schedules
  add column if not exists units numeric,
  add column if not exists lecture_contact_hours numeric,
  add column if not exists lab_contact_hours numeric,
  add column if not exists class_size integer;
