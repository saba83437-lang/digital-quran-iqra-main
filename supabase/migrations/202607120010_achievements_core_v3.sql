-- ============================================================================
-- Digital Quran Iqra — Achievements & Badges Core (Najm + verified special activities v1)
-- Date: 2026-07-12
--
-- Product rules:
--   * Najm is the only educational score/assessment source of truth.
--   * Simple verified special activities may represent ceremonies, competitions,
--     Quran service, or completion of a genuinely separate special program.
--   * grades / attendance / assignments / submissions are NOT rule sources.
--   * no points, rewards, levels, missions, or QR certificates in v1.
--   * awards use three methods: automatic, direct admin grant, or teacher nomination + admin approval.
--
-- Scope note:
--   This migration does not change RLS/policies of any existing project table.
--   New feature tables are exposed only through role-aware RPC functions.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1) Core tables
-- --------------------------------------------------------------------------

create table if not exists public.achievement_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  icon_key text not null default 'Award',
  color text not null default 'emerald',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievement_definitions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.achievement_categories(id) on delete set null,
  slug text not null unique,
  title text not null,
  description text not null default '',
  locked_hint text,
  icon_key text not null default 'Award',
  artwork_url text,
  tier text not null default 'bronze'
    check (tier in ('bronze', 'silver', 'gold', 'diamond', 'special')),
  decision_mode text not null default 'admin_approval'
    check (decision_mode in ('automatic', 'admin_approval', 'manual')),
  teacher_permission text not null default 'nominate'
    check (teacher_permission in ('none', 'nominate')),
  repeat_policy text not null default 'once'
    check (repeat_policy in ('once', 'per_term', 'per_year', 'multiple')),
  visibility text not null default 'private'
    check (visibility in ('private', 'profile', 'leaderboard')),
  is_secret boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievement_rules (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievement_definitions(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  title text not null,
  logic text not null default 'all' check (logic in ('all', 'any')),
  conditions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (achievement_id, version),
  check (effective_until is null or effective_until > effective_from)
);

create unique index if not exists achievement_rules_one_active_idx
  on public.achievement_rules(achievement_id)
  where is_active = true;

create table if not exists public.achievement_candidates (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievement_definitions(id) on delete restrict,
  student_id bigint not null references public.students(id) on delete cascade,
  rule_id uuid references public.achievement_rules(id) on delete set null,
  nomination_source text not null check (nomination_source in ('system', 'teacher')),
  achievement_source text not null
    check (achievement_source in (
      'najm', 'special_activity', 'competition', 'occasion',
      'admin_direct', 'teacher_nomination', 'legacy_migration', 'hybrid', 'other'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  candidate_key text not null,
  class_id bigint references public.classes(id) on delete set null,
  term public.najm_term,
  academic_year text,
  reason text not null default '',
  source_session_ids uuid[] not null default '{}'::uuid[],
  source_activity_ids uuid[] not null default '{}'::uuid[],
  evidence_refs jsonb not null default '{}'::jsonb,
  nominated_by_user_id uuid,
  decided_by_user_id uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists achievement_candidates_pending_unique_idx
  on public.achievement_candidates(achievement_id, student_id, candidate_key)
  where status = 'pending';
create index if not exists achievement_candidates_status_idx
  on public.achievement_candidates(status, created_at desc);
create index if not exists achievement_candidates_student_idx
  on public.achievement_candidates(student_id, created_at desc);

create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievement_definitions(id) on delete restrict,
  student_id bigint not null references public.students(id) on delete cascade,
  candidate_id uuid references public.achievement_candidates(id) on delete set null,
  rule_id uuid references public.achievement_rules(id) on delete set null,
  rule_version integer,
  grant_method text not null
    check (grant_method in ('automatic', 'admin_direct', 'teacher_nomination', 'legacy_migration')),
  achievement_source text not null
    check (achievement_source in (
      'najm', 'special_activity', 'competition', 'occasion',
      'admin_direct', 'teacher_nomination', 'legacy_migration', 'hybrid', 'other'
    )),
  occurrence_key text not null,
  class_id bigint references public.classes(id) on delete set null,
  term public.najm_term,
  academic_year text,
  reason text not null default '',
  source_session_ids uuid[] not null default '{}'::uuid[],
  source_activity_ids uuid[] not null default '{}'::uuid[],
  awarded_by_user_id uuid,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (achievement_id, student_id, occurrence_key),
  check (
    (revoked_at is null and revoked_by_user_id is null)
    or revoked_at is not null
  )
);

create index if not exists student_achievements_student_idx
  on public.student_achievements(student_id, awarded_at desc);
create index if not exists student_achievements_definition_idx
  on public.student_achievements(achievement_id, awarded_at desc);
create index if not exists student_achievements_source_idx
  on public.student_achievements(achievement_source, awarded_at desc);
create index if not exists student_achievements_grant_method_idx
  on public.student_achievements(grant_method, awarded_at desc);
create index if not exists student_achievements_active_idx
  on public.student_achievements(student_id, achievement_id)
  where revoked_at is null;

create table if not exists public.achievement_settings (
  id boolean primary key default true check (id = true),
  leaderboard_enabled boolean not null default true,
  show_locked_badges boolean not null default true,
  profile_featured_limit integer not null default 5 check (profile_featured_limit between 0 and 10),
  public_name_mode text not null default 'initials'
    check (public_name_mode in ('full', 'initials', 'hidden')),
  notify_student boolean not null default true,
  notify_parent boolean not null default true,
  notify_teacher boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.achievement_settings(id)
values (true)
on conflict (id) do nothing;

-- Simple verified special activities: ceremonies, competitions, Quran service, camps, or special plans.
-- These records are not a parallel grade system; they only represent confirmed special activities.
create table if not exists public.special_activity_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  source_kind text not null default 'special_activity'
    check (source_kind in ('special_activity', 'competition', 'occasion', 'other')),
  unit_label text not null default 'بار',
  allow_numeric_value boolean not null default false,
  requires_admin_verification boolean not null default true,
  teacher_can_record boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_special_activities (
  id uuid primary key default gen_random_uuid(),
  activity_type_id uuid not null references public.special_activity_types(id) on delete restrict,
  student_id bigint not null references public.students(id) on delete cascade,
  class_id bigint references public.classes(id) on delete set null,
  term public.najm_term,
  academic_year text,
  occurred_at timestamptz not null default now(),
  numeric_value numeric not null default 1,
  result_key text,
  notes text not null default '',
  evidence_url text,
  source_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'cancelled')),
  recorded_by_user_id uuid,
  verified_by_user_id uuid,
  verified_at timestamptz,
  verification_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (numeric_value >= 0),
  check (
    (status = 'verified' and verified_at is not null)
    or status <> 'verified'
  )
);

create index if not exists student_special_activities_student_idx
  on public.student_special_activities(student_id, status, occurred_at desc);
create index if not exists student_special_activities_type_idx
  on public.student_special_activities(activity_type_id, status, occurred_at desc);
create unique index if not exists student_special_activities_source_unique_idx
  on public.student_special_activities(activity_type_id, student_id, source_reference)
  where source_reference is not null;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null,
  notification_type text not null,
  title text not null,
  body text not null default '',
  achievement_id uuid references public.achievement_definitions(id) on delete set null,
  student_id bigint references public.students(id) on delete cascade,
  student_achievement_id uuid references public.student_achievements(id) on delete cascade,
  candidate_id uuid references public.achievement_candidates(id) on delete cascade,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_recipient_idx
  on public.app_notifications(recipient_user_id, read_at, created_at desc);

-- --------------------------------------------------------------------------
-- 2) Generic timestamps and rule validation
-- --------------------------------------------------------------------------

create or replace function public.achievement_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'achievement_categories',
    'achievement_definitions',
    'achievement_rules',
    'achievement_candidates',
    'student_achievements',
    'special_activity_types',
    'student_special_activities'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.achievement_set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

create or replace function public.validate_achievement_rule_conditions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  condition_item jsonb;
  metric_key text;
  operator_key text;
begin
  if jsonb_typeof(new.conditions) <> 'array' or jsonb_array_length(new.conditions) = 0 then
    raise exception 'Achievement rule conditions must be a non-empty JSON array';
  end if;

  for condition_item in select value from jsonb_array_elements(new.conditions)
  loop
    metric_key := condition_item ->> 'metric';
    operator_key := condition_item ->> 'operator';

    if metric_key not in (
      'najm_record_count',
      'attendance_streak',
      'attendance_rate',
      'exam_max',
      'exam_full_count',
      'session_score_average',
      'session_score_percent',
      'homework_average',
      'homework_full_streak',
      'discipline_average',
      'clean_discipline_streak',
      'special_progress_total',
      'special_help_total',
      'negative_disorder_total',
      'negative_disrespect_total',
      'improvement_delta',
      'adjusted_term_percent',
      'activity_count',
      'activity_value_sum',
      'activity_value_max'
    ) then
      raise exception 'Unsupported achievement metric: %', metric_key;
    end if;

    if operator_key not in ('>=', '>', '<=', '<', '=', 'between') then
      raise exception 'Unsupported achievement rule operator: %', operator_key;
    end if;

    if not (condition_item ? 'value') then
      raise exception 'Every achievement condition requires a value';
    end if;

    if metric_key like 'activity_%'
       and nullif(condition_item #>> '{params,activity_type}', '') is null then
      raise exception 'Special activity metrics require params.activity_type';
    end if;

    if operator_key = 'between' and not (condition_item ? 'max_value') then
      raise exception 'Between operator requires max_value';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_achievement_rule_conditions on public.achievement_rules;
create trigger trg_validate_achievement_rule_conditions
before insert or update of conditions on public.achievement_rules
for each row execute function public.validate_achievement_rule_conditions();

-- --------------------------------------------------------------------------
-- 3) Najm-only metric engine
-- --------------------------------------------------------------------------

create or replace function public.najm_achievement_metric(
  p_student_id bigint,
  p_metric_key text,
  p_params jsonb default '{}'::jsonb,
  p_term public.najm_term default null,
  p_academic_year text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result_value numeric := 0;
  metric_scope text := coalesce(nullif(p_params ->> 'scope', ''), 'term');
  last_n integer := greatest(coalesce((p_params ->> 'last_n')::integer, 0), 0);
  window_size integer := greatest(coalesce((p_params ->> 'window')::integer, 3), 1);
  student_average numeric;
  class_average numeric;
  absence_ratio numeric := 0.6;
  attended_total numeric := 0;
  attended_count integer := 0;
  absent_count integer := 0;
  record_count integer := 0;
begin
  if p_student_id is null then return 0; end if;

  if p_metric_key = 'najm_record_count' then
    select count(*)::numeric into result_value
    from public.najm_session_records r
    join public.najm_sessions s on s.id = r.session_id
    where r.student_id = p_student_id::text
      and coalesce(s.is_applied, true) = true
      and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
      and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term);

  elsif p_metric_key = 'attendance_streak' then
    with ordered as (
      select
        coalesce(r.is_absent, r.attendance = 0) as absent,
        s.session_date,
        s.created_at
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and coalesce(s.is_applied, true) = true
        and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
        and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term)
    ), marked as (
      select *,
        sum(case when absent then 1 else 0 end)
          over (order by session_date desc, created_at desc) as absence_seen
      from ordered
    )
    select count(*)::numeric into result_value
    from marked
    where absence_seen = 0;

  elsif p_metric_key = 'attendance_rate' then
    with scoped as (
      select coalesce(r.is_absent, r.attendance = 0) as absent
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and coalesce(s.is_applied, true) = true
        and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
        and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term)
    )
    select coalesce(100.0 * count(*) filter (where not absent) / nullif(count(*), 0), 0)
      into result_value
    from scoped;

  elsif p_metric_key in ('exam_max', 'exam_full_count', 'session_score_average',
                          'session_score_percent', 'homework_average',
                          'discipline_average', 'special_progress_total',
                          'special_help_total', 'negative_disorder_total',
                          'negative_disrespect_total') then
    with ordered as (
      select r.*,
        row_number() over (order by s.session_date desc, s.created_at desc) as row_num
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and coalesce(s.is_applied, true) = true
        and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
        and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term)
    ), scoped as (
      select * from ordered where last_n = 0 or row_num <= last_n
    )
    select case p_metric_key
      when 'exam_max' then coalesce(max(exam_raw) filter (where not coalesce(is_absent, attendance = 0)), 0)
      when 'exam_full_count' then count(*) filter (where not coalesce(is_absent, attendance = 0) and exam_raw = 10)::numeric
      when 'session_score_average' then coalesce(avg(session_score) filter (where not coalesce(is_absent, attendance = 0)), 0)
      when 'session_score_percent' then coalesce(100.0 * avg(session_score) filter (where not coalesce(is_absent, attendance = 0)) / 30.0, 0)
      when 'homework_average' then coalesce(avg(homework) filter (where not coalesce(is_absent, attendance = 0)), 0)
      when 'discipline_average' then coalesce(avg(discipline) filter (where not coalesce(is_absent, attendance = 0)), 0)
      when 'special_progress_total' then coalesce(sum(special_progress), 0)::numeric
      when 'special_help_total' then coalesce(sum(special_help), 0)::numeric
      when 'negative_disorder_total' then coalesce(sum(negative_disorder), 0)::numeric
      when 'negative_disrespect_total' then coalesce(sum(negative_disrespect), 0)::numeric
      else 0
    end into result_value
    from scoped;

  elsif p_metric_key = 'homework_full_streak' then
    with ordered as (
      select
        (coalesce(r.is_absent, r.attendance = 0) or r.homework < 5) as breaks_streak,
        s.session_date,
        s.created_at
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and coalesce(s.is_applied, true) = true
        and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
        and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term)
    ), marked as (
      select *,
        sum(case when breaks_streak then 1 else 0 end)
          over (order by session_date desc, created_at desc) as break_seen
      from ordered
    )
    select count(*)::numeric into result_value from marked where break_seen = 0;

  elsif p_metric_key = 'clean_discipline_streak' then
    with ordered as (
      select
        (
          coalesce(r.is_absent, r.attendance = 0)
          or r.negative_disorder > 0
          or r.negative_disrespect > 0
          or r.discipline < coalesce((p_params ->> 'min_discipline')::integer, 0)
        ) as breaks_streak,
        s.session_date,
        s.created_at
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and coalesce(s.is_applied, true) = true
        and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
        and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term)
    ), marked as (
      select *,
        sum(case when breaks_streak then 1 else 0 end)
          over (order by session_date desc, created_at desc) as break_seen
      from ordered
    )
    select count(*)::numeric into result_value from marked where break_seen = 0;

  elsif p_metric_key = 'improvement_delta' then
    with ordered as (
      select r.session_score::numeric as score,
        row_number() over (order by s.session_date desc, s.created_at desc) as row_num
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and not coalesce(r.is_absent, r.attendance = 0)
        and coalesce(s.is_applied, true) = true
        and (metric_scope = 'lifetime' or p_academic_year is null or s.academic_year = p_academic_year)
        and (metric_scope in ('lifetime', 'academic_year') or p_term is null or s.term = p_term)
    )
    select case
      when count(*) filter (where row_num <= window_size) = window_size
       and count(*) filter (where row_num > window_size and row_num <= window_size * 2) = window_size
      then
        coalesce(avg(score) filter (where row_num <= window_size), 0)
        - coalesce(avg(score) filter (where row_num > window_size and row_num <= window_size * 2), 0)
      else 0
    end into result_value
    from ordered
    where row_num <= window_size * 2;

  elsif p_metric_key = 'adjusted_term_percent' then
    select coalesce(t.absence_score_ratio, 0.6)
      into absence_ratio
    from public.najm_terms t
    where t.term = p_term and t.academic_year = p_academic_year
    order by t.is_active desc, t.created_at desc
    limit 1;
    absence_ratio := coalesce(absence_ratio, 0.6);

    with student_rows as (
      select r.session_score::numeric as score,
             coalesce(r.is_absent, r.attendance = 0) as absent,
             s.class_id
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where r.student_id = p_student_id::text
        and coalesce(s.is_applied, true) = true
        and (p_academic_year is null or s.academic_year = p_academic_year)
        and (p_term is null or s.term = p_term)
    )
    select
      coalesce(avg(score) filter (where not absent), 0),
      coalesce(sum(score) filter (where not absent), 0),
      count(*) filter (where not absent),
      count(*) filter (where absent),
      count(*)
    into student_average, attended_total, attended_count, absent_count, record_count
    from student_rows;

    if attended_count = 0 then
      with student_classes as (
        select distinct s.class_id
        from public.najm_session_records r
        join public.najm_sessions s on s.id = r.session_id
        where r.student_id = p_student_id::text
          and (p_academic_year is null or s.academic_year = p_academic_year)
          and (p_term is null or s.term = p_term)
      )
      select coalesce(avg(r.session_score), 0)
        into class_average
      from public.najm_session_records r
      join public.najm_sessions s on s.id = r.session_id
      where s.class_id in (select class_id from student_classes)
        and not coalesce(r.is_absent, r.attendance = 0)
        and coalesce(s.is_applied, true) = true
        and (p_academic_year is null or s.academic_year = p_academic_year)
        and (p_term is null or s.term = p_term);
      student_average := coalesce(class_average, 0);
    end if;

    if record_count = 0 then
      result_value := 0;
    else
      result_value := 100.0 * (
        attended_total + absent_count * round(absence_ratio * student_average)
      ) / (record_count * 30.0);
    end if;

  else
    raise exception 'Unsupported Najm achievement metric: %', p_metric_key;
  end if;

  return round(coalesce(result_value, 0), 2);
end;
$$;

create or replace function public.achievement_activity_metric(
  p_student_id bigint,
  p_metric_key text,
  p_params jsonb default '{}'::jsonb,
  p_term public.najm_term default null,
  p_academic_year text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result_value numeric := 0;
  metric_scope text := coalesce(nullif(p_params ->> 'scope', ''), 'term');
  activity_type_slug text := p_params ->> 'activity_type';
  required_result_key text := nullif(p_params ->> 'result_key', '');
  last_n_days integer := greatest(coalesce((p_params ->> 'last_n_days')::integer, 0), 0);
begin
  if p_student_id is null or activity_type_slug is null then return 0; end if;

  select case p_metric_key
    when 'activity_count' then count(*)::numeric
    when 'activity_value_sum' then coalesce(sum(e.numeric_value), 0)
    when 'activity_value_max' then coalesce(max(e.numeric_value), 0)
    else 0
  end into result_value
  from public.student_special_activities e
  join public.special_activity_types et on et.id = e.activity_type_id
  where e.student_id = p_student_id
    and e.status = 'verified'
    and et.slug = activity_type_slug
    and (required_result_key is null or e.result_key = required_result_key)
    and (
      metric_scope = 'lifetime'
      or metric_scope = 'last_n_days'
      or p_academic_year is null
      or e.academic_year = p_academic_year
    )
    and (
      metric_scope in ('lifetime', 'academic_year', 'last_n_days')
      or p_term is null
      or e.term = p_term
    )
    and (
      metric_scope <> 'last_n_days'
      or last_n_days = 0
      or e.occurred_at >= now() - make_interval(days => last_n_days)
    );

  return round(coalesce(result_value, 0), 2);
end;
$$;

create or replace function public.achievement_rule_metric(
  p_student_id bigint,
  p_metric_key text,
  p_params jsonb default '{}'::jsonb,
  p_term public.najm_term default null,
  p_academic_year text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_metric_key like 'activity_%' then
    return public.achievement_activity_metric(
      p_student_id, p_metric_key, p_params, p_term, p_academic_year
    );
  end if;

  return public.najm_achievement_metric(
    p_student_id, p_metric_key, p_params, p_term, p_academic_year
  );
end;
$$;

create or replace function public.resolve_achievement_source(
  p_rule_id uuid,
  p_source_activity_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  activity_source text;
  activity_condition_count integer := 0;
  najm_condition_count integer := 0;
begin
  select
    count(*) filter (where condition_item ->> 'metric' like 'activity_%'),
    count(*) filter (where condition_item ->> 'metric' not like 'activity_%')
  into activity_condition_count, najm_condition_count
  from public.achievement_rules r,
       lateral jsonb_array_elements(r.conditions) condition_item
  where r.id = p_rule_id;

  if activity_condition_count > 0 and najm_condition_count > 0 then return 'hybrid'; end if;

  if activity_condition_count > 0 and p_source_activity_id is not null then
    select sat.source_kind into activity_source
    from public.student_special_activities sa
    join public.special_activity_types sat on sat.id = sa.activity_type_id
    where sa.id = p_source_activity_id;

    if activity_source is not null then return activity_source; end if;
  end if;

  if activity_condition_count > 0 then return 'special_activity'; end if;
  if najm_condition_count > 0 then return 'najm'; end if;
  return 'other';
end;
$$;

create or replace function public.evaluate_achievement_rule(
  p_rule_id uuid,
  p_student_id bigint,
  p_term public.najm_term default null,
  p_academic_year text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  rule_row public.achievement_rules%rowtype;
  condition_item jsonb;
  current_value numeric;
  target_value numeric;
  max_value numeric;
  condition_met boolean;
  overall_met boolean;
  condition_count integer := 0;
  condition_results jsonb := '[]'::jsonb;
begin
  select * into rule_row
  from public.achievement_rules
  where id = p_rule_id
    and is_active = true
    and effective_from <= now()
    and (effective_until is null or effective_until > now());

  if not found then
    return jsonb_build_object('met', false, 'reason', 'inactive_rule', 'conditions', '[]'::jsonb);
  end if;

  overall_met := (rule_row.logic = 'all');

  for condition_item in select value from jsonb_array_elements(rule_row.conditions)
  loop
    condition_count := condition_count + 1;
    current_value := public.achievement_rule_metric(
      p_student_id,
      condition_item ->> 'metric',
      coalesce(condition_item -> 'params', '{}'::jsonb),
      p_term,
      p_academic_year
    );
    target_value := (condition_item ->> 'value')::numeric;
    max_value := nullif(condition_item ->> 'max_value', '')::numeric;

    condition_met := case condition_item ->> 'operator'
      when '>=' then current_value >= target_value
      when '>' then current_value > target_value
      when '<=' then current_value <= target_value
      when '<' then current_value < target_value
      when '=' then current_value = target_value
      when 'between' then current_value between target_value and max_value
      else false
    end;

    condition_results := condition_results || jsonb_build_array(jsonb_build_object(
      'metric', condition_item ->> 'metric',
      'operator', condition_item ->> 'operator',
      'current', current_value,
      'target', target_value,
      'max_target', max_value,
      'met', condition_met
    ));

    if rule_row.logic = 'all' then
      overall_met := overall_met and condition_met;
    else
      overall_met := overall_met or condition_met;
    end if;
  end loop;

  if condition_count = 0 then overall_met := false; end if;

  return jsonb_build_object(
    'met', overall_met,
    'logic', rule_row.logic,
    'rule_id', rule_row.id,
    'rule_version', rule_row.version,
    'conditions', condition_results
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 4) Award/candidate engine
-- --------------------------------------------------------------------------

create or replace function public.achievement_scope_key(
  p_repeat_policy text,
  p_term public.najm_term,
  p_academic_year text,
  p_source_session_id uuid default null,
  p_source_activity_id uuid default null
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_repeat_policy
    when 'once' then 'lifetime'
    when 'per_year' then 'year:' || coalesce(p_academic_year, 'unknown')
    when 'per_term' then 'term:' || coalesce(p_academic_year, 'unknown') || ':' || coalesce(p_term::text, 'unknown')
    when 'multiple' then case
      when p_source_activity_id is not null then 'activity:' || p_source_activity_id::text
      when p_source_session_id is not null then 'session:' || p_source_session_id::text
      else 'manual:' || current_date::text
    end
    else 'lifetime'
  end
$$;

create or replace function public.evaluate_student_achievements(
  p_student_id bigint,
  p_term public.najm_term default null,
  p_academic_year text default null,
  p_source_session_id uuid default null,
  p_source_activity_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  definition_row record;
  rule_result jsonb;
  scope_key text;
  inserted_award_id uuid;
  inserted_candidate_id uuid;
  result_items jsonb := '[]'::jsonb;
  resolved_term public.najm_term := p_term;
  resolved_year text := p_academic_year;
  resolved_class_id bigint;
  resolved_achievement_source text;
  caller_role text;
begin
  if p_student_id is null then return '[]'::jsonb; end if;

  -- Direct RPC calls are limited to the caller's own authorized scope.
  -- Database triggers/SQL maintenance without an end-user JWT may still run it.
  if auth.uid() is not null then
    caller_role := public.current_app_role();
    if caller_role = 'admin' then
      null;
    elsif caller_role = 'teacher' and public.teacher_can_access_student(p_student_id) then
      null;
    elsif caller_role = 'student' and public.current_student_id() = p_student_id then
      null;
    elsif caller_role = 'parent' and public.parent_can_access_student(p_student_id) then
      null;
    else
      raise exception 'Achievement evaluation access denied';
    end if;
  end if;

  if resolved_term is null or resolved_year is null then
    select t.term, t.academic_year
      into resolved_term, resolved_year
    from public.najm_terms t
    where t.is_active = true
    order by t.created_at desc
    limit 1;
  end if;

  if p_source_session_id is not null then
    select case when s.class_id ~ '^[0-9]+$' then s.class_id::bigint else null end
      into resolved_class_id
    from public.najm_sessions s
    where s.id = p_source_session_id;
  end if;

  if resolved_class_id is null then
    select s.class_id into resolved_class_id
    from public.students s where s.id = p_student_id;
  end if;

  for definition_row in
    select d.*, r.id as active_rule_id, r.version as active_rule_version
    from public.achievement_definitions d
    join public.achievement_rules r on r.achievement_id = d.id and r.is_active = true
    where d.is_active = true
      and r.effective_from <= now()
      and (r.effective_until is null or r.effective_until > now())
    order by d.sort_order, d.title
  loop
    rule_result := public.evaluate_achievement_rule(
      definition_row.active_rule_id,
      p_student_id,
      resolved_term,
      resolved_year
    );
    resolved_achievement_source := public.resolve_achievement_source(
      definition_row.active_rule_id,
      p_source_activity_id
    );
    scope_key := public.achievement_scope_key(
      definition_row.repeat_policy,
      resolved_term,
      resolved_year,
      p_source_session_id,
      p_source_activity_id
    );
    inserted_award_id := null;
    inserted_candidate_id := null;

    if coalesce((rule_result ->> 'met')::boolean, false) then
      if definition_row.decision_mode = 'automatic' then
        insert into public.student_achievements (
          achievement_id, student_id, rule_id, rule_version,
          grant_method, achievement_source,
          occurrence_key, class_id, term, academic_year, reason,
          source_session_ids, source_activity_ids, awarded_by_user_id
        ) values (
          definition_row.id, p_student_id, definition_row.active_rule_id,
          definition_row.active_rule_version, 'automatic', resolved_achievement_source,
          scope_key, resolved_class_id, resolved_term, resolved_year,
          'دریافت خودکار بر اساس اطلاعات تأییدشده سامانه',
          case when p_source_session_id is null then '{}'::uuid[] else array[p_source_session_id] end,
          case when p_source_activity_id is null then '{}'::uuid[] else array[p_source_activity_id] end,
          null
        )
        on conflict (achievement_id, student_id, occurrence_key) do nothing
        returning id into inserted_award_id;

      elsif definition_row.decision_mode = 'admin_approval' then
        if not exists (
          select 1 from public.student_achievements sa
          where sa.achievement_id = definition_row.id
            and sa.student_id = p_student_id
            and sa.occurrence_key = scope_key
            and sa.revoked_at is null
        ) then
          insert into public.achievement_candidates (
            achievement_id, student_id, rule_id,
            nomination_source, achievement_source, status,
            candidate_key, class_id, term, academic_year, reason,
            source_session_ids, source_activity_ids, evidence_refs
          ) values (
            definition_row.id, p_student_id, definition_row.active_rule_id,
            'system', resolved_achievement_source, 'pending',
            scope_key, resolved_class_id, resolved_term,
            resolved_year, 'احراز خودکار شرایط نشان بر اساس اطلاعات تأییدشده',
            case when p_source_session_id is null then '{}'::uuid[] else array[p_source_session_id] end,
            case when p_source_activity_id is null then '{}'::uuid[] else array[p_source_activity_id] end,
            jsonb_build_object('rule_evaluation', rule_result)
          )
          on conflict (achievement_id, student_id, candidate_key)
            where status = 'pending'
          do nothing
          returning id into inserted_candidate_id;
        end if;
      end if;
    end if;

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'achievement_id', definition_row.id,
      'slug', definition_row.slug,
      'title', definition_row.title,
      'met', coalesce((rule_result ->> 'met')::boolean, false),
      'achievement_source', resolved_achievement_source,
      'progress', rule_result,
      'award_id', inserted_award_id,
      'candidate_id', inserted_candidate_id
    ));
  end loop;

  return result_items;
end;
$$;

-- Evaluate after a full Najm record insert/update transaction has completed.
create or replace function public.trigger_evaluate_najm_achievements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.najm_sessions%rowtype;
begin
  if new.student_id !~ '^[0-9]+$' then return new; end if;

  select * into session_row
  from public.najm_sessions
  where id = new.session_id;

  if found and coalesce(session_row.is_applied, true) = true then
    perform public.evaluate_student_achievements(
      new.student_id::bigint,
      session_row.term,
      session_row.academic_year,
      new.session_id,
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_evaluate_najm_achievements on public.najm_session_records;
create constraint trigger trg_evaluate_najm_achievements
after insert or update on public.najm_session_records
deferrable initially deferred
for each row execute function public.trigger_evaluate_najm_achievements();

-- --------------------------------------------------------------------------
-- 5) Approval, nomination, direct grant, and revoke RPCs
-- --------------------------------------------------------------------------

create or replace function public.decide_achievement_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate_row public.achievement_candidates%rowtype;
  rule_version_value integer;
  award_id uuid;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can decide an achievement candidate';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into candidate_row
  from public.achievement_candidates
  where id = p_candidate_id and status = 'pending'
  for update;

  if not found then raise exception 'Pending candidate not found'; end if;

  update public.achievement_candidates
  set status = p_decision,
      decided_by_user_id = auth.uid(),
      decided_at = now(),
      decision_note = p_note
  where id = p_candidate_id;

  if p_decision = 'approved' then
    select version into rule_version_value
    from public.achievement_rules where id = candidate_row.rule_id;

    insert into public.student_achievements (
      achievement_id, student_id, candidate_id, rule_id, rule_version,
      grant_method, achievement_source,
      occurrence_key, class_id, term, academic_year, reason,
      source_session_ids, source_activity_ids, awarded_by_user_id
    ) values (
      candidate_row.achievement_id, candidate_row.student_id, candidate_row.id,
      candidate_row.rule_id, rule_version_value,
      case when candidate_row.nomination_source = 'teacher' then 'teacher_nomination' else 'automatic' end,
      candidate_row.achievement_source,
      candidate_row.candidate_key, candidate_row.class_id,
      candidate_row.term, candidate_row.academic_year,
      coalesce(nullif(candidate_row.reason, ''), 'تأیید مدیر'),
      candidate_row.source_session_ids, candidate_row.source_activity_ids, auth.uid()
    )
    on conflict (achievement_id, student_id, occurrence_key) do update
      set revoked_at = null,
          revoked_by_user_id = null,
          revocation_reason = null,
          candidate_id = excluded.candidate_id,
          grant_method = excluded.grant_method,
          achievement_source = excluded.achievement_source,
          awarded_by_user_id = excluded.awarded_by_user_id,
          awarded_at = now(),
          updated_at = now()
    returning id into award_id;
  end if;

  return award_id;
end;
$$;

create or replace function public.nominate_student_achievement(
  p_achievement_id uuid,
  p_student_id bigint,
  p_reason text,
  p_term public.najm_term default null,
  p_academic_year text default null,
  p_source_session_ids uuid[] default '{}'::uuid[],
  p_source_activity_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  definition_row public.achievement_definitions%rowtype;
  student_class_id bigint;
  candidate_id uuid;
  scope_key text;
  resolved_term public.najm_term := p_term;
  resolved_year text := p_academic_year;
begin
  if public.current_app_role() <> 'teacher' then
    raise exception 'Only a teacher can submit an achievement nomination';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A nomination reason is required';
  end if;

  select * into definition_row
  from public.achievement_definitions
  where id = p_achievement_id and is_active = true;
  if not found then raise exception 'Active achievement not found'; end if;
  if definition_row.teacher_permission <> 'nominate' then
    raise exception 'Teacher nomination is disabled for this achievement';
  end if;
  if not public.teacher_can_access_student(p_student_id) then
    raise exception 'Teacher cannot access this student';
  end if;

  select class_id into student_class_id
  from public.students where id = p_student_id;

  if resolved_term is null or resolved_year is null then
    select t.term, t.academic_year
      into resolved_term, resolved_year
    from public.najm_terms t
    where t.is_active = true
    order by t.created_at desc
    limit 1;
  end if;

  scope_key := public.achievement_scope_key(
    definition_row.repeat_policy,
    resolved_term,
    resolved_year,
    case when cardinality(p_source_session_ids) > 0 then p_source_session_ids[1] else null end,
    case when cardinality(p_source_activity_ids) > 0 then p_source_activity_ids[1] else null end
  );

  insert into public.achievement_candidates (
    achievement_id, student_id, nomination_source, achievement_source,
    status, candidate_key, class_id, term, academic_year, reason,
    source_session_ids, source_activity_ids, nominated_by_user_id
  ) values (
    p_achievement_id, p_student_id, 'teacher', 'teacher_nomination',
    'pending', scope_key, student_class_id, resolved_term, resolved_year,
    trim(p_reason), p_source_session_ids, p_source_activity_ids, auth.uid()
  )
  on conflict (achievement_id, student_id, candidate_key)
    where status = 'pending'
  do update set
    reason = excluded.reason,
    source_session_ids = excluded.source_session_ids,
    source_activity_ids = excluded.source_activity_ids,
    nominated_by_user_id = excluded.nominated_by_user_id,
    updated_at = now()
  returning id into candidate_id;

  return candidate_id;
end;
$$;

create or replace function public.admin_grant_student_achievement(
  p_achievement_id uuid,
  p_student_id bigint,
  p_reason text,
  p_achievement_source text default 'admin_direct',
  p_term public.najm_term default null,
  p_academic_year text default null,
  p_source_session_ids uuid[] default '{}'::uuid[],
  p_source_activity_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  definition_row public.achievement_definitions%rowtype;
  student_class_id bigint;
  award_id uuid;
  scope_key text;
  resolved_term public.najm_term := p_term;
  resolved_year text := p_academic_year;
  resolved_source text := coalesce(nullif(p_achievement_source, ''), 'admin_direct');
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can directly grant an achievement';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A direct grant reason is required';
  end if;
  if resolved_source not in (
    'najm', 'special_activity', 'competition', 'occasion',
    'admin_direct', 'legacy_migration', 'hybrid', 'other'
  ) then
    raise exception 'Unsupported achievement source for direct admin grant';
  end if;

  select * into definition_row
  from public.achievement_definitions
  where id = p_achievement_id and is_active = true;
  if not found then raise exception 'Active achievement not found'; end if;

  select class_id into student_class_id
  from public.students where id = p_student_id;
  if not found then raise exception 'Student not found'; end if;

  if resolved_term is null or resolved_year is null then
    select t.term, t.academic_year
      into resolved_term, resolved_year
    from public.najm_terms t
    where t.is_active = true
    order by t.created_at desc
    limit 1;
  end if;

  scope_key := public.achievement_scope_key(
    definition_row.repeat_policy,
    resolved_term,
    resolved_year,
    case when cardinality(p_source_session_ids) > 0 then p_source_session_ids[1] else null end,
    case when cardinality(p_source_activity_ids) > 0 then p_source_activity_ids[1] else null end
  );

  insert into public.student_achievements (
    achievement_id, student_id, grant_method, achievement_source,
    occurrence_key, class_id, term, academic_year, reason,
    source_session_ids, source_activity_ids, awarded_by_user_id
  ) values (
    p_achievement_id, p_student_id, 'admin_direct', resolved_source,
    scope_key, student_class_id, resolved_term, resolved_year,
    trim(p_reason), p_source_session_ids, p_source_activity_ids, auth.uid()
  )
  on conflict (achievement_id, student_id, occurrence_key) do update
    set grant_method = 'admin_direct',
        achievement_source = excluded.achievement_source,
        reason = excluded.reason,
        source_session_ids = excluded.source_session_ids,
        source_activity_ids = excluded.source_activity_ids,
        awarded_by_user_id = auth.uid(),
        awarded_at = now(),
        revoked_at = null,
        revoked_by_user_id = null,
        revocation_reason = null,
        updated_at = now()
  returning id into award_id;

  return award_id;
end;
$$;

create or replace function public.revoke_student_achievement(
  p_student_achievement_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can revoke an achievement';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A revocation reason is required';
  end if;

  update public.student_achievements
  set revoked_at = now(),
      revoked_by_user_id = auth.uid(),
      revocation_reason = trim(p_reason),
      updated_at = now()
  where id = p_student_achievement_id and revoked_at is null;

  return found;
end;
$$;

-- --------------------------------------------------------------------------
-- 6) Simple special activity APIs
-- --------------------------------------------------------------------------

create or replace function public.admin_save_special_activity_type(p_activity_type jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activity_type_id uuid := nullif(p_activity_type ->> 'id', '')::uuid;
  saved_id uuid;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can manage special activity types';
  end if;

  if activity_type_id is null then
    insert into public.special_activity_types (
      slug, title, description, source_kind, unit_label, allow_numeric_value,
      requires_admin_verification, teacher_can_record, is_active,
      metadata, created_by_user_id
    ) values (
      trim(p_activity_type ->> 'slug'),
      trim(p_activity_type ->> 'title'),
      coalesce(p_activity_type ->> 'description', ''),
      coalesce(nullif(p_activity_type ->> 'source_kind', ''), 'special_activity'),
      coalesce(nullif(p_activity_type ->> 'unit_label', ''), 'بار'),
      coalesce((p_activity_type ->> 'allow_numeric_value')::boolean, false),
      coalesce((p_activity_type ->> 'requires_admin_verification')::boolean, true),
      coalesce((p_activity_type ->> 'teacher_can_record')::boolean, true),
      coalesce((p_activity_type ->> 'is_active')::boolean, true),
      coalesce(p_activity_type -> 'metadata', '{}'::jsonb),
      auth.uid()
    ) returning id into saved_id;
  else
    update public.special_activity_types et
    set slug = coalesce(nullif(trim(p_activity_type ->> 'slug'), ''), et.slug),
        title = coalesce(nullif(trim(p_activity_type ->> 'title'), ''), et.title),
        description = coalesce(p_activity_type ->> 'description', et.description),
        source_kind = coalesce(nullif(p_activity_type ->> 'source_kind', ''), et.source_kind),
        unit_label = coalesce(nullif(p_activity_type ->> 'unit_label', ''), et.unit_label),
        allow_numeric_value = case when p_activity_type ? 'allow_numeric_value' then (p_activity_type ->> 'allow_numeric_value')::boolean else et.allow_numeric_value end,
        requires_admin_verification = case when p_activity_type ? 'requires_admin_verification' then (p_activity_type ->> 'requires_admin_verification')::boolean else et.requires_admin_verification end,
        teacher_can_record = case when p_activity_type ? 'teacher_can_record' then (p_activity_type ->> 'teacher_can_record')::boolean else et.teacher_can_record end,
        is_active = case when p_activity_type ? 'is_active' then (p_activity_type ->> 'is_active')::boolean else et.is_active end,
        metadata = case when p_activity_type ? 'metadata' then p_activity_type -> 'metadata' else et.metadata end,
        updated_at = now()
    where et.id = activity_type_id
    returning et.id into saved_id;
  end if;

  if saved_id is null then raise exception 'Special activity type was not saved'; end if;
  return saved_id;
end;
$$;

create or replace function public.record_student_special_activity(
  p_activity_type_id uuid,
  p_student_id bigint,
  p_occurred_at timestamptz default now(),
  p_numeric_value numeric default 1,
  p_result_key text default null,
  p_notes text default '',
  p_evidence_url text default null,
  p_source_reference text default null,
  p_term public.najm_term default null,
  p_academic_year text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_role text := public.current_app_role();
  activity_type_row public.special_activity_types%rowtype;
  student_class_id bigint;
  initial_status text;
  activity_id uuid;
  safe_numeric_value numeric;
  resolved_term public.najm_term := p_term;
  resolved_year text := p_academic_year;
begin
  if current_role not in ('admin', 'teacher') then
    raise exception 'Only an admin or teacher can record special activities';
  end if;

  select * into activity_type_row
  from public.special_activity_types
  where id = p_activity_type_id and is_active = true;
  if not found then raise exception 'Active special activity type not found'; end if;

  select class_id into student_class_id from public.students where id = p_student_id;
  if student_class_id is null and not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student not found';
  end if;

  if current_role = 'teacher' then
    if not activity_type_row.teacher_can_record then
      raise exception 'Teacher recording is disabled for this special activity type';
    end if;
    if not public.teacher_can_access_student(p_student_id) then
      raise exception 'Teacher cannot access this student';
    end if;
  end if;

  if resolved_term is null or resolved_year is null then
    select t.term, t.academic_year
      into resolved_term, resolved_year
    from public.najm_terms t
    where t.is_active = true
    order by t.created_at desc
    limit 1;
  end if;

  initial_status := case
    when current_role = 'admin' then 'verified'
    when activity_type_row.requires_admin_verification then 'pending'
    else 'verified'
  end;
  safe_numeric_value := case
    when activity_type_row.allow_numeric_value then greatest(coalesce(p_numeric_value, 0), 0)
    else 1
  end;

  insert into public.student_special_activities (
    activity_type_id, student_id, class_id, term, academic_year,
    occurred_at, numeric_value, result_key, notes, evidence_url,
    source_reference, status, recorded_by_user_id,
    verified_by_user_id, verified_at, metadata
  ) values (
    p_activity_type_id, p_student_id, student_class_id, resolved_term, resolved_year,
    coalesce(p_occurred_at, now()), safe_numeric_value, nullif(p_result_key, ''),
    coalesce(p_notes, ''), nullif(p_evidence_url, ''), nullif(p_source_reference, ''),
    initial_status, auth.uid(),
    case when initial_status = 'verified' then auth.uid() else null end,
    case when initial_status = 'verified' then now() else null end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into activity_id;

  return activity_id;
end;
$$;

create or replace function public.decide_student_special_activity(
  p_activity_id uuid,
  p_decision text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can verify special activities';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Special activity decision must be verified or rejected';
  end if;

  update public.student_special_activities
  set status = p_decision,
      verified_by_user_id = auth.uid(),
      verified_at = case when p_decision = 'verified' then now() else null end,
      verification_note = p_note,
      updated_at = now()
  where id = p_activity_id and status = 'pending';

  return found;
end;
$$;

create or replace function public.trigger_evaluate_verified_special_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  should_evaluate boolean := false;
begin
  if tg_op = 'INSERT' then
    should_evaluate := new.status = 'verified';
  elsif tg_op = 'UPDATE' then
    should_evaluate := new.status = 'verified' and old.status is distinct from new.status;
  end if;

  if should_evaluate then
    perform public.evaluate_student_achievements(
      new.student_id,
      new.term,
      new.academic_year,
      null,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evaluate_verified_special_activity on public.student_special_activities;
create trigger trg_evaluate_verified_special_activity
after insert or update of status on public.student_special_activities
for each row execute function public.trigger_evaluate_verified_special_activity();

-- --------------------------------------------------------------------------
-- 7) Admin management RPCs for the upcoming UI
-- --------------------------------------------------------------------------

create or replace function public.admin_save_achievement_definition(p_definition jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  definition_id uuid := nullif(p_definition ->> 'id', '')::uuid;
  category_id_value uuid := nullif(p_definition ->> 'category_id', '')::uuid;
  saved_id uuid;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can manage achievement definitions';
  end if;

  if category_id_value is null and nullif(p_definition ->> 'category_slug', '') is not null then
    select id into category_id_value
    from public.achievement_categories
    where slug = p_definition ->> 'category_slug';
  end if;

  if definition_id is null then
    insert into public.achievement_definitions (
      category_id, slug, title, description, locked_hint, icon_key,
      artwork_url, tier, decision_mode, teacher_permission, repeat_policy,
      visibility, is_secret, is_active, sort_order, metadata,
      created_by_user_id
    ) values (
      category_id_value,
      trim(p_definition ->> 'slug'),
      trim(p_definition ->> 'title'),
      coalesce(p_definition ->> 'description', ''),
      nullif(p_definition ->> 'locked_hint', ''),
      coalesce(nullif(p_definition ->> 'icon_key', ''), 'Award'),
      nullif(p_definition ->> 'artwork_url', ''),
      coalesce(nullif(p_definition ->> 'tier', ''), 'bronze'),
      coalesce(nullif(p_definition ->> 'decision_mode', ''), 'admin_approval'),
      coalesce(nullif(p_definition ->> 'teacher_permission', ''), 'nominate'),
      coalesce(nullif(p_definition ->> 'repeat_policy', ''), 'once'),
      coalesce(nullif(p_definition ->> 'visibility', ''), 'private'),
      coalesce((p_definition ->> 'is_secret')::boolean, false),
      coalesce((p_definition ->> 'is_active')::boolean, true),
      coalesce((p_definition ->> 'sort_order')::integer, 0),
      coalesce(p_definition -> 'metadata', '{}'::jsonb),
      auth.uid()
    )
    returning id into saved_id;
  else
    update public.achievement_definitions d
    set category_id = coalesce(category_id_value, d.category_id),
        slug = coalesce(nullif(trim(p_definition ->> 'slug'), ''), d.slug),
        title = coalesce(nullif(trim(p_definition ->> 'title'), ''), d.title),
        description = coalesce(p_definition ->> 'description', d.description),
        locked_hint = case when p_definition ? 'locked_hint' then nullif(p_definition ->> 'locked_hint', '') else d.locked_hint end,
        icon_key = coalesce(nullif(p_definition ->> 'icon_key', ''), d.icon_key),
        artwork_url = case when p_definition ? 'artwork_url' then nullif(p_definition ->> 'artwork_url', '') else d.artwork_url end,
        tier = coalesce(nullif(p_definition ->> 'tier', ''), d.tier),
        decision_mode = coalesce(nullif(p_definition ->> 'decision_mode', ''), d.decision_mode),
        teacher_permission = coalesce(nullif(p_definition ->> 'teacher_permission', ''), d.teacher_permission),
        repeat_policy = coalesce(nullif(p_definition ->> 'repeat_policy', ''), d.repeat_policy),
        visibility = coalesce(nullif(p_definition ->> 'visibility', ''), d.visibility),
        is_secret = case when p_definition ? 'is_secret' then (p_definition ->> 'is_secret')::boolean else d.is_secret end,
        is_active = case when p_definition ? 'is_active' then (p_definition ->> 'is_active')::boolean else d.is_active end,
        sort_order = case when p_definition ? 'sort_order' then (p_definition ->> 'sort_order')::integer else d.sort_order end,
        metadata = case when p_definition ? 'metadata' then p_definition -> 'metadata' else d.metadata end,
        updated_at = now()
    where d.id = definition_id
    returning d.id into saved_id;
  end if;

  if saved_id is null then raise exception 'Achievement definition was not saved'; end if;
  return saved_id;
end;
$$;

create or replace function public.admin_publish_achievement_rule(
  p_achievement_id uuid,
  p_title text,
  p_logic text,
  p_conditions jsonb,
  p_effective_from timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_version integer;
  new_rule_id uuid;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can publish achievement rules';
  end if;
  if not exists (select 1 from public.achievement_definitions where id = p_achievement_id) then
    raise exception 'Achievement definition not found';
  end if;
  if p_logic not in ('all', 'any') then raise exception 'Rule logic must be all or any'; end if;

  perform 1 from public.achievement_definitions where id = p_achievement_id for update;

  select coalesce(max(version), 0) + 1 into next_version
  from public.achievement_rules
  where achievement_id = p_achievement_id;

  update public.achievement_rules
  set is_active = false, effective_until = coalesce(effective_until, now()), updated_at = now()
  where achievement_id = p_achievement_id and is_active = true;

  insert into public.achievement_rules (
    achievement_id, version, title, logic, conditions,
    is_active, effective_from, created_by_user_id
  ) values (
    p_achievement_id, next_version, trim(p_title), p_logic, p_conditions,
    true, coalesce(p_effective_from, now()), auth.uid()
  )
  returning id into new_rule_id;

  return new_rule_id;
end;
$$;

create or replace function public.admin_set_achievement_active(
  p_achievement_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can archive achievements';
  end if;

  update public.achievement_definitions
  set is_active = p_is_active, updated_at = now()
  where id = p_achievement_id;
  return found;
end;
$$;

create or replace function public.admin_get_achievement_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result_value jsonb;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can view achievement management data';
  end if;

  select jsonb_build_object(
    'activity_types', coalesce((
      select jsonb_agg(to_jsonb(et) order by et.title)
      from public.special_activity_types et
    ), '[]'::jsonb),
    'pending_activities', coalesce((
      select jsonb_agg(
        to_jsonb(e) || jsonb_build_object(
          'activity_type_title', et.title,
          'student_name', s.name,
          'class_name', c.name
        ) order by e.created_at desc
      )
      from public.student_special_activities e
      join public.special_activity_types et on et.id = e.activity_type_id
      join public.students s on s.id = e.student_id
      left join public.classes c on c.id = e.class_id
      where e.status = 'pending'
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order, c.title)
      from public.achievement_categories c
    ), '[]'::jsonb),
    'definitions', coalesce((
      select jsonb_agg(
        to_jsonb(d) || jsonb_build_object(
          'category_title', c.title,
          'active_rule', case when r.id is null then null else to_jsonb(r) end,
          'recipient_count', (
            select count(distinct sa.student_id)
            from public.student_achievements sa
            where sa.achievement_id = d.id and sa.revoked_at is null
          ),
          'award_count', (
            select count(*)
            from public.student_achievements sa
            where sa.achievement_id = d.id and sa.revoked_at is null
          )
        ) order by d.sort_order, d.title
      )
      from public.achievement_definitions d
      left join public.achievement_categories c on c.id = d.category_id
      left join public.achievement_rules r on r.achievement_id = d.id and r.is_active = true
    ), '[]'::jsonb),
    'pending_candidates', coalesce((
      select jsonb_agg(
        to_jsonb(ac) || jsonb_build_object(
          'achievement_title', d.title,
          'achievement_tier', d.tier,
          'student_name', s.name,
          'class_name', c.name
        ) order by ac.created_at desc
      )
      from public.achievement_candidates ac
      join public.achievement_definitions d on d.id = ac.achievement_id
      join public.students s on s.id = ac.student_id
      left join public.classes c on c.id = ac.class_id
      where ac.status = 'pending'
    ), '[]'::jsonb),
    'recent_awards', coalesce((
      select jsonb_agg(
        to_jsonb(sa) || jsonb_build_object(
          'achievement_title', d.title,
          'achievement_tier', d.tier,
          'student_name', s.name,
          'class_name', c.name
        ) order by sa.awarded_at desc
      )
      from (
        select * from public.student_achievements
        order by awarded_at desc
        limit 100
      ) sa
      join public.achievement_definitions d on d.id = sa.achievement_id
      join public.students s on s.id = sa.student_id
      left join public.classes c on c.id = sa.class_id
    ), '[]'::jsonb),
    'settings', (select to_jsonb(settings_row) from public.achievement_settings settings_row where id = true)
  ) into result_value;

  return result_value;
end;
$$;

-- --------------------------------------------------------------------------
-- 7) Notifications generated from final awards and pending candidates
-- --------------------------------------------------------------------------

create or replace function public.notify_final_achievement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  achievement_title text;
  student_name text;
  settings_row public.achievement_settings%rowtype;
begin
  select title into achievement_title
  from public.achievement_definitions where id = new.achievement_id;
  select name into student_name
  from public.students where id = new.student_id;
  select * into settings_row from public.achievement_settings where id = true;

  insert into public.app_notifications (
    recipient_user_id, notification_type, title, body,
    achievement_id, student_id, student_achievement_id, action_url
  )
  select distinct recipient_id, 'achievement_awarded',
    'افتخار جدید: ' || achievement_title,
    coalesce(student_name, 'قرآن‌آموز') || ' نشان «' || achievement_title || '» را دریافت کرد.',
    new.achievement_id, new.student_id, new.id, '/student/achievements'
  from (
    select ur.id as recipient_id
    from public.user_roles ur
    where settings_row.notify_student and ur.student_id = new.student_id and ur.is_active

    union

    select ur.id
    from public.user_roles ur
    join public.student_parents sp on sp.parent_id = ur.parent_id
    where settings_row.notify_parent and sp.student_id = new.student_id and ur.is_active

    union

    select ur.id
    from public.user_roles ur
    join public.classes c on c.teacher_id = ur.teacher_id
    join public.students st on st.class_id = c.id
    where settings_row.notify_teacher and st.id = new.student_id and ur.is_active
  ) recipients
  where recipient_id is not null;

  return new;
end;
$$;

drop trigger if exists trg_notify_final_achievement on public.student_achievements;
create trigger trg_notify_final_achievement
after insert on public.student_achievements
for each row execute function public.notify_final_achievement();

create or replace function public.notify_pending_achievement_candidate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  achievement_title text;
  student_name text;
begin
  if new.status <> 'pending' then return new; end if;

  select title into achievement_title
  from public.achievement_definitions where id = new.achievement_id;
  select name into student_name
  from public.students where id = new.student_id;

  insert into public.app_notifications (
    recipient_user_id, notification_type, title, body,
    achievement_id, student_id, candidate_id, action_url
  )
  select ur.id, 'achievement_candidate', 'نامزدی نشان نیازمند بررسی است',
    coalesce(student_name, 'قرآن‌آموز') || ' برای نشان «' || achievement_title || '» نامزد شده است.',
    new.achievement_id, new.student_id, new.id, '/admin/achievements'
  from public.user_roles ur
  where ur.role = 'admin' and ur.is_active;

  return new;
end;
$$;

drop trigger if exists trg_notify_pending_achievement_candidate on public.achievement_candidates;
create trigger trg_notify_pending_achievement_candidate
after insert on public.achievement_candidates
for each row execute function public.notify_pending_achievement_candidate();

-- --------------------------------------------------------------------------
-- 7) Read RPCs (progress is calculated live; no duplicate educational data)
-- --------------------------------------------------------------------------

create or replace function public.get_student_achievement_showcase(
  p_student_id bigint,
  p_term public.najm_term default null,
  p_academic_year text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_role text := public.current_app_role();
  result_value jsonb;
  resolved_term public.najm_term := p_term;
  resolved_year text := p_academic_year;
begin
  if current_role is null then raise exception 'Authentication required'; end if;

  if resolved_term is null or resolved_year is null then
    select t.term, t.academic_year
      into resolved_term, resolved_year
    from public.najm_terms t
    where t.is_active = true
    order by t.created_at desc
    limit 1;
  end if;

  if current_role = 'student' and public.current_student_id() <> p_student_id then
    raise exception 'Student access denied';
  elsif current_role = 'parent' and not public.parent_can_access_student(p_student_id) then
    raise exception 'Parent access denied';
  elsif current_role = 'teacher' and not public.teacher_can_access_student(p_student_id) then
    raise exception 'Teacher access denied';
  elsif current_role not in ('admin', 'teacher', 'student', 'parent') then
    raise exception 'Access denied';
  end if;

  select jsonb_build_object(
    'student_id', p_student_id,
    'earned', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_achievement_id', sa.id,
        'achievement_id', d.id,
        'slug', d.slug,
        'title', d.title,
        'description', d.description,
        'icon_key', d.icon_key,
        'artwork_url', d.artwork_url,
        'tier', d.tier,
        'visibility', d.visibility,
        'reason', sa.reason,
        'grant_method', sa.grant_method,
        'achievement_source', sa.achievement_source,
        'awarded_at', sa.awarded_at,
        'term', sa.term,
        'academic_year', sa.academic_year
      ) order by sa.awarded_at desc)
      from public.student_achievements sa
      join public.achievement_definitions d on d.id = sa.achievement_id
      where sa.student_id = p_student_id and sa.revoked_at is null
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'achievement_id', d.id,
        'slug', d.slug,
        'title', d.title,
        'description', d.description,
        'locked_hint', d.locked_hint,
        'icon_key', d.icon_key,
        'tier', d.tier,
        'is_secret', d.is_secret,
        'decision_mode', d.decision_mode,
        'evaluation', case
          when r.id is null then jsonb_build_object(
            'met', false,
            'manual', true,
            'conditions', '[]'::jsonb
          )
          else public.evaluate_achievement_rule(r.id, p_student_id, resolved_term, resolved_year)
        end
      ) order by d.sort_order, d.title)
      from public.achievement_definitions d
      left join public.achievement_rules r on r.achievement_id = d.id and r.is_active = true
      where d.is_active = true
        and not exists (
          select 1 from public.student_achievements sa
          where sa.student_id = p_student_id
            and sa.achievement_id = d.id
            and sa.revoked_at is null
        )
    ), '[]'::jsonb)
  ) into result_value;

  return result_value;
end;
$$;

create or replace function public.get_my_app_notifications(p_limit integer default 30)
returns table (
  id uuid,
  notification_type text,
  title text,
  body text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.notification_type, n.title, n.body, n.action_url, n.read_at, n.created_at
  from public.app_notifications n
  where n.recipient_user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.mark_app_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_user_id = auth.uid();
  return found;
end;
$$;

-- --------------------------------------------------------------------------
-- 9) Seed v1 categories, special activity types, badge definitions, and editable rules
-- --------------------------------------------------------------------------

insert into public.special_activity_types(
  slug, title, description, source_kind, unit_label, allow_numeric_value,
  requires_admin_verification, teacher_can_record
)
values
  ('ceremony_participation', 'مشارکت در مراسم', 'حضور و همکاری تأییدشده در مراسم‌های دارالقرآن', 'special_activity', 'مراسم', false, true, true),
  ('quran_service', 'خدمت قرآنی', 'فعالیت تأییدشده در خدمت‌رسانی قرآنی یا همکاری داوطلبانه', 'special_activity', 'فعالیت', false, true, true),
  ('competition_achievement', 'دستاورد مسابقه', 'رتبه یا دستاورد تأییدشده در مسابقات قرآنی', 'competition', 'مسابقه', true, true, true),
  ('camp_participation', 'مشارکت در اردو', 'حضور یا همکاری تأییدشده در اردوهای دارالقرآن', 'special_activity', 'اردو', false, true, true),
  ('occasion_program', 'برنامه مناسبتی', 'مشارکت تأییدشده در برنامه‌ها و مناسبت‌های ویژه', 'occasion', 'برنامه', false, true, true),
  ('special_program_completion', 'تکمیل طرح ویژه', 'تکمیل تأییدشده یک طرح یا دوره ویژه خارج از ارزیابی نجم', 'special_activity', 'طرح', false, true, true)
on conflict (slug) do nothing;

insert into public.achievement_categories(slug, title, description, icon_key, color, sort_order)
values
  ('attendance', 'حضور', 'افتخارات حضور و استمرار در جلسات طرح نجم', 'CalendarCheck', 'emerald', 10),
  ('exam', 'آزمون', 'افتخارات آزمون‌های ثبت‌شده در طرح نجم', 'GraduationCap', 'gold', 20),
  ('homework', 'تکلیف در نجم', 'افتخارات شاخص تکلیف در ارزیابی نجم', 'BookCheck', 'blue', 30),
  ('discipline', 'اخلاق و انضباط', 'افتخارات انضباط، احترام و رفتار قرآنی', 'Heart', 'purple', 40),
  ('progress', 'پیشرفت', 'افتخارات رشد و پیشرفت در ارزیابی‌های نجم', 'TrendingUp', 'teal', 50),
  ('participation', 'مشارکت', 'افتخارات مشارکت و کمک به دیگران در طرح نجم', 'Sparkles', 'orange', 60),
  ('special', 'ویژه', 'افتخارات دستی و مناسبتی با تأیید مدیر', 'Trophy', 'gold', 70)
on conflict (slug) do nothing;

insert into public.achievement_definitions(
  category_id, slug, title, description, locked_hint, icon_key, tier,
  decision_mode, teacher_permission, repeat_policy, visibility, sort_order
)
values
  ((select id from public.achievement_categories where slug='progress'),
   'first_najm_record', 'اولین گام نجم', 'اولین ارزیابی رسمی در طرح نجم ثبت شد.',
   'با ثبت اولین جلسه نجم این نشان را دریافت می‌کنی.', 'Star', 'bronze',
   'automatic', 'none', 'once', 'profile', 10),

  ((select id from public.achievement_categories where slug='progress'),
   'gold_najm_average', 'درخشش طلایی نجم', 'میانگین عملکرد نجم در سطح طلایی قرار گرفت.',
   'میانگین عملکرد نجم را به ۹۰٪ برسان.', 'Crown', 'gold',
   'automatic', 'none', 'per_term', 'leaderboard', 20),

  ((select id from public.achievement_categories where slug='progress'),
   'silver_najm_average', 'درخشش نقره‌ای نجم', 'میانگین عملکرد نجم در سطح نقره‌ای قرار گرفت.',
   'میانگین عملکرد نجم را به ۸۰٪ برسان.', 'Medal', 'silver',
   'automatic', 'none', 'per_term', 'profile', 30),

  ((select id from public.achievement_categories where slug='exam'),
   'perfect_najm_exam', 'آزمون کامل', 'نمره خام ۱۰ از ۱۰ در آزمون نجم؛ معادل ۲۰ در نمایش.',
   'در یکی از آزمون‌های نجم نمره کامل بگیر.', 'Sparkles', 'gold',
   'automatic', 'none', 'once', 'profile', 40),

  ((select id from public.achievement_categories where slug='attendance'),
   'attendance_streak_5', 'پنج حضور متوالی', 'پنج جلسه طرح نجم بدون غیبت.',
   'پنج جلسه متوالی در طرح نجم حاضر باش.', 'Flame', 'bronze',
   'automatic', 'none', 'once', 'profile', 50),

  ((select id from public.achievement_categories where slug='attendance'),
   'attendance_streak_10', 'قهرمان حضور', 'ده جلسه طرح نجم بدون غیبت.',
   'ده جلسه متوالی در طرح نجم حاضر باش.', 'Zap', 'gold',
   'automatic', 'none', 'once', 'leaderboard', 60),

  ((select id from public.achievement_categories where slug='attendance'),
   'attendance_rate_90', 'حضور منظم', 'نرخ حضور طرح نجم حداقل ۹۰ درصد است.',
   'نرخ حضور ترم را به ۹۰٪ برسان.', 'CalendarHeart', 'silver',
   'automatic', 'none', 'per_term', 'profile', 70),

  ((select id from public.achievement_categories where slug='homework'),
   'najm_homework_star', 'ستاره تکلیف نجم', 'میانگین شاخص تکلیف نجم حداقل ۴٫۵ از ۵ است.',
   'در حداقل سه جلسه، میانگین تکلیف نجم را به ۴٫۵ برسان.', 'BookCheck', 'gold',
   'automatic', 'none', 'per_term', 'profile', 80),

  ((select id from public.achievement_categories where slug='progress'),
   'najm_upward_trend', 'پیشرفت صعودی', 'میانگین سه جلسه اخیر نسبت به سه جلسه قبل رشد کرده است.',
   'در سه جلسه اخیر دست‌کم یک امتیاز رشد میانگین داشته باش.', 'TrendingUp', 'silver',
   'admin_approval', 'none', 'per_term', 'profile', 90),

  ((select id from public.achievement_categories where slug='participation'),
   'active_najm_student', 'قرآن‌آموز فعال نجم', 'حداقل ده ارزیابی رسمی در طرح نجم ثبت شده است.',
   'در ده جلسه طرح نجم ارزیابی شو.', 'Target', 'bronze',
   'automatic', 'none', 'per_term', 'profile', 100),

  ((select id from public.achievement_categories where slug='participation'),
   'ceremony_supporter', 'همراه مراسم‌های قرآنی', 'مشارکت تأییدشده در سه مراسم دارالقرآن طی یک سال تحصیلی.',
   'در سه مراسم قرآنی مشارکت تأییدشده داشته باش.', 'HandHeart', 'silver',
   'admin_approval', 'nominate', 'per_year', 'profile', 110),

  ((select id from public.achievement_categories where slug='special'),
   'quran_servant', 'خادم قرآن', 'افتخار ویژه برای خدمت ارزشمند و تأییدشده در مسیر قرآن.',
   'این نشان ویژه با نامزدی و تأیید مدیر اعطا می‌شود.', 'Trophy', 'special',
   'manual', 'nominate', 'per_year', 'profile', 120)
on conflict (slug) do nothing;

-- One active, editable rule per seeded achievement.
insert into public.achievement_rules(achievement_id, version, title, logic, conditions)
select d.id, 1, seed.title, 'all', seed.conditions
from (
  values
    ('first_najm_record', 'اولین ارزیابی نجم',
      '[{"metric":"najm_record_count","operator":">=","value":1,"params":{"scope":"lifetime"}}]'::jsonb),
    ('gold_najm_average', 'میانگین طلایی ترم',
      '[{"metric":"session_score_percent","operator":">=","value":90,"params":{"scope":"term"}},{"metric":"najm_record_count","operator":">=","value":4,"params":{"scope":"term"}}]'::jsonb),
    ('silver_najm_average', 'میانگین نقره‌ای ترم',
      '[{"metric":"session_score_percent","operator":">=","value":80,"params":{"scope":"term"}},{"metric":"najm_record_count","operator":">=","value":4,"params":{"scope":"term"}}]'::jsonb),
    ('perfect_najm_exam', 'آزمون کامل نجم',
      '[{"metric":"exam_full_count","operator":">=","value":1,"params":{"scope":"lifetime"}}]'::jsonb),
    ('attendance_streak_5', 'پنج حضور متوالی',
      '[{"metric":"attendance_streak","operator":">=","value":5,"params":{"scope":"lifetime"}}]'::jsonb),
    ('attendance_streak_10', 'ده حضور متوالی',
      '[{"metric":"attendance_streak","operator":">=","value":10,"params":{"scope":"lifetime"}}]'::jsonb),
    ('attendance_rate_90', 'حضور حداقل نود درصد',
      '[{"metric":"attendance_rate","operator":">=","value":90,"params":{"scope":"term"}},{"metric":"najm_record_count","operator":">=","value":5,"params":{"scope":"term"}}]'::jsonb),
    ('najm_homework_star', 'میانگین تکلیف نجم',
      '[{"metric":"homework_average","operator":">=","value":4.5,"params":{"scope":"term"}},{"metric":"najm_record_count","operator":">=","value":3,"params":{"scope":"term"}}]'::jsonb),
    ('najm_upward_trend', 'روند صعودی سه‌جلسه‌ای',
      '[{"metric":"improvement_delta","operator":">=","value":1,"params":{"scope":"term","window":3}},{"metric":"najm_record_count","operator":">=","value":6,"params":{"scope":"term"}}]'::jsonb),
    ('active_najm_student', 'ده ارزیابی رسمی نجم',
      '[{"metric":"najm_record_count","operator":">=","value":10,"params":{"scope":"term"}}]'::jsonb),
    ('ceremony_supporter', 'سه مشارکت تأییدشده در مراسم',
      '[{"metric":"activity_count","operator":">=","value":3,"params":{"scope":"academic_year","activity_type":"ceremony_participation"}}]'::jsonb)
) as seed(slug, title, conditions)
join public.achievement_definitions d on d.slug = seed.slug
where not exists (
  select 1 from public.achievement_rules r where r.achievement_id = d.id
);

-- Backfill final awards/candidates from existing applied Najm history.
-- This does not copy grades/attendance; it only records the resulting achievement.
do $$
declare
  student_term record;
begin
  for student_term in
    select distinct
      r.student_id::bigint as student_id,
      s.term,
      s.academic_year
    from public.najm_session_records r
    join public.najm_sessions s on s.id = r.session_id
    where r.student_id ~ '^[0-9]+$'
      and coalesce(s.is_applied, true) = true
  loop
    perform public.evaluate_student_achievements(
      student_term.student_id,
      student_term.term,
      student_term.academic_year,
      null,
      null
    );
  end loop;
end
$$;

-- --------------------------------------------------------------------------
-- 9) Feature-local API access (no changes to existing project tables/RLS)
-- --------------------------------------------------------------------------

-- Prevent direct public mutation of achievement core; use RPC functions.
revoke all on public.achievement_categories from anon, authenticated;
revoke all on public.achievement_definitions from anon, authenticated;
revoke all on public.achievement_rules from anon, authenticated;
revoke all on public.achievement_candidates from anon, authenticated;
revoke all on public.student_achievements from anon, authenticated;
revoke all on public.achievement_settings from anon, authenticated;
revoke all on public.special_activity_types from anon, authenticated;
revoke all on public.student_special_activities from anon, authenticated;
revoke all on public.app_notifications from anon, authenticated;

-- Internal calculation functions are not public APIs.
revoke all on function public.najm_achievement_metric(bigint, text, jsonb, public.najm_term, text) from public, anon, authenticated;
revoke all on function public.achievement_activity_metric(bigint, text, jsonb, public.najm_term, text) from public, anon, authenticated;
revoke all on function public.achievement_rule_metric(bigint, text, jsonb, public.najm_term, text) from public, anon, authenticated;
revoke all on function public.resolve_achievement_source(uuid, uuid) from public, anon, authenticated;
revoke all on function public.evaluate_achievement_rule(uuid, bigint, public.najm_term, text) from public, anon, authenticated;
revoke all on function public.achievement_scope_key(text, public.najm_term, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.trigger_evaluate_najm_achievements() from public, anon, authenticated;
revoke all on function public.trigger_evaluate_verified_special_activity() from public, anon, authenticated;
revoke all on function public.notify_final_achievement() from public, anon, authenticated;
revoke all on function public.notify_pending_achievement_candidate() from public, anon, authenticated;

-- Role-aware APIs used by the application.
revoke all on function public.evaluate_student_achievements(bigint, public.najm_term, text, uuid, uuid) from public, anon;
revoke all on function public.decide_achievement_candidate(uuid, text, text) from public, anon;
revoke all on function public.nominate_student_achievement(uuid, bigint, text, public.najm_term, text, uuid[], uuid[]) from public, anon;
revoke all on function public.admin_grant_student_achievement(uuid, bigint, text, text, public.najm_term, text, uuid[], uuid[]) from public, anon;
revoke all on function public.revoke_student_achievement(uuid, text) from public, anon;
revoke all on function public.admin_save_special_activity_type(jsonb) from public, anon;
revoke all on function public.record_student_special_activity(uuid, bigint, timestamptz, numeric, text, text, text, text, public.najm_term, text, jsonb) from public, anon;
revoke all on function public.decide_student_special_activity(uuid, text, text) from public, anon;
revoke all on function public.admin_save_achievement_definition(jsonb) from public, anon;
revoke all on function public.admin_publish_achievement_rule(uuid, text, text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_set_achievement_active(uuid, boolean) from public, anon;
revoke all on function public.admin_get_achievement_management_snapshot() from public, anon;
revoke all on function public.get_student_achievement_showcase(bigint, public.najm_term, text) from public, anon;
revoke all on function public.get_my_app_notifications(integer) from public, anon;
revoke all on function public.mark_app_notification_read(uuid) from public, anon;

grant execute on function public.evaluate_student_achievements(bigint, public.najm_term, text, uuid, uuid) to authenticated;
grant execute on function public.decide_achievement_candidate(uuid, text, text) to authenticated;
grant execute on function public.nominate_student_achievement(uuid, bigint, text, public.najm_term, text, uuid[], uuid[]) to authenticated;
grant execute on function public.admin_grant_student_achievement(uuid, bigint, text, text, public.najm_term, text, uuid[], uuid[]) to authenticated;
grant execute on function public.revoke_student_achievement(uuid, text) to authenticated;
grant execute on function public.admin_save_special_activity_type(jsonb) to authenticated;
grant execute on function public.record_student_special_activity(uuid, bigint, timestamptz, numeric, text, text, text, text, public.najm_term, text, jsonb) to authenticated;
grant execute on function public.decide_student_special_activity(uuid, text, text) to authenticated;
grant execute on function public.admin_save_achievement_definition(jsonb) to authenticated;
grant execute on function public.admin_publish_achievement_rule(uuid, text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_set_achievement_active(uuid, boolean) to authenticated;
grant execute on function public.admin_get_achievement_management_snapshot() to authenticated;
grant execute on function public.get_student_achievement_showcase(bigint, public.najm_term, text) to authenticated;
grant execute on function public.get_my_app_notifications(integer) to authenticated;
grant execute on function public.mark_app_notification_read(uuid) to authenticated;

commit;
