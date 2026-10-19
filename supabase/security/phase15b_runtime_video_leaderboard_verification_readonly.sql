-- ============================================================================
-- مرحله ۱۵B — Verification فقط‌خواندنی بازدیدکنندگان و رتبه‌بندی
-- ============================================================================

with function_defs as (
  select proc.proname,pg_get_functiondef(proc.oid) as definition,proc.oid
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace
    and proc.proname in ('secure_increment_video_view','get_achievement_leaderboard')
),checks as (
  select 10 as sort_order,'video_progress_unique_constraint'::text as item,
         count(*)=1 as passed,
         coalesce(string_agg(con.conname||':'||pg_get_constraintdef(con.oid),' ؛ '),'missing') as details
  from pg_catalog.pg_constraint con
  where con.conrelid='public.video_watch_progress'::regclass
    and con.contype='u'
    and pg_get_constraintdef(con.oid) like '%(video_id, student_id)%'

  union all
  select 20,'video_view_rpc_tracks_student',
         count(*)=1 and bool_and(definition like '%video_watch_progress%')
         and bool_and(definition like '%on conflict%')
         and bool_and(definition like '%current_student_id%'),
         'function_count='||count(*)::text
  from function_defs where proname='secure_increment_video_view'

  union all
  select 30,'video_progress_no_duplicates',
         count(*)=count(distinct(video_id,student_id)),
         'rows='||count(*)::text||' | distinct='||count(distinct(video_id,student_id))::text
  from public.video_watch_progress

  union all
  select 40,'leaderboard_text_bigint_fixed',
         count(*)=1
         and bool_and(definition not like '%nr.student_id = r.student_id%')
         and bool_and(definition like '%record.student_id=ranked.student_id::text%'),
         'function_count='||count(*)::text
  from function_defs where proname='get_achievement_leaderboard'

  union all
  select 50,'leaderboard_uses_official_najm_sessions',
         count(*)=1
         and bool_and(definition like '%join public.najm_sessions%')
         and bool_and(definition like '%session_row.is_applied%'),
         'official_source=true'
  from function_defs where proname='get_achievement_leaderboard'

  union all
  select 60,'leaderboard_class_scope_authorized',
         count(*)=1
         and bool_and(definition like '%teacher_owns_class%')
         and bool_and(definition like '%current_student_id%')
         and bool_and(definition like '%current_parent_id%'),
         'admin/teacher/student/parent guards present'
  from function_defs where proname='get_achievement_leaderboard'

  union all
  select 70,'hotfix_rpc_acl',
         count(*)=2
         and count(*) filter(where has_function_privilege('authenticated',oid,'EXECUTE'))=2
         and count(*) filter(where has_function_privilege('anon',oid,'EXECUTE'))=0
         and count(*) filter(where has_function_privilege('public',oid,'EXECUTE'))=0,
         'functions='||count(*)::text||' | unsafe='||
           count(*) filter(where has_function_privilege('anon',oid,'EXECUTE')
             or has_function_privilege('public',oid,'EXECUTE'))::text
  from function_defs

  union all
  select 80,'business_data_preserved',
         (select count(*) from public.videos)=2
         and (select count(*) from public.video_playlists)=2
         and (select count(*) from public.student_achievements)=31
         and (select count(*) from public.app_notifications)=40,
         'videos='||(select count(*) from public.videos)::text||
         ' | playlists='||(select count(*) from public.video_playlists)::text||
         ' | awards='||(select count(*) from public.student_achievements)::text||
         ' | notifications='||(select count(*) from public.app_notifications)::text

  union all
  select 90,'phase15_security_preserved',
         (select count(*) from pg_catalog.pg_policies
          where schemaname='public' and policyname like 'p15_video%')=6
         and (select count(*) from pg_catalog.pg_policies
              where schemaname='storage' and policyname like 'p15_%')=20
         and (select count(*) from storage.buckets
              where id in ('videos','najm-posters','achievement-hall-posters') and public=false)=3,
         'video_policies='||(select count(*) from pg_catalog.pg_policies
           where schemaname='public' and policyname like 'p15_video%')::text||
         ' | storage_policies='||(select count(*) from pg_catalog.pg_policies
           where schemaname='storage' and policyname like 'p15_%')::text

  union all
  select 100,'phase14_core_preserved',count(*)=40,
         'core_policies='||count(*)::text||'/40'
  from pg_catalog.pg_policies
  where schemaname='public' and tablename in (
    'admins','teachers','students','parents','student_parents','classes',
    'najm_terms','najm_settings','najm_score_items','najm_sessions',
    'najm_session_records','attendance','grades','student_documents'
  )
)
select item,passed,details from checks order by sort_order;
