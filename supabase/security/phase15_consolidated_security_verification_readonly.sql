-- ============================================================================
-- مرحله ۱۵ — Verification فقط‌خواندنی امنیت ویدیو، افتخارات و Storage
-- ============================================================================

with expected_rpcs(function_name) as (
  values
    ('admin_get_achievement_management_snapshot'),('get_teacher_achievement_workspace'),
    ('get_parent_achievement_workspace'),('admin_save_special_activity_type'),
    ('record_student_special_activity'),('decide_student_special_activity'),
    ('admin_save_achievement_definition'),('admin_register_achievement_artwork'),
    ('admin_get_achievement_artwork_history'),('admin_publish_achievement_rule'),
    ('admin_set_achievement_active'),('get_achievement_leaderboard'),
    ('get_achievement_hall'),('get_achievement_history_records'),
    ('admin_save_achievement_history_metric_settings'),
    ('admin_refresh_all_achievement_history_records'),('admin_finalize_achievement_hall'),
    ('admin_save_achievement_hall_metric'),('admin_save_achievement_hall_poster'),
    ('admin_update_achievement_privacy'),('admin_get_student_achievement_profile'),
    ('get_student_achievement_showcase'),('evaluate_student_achievements'),
    ('nominate_student_achievement'),('admin_grant_student_achievement'),
    ('decide_achievement_candidate'),('revoke_student_achievement'),
    ('get_my_app_notifications'),('mark_app_notification_read'),
    ('mark_all_app_notifications_read'),('get_achievement_notify_templates'),
    ('admin_save_achievement_notify_templates'),('admin_save_najm_quest'),
    ('admin_delete_achievement'),('admin_duplicate_achievement'),
    ('evaluate_najm_item_quests'),('admin_save_achievement_full'),
    ('get_najm_monthly_snapshots'),('admin_finalize_najm_month')
), achievement_tables(table_name) as (
  values
    ('achievement_categories'),('achievement_definitions'),('achievement_rules'),
    ('achievement_candidates'),('student_achievements'),('achievement_settings'),
    ('special_activity_types'),('student_special_activities'),('app_notifications'),
    ('achievement_artwork_assets'),('achievement_hall_metrics'),('achievement_hall_posters'),
    ('achievement_hall_snapshot_entries'),('achievement_hall_snapshots'),
    ('achievement_history_record_events'),('najm_monthly_snapshots')
), video_tables(table_name) as (
  values('videos'),('video_playlists'),('video_attachments'),('video_bookmarks'),('video_watch_progress')
), checks as (
  select 10 as sort_order,'video_data_preserved'::text as item,
         (select count(*) from public.videos)=2
         and (select count(*) from public.video_playlists)=2
         and (select count(*) from public.video_attachments)=0
         and (select count(*) from public.video_bookmarks)=0
         and (select count(*) from public.video_watch_progress)=0 as passed,
         'videos='||(select count(*) from public.videos)::text||
         ' | playlists='||(select count(*) from public.video_playlists)::text||
         ' | attachments='||(select count(*) from public.video_attachments)::text||
         ' | bookmarks='||(select count(*) from public.video_bookmarks)::text||
         ' | progress='||(select count(*) from public.video_watch_progress)::text as details

  union all
  select 20,'video_rls_enabled',count(*)=5,
         'enabled='||count(*)::text||'/5'
  from video_tables tracked
  join pg_catalog.pg_class cls
    on cls.relname=tracked.table_name and cls.relnamespace='public'::regnamespace
  where cls.relrowsecurity

  union all
  select 30,'video_policy_matrix',
         count(*)=6
         and count(*) filter(where policyname='p15_videos_student_read' and cmd='SELECT')=1
         and count(*) filter(where policyname like '%admin_manage' and cmd='ALL')=5,
         'count='||count(*)::text||' | expected=6'
  from pg_catalog.pg_policies
  where schemaname='public' and policyname like 'p15_video%'

  union all
  select 40,'legacy_open_video_policies_removed',count(*)=0,
         'remaining='||count(*)::text
  from pg_catalog.pg_policies
  where schemaname='public'
    and tablename in (select table_name from video_tables)
    and (roles && array['public','anon']::name[] or qual='true' or with_check='true')

  union all
  select 50,'video_anon_crud_closed',count(*)=0,
         'tables_with_anon_crud='||count(*)::text
  from video_tables tracked
  where has_table_privilege('anon',format('public.%I',table_name),'SELECT')
     or has_table_privilege('anon',format('public.%I',table_name),'INSERT')
     or has_table_privilege('anon',format('public.%I',table_name),'UPDATE')
     or has_table_privilege('anon',format('public.%I',table_name),'DELETE')

  union all
  select 60,'secure_video_view_rpc',
         to_regprocedure('public.secure_increment_video_view(bigint)') is not null
         and has_function_privilege('authenticated','public.secure_increment_video_view(bigint)','EXECUTE')
         and not has_function_privilege('anon','public.secure_increment_video_view(bigint)','EXECUTE')
         and not has_function_privilege('public','public.secure_increment_video_view(bigint)','EXECUTE'),
         'exists='||(to_regprocedure('public.secure_increment_video_view(bigint)') is not null)::text

  union all
  select 70,'achievement_data_preserved',
         (select count(*) from public.achievement_categories)=11
         and (select count(*) from public.achievement_definitions)=19
         and (select count(*) from public.achievement_rules)=11
         and (select count(*) from public.achievement_candidates)=1
         and (select count(*) from public.student_achievements)=31
         and (select count(*) from public.app_notifications)=40,
         'categories='||(select count(*) from public.achievement_categories)::text||
         ' | definitions='||(select count(*) from public.achievement_definitions)::text||
         ' | awards='||(select count(*) from public.student_achievements)::text||
         ' | notifications='||(select count(*) from public.app_notifications)::text

  union all
  select 80,'achievement_rls_defense',count(*)=16,
         'enabled='||count(*)::text||'/16'
  from achievement_tables tracked
  join pg_catalog.pg_class cls
    on cls.relname=tracked.table_name and cls.relnamespace='public'::regnamespace
  where cls.relrowsecurity

  union all
  select 90,'achievement_direct_crud_closed',count(*)=0,
         'tables_with_client_crud='||count(*)::text
  from achievement_tables tracked
  where has_table_privilege('anon',format('public.%I',table_name),'SELECT')
     or has_table_privilege('anon',format('public.%I',table_name),'INSERT')
     or has_table_privilege('anon',format('public.%I',table_name),'UPDATE')
     or has_table_privilege('anon',format('public.%I',table_name),'DELETE')
     or has_table_privilege('authenticated',format('public.%I',table_name),'SELECT')
     or has_table_privilege('authenticated',format('public.%I',table_name),'INSERT')
     or has_table_privilege('authenticated',format('public.%I',table_name),'UPDATE')
     or has_table_privilege('authenticated',format('public.%I',table_name),'DELETE')

  union all
  select 100,'achievement_rpc_allowlist',
         count(distinct proc.proname)=39
         and count(*) filter(where not has_function_privilege('authenticated',proc.oid,'EXECUTE'))=0
         and count(*) filter(where has_function_privilege('anon',proc.oid,'EXECUTE'))=0
         and count(*) filter(where has_function_privilege('public',proc.oid,'EXECUTE'))=0,
         'apis='||count(distinct proc.proname)::text||'/39 | anon_or_public='||
         count(*) filter(where has_function_privilege('anon',proc.oid,'EXECUTE')
           or has_function_privilege('public',proc.oid,'EXECUTE'))::text
  from expected_rpcs expected
  join pg_catalog.pg_proc proc
    on proc.proname=expected.function_name and proc.pronamespace='public'::regnamespace

  union all
  select 110,'achievement_rpc_security_definer_search_path',
         count(distinct proc.proname)=39
         and bool_and(proc.prosecdef)
         and bool_and(exists(
           select 1 from unnest(coalesce(proc.proconfig,array[]::text[])) cfg
           where cfg like 'search_path=%'
         )),
         'checked='||count(distinct proc.proname)::text||'/39'
  from expected_rpcs expected
  join pg_catalog.pg_proc proc
    on proc.proname=expected.function_name and proc.pronamespace='public'::regnamespace

  union all
  select 120,'private_buckets_and_objects_preserved',
         count(*)=3 and bool_and(public=false)
         and (select count(*) from storage.objects where bucket_id='videos')=0
         and (select count(*) from storage.objects where bucket_id='achievement-hall-posters')=0
         and (select count(*) from storage.objects where bucket_id='najm-posters')=1,
         string_agg(id||':public='||public::text,' ؛ ' order by id)||
         ' | najm_objects='||(select count(*) from storage.objects where bucket_id='najm-posters')::text
  from storage.buckets
  where id in ('videos','najm-posters','achievement-hall-posters')

  union all
  select 130,'phase15_storage_policies',
         count(*)=20
         and count(*) filter(where permissive='RESTRICTIVE')=8,
         'count='||count(*)::text||' | restrictive='||
         count(*) filter(where permissive='RESTRICTIVE')::text
  from pg_catalog.pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'p15_%'

  union all
  select 140,'public_artwork_bucket_intentional',
         count(*)=1 and bool_and(public=true),
         'public='||coalesce(bool_and(public)::text,'missing')||
         ' | objects='||(select count(*) from storage.objects where bucket_id='achievement-artworks')::text
  from storage.buckets where id='achievement-artworks'

  union all
  select 150,'previous_secure_storage_preserved',
         (select count(*) from storage.objects where bucket_id='student-files')=20
         and (select count(*) from storage.objects where bucket_id='assignments')=3
         and (select count(*) from storage.objects where bucket_id='finance-receipts')=1
         and (select count(*) from storage.buckets
              where id in ('student-files','assignments','finance-receipts') and public=false)=3,
         'student-files='||(select count(*) from storage.objects where bucket_id='student-files')::text||
         ' | assignments='||(select count(*) from storage.objects where bucket_id='assignments')::text||
         ' | finance='||(select count(*) from storage.objects where bucket_id='finance-receipts')::text

  union all
  select 160,'phase14_core_unchanged',count(*)=40,
         'core_policies='||count(*)::text||'/40'
  from pg_catalog.pg_policies
  where schemaname='public'
    and tablename in (
      'admins','teachers','students','parents','student_parents','classes',
      'najm_terms','najm_settings','najm_score_items','najm_sessions',
      'najm_session_records','attendance','grades','student_documents'
    )
)
select item,passed,details from checks order by sort_order;
