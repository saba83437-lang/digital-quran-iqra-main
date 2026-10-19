-- ============================================================================
-- مرحله ۱۴C — Verification فقط‌خواندنی Read نقش‌محور و ستون‌های حساس
-- فقط SELECT؛ هیچ Policy، Grant، Function، Schema یا داده‌ای تغییر نمی‌کند.
-- ============================================================================

with tracked(table_name) as (
  values
    ('admins'), ('teachers'), ('students'), ('parents'), ('student_parents'), ('classes'),
    ('najm_terms'), ('najm_settings'), ('najm_score_items'),
    ('najm_sessions'), ('najm_session_records'),
    ('attendance'), ('grades'), ('student_documents')
), sensitive(table_name, column_name) as (
  values
    ('admins', 'password_hash'),
    ('teachers', 'password_hash'), ('teachers', 'national_id'), ('teachers', 'phone'),
    ('students', 'password_hash'), ('students', 'national_id'), ('students', 'phone'),
    ('students', 'address'), ('students', 'parent_phone'),
    ('students', 'parent_national_id'), ('students', 'id_card_url'),
    ('students', 'birth_cert_url'),
    ('parents', 'password_hash')
), rpc_signatures(signature) as (
  values
    ('public.secure_current_student_profile()'),
    ('public.secure_current_teacher_profile()'),
    ('public.secure_admin_students()'),
    ('public.secure_admin_teachers()'),
    ('public.secure_teacher_students()')
), helper_signatures(signature) as (
  values
    ('public.app_can_read_student_academic(bigint)'),
    ('public.app_can_read_student_profile(bigint)'),
    ('public.app_can_read_teacher(bigint)'),
    ('public.app_can_read_class(bigint)'),
    ('public.app_can_read_najm_session(uuid)'),
    ('public.app_can_read_najm_record(uuid,bigint)')
), checks as (
  select 10 as sort_order, 'core_tables_and_rls'::text as item,
         count(cls.oid) = 14
         and count(*) filter (where cls.relrowsecurity) = 14 as passed,
         'tables=' || count(cls.oid)::text || '/14 | rls=' ||
         count(*) filter (where cls.relrowsecurity)::text || '/14' as details
  from tracked
  left join pg_catalog.pg_class cls
    on cls.relname = tracked.table_name
   and cls.relnamespace = 'public'::regnamespace
   and cls.relkind in ('r', 'p')

  union all
  select 20, 'temporary_phase14b_reads_removed',
         count(*) = 0,
         'remaining=' || count(*)::text
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from tracked)
    and policyname like 'p14b_%_read_all_auth'

  union all
  select 30, 'phase14b_write_policies_preserved',
         count(*) = 26,
         'count=' || count(*)::text || ' | expected=26'
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from tracked)
    and policyname like 'p14b_%'

  union all
  select 40, 'phase14c_scoped_read_policies',
         count(*) = 14
         and count(distinct tablename) = 14
         and bool_and(cmd = 'SELECT')
         and bool_and(roles = array['authenticated']::name[])
         and bool_and(qual <> 'true'),
         'policies=' || count(*)::text || '/14 | tables=' ||
         count(distinct tablename)::text || '/14'
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from tracked)
    and policyname like 'p14c_%'

  union all
  select 50, 'core_policy_total_stable',
         count(*) = 40,
         'count=' || count(*)::text || ' | 26 write + 14 scoped read'
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from tracked)

  union all
  select 60, 'no_anon_or_public_core_policies',
         count(*) = 0,
         'unsafe_role_policies=' || count(*)::text
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from tracked)
    and ('anon' = any(roles) or 'public' = any(roles))

  union all
  select 70, 'sensitive_direct_select_closed',
         count(*) filter (
           where has_column_privilege(
             'authenticated', format('public.%I', table_name), column_name, 'SELECT'
           )
         ) = 0,
         'closed=' || count(*) filter (
           where not has_column_privilege(
             'authenticated', format('public.%I', table_name), column_name, 'SELECT'
           )
         )::text || '/' || count(*)::text
  from sensitive

  union all
  select 80, 'identity_safe_columns_available',
         count(*) filter (
           where has_column_privilege(
             'authenticated', format('public.%I', table_name), column_name, 'SELECT'
           )
         ) = 10,
         'available=' || count(*) filter (
           where has_column_privilege(
             'authenticated', format('public.%I', table_name), column_name, 'SELECT'
           )
         )::text || '/10'
  from (values
    ('admins', 'id'), ('admins', 'phone'),
    ('teachers', 'id'), ('teachers', 'name'),
    ('students', 'id'), ('students', 'name'), ('students', 'class_id'),
    ('parents', 'id'), ('parents', 'name'), ('parents', 'phone')
  ) safe(table_name, column_name)

  union all
  select 90, 'identity_full_table_select_removed',
         count(*) filter (
           where has_table_privilege(
             'authenticated', format('public.%I', table_name), 'SELECT'
           )
         ) = 0,
         'tables_without_full_select=' || count(*) filter (
           where not has_table_privilege(
             'authenticated', format('public.%I', table_name), 'SELECT'
           )
         )::text || '/4'
  from (values ('admins'), ('teachers'), ('students'), ('parents')) identity(table_name)

  union all
  select 100, 'secure_identity_rpcs',
         count(*) filter (where to_regprocedure(signature) is not null) = 5
         and count(*) filter (
           where has_function_privilege('authenticated', signature, 'EXECUTE')
         ) = 5
         and count(*) filter (
           where has_function_privilege('anon', signature, 'EXECUTE')
         ) = 0,
         'exists=' || count(*) filter (where to_regprocedure(signature) is not null)::text ||
         '/5 | auth=' || count(*) filter (
           where has_function_privilege('authenticated', signature, 'EXECUTE')
         )::text || '/5 | anon=' || count(*) filter (
           where has_function_privilege('anon', signature, 'EXECUTE')
         )::text
  from rpc_signatures

  union all
  select 110, 'role_scope_helpers',
         count(*) filter (where to_regprocedure(signature) is not null) = 6
         and count(*) filter (
           where has_function_privilege('authenticated', signature, 'EXECUTE')
         ) = 6
         and count(*) filter (
           where has_function_privilege('anon', signature, 'EXECUTE')
         ) = 0,
         'exists=' || count(*) filter (where to_regprocedure(signature) is not null)::text ||
         '/6 | auth=' || count(*) filter (
           where has_function_privilege('authenticated', signature, 'EXECUTE')
         )::text || '/6 | anon=' || count(*) filter (
           where has_function_privilege('anon', signature, 'EXECUTE')
         )::text
  from helper_signatures

  union all
  select 120, 'anon_crud_closed',
         count(*) = 0,
         'tables_with_anon_crud=' || count(*)::text
  from tracked
  where has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
     or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
     or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
     or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')

  union all
  select 130, 'authenticated_write_grants_preserved_for_rls',
         count(*) = 14,
         'crud_transport_grants=' || count(*)::text ||
         '/14 | write authorization remains RLS-scoped'
  from tracked
  where has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
    and has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
    and has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')

  union all
  select 140, 'password_hashes_still_empty',
         (
           (select count(*) from public.admins where password_hash is not null) +
           (select count(*) from public.teachers where password_hash is not null) +
           (select count(*) from public.students where password_hash is not null) +
           (select count(*) from public.parents where password_hash is not null)
         ) = 0,
         'nonnull=' || (
           (select count(*) from public.admins where password_hash is not null) +
           (select count(*) from public.teachers where password_hash is not null) +
           (select count(*) from public.students where password_hash is not null) +
           (select count(*) from public.parents where password_hash is not null)
         )::text
)
select item, passed, details
from checks
order by sort_order;
