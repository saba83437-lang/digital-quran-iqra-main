-- ============================================================================
-- FINAL_EXECUTABLE — مرحله ۱۴C: Read نقش‌محور و محافظت ستون‌های حساس
-- تاریخ نسخهٔ نهایی: 2026-07-30
--
-- پیش‌نیاز:
--   * مرحله ۱۴B اجرا و Verification آن با ۱۳/۱۳ نتیجه true تأیید شده است.
--   * Runtime مدیر پس از ۱۴B سالم تأیید شده است.
--
-- تصمیم تأییدشدهٔ مالک:
--   * مرحله ۱۴ را یکجا کامل کنیم و Read باز موقت باقی نماند.
--   * مدیر: دسترسی مدیریتی کامل، به‌جز password_hash که برای هیچ client خواندنی نیست.
--   * استاد: فقط کلاس‌ها/قرآن‌آموزان/داده آموزشی خودش؛ تماس شاگردانش فقط از RPC امن.
--   * قرآن‌آموز: پروفایل خودش، هم‌کلاسی‌ها فقط ستون‌های عمومی، داده آموزشی فقط خودش.
--   * والد: پروفایل خودش، فرزندان متصل و داده آموزشی همان فرزندان.
--   * حساب بدون user_roles فعال: بدون Read و Write جداول اصلی.
--
-- اثر Migration:
--   * هیچ رکورد، فایل یا مقدار داده‌ای ایجاد/ویرایش/حذف نمی‌شود.
--   * ۱۴ Policy موقت Read مرحله ۱۴B با ۱۴ Policy نقش‌محور جایگزین می‌شوند.
--   * ۲۶ Policy سالم Write مرحله ۱۴B دست‌نخورده می‌مانند.
--   * SELECT مستقیم students/teachers به ستون‌های مجاز محدود می‌شود.
--   * password_hash هر چهار جدول هویتی از client پنهان می‌ماند.
--   * پنج RPC بدون پارامتر و Authمحور برای پروفایل/فهرست‌های حساس ساخته می‌شود.
--   * Full RLS سایر بخش‌ها و فایل DRAFT قدیمی اجرا نمی‌شوند.
--
-- محافظ‌ها:
--   * Transaction واحد؛ هر خطا باعث Rollback کامل می‌شود.
--   * Guard دقیق وضعیت ۱۴B و توقف اجرای تکراری.
--   * Postflight داخل همان Transaction.
-- ============================================================================

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- --------------------------------------------------------------------------
-- 1) Guard دقیق وضعیت تأییدشدهٔ ۱۴B
-- --------------------------------------------------------------------------
do $preflight_guard$
declare
  core_table_count integer;
  rls_count integer;
  total_policy_count integer;
  p14b_read_count integer;
  p14b_write_count integer;
  p14c_policy_count integer;
  auth_full_grant_count integer;
  anon_open_count integer;
begin
  select count(*), count(*) filter (where cls.relrowsecurity)
  into core_table_count, rls_count
  from pg_catalog.pg_class cls
  join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relkind in ('r', 'p')
    and cls.relname = any(array[
      'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
      'najm_terms', 'najm_settings', 'najm_score_items',
      'najm_sessions', 'najm_session_records',
      'attendance', 'grades', 'student_documents'
    ]::text[]);

  select
    count(*),
    count(*) filter (where policyname like 'p14b_%_read_all_auth'),
    count(*) filter (
      where policyname like 'p14b_%'
        and policyname not like 'p14b_%_read_all_auth'
    ),
    count(*) filter (where policyname like 'p14c_%')
  into total_policy_count, p14b_read_count, p14b_write_count, p14c_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = any(array[
      'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
      'najm_terms', 'najm_settings', 'najm_score_items',
      'najm_sessions', 'najm_session_records',
      'attendance', 'grades', 'student_documents'
    ]::text[]);

  select count(*) into auth_full_grant_count
  from unnest(array[
    'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
    'najm_terms', 'najm_settings', 'najm_score_items',
    'najm_sessions', 'najm_session_records',
    'attendance', 'grades', 'student_documents'
  ]::text[]) tracked(table_name)
  where has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
    and has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
    and has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
    and has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE');

  select count(*) into anon_open_count
  from unnest(array[
    'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
    'najm_terms', 'najm_settings', 'najm_score_items',
    'najm_sessions', 'najm_session_records',
    'attendance', 'grades', 'student_documents'
  ]::text[]) tracked(table_name)
  where has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
     or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
     or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
     or has_table_privilege('anon', format('public.%I', table_name), 'DELETE');

  if core_table_count <> 14 or rls_count <> 14
     or total_policy_count <> 40
     or p14b_read_count <> 14 or p14b_write_count <> 26
     or p14c_policy_count <> 0
     or auth_full_grant_count <> 14
     or anon_open_count <> 0 then
    raise exception
      'Phase 14C aborted: Phase 14B snapshot changed (tables %, rls %, policies %, reads %, writes %, p14c %, grants %, anon %).',
      core_table_count, rls_count, total_policy_count, p14b_read_count,
      p14b_write_count, p14c_policy_count, auth_full_grant_count, anon_open_count;
  end if;

  if to_regprocedure('public.app_safe_bigint(text)') is null
     or to_regprocedure('public.app_is_admin()') is null
     or to_regprocedure('public.current_app_role()') is null
     or to_regprocedure('public.current_teacher_id()') is null
     or to_regprocedure('public.current_student_id()') is null
     or to_regprocedure('public.current_parent_id()') is null
     or to_regprocedure('public.teacher_can_access_student(bigint)') is null
     or to_regprocedure('public.parent_can_access_student(bigint)') is null then
    raise exception 'Phase 14C aborted: required Phase 14B/Auth helpers are missing.';
  end if;

  if to_regprocedure('public.app_can_read_student_profile(bigint)') is not null
     or to_regprocedure('public.secure_current_student_profile()') is not null
     or to_regprocedure('public.secure_teacher_students()') is not null then
    raise exception 'Phase 14C already exists or is partial; verify instead of re-running.';
  end if;
end
$preflight_guard$;

-- --------------------------------------------------------------------------
-- 2) Helperهای Read؛ همگی Authمحور، بدون ورودی قابل جعل هویت
-- --------------------------------------------------------------------------
create function public.app_can_read_student_academic(target_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or public.current_student_id() = target_student_id
    or public.teacher_can_access_student(target_student_id)
    or public.parent_can_access_student(target_student_id),
    false
  )
$function$;

create function public.app_can_read_student_profile(target_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_can_read_student_academic(target_student_id)
    or (
      public.current_app_role() = 'student'
      and exists (
        select 1
        from public.students me
        join public.students target
          on target.id = target_student_id
         and target.class_id = me.class_id
        join public.classes cls on cls.id = me.class_id
        where me.id = public.current_student_id()
          and cls.deleted_at is null
      )
    ),
    false
  )
$function$;

create function public.app_can_read_teacher(target_teacher_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or public.current_teacher_id() = target_teacher_id
    or exists (
      select 1
      from public.students student
      join public.classes cls on cls.id = student.class_id
      where student.id = public.current_student_id()
        and cls.teacher_id = target_teacher_id
        and cls.deleted_at is null
    )
    or exists (
      select 1
      from public.student_parents link
      join public.students student on student.id = link.student_id
      join public.classes cls on cls.id = student.class_id
      where link.parent_id = public.current_parent_id()
        and cls.teacher_id = target_teacher_id
        and cls.deleted_at is null
    ),
    false
  )
$function$;

create function public.app_can_read_class(target_class_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or exists (
      select 1
      from public.classes cls
      where cls.id = target_class_id
        and cls.deleted_at is null
        and (
          cls.teacher_id = public.current_teacher_id()
          or exists (
            select 1 from public.students student
            where student.id = public.current_student_id()
              and student.class_id = cls.id
          )
          or exists (
            select 1
            from public.student_parents link
            join public.students student on student.id = link.student_id
            where link.parent_id = public.current_parent_id()
              and student.class_id = cls.id
          )
        )
    ),
    false
  )
$function$;

create function public.app_can_read_najm_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or exists (
      select 1
      from public.najm_sessions session_row
      where session_row.id = target_session_id
        and (
          (
            public.current_app_role() = 'teacher'
            and session_row.teacher_id = public.current_teacher_id()::text
            and public.teacher_owns_class(
              public.app_safe_bigint(session_row.class_id)
            )
          )
          or public.app_can_read_class(
            public.app_safe_bigint(session_row.class_id)
          )
        )
    ),
    false
  )
$function$;

create function public.app_can_read_najm_record(
  target_session_id uuid,
  target_student_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_can_read_student_academic(target_student_id)
    and public.app_can_read_najm_session(target_session_id),
    false
  )
$function$;

revoke all on function public.app_can_read_student_academic(bigint)
  from public, anon, authenticated;
revoke all on function public.app_can_read_student_profile(bigint)
  from public, anon, authenticated;
revoke all on function public.app_can_read_teacher(bigint)
  from public, anon, authenticated;
revoke all on function public.app_can_read_class(bigint)
  from public, anon, authenticated;
revoke all on function public.app_can_read_najm_session(uuid)
  from public, anon, authenticated;
revoke all on function public.app_can_read_najm_record(uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.app_can_read_student_academic(bigint) to authenticated;
grant execute on function public.app_can_read_student_profile(bigint) to authenticated;
grant execute on function public.app_can_read_teacher(bigint) to authenticated;
grant execute on function public.app_can_read_class(bigint) to authenticated;
grant execute on function public.app_can_read_najm_session(uuid) to authenticated;
grant execute on function public.app_can_read_najm_record(uuid, bigint) to authenticated;

-- --------------------------------------------------------------------------
-- 3) RPCهای حساس: هویت از auth.uid تعیین می‌شود، نه پارامتر client
-- --------------------------------------------------------------------------
create function public.secure_current_student_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare result jsonb;
begin
  if public.current_app_role() <> 'student' or public.current_student_id() is null then
    raise exception 'Active student profile required.';
  end if;

  select to_jsonb(student) - 'password_hash' - 'id_card_url' - 'birth_cert_url'
  into result
  from public.students student
  where student.id = public.current_student_id();

  return result;
end
$function$;

create function public.secure_current_teacher_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare result jsonb;
begin
  if public.current_app_role() <> 'teacher' or public.current_teacher_id() is null then
    raise exception 'Active teacher profile required.';
  end if;

  select to_jsonb(teacher) - 'password_hash'
  into result
  from public.teachers teacher
  where teacher.id = public.current_teacher_id();

  return result;
end
$function$;

create function public.secure_admin_students()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare result jsonb;
begin
  if not public.app_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(student) - 'password_hash' order by student.name),
    '[]'::jsonb
  )
  into result
  from public.students student;

  return result;
end
$function$;

create function public.secure_admin_teachers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare result jsonb;
begin
  if not public.app_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(teacher) - 'password_hash' order by teacher.name),
    '[]'::jsonb
  )
  into result
  from public.teachers teacher;

  return result;
end
$function$;

create function public.secure_teacher_students()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare result jsonb;
begin
  if public.current_app_role() <> 'teacher' or public.current_teacher_id() is null then
    raise exception 'Active teacher profile required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', student.id,
        'name', student.name,
        'level', student.level,
        'class_id', student.class_id,
        'parent_name', student.parent_name,
        'parent_phone', student.parent_phone,
        'phone', student.phone,
        'attendance_rate', student.attendance_rate,
        'average_grade', student.average_grade,
        'avatar_url', student.avatar_url,
        'status', student.status
      ) order by student.name
    ),
    '[]'::jsonb
  )
  into result
  from public.students student
  where public.teacher_can_access_student(student.id);

  return result;
end
$function$;

revoke all on function public.secure_current_student_profile()
  from public, anon, authenticated;
revoke all on function public.secure_current_teacher_profile()
  from public, anon, authenticated;
revoke all on function public.secure_admin_students()
  from public, anon, authenticated;
revoke all on function public.secure_admin_teachers()
  from public, anon, authenticated;
revoke all on function public.secure_teacher_students()
  from public, anon, authenticated;

grant execute on function public.secure_current_student_profile() to authenticated;
grant execute on function public.secure_current_teacher_profile() to authenticated;
grant execute on function public.secure_admin_students() to authenticated;
grant execute on function public.secure_admin_teachers() to authenticated;
grant execute on function public.secure_teacher_students() to authenticated;

-- --------------------------------------------------------------------------
-- 4) حذف دقیق ۱۴ Read موقت مرحله ۱۴B
-- --------------------------------------------------------------------------
drop policy p14b_admins_read_all_auth on public.admins;
drop policy p14b_teachers_read_all_auth on public.teachers;
drop policy p14b_students_read_all_auth on public.students;
drop policy p14b_parents_read_all_auth on public.parents;
drop policy p14b_student_parents_read_all_auth on public.student_parents;
drop policy p14b_classes_read_all_auth on public.classes;
drop policy p14b_najm_terms_read_all_auth on public.najm_terms;
drop policy p14b_najm_settings_read_all_auth on public.najm_settings;
drop policy p14b_najm_score_items_read_all_auth on public.najm_score_items;
drop policy p14b_najm_sessions_read_all_auth on public.najm_sessions;
drop policy p14b_najm_session_records_read_all_auth on public.najm_session_records;
drop policy p14b_attendance_read_all_auth on public.attendance;
drop policy p14b_grades_read_all_auth on public.grades;
drop policy p14b_student_documents_read_all_auth on public.student_documents;

-- --------------------------------------------------------------------------
-- 5) دقیقاً یک Policy Read نقش‌محور برای هر جدول اصلی
-- --------------------------------------------------------------------------
create policy p14c_admins_read_scoped
on public.admins for select to authenticated
using (public.app_is_admin());

create policy p14c_teachers_read_scoped
on public.teachers for select to authenticated
using (public.app_can_read_teacher(id));

create policy p14c_students_read_scoped
on public.students for select to authenticated
using (public.app_can_read_student_profile(id));

create policy p14c_parents_read_scoped
on public.parents for select to authenticated
using (
  public.app_is_admin()
  or id = public.current_parent_id()
);

create policy p14c_student_parents_read_scoped
on public.student_parents for select to authenticated
using (
  public.app_is_admin()
  or parent_id = public.current_parent_id()
  or student_id = public.current_student_id()
);

create policy p14c_classes_read_scoped
on public.classes for select to authenticated
using (public.app_can_read_class(id));

create policy p14c_najm_terms_read_scoped
on public.najm_terms for select to authenticated
using (public.current_app_role() is not null);

create policy p14c_najm_settings_read_scoped
on public.najm_settings for select to authenticated
using (public.current_app_role() is not null);

create policy p14c_najm_score_items_read_scoped
on public.najm_score_items for select to authenticated
using (public.current_app_role() is not null);

create policy p14c_najm_sessions_read_scoped
on public.najm_sessions for select to authenticated
using (public.app_can_read_najm_session(id));

create policy p14c_najm_session_records_read_scoped
on public.najm_session_records for select to authenticated
using (
  public.app_can_read_najm_record(
    session_id,
    public.app_safe_bigint(student_id)
  )
);

create policy p14c_attendance_read_scoped
on public.attendance for select to authenticated
using (
  public.app_can_read_student_academic(
    public.app_safe_bigint(student_id)
  )
);

create policy p14c_grades_read_scoped
on public.grades for select to authenticated
using (
  public.app_can_read_student_academic(
    public.app_safe_bigint(student_id)
  )
);

create policy p14c_student_documents_read_scoped
on public.student_documents for select to authenticated
using (public.app_is_admin());

-- --------------------------------------------------------------------------
-- 6) Column-level SELECT برای چهار جدول هویتی
--    والد و مدیر ردیف مجاز را می‌بینند، ولی password_hash هیچ‌گاه client-readable نیست.
--    students/teachers علاوه بر آن، ستون‌های شخصی از SELECT مستقیم حذف می‌شوند.
-- --------------------------------------------------------------------------
revoke select on table public.admins from authenticated;
revoke select on table public.teachers from authenticated;
revoke select on table public.students from authenticated;
revoke select on table public.parents from authenticated;

do $grant_safe_identity_columns$
declare
  target_table text;
  excluded_columns text[];
  safe_columns text;
begin
  foreach target_table in array array['admins', 'teachers', 'students', 'parents']
  loop
    excluded_columns := case target_table
      when 'admins' then array['password_hash']::text[]
      when 'teachers' then array['password_hash', 'national_id', 'phone']::text[]
      when 'students' then array[
        'password_hash', 'national_id', 'phone', 'address',
        'parent_phone', 'parent_national_id', 'id_card_url', 'birth_cert_url'
      ]::text[]
      when 'parents' then array['password_hash']::text[]
    end;

    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into safe_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = target_table
      and not (column_name = any(excluded_columns));

    if safe_columns is null then
      raise exception 'No safe columns found for public.%', target_table;
    end if;

    execute format(
      'grant select (%s) on table public.%I to authenticated',
      safe_columns,
      target_table
    );
  end loop;
end
$grant_safe_identity_columns$;

-- سایر ۱۰ جدول همچنان SELECT جدولی لازم برای PostgREST دارند؛ RLS ردیف را محدود می‌کند.
-- مجوزهای INSERT/UPDATE/DELETE مرحله ۱۴B نیز حفظ شده‌اند و RLS Write بر آن‌ها حاکم است.

-- --------------------------------------------------------------------------
-- 7) Postflight داخل همان Transaction
-- --------------------------------------------------------------------------
do $postflight_guard$
declare
  rls_count integer;
  total_policy_count integer;
  p14b_read_count integer;
  p14b_write_count integer;
  p14c_read_count integer;
  unsafe_sensitive_select_count integer;
  safe_identity_column_count integer;
  rpc_auth_count integer;
  rpc_anon_count integer;
  anon_open_count integer;
begin
  select count(*) into rls_count
  from pg_catalog.pg_class cls
  join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relname = any(array[
      'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
      'najm_terms', 'najm_settings', 'najm_score_items',
      'najm_sessions', 'najm_session_records',
      'attendance', 'grades', 'student_documents'
    ]::text[])
    and cls.relrowsecurity;

  select
    count(*),
    count(*) filter (where policyname like 'p14b_%_read_all_auth'),
    count(*) filter (where policyname like 'p14b_%'),
    count(*) filter (where policyname like 'p14c_%' and cmd = 'SELECT')
  into total_policy_count, p14b_read_count, p14b_write_count, p14c_read_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = any(array[
      'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
      'najm_terms', 'najm_settings', 'najm_score_items',
      'najm_sessions', 'najm_session_records',
      'attendance', 'grades', 'student_documents'
    ]::text[]);

  select count(*) into unsafe_sensitive_select_count
  from (values
    ('admins', 'password_hash'),
    ('teachers', 'password_hash'),
    ('teachers', 'national_id'),
    ('teachers', 'phone'),
    ('students', 'password_hash'),
    ('students', 'national_id'),
    ('students', 'phone'),
    ('students', 'address'),
    ('students', 'parent_phone'),
    ('students', 'parent_national_id'),
    ('students', 'id_card_url'),
    ('students', 'birth_cert_url'),
    ('parents', 'password_hash')
  ) sensitive(table_name, column_name)
  where has_column_privilege(
    'authenticated',
    format('public.%I', table_name),
    column_name,
    'SELECT'
  );

  select count(*) into safe_identity_column_count
  from (values
    ('admins', 'id'), ('admins', 'phone'),
    ('teachers', 'id'), ('teachers', 'name'),
    ('students', 'id'), ('students', 'name'), ('students', 'class_id'),
    ('parents', 'id'), ('parents', 'name'), ('parents', 'phone')
  ) safe(table_name, column_name)
  where has_column_privilege(
    'authenticated',
    format('public.%I', table_name),
    column_name,
    'SELECT'
  );

  select count(*) into rpc_auth_count
  from unnest(array[
    'public.secure_current_student_profile()',
    'public.secure_current_teacher_profile()',
    'public.secure_admin_students()',
    'public.secure_admin_teachers()',
    'public.secure_teacher_students()'
  ]::text[]) signature
  where has_function_privilege('authenticated', signature, 'EXECUTE');

  select count(*) into rpc_anon_count
  from unnest(array[
    'public.secure_current_student_profile()',
    'public.secure_current_teacher_profile()',
    'public.secure_admin_students()',
    'public.secure_admin_teachers()',
    'public.secure_teacher_students()'
  ]::text[]) signature
  where has_function_privilege('anon', signature, 'EXECUTE');

  select count(*) into anon_open_count
  from unnest(array[
    'admins', 'teachers', 'students', 'parents', 'student_parents', 'classes',
    'najm_terms', 'najm_settings', 'najm_score_items',
    'najm_sessions', 'najm_session_records',
    'attendance', 'grades', 'student_documents'
  ]::text[]) tracked(table_name)
  where has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
     or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
     or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
     or has_table_privilege('anon', format('public.%I', table_name), 'DELETE');

  if rls_count <> 14
     or total_policy_count <> 40
     or p14b_read_count <> 0
     or p14b_write_count <> 26
     or p14c_read_count <> 14
     or unsafe_sensitive_select_count <> 0
     or safe_identity_column_count <> 10
     or rpc_auth_count <> 5 or rpc_anon_count <> 0
     or anon_open_count <> 0 then
    raise exception
      'Phase 14C postflight failed (rls %, policies %, old reads %, p14b %, p14c %, sensitive %, safe %, rpc auth %, rpc anon %, anon tables %).',
      rls_count, total_policy_count, p14b_read_count, p14b_write_count,
      p14c_read_count, unsafe_sensitive_select_count, safe_identity_column_count,
      rpc_auth_count, rpc_anon_count, anon_open_count;
  end if;
end
$postflight_guard$;

commit;
