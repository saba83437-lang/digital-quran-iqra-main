-- ============================================================================
-- FINAL_EXECUTABLE — مرحله ۱۵: امنیت نهایی ویدیو، افتخارات و Storage
-- تاریخ: 2026-07-30
--
-- تصمیم:
--   * ویدیو فقط برای مدیر و قرآن‌آموز کلاس مرتبط؛ Write مستقیم فقط مدیر.
--   * افزایش بازدید فقط از RPC اتمیک و نقش‌محور.
--   * جداول افتخارات فقط از RPCهای نقش‌محور؛ دسترسی مستقیم client بسته.
--   * RPCهای افتخارات برای anon/PUBLIC بسته و فقط APIهای واقعی به authenticated داده می‌شوند.
--   * videos / najm-posters / achievement-hall-posters خصوصی و Signed URLمحور.
--   * achievement-artworks عمومی باقی می‌ماند چون فقط Artwork عمومی نشان‌هاست؛ Write فقط مدیر.
--
-- داده‌های تأییدشدهٔ Preflight:
--   videos=2, playlists=2, video objects=0, video orphan=0
--   achievement definitions=19, awards=31, notifications=40
--   najm-posters objects=1 و همگی مرجع‌دار
--
-- اثر:
--   * هیچ رکورد یا فایل موجودی حذف/ویرایش نمی‌شود.
--   * فقط RLS/Policy/Grant/Function و تنظیم private سه Bucket تغییر می‌کند.
--   * Transaction واحد؛ هر خطا Rollback کامل می‌شود.
-- ============================================================================

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- --------------------------------------------------------------------------
-- 1) Guard snapshot مرحله ۱۵
-- --------------------------------------------------------------------------
do $preflight_guard$
declare
  video_policy_count integer;
  achievement_core_count integer;
  achievement_rpc_count integer;
  phase15_policy_count integer;
begin
  if (select count(*) from public.videos) <> 2
     or (select count(*) from public.video_playlists) <> 2
     or (select count(*) from public.video_attachments) <> 0
     or (select count(*) from public.video_bookmarks) <> 0
     or (select count(*) from public.video_watch_progress) <> 0 then
    raise exception 'Phase 15 aborted: video data snapshot changed.';
  end if;

  if (select count(*) from storage.objects where bucket_id='videos') <> 0
     or (select count(*) from storage.objects where bucket_id='achievement-artworks') <> 0
     or (select count(*) from storage.objects where bucket_id='achievement-hall-posters') <> 0
     or (select count(*) from storage.objects where bucket_id='najm-posters') <> 1 then
    raise exception 'Phase 15 aborted: tracked Storage object snapshot changed.';
  end if;

  if (select count(*) from public.achievement_categories) <> 11
     or (select count(*) from public.achievement_definitions) <> 19
     or (select count(*) from public.achievement_rules) <> 11
     or (select count(*) from public.achievement_candidates) <> 1
     or (select count(*) from public.student_achievements) <> 31
     or (select count(*) from public.achievement_settings) <> 1
     or (select count(*) from public.special_activity_types) <> 6
     or (select count(*) from public.student_special_activities) <> 0
     or (select count(*) from public.app_notifications) <> 40 then
    raise exception 'Phase 15 aborted: achievement core snapshot changed.';
  end if;

  select count(*) into video_policy_count
  from pg_catalog.pg_policies
  where schemaname='public'
    and tablename in (
      'videos','video_playlists','video_attachments','video_bookmarks','video_watch_progress'
    );
  if video_policy_count <> 3 then
    raise exception 'Phase 15 aborted: expected three legacy video policies, found %.', video_policy_count;
  end if;

  select count(*) into achievement_core_count
  from pg_catalog.pg_class cls
  where cls.relnamespace='public'::regnamespace
    and cls.relkind in ('r','p')
    and cls.relname in (
      'achievement_categories','achievement_definitions','achievement_rules',
      'achievement_candidates','student_achievements','achievement_settings',
      'special_activity_types','student_special_activities','app_notifications',
      'achievement_artwork_assets','achievement_hall_metrics','achievement_hall_posters',
      'achievement_hall_snapshot_entries','achievement_hall_snapshots',
      'achievement_history_record_events','najm_monthly_snapshots'
    );
  if achievement_core_count <> 16 then
    raise exception 'Phase 15 aborted: expected 16 achievement tables, found %.', achievement_core_count;
  end if;

  select count(distinct proc.proname) into achievement_rpc_count
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace
    and proc.proname = any(array[
      'admin_get_achievement_management_snapshot','get_teacher_achievement_workspace',
      'get_parent_achievement_workspace','admin_save_special_activity_type',
      'record_student_special_activity','decide_student_special_activity',
      'admin_save_achievement_definition','admin_register_achievement_artwork',
      'admin_get_achievement_artwork_history','admin_publish_achievement_rule',
      'admin_set_achievement_active','get_achievement_leaderboard','get_achievement_hall',
      'get_achievement_history_records','admin_save_achievement_history_metric_settings',
      'admin_refresh_all_achievement_history_records','admin_finalize_achievement_hall',
      'admin_save_achievement_hall_metric','admin_save_achievement_hall_poster',
      'admin_update_achievement_privacy','admin_get_student_achievement_profile',
      'get_student_achievement_showcase','evaluate_student_achievements',
      'nominate_student_achievement','admin_grant_student_achievement',
      'decide_achievement_candidate','revoke_student_achievement',
      'get_my_app_notifications','mark_app_notification_read',
      'mark_all_app_notifications_read','get_achievement_notify_templates',
      'admin_save_achievement_notify_templates','admin_save_najm_quest',
      'admin_delete_achievement','admin_duplicate_achievement',
      'evaluate_najm_item_quests','admin_save_achievement_full',
      'get_najm_monthly_snapshots','admin_finalize_najm_month'
    ]::text[]);
  if achievement_rpc_count <> 39 then
    raise exception 'Phase 15 aborted: expected 39 achievement APIs, found %.', achievement_rpc_count;
  end if;

  select count(*) into phase15_policy_count
  from pg_catalog.pg_policies where policyname like 'p15_%';
  if phase15_policy_count <> 0
     or to_regprocedure('public.secure_increment_video_view(bigint)') is not null then
    raise exception 'Phase 15 already exists or is partial; verify instead of re-running.';
  end if;

  if not exists(select 1 from storage.buckets where id='videos' and public=true)
     or not exists(select 1 from storage.buckets where id='najm-posters' and public=true)
     or not exists(select 1 from storage.buckets where id='achievement-hall-posters' and public=true)
     or not exists(select 1 from storage.buckets where id='achievement-artworks' and public=true) then
    raise exception 'Phase 15 aborted: expected bucket visibility snapshot not found.';
  end if;
end
$preflight_guard$;

-- --------------------------------------------------------------------------
-- 2) Video authorization helpers and atomic view counter
-- --------------------------------------------------------------------------
create function public.video_playlist_is_available(target_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    target_playlist_id is null
    or exists (
      select 1 from public.video_playlists playlist
      where playlist.id=target_playlist_id and playlist.status='active'
    ),
    false
  )
$function$;

create function public.app_can_read_video(target_video_id bigint)
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
      from public.videos video
      where video.id=target_video_id
        and public.current_app_role()='student'
        and video.locked=false
        and (video.scheduled_at is null or video.scheduled_at <= now())
        and public.app_can_read_class(video.class_id)
        and public.video_playlist_is_available(video.playlist_id)
    ),
    false
  )
$function$;

create function public.secure_increment_video_view(p_video_id bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare next_views integer;
begin
  if not public.app_can_read_video(p_video_id) then
    raise exception 'Video access denied.';
  end if;

  update public.videos
  set views=coalesce(views,0)+1,
      updated_at=now()
  where id=p_video_id
  returning views into next_views;

  if next_views is null then raise exception 'Video not found.'; end if;
  return next_views;
end
$function$;

revoke all on function public.video_playlist_is_available(uuid) from public,anon,authenticated;
revoke all on function public.app_can_read_video(bigint) from public,anon,authenticated;
revoke all on function public.secure_increment_video_view(bigint) from public,anon,authenticated;
grant execute on function public.video_playlist_is_available(uuid) to authenticated;
grant execute on function public.app_can_read_video(bigint) to authenticated;
grant execute on function public.secure_increment_video_view(bigint) to authenticated;

-- --------------------------------------------------------------------------
-- 3) Video table RLS: admin manage, student scoped read, no student direct write
-- --------------------------------------------------------------------------
alter table public.videos enable row level security;
alter table public.video_playlists enable row level security;
alter table public.video_attachments enable row level security;
alter table public.video_bookmarks enable row level security;
alter table public.video_watch_progress enable row level security;

do $drop_video_policies$
declare policy_row record;
begin
  for policy_row in
    select tablename,policyname from pg_catalog.pg_policies
    where schemaname='public'
      and tablename in (
        'videos','video_playlists','video_attachments','video_bookmarks','video_watch_progress'
      )
  loop
    execute format('drop policy if exists %I on public.%I',policy_row.policyname,policy_row.tablename);
  end loop;
end
$drop_video_policies$;

create policy p15_videos_admin_manage on public.videos
for all to authenticated using(public.app_is_admin()) with check(public.app_is_admin());
create policy p15_videos_student_read on public.videos
for select to authenticated
using(
  public.current_app_role()='student'
  and locked=false
  and (scheduled_at is null or scheduled_at <= now())
  and public.app_can_read_class(class_id)
  and public.video_playlist_is_available(playlist_id)
);

create policy p15_video_playlists_admin_manage on public.video_playlists
for all to authenticated using(public.app_is_admin()) with check(public.app_is_admin());
create policy p15_video_attachments_admin_manage on public.video_attachments
for all to authenticated using(public.app_is_admin()) with check(public.app_is_admin());
create policy p15_video_bookmarks_admin_manage on public.video_bookmarks
for all to authenticated using(public.app_is_admin()) with check(public.app_is_admin());
create policy p15_video_progress_admin_manage on public.video_watch_progress
for all to authenticated using(public.app_is_admin()) with check(public.app_is_admin());

revoke all on table public.videos,public.video_playlists,public.video_attachments,
  public.video_bookmarks,public.video_watch_progress from public,anon,authenticated;
grant select,insert,update,delete on table public.videos,public.video_playlists,
  public.video_attachments,public.video_bookmarks,public.video_watch_progress to authenticated;

-- --------------------------------------------------------------------------
-- 4) Achievement tables/views: RPC-only + defense-in-depth RLS
-- --------------------------------------------------------------------------
do $secure_achievement_objects$
declare object_row record;
begin
  for object_row in
    select cls.relname,cls.relkind
    from pg_catalog.pg_class cls
    where cls.relnamespace='public'::regnamespace
      and cls.relkind in ('r','p','v','m')
      and (
        cls.relname in (
          'achievement_categories','achievement_definitions','achievement_rules',
          'achievement_candidates','student_achievements','achievement_settings',
          'special_activity_types','student_special_activities','app_notifications',
          'achievement_artwork_assets','achievement_hall_metrics','achievement_hall_posters',
          'achievement_hall_snapshot_entries','achievement_hall_snapshots',
          'achievement_history_record_events','najm_monthly_snapshots'
        )
        or cls.relname like '%achievement%'
        or cls.relname like '%special_activit%'
        or cls.relname like '%najm_month%'
        or cls.relname like '%hall%poster%'
      )
  loop
    if object_row.relkind in ('r','p') then
      execute format('alter table public.%I enable row level security',object_row.relname);
    end if;
    execute format(
      'revoke all on table public.%I from public,anon,authenticated',
      object_row.relname
    );
  end loop;
end
$secure_achievement_objects$;

-- تمام Functionهای حوزه ابتدا بسته می‌شوند؛ سپس فقط ۳۹ API واقعی برنامه باز می‌شوند.
do $secure_achievement_functions$
declare function_row record;
begin
  for function_row in
    select proc.oid::regprocedure as signature
    from pg_catalog.pg_proc proc
    where proc.pronamespace='public'::regnamespace
      and (
        proc.proname like '%achievement%'
        or proc.proname like '%special_activity%'
        or proc.proname like '%najm_month%'
        or proc.proname in (
          'admin_save_najm_quest','evaluate_najm_item_quests','admin_finalize_najm_month'
        )
      )
  loop
    execute format(
      'revoke all on function %s from public,anon,authenticated',
      function_row.signature
    );
  end loop;

  for function_row in
    select proc.oid::regprocedure as signature
    from pg_catalog.pg_proc proc
    where proc.pronamespace='public'::regnamespace
      and proc.proname = any(array[
        'admin_get_achievement_management_snapshot','get_teacher_achievement_workspace',
        'get_parent_achievement_workspace','admin_save_special_activity_type',
        'record_student_special_activity','decide_student_special_activity',
        'admin_save_achievement_definition','admin_register_achievement_artwork',
        'admin_get_achievement_artwork_history','admin_publish_achievement_rule',
        'admin_set_achievement_active','get_achievement_leaderboard','get_achievement_hall',
        'get_achievement_history_records','admin_save_achievement_history_metric_settings',
        'admin_refresh_all_achievement_history_records','admin_finalize_achievement_hall',
        'admin_save_achievement_hall_metric','admin_save_achievement_hall_poster',
        'admin_update_achievement_privacy','admin_get_student_achievement_profile',
        'get_student_achievement_showcase','evaluate_student_achievements',
        'nominate_student_achievement','admin_grant_student_achievement',
        'decide_achievement_candidate','revoke_student_achievement',
        'get_my_app_notifications','mark_app_notification_read',
        'mark_all_app_notifications_read','get_achievement_notify_templates',
        'admin_save_achievement_notify_templates','admin_save_najm_quest',
        'admin_delete_achievement','admin_duplicate_achievement',
        'evaluate_najm_item_quests','admin_save_achievement_full',
        'get_najm_monthly_snapshots','admin_finalize_najm_month'
      ]::text[])
  loop
    execute format('grant execute on function %s to authenticated',function_row.signature);
  end loop;
end
$secure_achievement_functions$;

-- --------------------------------------------------------------------------
-- 5) Private Storage references and authorization
-- --------------------------------------------------------------------------
create function public.storage_reference_matches(
  stored_value text,target_bucket text,object_name text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select coalesce(
    nullif(trim(stored_value),'')=object_name
    or position('/'||target_bucket||'/'||object_name in coalesce(stored_value,''))>0,
    false
  )
$function$;

create function public.can_read_video_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or exists(
      select 1 from public.videos video
      where public.app_can_read_video(video.id)
        and (
          public.storage_reference_matches(video.video_url,'videos',object_name)
          or public.storage_reference_matches(video.thumbnail_url,'videos',object_name)
          or exists(
            select 1 from public.video_attachments attachment
            where attachment.video_id=video.id
              and public.storage_reference_matches(attachment.file_url,'videos',object_name)
          )
        )
    ),false
  )
$function$;

revoke all on function public.storage_reference_matches(text,text,text)
  from public,anon,authenticated;
revoke all on function public.can_read_video_file(text) from public,anon,authenticated;
grant execute on function public.can_read_video_file(text) to authenticated;

update storage.buckets
set public=false,
    file_size_limit=524288000,
    allowed_mime_types=array[
      'video/mp4','video/webm','video/quicktime','video/x-matroska',
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','application/octet-stream'
    ]::text[]
where id='videos';
update storage.buckets set public=false where id in ('najm-posters','achievement-hall-posters');

-- Policyهای قبلی همین سه Bucket پاک و با Matrix نهایی جایگزین می‌شوند.
do $drop_phase15_storage_policies$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_catalog.pg_policies
    where schemaname='storage' and tablename='objects'
      and (
        coalesce(qual,'') like '%videos%'
        or coalesce(with_check,'') like '%videos%'
        or coalesce(qual,'') like '%najm-posters%'
        or coalesce(with_check,'') like '%najm-posters%'
        or coalesce(qual,'') like '%achievement-hall-posters%'
        or coalesce(with_check,'') like '%achievement-hall-posters%'
        or policyname like 'p15_%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects',policy_row.policyname);
  end loop;
end
$drop_phase15_storage_policies$;

-- Permissive policies: مسیر مجاز هر Bucket
create policy p15_videos_select on storage.objects for select to authenticated
using(bucket_id='videos' and public.can_read_video_file(name));
create policy p15_videos_insert on storage.objects for insert to authenticated
with check(bucket_id='videos' and public.app_is_admin());
create policy p15_videos_update on storage.objects for update to authenticated
using(bucket_id='videos' and public.app_is_admin())
with check(bucket_id='videos' and public.app_is_admin());
create policy p15_videos_delete on storage.objects for delete to authenticated
using(bucket_id='videos' and public.app_is_admin());

create policy p15_najm_posters_select on storage.objects for select to authenticated
using(bucket_id='najm-posters' and public.app_is_admin());
create policy p15_najm_posters_insert on storage.objects for insert to authenticated
with check(bucket_id='najm-posters' and public.app_is_admin());
create policy p15_najm_posters_update on storage.objects for update to authenticated
using(bucket_id='najm-posters' and public.app_is_admin())
with check(bucket_id='najm-posters' and public.app_is_admin());
create policy p15_najm_posters_delete on storage.objects for delete to authenticated
using(bucket_id='najm-posters' and public.app_is_admin());

create policy p15_hall_posters_select on storage.objects for select to authenticated
using(bucket_id='achievement-hall-posters' and public.app_is_admin());
create policy p15_hall_posters_insert on storage.objects for insert to authenticated
with check(bucket_id='achievement-hall-posters' and public.app_is_admin());
create policy p15_hall_posters_update on storage.objects for update to authenticated
using(bucket_id='achievement-hall-posters' and public.app_is_admin())
with check(bucket_id='achievement-hall-posters' and public.app_is_admin());
create policy p15_hall_posters_delete on storage.objects for delete to authenticated
using(bucket_id='achievement-hall-posters' and public.app_is_admin());

-- Restrictive guards: Policy قدیمی/آینده نمی‌تواند Matrix را بازتر کند.
create policy p15_private_anon_select on storage.objects as restrictive for select to anon
using(bucket_id not in ('videos','najm-posters','achievement-hall-posters'));
create policy p15_private_anon_insert on storage.objects as restrictive for insert to anon
with check(bucket_id not in ('videos','najm-posters','achievement-hall-posters'));
create policy p15_private_anon_update on storage.objects as restrictive for update to anon
using(bucket_id not in ('videos','najm-posters','achievement-hall-posters'))
with check(bucket_id not in ('videos','najm-posters','achievement-hall-posters'));
create policy p15_private_anon_delete on storage.objects as restrictive for delete to anon
using(bucket_id not in ('videos','najm-posters','achievement-hall-posters'));

create policy p15_private_auth_select on storage.objects as restrictive for select to authenticated
using(
  bucket_id not in ('videos','najm-posters','achievement-hall-posters')
  or (bucket_id='videos' and public.can_read_video_file(name))
  or (bucket_id in ('najm-posters','achievement-hall-posters') and public.app_is_admin())
);
create policy p15_private_auth_insert on storage.objects as restrictive for insert to authenticated
with check(
  bucket_id not in ('videos','najm-posters','achievement-hall-posters')
  or public.app_is_admin()
);
create policy p15_private_auth_update on storage.objects as restrictive for update to authenticated
using(
  bucket_id not in ('videos','najm-posters','achievement-hall-posters')
  or public.app_is_admin()
)
with check(
  bucket_id not in ('videos','najm-posters','achievement-hall-posters')
  or public.app_is_admin()
);
create policy p15_private_auth_delete on storage.objects as restrictive for delete to authenticated
using(
  bucket_id not in ('videos','najm-posters','achievement-hall-posters')
  or public.app_is_admin()
);

-- --------------------------------------------------------------------------
-- 6) Postflight
-- --------------------------------------------------------------------------
do $postflight_guard$
declare
  video_rls_count integer;
  video_policy_count integer;
  achievement_rls_count integer;
  achievement_direct_grant_count integer;
  expected_rpc_count integer;
  unsafe_rpc_count integer;
  p15_storage_policy_count integer;
begin
  select count(*) into video_rls_count from pg_catalog.pg_class cls
  where cls.relnamespace='public'::regnamespace and cls.relrowsecurity
    and cls.relname in (
      'videos','video_playlists','video_attachments','video_bookmarks','video_watch_progress'
    );
  select count(*) into video_policy_count from pg_catalog.pg_policies
  where schemaname='public' and policyname like 'p15_video%';

  select count(*) into achievement_rls_count from pg_catalog.pg_class cls
  where cls.relnamespace='public'::regnamespace and cls.relrowsecurity
    and cls.relname in (
      'achievement_categories','achievement_definitions','achievement_rules',
      'achievement_candidates','student_achievements','achievement_settings',
      'special_activity_types','student_special_activities','app_notifications',
      'achievement_artwork_assets','achievement_hall_metrics','achievement_hall_posters',
      'achievement_hall_snapshot_entries','achievement_hall_snapshots',
      'achievement_history_record_events','najm_monthly_snapshots'
    );

  select count(*) into achievement_direct_grant_count
  from pg_catalog.pg_class cls
  where cls.relnamespace='public'::regnamespace
    and cls.relname in (
      'achievement_categories','achievement_definitions','achievement_rules',
      'achievement_candidates','student_achievements','achievement_settings',
      'special_activity_types','student_special_activities','app_notifications',
      'achievement_artwork_assets','achievement_hall_metrics','achievement_hall_posters',
      'achievement_hall_snapshot_entries','achievement_hall_snapshots',
      'achievement_history_record_events','najm_monthly_snapshots'
    )
    and (
      has_table_privilege('authenticated',cls.oid,'SELECT')
      or has_table_privilege('authenticated',cls.oid,'INSERT')
      or has_table_privilege('authenticated',cls.oid,'UPDATE')
      or has_table_privilege('authenticated',cls.oid,'DELETE')
      or has_table_privilege('anon',cls.oid,'SELECT')
      or has_table_privilege('anon',cls.oid,'INSERT')
      or has_table_privilege('anon',cls.oid,'UPDATE')
      or has_table_privilege('anon',cls.oid,'DELETE')
    );

  select count(distinct proc.proname),count(*) filter(where
    has_function_privilege('anon',proc.oid,'EXECUTE')
    or has_function_privilege('public',proc.oid,'EXECUTE'))
  into expected_rpc_count,unsafe_rpc_count
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace
    and proc.proname = any(array[
      'admin_get_achievement_management_snapshot','get_teacher_achievement_workspace',
      'get_parent_achievement_workspace','admin_save_special_activity_type',
      'record_student_special_activity','decide_student_special_activity',
      'admin_save_achievement_definition','admin_register_achievement_artwork',
      'admin_get_achievement_artwork_history','admin_publish_achievement_rule',
      'admin_set_achievement_active','get_achievement_leaderboard','get_achievement_hall',
      'get_achievement_history_records','admin_save_achievement_history_metric_settings',
      'admin_refresh_all_achievement_history_records','admin_finalize_achievement_hall',
      'admin_save_achievement_hall_metric','admin_save_achievement_hall_poster',
      'admin_update_achievement_privacy','admin_get_student_achievement_profile',
      'get_student_achievement_showcase','evaluate_student_achievements',
      'nominate_student_achievement','admin_grant_student_achievement',
      'decide_achievement_candidate','revoke_student_achievement',
      'get_my_app_notifications','mark_app_notification_read',
      'mark_all_app_notifications_read','get_achievement_notify_templates',
      'admin_save_achievement_notify_templates','admin_save_najm_quest',
      'admin_delete_achievement','admin_duplicate_achievement',
      'evaluate_najm_item_quests','admin_save_achievement_full',
      'get_najm_monthly_snapshots','admin_finalize_najm_month'
    ]::text[]);

  select count(*) into p15_storage_policy_count from pg_catalog.pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'p15_%';

  if video_rls_count<>5 or video_policy_count<>6
     or achievement_rls_count<>16 or achievement_direct_grant_count<>0
     or expected_rpc_count<>39 or unsafe_rpc_count<>0
     or p15_storage_policy_count<>20
     or (select count(*) from storage.buckets
         where id in ('videos','najm-posters','achievement-hall-posters') and public=false)<>3
     or (select count(*) from public.videos)<>2
     or (select count(*) from public.student_achievements)<>31
     or (select count(*) from storage.objects where bucket_id='najm-posters')<>1 then
    raise exception
      'Phase 15 postflight failed (video rls %, video policies %, achievement rls %, grants %, rpc %, unsafe rpc %, storage policies %).',
      video_rls_count,video_policy_count,achievement_rls_count,
      achievement_direct_grant_count,expected_rpc_count,unsafe_rpc_count,p15_storage_policy_count;
  end if;
end
$postflight_guard$;

commit;
