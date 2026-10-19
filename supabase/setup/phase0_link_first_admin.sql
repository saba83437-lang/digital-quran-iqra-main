-- ============================================================================
-- Phase 0.1 — Link the first Supabase Auth user to the existing admin record
--
-- Before running:
-- 1) Read the existing admin phone from public.admins in Table Editor.
-- 2) Normalize it: 09123456789 becomes 989123456789.
-- 3) Supabase Dashboard > Authentication > Users > Add user.
-- 4) Use this internal email: 989123456789@iqra.invalid
-- 5) Set a strong test password and enable Auto Confirm User.
-- 6) Run this script in SQL Editor.
--
-- No phone number or password needs to be written into this SQL file.
-- ============================================================================

begin;

-- Stop if the same normalized phone matches more than one admin record.
do $$
begin
  if exists (
    select public.normalize_iran_phone(a.phone)
    from public.admins a
    where a.phone is not null
    group by public.normalize_iran_phone(a.phone)
    having count(*) > 1
  ) then
    raise exception 'Duplicate admin phones detected. Resolve duplicates before linking Auth users.';
  end if;
end
$$;

insert into public.user_roles (
  id,
  role,
  name,
  admin_id,
  teacher_id,
  student_id,
  parent_id,
  is_active,
  must_change_password,
  updated_at
)
select
  au.id,
  'admin',
  a.name,
  a.id,
  null,
  null,
  null,
  true,
  false,
  now()
from auth.users au
join public.admins a
  on lower(au.email) =
     replace(public.normalize_iran_phone(a.phone), '+', '') || '@iqra.invalid'
where au.email is not null
on conflict (id) do update set
  role = excluded.role,
  name = excluded.name,
  admin_id = excluded.admin_id,
  teacher_id = null,
  student_id = null,
  parent_id = null,
  is_active = true,
  must_change_password = false,
  updated_at = now();

commit;

-- Validation: at least one row must be returned.
select
  ur.id as auth_user_id,
  ur.role,
  ur.name,
  ur.admin_id,
  ur.is_active,
  au.email_confirmed_at is not null as auth_identity_confirmed
from public.user_roles ur
join auth.users au on au.id = ur.id
where ur.role = 'admin'
order by ur.created_at;
