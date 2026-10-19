-- ============================================================================
-- FINAL_EXECUTABLE — مرحله ۱۵B: Hotfix بازدیدکنندگان و رتبه‌بندی افتخارات
-- تاریخ: 2026-07-30
--
-- اصلاح ۱: secure_increment_video_view علاوه بر شمارنده، مشاهده‌کننده را با
--          UNIQUE(video_id,student_id) ثبت/به‌روزرسانی می‌کند.
-- اصلاح ۲: get_achievement_leaderboard مقایسه text/bigint را با Cast امن
--          و JOIN منبع رسمی najm_sessions اصلاح می‌کند.
-- هیچ دادهٔ موجودی Reset یا حذف نمی‌شود.
-- ============================================================================

begin;
set local lock_timeout='10s';
set local statement_timeout='60s';

do $preflight_guard$
declare
  leaderboard_definition text;
  progress_unique_count integer;
  p15_video_policy_count integer;
begin
  select pg_get_functiondef(proc.oid) into leaderboard_definition
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace
    and proc.proname='get_achievement_leaderboard';

  select count(*) into progress_unique_count
  from pg_catalog.pg_constraint con
  where con.conrelid='public.video_watch_progress'::regclass
    and con.contype='u'
    and pg_get_constraintdef(con.oid) like '%(video_id, student_id)%';

  select count(*) into p15_video_policy_count
  from pg_catalog.pg_policies
  where schemaname='public' and policyname like 'p15_video%';

  if leaderboard_definition is null
     or leaderboard_definition not like '%nr.student_id = r.student_id%'
     or progress_unique_count<>1
     or p15_video_policy_count<>6
     or to_regprocedure('public.secure_increment_video_view(bigint)') is null then
    raise exception
      'Phase 15B aborted: expected runtime snapshot not found (bad comparison %, unique %, policies %).',
      leaderboard_definition like '%nr.student_id = r.student_id%',
      progress_unique_count,p15_video_policy_count;
  end if;
end
$preflight_guard$;

-- --------------------------------------------------------------------------
-- 1) شمارنده + ثبت یکتای مشاهده‌کننده
-- --------------------------------------------------------------------------
create or replace function public.secure_increment_video_view(p_video_id bigint)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  next_views integer;
  viewer_student_id bigint:=public.current_student_id();
begin
  if not public.app_can_read_video(p_video_id) then
    raise exception 'Video access denied.';
  end if;

  if public.current_app_role()='student' then
    if viewer_student_id is null then raise exception 'Active student profile required.'; end if;

    insert into public.video_watch_progress(
      video_id,student_id,watched_seconds,percent,last_watched_at
    ) values(
      p_video_id,viewer_student_id,0,0,now()
    )
    on conflict(video_id,student_id) do update
      set watched_seconds=greatest(coalesce(video_watch_progress.watched_seconds,0),0),
          percent=greatest(coalesce(video_watch_progress.percent,0),0),
          last_watched_at=now();
  end if;

  update public.videos
  set views=coalesce(views,0)+1,updated_at=now()
  where id=p_video_id
  returning views into next_views;

  if next_views is null then raise exception 'Video not found.'; end if;
  return next_views;
end
$function$;

revoke all on function public.secure_increment_video_view(bigint) from public,anon;
grant execute on function public.secure_increment_video_view(bigint) to authenticated;

-- --------------------------------------------------------------------------
-- 2) رتبه‌بندی با Cast امن و Source رسمی نجم
-- --------------------------------------------------------------------------
create or replace function public.get_achievement_leaderboard(
  p_scope text default 'center'::text,
  p_class_id bigint default null::bigint,
  p_term public.najm_term default null::public.najm_term,
  p_academic_year text default null::text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  current_role text:=public.current_app_role();
  normalized_scope text:=case when p_scope='class' then 'class' else 'center' end;
  resolved_term public.najm_term:=p_term;
  resolved_year text:=p_academic_year;
  settings_row public.achievement_settings%rowtype;
  result_value jsonb;
  can_use_class_scope boolean:=false;
begin
  if current_role is null then
    raise exception 'Active application profile required.';
  end if;

  if resolved_term is null or resolved_year is null then
    select term.term,term.academic_year
    into resolved_term,resolved_year
    from public.najm_terms term
    where term.is_active=true
    order by term.created_at desc
    limit 1;
  end if;

  select * into settings_row from public.achievement_settings where id=true;

  if normalized_scope='class' then
    if p_class_id is null then raise exception 'Class is required.'; end if;
    can_use_class_scope:=
      public.app_is_admin()
      or (current_role='teacher' and public.teacher_owns_class(p_class_id))
      or (current_role='student' and exists(
        select 1 from public.students student
        where student.id=public.current_student_id() and student.class_id=p_class_id
      ))
      or (current_role='parent' and exists(
        select 1
        from public.student_parents link
        join public.students student on student.id=link.student_id
        where link.parent_id=public.current_parent_id() and student.class_id=p_class_id
      ));
    if not can_use_class_scope then raise exception 'Class leaderboard access denied.'; end if;
  end if;

  select jsonb_build_object(
    'scope',normalized_scope,
    'class_id',p_class_id,
    'term',resolved_term,
    'academic_year',resolved_year,
    'name_mode',coalesce(settings_row.public_name_mode,'initials'),
    'leaderboard_enabled',coalesce(settings_row.leaderboard_enabled,true),
    'total_students',case
      when not coalesce(settings_row.leaderboard_enabled,true) and not public.app_is_admin() then 0
      else (
        select count(distinct award.student_id)
        from public.student_achievements award
        where award.revoked_at is null
          and (normalized_scope<>'class' or award.class_id=p_class_id)
      ) end,
    'rows',case
      when not coalesce(settings_row.leaderboard_enabled,true) and not public.app_is_admin()
        then '[]'::jsonb
      else coalesce((
        select jsonb_agg(row_obj order by rank_value)
        from (
          with base as (
            select
              award.student_id,
              count(*) as total_awards,
              count(distinct award.achievement_id) as unique_badges,
              count(*) filter(where coalesce(award.tier,'special')='bronze') as bronze_count,
              count(*) filter(where coalesce(award.tier,'special')='silver') as silver_count,
              count(*) filter(where coalesce(award.tier,'special')='gold') as gold_count,
              count(*) filter(where coalesce(award.tier,'special')='diamond') as diamond_count,
              count(*) filter(where coalesce(award.tier,'special')='special') as special_count,
              max(award.awarded_at) as latest_awarded_at
            from public.student_achievements award
            where award.revoked_at is null
              and (normalized_scope<>'class' or award.class_id=p_class_id)
            group by award.student_id
          ),ranked as (
            select base.*,
              rank() over(order by base.unique_badges desc,base.total_awards desc,base.student_id) as rank_value
            from base
          )
          select ranked.rank_value,
            jsonb_build_object(
              'rank',ranked.rank_value,
              'student_id',ranked.student_id,
              'display_name',case coalesce(settings_row.public_name_mode,'initials')
                when 'hidden' then 'قرآن‌آموز ناشناس'
                when 'initials' then left(trim(student.name),1)||'…'
                else student.name end,
              'class_id',student.class_id,
              'class_name',class_row.name,
              'unique_badges',ranked.unique_badges,
              'total_awards',ranked.total_awards,
              'bronze_count',ranked.bronze_count,
              'silver_count',ranked.silver_count,
              'gold_count',ranked.gold_count,
              'diamond_count',ranked.diamond_count,
              'special_count',ranked.special_count,
              'najm_percent',(
                select coalesce(round(avg(record.session_score)::numeric*100/30,1),0)
                from public.najm_session_records record
                join public.najm_sessions session_row on session_row.id=record.session_id
                where record.student_id=ranked.student_id::text
                  and coalesce(session_row.is_applied,true)=true
                  and (resolved_term is null or session_row.term=resolved_term)
                  and (resolved_year is null or session_row.academic_year=resolved_year)
                  and not coalesce(record.is_absent,record.attendance=0)
              ),
              'latest_achievement',(
                select jsonb_build_object(
                  'title',definition.title,
                  'tier',coalesce(latest_award.tier,definition.tier::text,'special'),
                  'icon_key',definition.icon_key,
                  'awarded_at',latest_award.awarded_at
                )
                from public.student_achievements latest_award
                join public.achievement_definitions definition
                  on definition.id=latest_award.achievement_id
                where latest_award.student_id=ranked.student_id
                  and latest_award.revoked_at is null
                order by latest_award.awarded_at desc
                limit 1
              )
            ) as row_obj
          from ranked
          join public.students student on student.id=ranked.student_id
          left join public.classes class_row on class_row.id=student.class_id
          order by ranked.rank_value
          limit greatest(1,least(coalesce(p_limit,50),100))
        ) ordered_rows
      ),'[]'::jsonb)
    end
  ) into result_value;

  return result_value;
end
$function$;

revoke all on function public.get_achievement_leaderboard(
  text,bigint,public.najm_term,text,integer
) from public,anon;
grant execute on function public.get_achievement_leaderboard(
  text,bigint,public.najm_term,text,integer
) to authenticated;

-- --------------------------------------------------------------------------
-- 3) Postflight
-- --------------------------------------------------------------------------
do $postflight_guard$
declare
  leaderboard_definition text;
  view_definition text;
  unsafe_execute_count integer;
begin
  select pg_get_functiondef(proc.oid) into leaderboard_definition
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace and proc.proname='get_achievement_leaderboard';
  select pg_get_functiondef(proc.oid) into view_definition
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace and proc.proname='secure_increment_video_view';

  select count(*) into unsafe_execute_count
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace
    and proc.proname in ('get_achievement_leaderboard','secure_increment_video_view')
    and (
      has_function_privilege('anon',proc.oid,'EXECUTE')
      or has_function_privilege('public',proc.oid,'EXECUTE')
    );

  if leaderboard_definition like '%nr.student_id = r.student_id%'
     or leaderboard_definition not like '%record.student_id=ranked.student_id::text%'
     or leaderboard_definition not like '%join public.najm_sessions%'
     or view_definition not like '%video_watch_progress%'
     or view_definition not like '%on conflict%'
     or unsafe_execute_count<>0
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='public' and policyname like 'p15_video%')<>6
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='storage' and policyname like 'p15_%')<>20 then
    raise exception 'Phase 15B postflight failed (unsafe execute %).',unsafe_execute_count;
  end if;
end
$postflight_guard$;

commit;
