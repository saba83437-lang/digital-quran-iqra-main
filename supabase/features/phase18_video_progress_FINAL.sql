-- ============================================================================
-- FINAL_EXECUTABLE — مرحله ۱۸: زمان و درصد واقعی تماشای ویدیو
-- تاریخ: 2026-07-30
--
-- watched_seconds: زمان واقعی فعالِ گزارش‌شده، با سقف مدت ویدیو
-- last_position_seconds: آخرین نقطه برای ادامه پخش
-- percent: بیشترین موقعیت مشاهده‌شده نسبت به مدت
-- Write فقط از RPC Authمحور؛ دانش‌آموز فقط Progress خودش را می‌خواند.
-- ============================================================================

begin;
set local lock_timeout='10s';
set local statement_timeout='60s';

-- --------------------------------------------------------------------------
-- 1) Guard
-- --------------------------------------------------------------------------
do $preflight_guard$
declare
  legacy_policy_count integer;
  invalid_progress_count integer;
begin
  if to_regprocedure(
       'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)'
     ) is not null
     or exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='video_watch_progress'
         and column_name='last_position_seconds') then
    raise exception 'Phase 18 already exists or is partial; verify instead of re-running.';
  end if;

  if (select count(*) from public.videos)<>3
     or (select count(*) from public.video_watch_progress)<>1
     or (select count(distinct(video_id,student_id)) from public.video_watch_progress)<>1
     or (select count(*) from public.video_watch_progress progress
         left join public.videos video on video.id=progress.video_id
         left join public.students student on student.id=progress.student_id
         where video.id is null or student.id is null)<>0 then
    raise exception 'Phase 18 aborted: video/progress snapshot changed.';
  end if;

  select count(*) into invalid_progress_count
  from public.video_watch_progress
  where video_id is null or student_id is null
     or watched_seconds is null or watched_seconds<0
     or percent is null or percent<0 or percent>100
     or last_watched_at is null;
  if invalid_progress_count<>0 then
    raise exception 'Phase 18 aborted: invalid progress rows found (%).',invalid_progress_count;
  end if;

  select count(*) into legacy_policy_count
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='video_watch_progress';
  if legacy_policy_count<>1
     or not exists(select 1 from pg_catalog.pg_policies
       where schemaname='public' and tablename='video_watch_progress'
         and policyname='p15_video_progress_admin_manage')
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='public' and policyname like 'p15_video%')<>6
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='storage' and policyname like 'p15_%')<>20 then
    raise exception 'Phase 18 aborted: Phase 15 security snapshot changed.';
  end if;

  if to_regprocedure('public.app_can_read_video(bigint)') is null
     or to_regprocedure('public.current_student_id()') is null
     or to_regprocedure('public.secure_increment_video_view(bigint)') is null then
    raise exception 'Phase 18 aborted: required video/Auth helpers are missing.';
  end if;
end
$preflight_guard$;

-- --------------------------------------------------------------------------
-- 2) Progress schema
-- --------------------------------------------------------------------------
alter table public.video_watch_progress
  alter column video_id set not null,
  alter column student_id set not null,
  alter column watched_seconds set default 0,
  alter column watched_seconds set not null,
  alter column percent set default 0,
  alter column percent set not null,
  alter column last_watched_at set default now(),
  alter column last_watched_at set not null,
  add column last_position_seconds integer not null default 0,
  add column duration_seconds integer,
  add column completed_at timestamptz;

alter table public.video_watch_progress
  add constraint video_progress_watched_nonnegative
    check(watched_seconds>=0),
  add constraint video_progress_position_nonnegative
    check(last_position_seconds>=0),
  add constraint video_progress_duration_positive
    check(duration_seconds is null or duration_seconds>0),
  add constraint video_progress_percent_range
    check(percent>=0 and percent<=100),
  add constraint video_progress_position_within_duration
    check(duration_seconds is null or last_position_seconds<=duration_seconds+2),
  add constraint video_progress_completion_consistency
    check(completed_at is null or percent>=95);

create index video_progress_student_recent_idx
  on public.video_watch_progress(student_id,last_watched_at desc);

-- --------------------------------------------------------------------------
-- 3) Student read own progress; direct write remains closed by absence of policy
-- --------------------------------------------------------------------------
create policy p18_video_progress_student_read
on public.video_watch_progress
for select to authenticated
using(
  public.current_app_role()='student'
  and student_id=public.current_student_id()
);

-- --------------------------------------------------------------------------
-- 4) Secure atomic progress API
-- --------------------------------------------------------------------------
create function public.secure_update_video_progress(
  p_video_id bigint,
  p_position_seconds integer,
  p_duration_seconds integer,
  p_watched_delta integer default 0,
  p_completed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  viewer_student_id bigint:=public.current_student_id();
  safe_duration integer;
  safe_position integer;
  safe_delta integer;
  position_percent numeric;
  reached_completion boolean;
  result_value jsonb;
begin
  if public.current_app_role()<>'student' or viewer_student_id is null then
    raise exception 'Active student profile required.';
  end if;
  if not public.app_can_read_video(p_video_id) then
    raise exception 'Video progress access denied.';
  end if;

  safe_duration:=least(greatest(coalesce(p_duration_seconds,0),1),43200);
  safe_position:=least(greatest(coalesce(p_position_seconds,0),0),safe_duration);
  -- هر درخواست حداکثر ۳۰ ثانیه زمان فعال اضافه می‌کند؛ کلاینت هر ۱۰ ثانیه ذخیره می‌کند.
  safe_delta:=least(greatest(coalesce(p_watched_delta,0),0),30);
  position_percent:=round((safe_position::numeric*100)/safe_duration,2);
  reached_completion:=position_percent>=95
    or (coalesce(p_completed,false) and safe_position>=safe_duration-2);
  if reached_completion then position_percent:=100; end if;

  insert into public.video_watch_progress(
    video_id,student_id,watched_seconds,percent,last_watched_at,
    last_position_seconds,duration_seconds,completed_at
  ) values(
    p_video_id,viewer_student_id,least(safe_delta,safe_duration),position_percent,now(),
    safe_position,safe_duration,case when reached_completion then now() else null end
  )
  on conflict(video_id,student_id) do update
  set watched_seconds=least(
        safe_duration,
        greatest(coalesce(video_watch_progress.watched_seconds,0),0)+safe_delta
      ),
      percent=greatest(coalesce(video_watch_progress.percent,0),position_percent),
      last_watched_at=now(),
      last_position_seconds=safe_position,
      duration_seconds=safe_duration,
      completed_at=case
        when video_watch_progress.completed_at is not null then video_watch_progress.completed_at
        when reached_completion then now()
        else null
      end
  returning jsonb_build_object(
    'video_id',video_id,
    'student_id',student_id,
    'watched_seconds',watched_seconds,
    'percent',percent,
    'last_position_seconds',last_position_seconds,
    'duration_seconds',duration_seconds,
    'last_watched_at',last_watched_at,
    'completed_at',completed_at
  ) into result_value;

  return result_value;
end
$function$;

revoke all on function public.secure_update_video_progress(
  bigint,integer,integer,integer,boolean
) from public,anon;
grant execute on function public.secure_update_video_progress(
  bigint,integer,integer,integer,boolean
) to authenticated;

-- --------------------------------------------------------------------------
-- 5) Postflight
-- --------------------------------------------------------------------------
do $postflight_guard$
declare
  required_column_count integer;
  check_count integer;
  policy_count integer;
begin
  select count(*) into required_column_count
  from information_schema.columns
  where table_schema='public' and table_name='video_watch_progress'
    and column_name in ('last_position_seconds','duration_seconds','completed_at');
  select count(*) into check_count from pg_catalog.pg_constraint
  where conrelid='public.video_watch_progress'::regclass
    and conname in (
      'video_progress_watched_nonnegative','video_progress_position_nonnegative',
      'video_progress_duration_positive','video_progress_percent_range',
      'video_progress_position_within_duration','video_progress_completion_consistency'
    );
  select count(*) into policy_count from pg_catalog.pg_policies
  where schemaname='public' and tablename='video_watch_progress';

  if required_column_count<>3 or check_count<>6 or policy_count<>2
     or not exists(select 1 from pg_catalog.pg_policies
       where schemaname='public' and tablename='video_watch_progress'
         and policyname='p18_video_progress_student_read' and cmd='SELECT')
     or to_regprocedure(
       'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)'
     ) is null
     or not has_function_privilege('authenticated',
       'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)','EXECUTE')
     or has_function_privilege('anon',
       'public.secure_update_video_progress(bigint,integer,integer,integer,boolean)','EXECUTE')
     or (select count(*) from public.video_watch_progress)<>1
     or (select count(*) from public.videos)<>3
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='public' and policyname like 'p15_video%')<>6
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='storage' and policyname like 'p15_%')<>20 then
    raise exception
      'Phase 18 postflight failed (columns %, checks %, policies %).',
      required_column_count,check_count,policy_count;
  end if;
end
$postflight_guard$;

commit;
