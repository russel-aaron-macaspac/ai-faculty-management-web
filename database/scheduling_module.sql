-- Scheduling Module Schema for Faculty Management System
-- Apply in Supabase SQL editor or your migration pipeline.

create extension if not exists pgcrypto;

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity integer not null default 40,
  created_at timestamptz not null default now(),
  constraint rooms_capacity_positive check (capacity > 0)
);

create table if not exists faculty_availability (
  id uuid primary key default gen_random_uuid(),
  faculty_id bigint not null references users(user_id) on delete cascade,
  day text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faculty_availability_day_valid check (
    day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  constraint faculty_availability_time_valid check (start_time < end_time)
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  faculty_id bigint not null references users(user_id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete restrict,
  room_id uuid not null references rooms(id) on delete restrict,
  day text not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending_program_chair',
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_day_valid check (
    day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  constraint schedules_time_valid check (start_time < end_time),
  constraint schedules_status_valid check (
    status in (
      'pending_program_chair',
      'pending_dean',
      'pending_ovpaa',
      'pending_registrar',
      'approved',
      'rejected'
    )
  )
);

create table if not exists schedule_approvals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  role text not null,
  action text not null,
  remarks text,
  timestamp timestamptz not null default now(),
  constraint schedule_approvals_action_valid check (action in ('approve', 'reject'))
);

create index if not exists idx_faculty_availability_faculty_day
  on faculty_availability (faculty_id, day);

create index if not exists idx_schedules_faculty_day_time
  on schedules (faculty_id, day, start_time, end_time);

create index if not exists idx_schedules_room_day_time
  on schedules (room_id, day, start_time, end_time);

create index if not exists idx_schedules_status
  on schedules (status);

create index if not exists idx_schedule_approvals_schedule
  on schedule_approvals (schedule_id, timestamp desc);

-- Seed default Program Chair user (adjust password hash generation to match your auth policy)
insert into users (
  first_name,
  middle_name,
  last_name,
  email,
  role,
  status,
  password_hash
)
values (
  'Imelda',
  null,
  'Tolentino',
  'imelda.tolentino@sdca.edu.ph',
  'program_chair',
  'active',
  crypt('password123', gen_salt('bf'))
)
on conflict (email) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    status = excluded.status;

-- Optional starter records
insert into subjects (code, name)
values
  ('CS101', 'Introduction to Computing'),
  ('CS201', 'Data Structures and Algorithms'),
  ('IT305', 'Database Systems')
on conflict (code) do nothing;

insert into rooms (name, capacity)
values
  ('Room 201', 45),
  ('Room 302', 35),
  ('Computer Lab 1', 30)
on conflict (name) do nothing;
