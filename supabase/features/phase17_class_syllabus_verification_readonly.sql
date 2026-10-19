-- ============================================================================
-- مرحله ۱۷ — Verification فقط‌خواندنی برنامه آموزشی کلاس‌ها
-- ============================================================================

with checks as (
  select 10 as sort_order,'table_exists_rls'::text as item,
         to_regclass('public.class_syllabus_items') is not null
         and cls.relrowsecurity as passed,
         'rls='||cls.relrowsecurity::text as details
  from pg_catalog.pg_class cls where cls.oid='public.class_syllabus_items'::regclass

  union all
  select 20,'required_columns',count(*)=13,
         'count='||count(*)::text||'/13'
  from information_schema.columns
  where table_schema='public' and table_name='class_syllabus_items'
    and column_name in (
      'id','class_id','title','description','status','target_date','sort_order','is_active',
      'completed_at','completed_by_user_id','created_by_user_id','created_at','updated_at'
    )

  union all
  select 30,'integrity_constraints',count(*)>=7 and bool_and(convalidated),
         'count='||count(*)::text
  from pg_catalog.pg_constraint con
  where con.conrelid='public.class_syllabus_items'::regclass

  union all
  select 40,'syllabus_indexes',count(*)>=3,
         'count='||count(*)::text||' | '||string_agg(indexname,' ؛ ' order by indexname)
  from pg_catalog.pg_indexes
  where schemaname='public' and tablename='class_syllabus_items'

  union all
  select 50,'read_policy_scoped',count(*)=1
         and bool_and(cmd='SELECT')
         and bool_and(roles=array['authenticated']::name[])
         and bool_and(qual like '%app_can_read_class%'),
         coalesce(string_agg(policyname||':'||qual,' ؛ '),'missing')
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='class_syllabus_items'

  union all
  select 60,'direct_write_closed',
         has_table_privilege('authenticated','public.class_syllabus_items','SELECT')
         and not has_table_privilege('authenticated','public.class_syllabus_items','INSERT')
         and not has_table_privilege('authenticated','public.class_syllabus_items','UPDATE')
         and not has_table_privilege('authenticated','public.class_syllabus_items','DELETE'),
         'expected=SELECT only'

  union all
  select 70,'anon_crud_closed',not(
         has_table_privilege('anon','public.class_syllabus_items','SELECT')
         or has_table_privilege('anon','public.class_syllabus_items','INSERT')
         or has_table_privilege('anon','public.class_syllabus_items','UPDATE')
         or has_table_privilege('anon','public.class_syllabus_items','DELETE')),
         'expected=no anon CRUD'

  union all
  select 80,'secure_write_rpcs',count(*)=3
         and count(*) filter(where has_function_privilege('authenticated',proc.oid,'EXECUTE'))=3
         and count(*) filter(where has_function_privilege('anon',proc.oid,'EXECUTE'))=0
         and bool_and(proc.prosecdef),
         'count='||count(*)::text||'/3'
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace and proc.proname in (
    'secure_save_class_syllabus_item','secure_delete_class_syllabus_item',
    'secure_reorder_class_syllabus'
  )

  union all
  select 90,'authorization_helper',
         to_regprocedure('public.can_manage_class_syllabus(bigint)') is not null
         and has_function_privilege('authenticated','public.can_manage_class_syllabus(bigint)','EXECUTE')
         and not has_function_privilege('anon','public.can_manage_class_syllabus(bigint)','EXECUTE'),
         'can_manage_class_syllabus'

  union all
  select 100,'server_fields_trigger',count(*)=1,
         coalesce(string_agg(tgname,' ؛ '),'missing')
  from pg_catalog.pg_trigger
  where tgrelid='public.class_syllabus_items'::regclass
    and tgname='trg_prepare_class_syllabus_item' and not tgisinternal

  union all
  select 110,'admin_audit_trigger',count(*)=1,
         coalesce(string_agg(tgname,' ؛ '),'missing')
  from pg_catalog.pg_trigger
  where tgrelid='public.class_syllabus_items'::regclass
    and tgname='trg_server_audit_class_syllabus' and not tgisinternal

  union all
  select 120,'clean_start_no_fake_items',count(*)=0,
         'rows='||count(*)::text
  from public.class_syllabus_items

  union all
  select 130,'existing_security_preserved',
         (select count(*) from pg_catalog.pg_policies where schemaname='public'
           and tablename in (
             'admins','teachers','students','parents','student_parents','classes',
             'najm_terms','najm_settings','najm_score_items','najm_sessions',
             'najm_session_records','attendance','grades','student_documents'
           ))=40
         and (select count(*) from pg_catalog.pg_policies
              where schemaname='public' and policyname like 'p15_video%')=6
         and (select count(*) from pg_catalog.pg_policies
              where schemaname='storage' and policyname like 'p15_%')=20,
         'phase14=40 | video=6 | storage=20'
)
select item,passed,details from checks order by sort_order;
