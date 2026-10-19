-- ============================================================================
-- مرحله ۱۸ — Verification فقط‌خواندنی پیشرفت واقعی ویدیو
-- ============================================================================

with checks as (
  select 10 as sort_order,'progress_columns'::text as item,
         count(*)=3 as passed,
         'count='||count(*)::text||'/3 | '||
         string_agg(column_name||':nullable='||is_nullable,' ؛ ' order by ordinal_position) as details
  from information_schema.columns
  where table_schema='public' and table_name='video_watch_progress'
    and column_name in ('last_position_seconds','duration_seconds','completed_at')

  union all
  select 20,'progress_constraints',count(*)=6 and bool_and(convalidated),
         'count='||count(*)::text||'/6'
  from pg_catalog.pg_constraint
  where conrelid='public.video_watch_progress'::regclass
    and conname in (
      'video_progress_watched_nonnegative','video_progress_position_nonnegative',
      'video_progress_duration_positive','video_progress_percent_range',
      'video_progress_position_within_duration','video_progress_completion_consistency'
    )

  union all
  select 30,'progress_indexes',count(*)>=3,
         'count='||count(*)::text||' | '||string_agg(indexname,' ؛ ' order by indexname)
  from pg_catalog.pg_indexes
  where schemaname='public' and tablename='video_watch_progress'

  union all
  select 40,'student_read_policy',count(*)=1
         and bool_and(cmd='SELECT')
         and bool_and(qual like '%current_student_id%'),
         coalesce(string_agg(policyname||':'||qual,' ؛ '),'missing')
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='video_watch_progress'
    and policyname='p18_video_progress_student_read'

  union all
  select 50,'admin_manage_policy_preserved',count(*)=1,
         coalesce(string_agg(policyname||':'||cmd,' ؛ '),'missing')
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='video_watch_progress'
    and policyname='p15_video_progress_admin_manage'

  union all
  select 60,'secure_progress_rpc',
         to_regprocedure(
           'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)'
         ) is not null
         and has_function_privilege('authenticated',
           'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)','EXECUTE')
         and not has_function_privilege('anon',
           'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)','EXECUTE')
         and not has_function_privilege('public',
           'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)','EXECUTE'),
         'authenticated only'

  union all
  select 70,'progress_data_preserved',count(*)=1
         and count(distinct(video_id,student_id))=1,
         'rows='||count(*)::text||' | distinct='||count(distinct(video_id,student_id))::text
  from public.video_watch_progress

  union all
  select 80,'progress_values_valid',count(*)=0,
         'invalid='||count(*)::text
  from public.video_watch_progress
  where watched_seconds<0 or percent<0 or percent>100
     or last_position_seconds<0
     or (duration_seconds is not null and duration_seconds<=0)
     or (duration_seconds is not null and last_position_seconds>duration_seconds+2)
     or (completed_at is not null and percent<95)

  union all
  select 90,'direct_student_write_closed',
         count(*) filter(where cmd in ('INSERT','UPDATE','DELETE')
           and 'authenticated'=any(roles)
           and policyname<>'p15_video_progress_admin_manage')=0,
         'student_write_policies=0'
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='video_watch_progress'

  union all
  select 100,'anon_crud_closed',not(
         has_table_privilege('anon','public.video_watch_progress','SELECT')
         or has_table_privilege('anon','public.video_watch_progress','INSERT')
         or has_table_privilege('anon','public.video_watch_progress','UPDATE')
         or has_table_privilege('anon','public.video_watch_progress','DELETE')),
         'expected=no anon CRUD'

  union all
  select 110,'video_data_preserved',count(*)=3,
         'videos='||count(*)::text||' | link='||count(*) filter(where source_type='link')::text
  from public.videos

  union all
  select 120,'phase15_security_preserved',
         (select count(*) from pg_catalog.pg_policies
          where schemaname='public' and policyname like 'p15_video%')=6
         and (select count(*) from pg_catalog.pg_policies
              where schemaname='storage' and policyname like 'p15_%')=20
         and (select count(*) from storage.buckets
              where id='videos' and public=false)=1,
         'video_policies=6 | storage_policies=20 | bucket_private=true'

  union all
  select 130,'phase14_core_preserved',count(*)=40,
         'core_policies='||count(*)::text||'/40'
  from pg_catalog.pg_policies
  where schemaname='public' and tablename in (
    'admins','teachers','students','parents','student_parents','classes',
    'najm_terms','najm_settings','najm_score_items','najm_sessions',
    'najm_session_records','attendance','grades','student_documents'
  )
)
select item,passed,details from checks order by sort_order;
