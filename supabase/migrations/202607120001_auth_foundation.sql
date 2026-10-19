-- ============================================================================
-- Digital Quran Iqra — Phase 0.1: Supabase Auth foundation
-- Date: 2026-07-12
--
-- Safe first migration:
--   * extends user_roles as the single app profile/mapping table
--   * adds secure helper functions used by future RLS policies
--   * secures user_roles itself
--   * fixes admin_audit_logs.entity_id for bigint/uuid entities
--
-- IMPORTANT:
-- This migration intentionally does NOT enable RLS on the remaining application
-- tables yet. Run the cutover migration only after Auth users are created and
-- linked, otherwise the current application would be locked out.
-- ============================================================================

begin;

-- ---------- Phone normalization used during the one-time account linking ----------
create or replace function public.normalize_iran_phone(input text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  value text;
begin
  value := translate(coalesce(input, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  value := regexp_replace(value, '[^0-9+]', '', 'g');

  if value like '0098%' then
    value := '+98' || substr(value, 5);
  elsif value like '98%' then
    value := '+' || value;
  elsif value like '0%' then
    value := '+98' || substr(value, 2);
  elsif value like '9%' then
    value := '+98' || value;
  end if;

  return value;
end;
$$;

-- ---------- Extend the existing auth.users mapping table ----------
alter table public.user_roles
  add column if not exists admin_id uuid references public.admins(id) on delete cascade,
  add column if not exists teacher_id bigint references public.teachers(id) on delete cascade,
  add column if not exists student_id bigint references public.students(id) on delete cascade,
  add column if not exists parent_id uuid references public.parents(id) on delete cascade,
  add column if not exists is_active boolean not null default true,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists user_roles_admin_unique
  on public.user_roles(admin_id) where admin_id is not null;
create unique index if not exists user_roles_teacher_unique
  on public.user_roles(teacher_id) where teacher_id is not null;
create unique index if not exists user_roles_student_unique
  on public.user_roles(student_id) where student_id is not null;
create unique index if not exists user_roles_parent_unique
  on public.user_roles(parent_id) where parent_id is not null;
create index if not exists user_roles_role_active_idx
  on public.user_roles(role, is_active);

-- Every new/updated profile must have exactly the entity link matching its role.
create or replace function public.validate_user_role_entity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role = 'admin' then
    if new.admin_id is null or new.teacher_id is not null or new.student_id is not null or new.parent_id is not null then
      raise exception 'Admin profile must contain only admin_id';
    end if;
  elsif new.role = 'teacher' then
    if new.teacher_id is null or new.admin_id is not null or new.student_id is not null or new.parent_id is not null then
      raise exception 'Teacher profile must contain only teacher_id';
    end if;
  elsif new.role = 'student' then
    if new.student_id is null or new.admin_id is not null or new.teacher_id is not null or new.parent_id is not null then
      raise exception 'Student profile must contain only student_id';
    end if;
  elsif new.role = 'parent' then
    if new.parent_id is null or new.admin_id is not null or new.teacher_id is not null or new.student_id is not null then
      raise exception 'Parent profile must contain only parent_id';
    end if;
  else
    raise exception 'Unsupported application role: %', new.role;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_user_role_entity on public.user_roles;
create trigger trg_validate_user_role_entity
before insert or update on public.user_roles
for each row execute function public.validate_user_role_entity();

-- ---------- Security-definer identity helpers for RLS ----------
-- These functions return only the current authenticated user's own mapping.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ur.role
  from public.user_roles ur
  where ur.id = auth.uid() and ur.is_active = true
  limit 1
$$;

create or replace function public.current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ur.admin_id
  from public.user_roles ur
  where ur.id = auth.uid() and ur.role = 'admin' and ur.is_active = true
  limit 1
$$;

create or replace function public.current_teacher_id()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ur.teacher_id
  from public.user_roles ur
  where ur.id = auth.uid() and ur.role = 'teacher' and ur.is_active = true
  limit 1
$$;

create or replace function public.current_student_id()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ur.student_id
  from public.user_roles ur
  where ur.id = auth.uid() and ur.role = 'student' and ur.is_active = true
  limit 1
$$;

create or replace function public.current_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ur.parent_id
  from public.user_roles ur
  where ur.id = auth.uid() and ur.role = 'parent' and ur.is_active = true
  limit 1
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.teacher_owns_class(target_class_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.teacher_id = public.current_teacher_id()
      and c.deleted_at is null
  )
$$;

create or replace function public.teacher_can_access_student(target_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.students s
    join public.classes c on c.id = s.class_id
    where s.id = target_student_id
      and c.teacher_id = public.current_teacher_id()
      and c.deleted_at is null
  )
$$;

create or replace function public.parent_can_access_student(target_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.student_parents sp
    where sp.student_id = target_student_id
      and sp.parent_id = public.current_parent_id()
  )
$$;

create or replace function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_roles
  set must_change_password = false, updated_at = now()
  where id = auth.uid();
end;
$$;

-- Restrict helper execution to authenticated users only.
revoke all on function public.current_app_role() from public;
revoke all on function public.current_admin_id() from public;
revoke all on function public.current_teacher_id() from public;
revoke all on function public.current_student_id() from public;
revoke all on function public.current_parent_id() from public;
revoke all on function public.app_is_admin() from public;
revoke all on function public.teacher_owns_class(bigint) from public;
revoke all on function public.teacher_can_access_student(bigint) from public;
revoke all on function public.parent_can_access_student(bigint) from public;
revoke all on function public.mark_password_changed() from public;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_admin_id() to authenticated;
grant execute on function public.current_teacher_id() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.current_parent_id() to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.teacher_owns_class(bigint) to authenticated;
grant execute on function public.teacher_can_access_student(bigint) to authenticated;
grant execute on function public.parent_can_access_student(bigint) to authenticated;
grant execute on function public.mark_password_changed() to authenticated;

-- ---------- Secure user_roles now; the legacy app does not depend on this table ----------
alter table public.user_roles enable row level security;

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
  loop
    execute format('drop policy if exists %I on public.user_roles', policy_record.policyname);
  end loop;
end
$$;

create policy user_roles_select_own_or_admin
on public.user_roles
for select
to authenticated
using (id = auth.uid() or public.app_is_admin());

create policy user_roles_admin_insert
on public.user_roles
for insert
to authenticated
with check (public.app_is_admin());

create policy user_roles_admin_update
on public.user_roles
for update
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy user_roles_admin_delete
on public.user_roles
for delete
to authenticated
using (public.app_is_admin());

revoke all on public.user_roles from anon;
grant select, insert, update, delete on public.user_roles to authenticated;

-- ---------- Audit IDs can refer to UUID or bigint entities ----------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_audit_logs'
      and column_name = 'entity_id'
      and data_type <> 'text'
  ) then
    alter table public.admin_audit_logs
      alter column entity_id type text using entity_id::text;
  end if;
end
$$;

commit;
