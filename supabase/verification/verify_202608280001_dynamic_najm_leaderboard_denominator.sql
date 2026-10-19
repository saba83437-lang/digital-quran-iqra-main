-- =============================================================================
-- Package 1A — READ-ONLY VERIFICATION
-- Run after the migration. Expected: all boolean checks are true.
-- =============================================================================

with inspected as (
  select
    pg_get_functiondef(
      'public.get_achievement_leaderboard(text,bigint,public.najm_term,text,integer)'::regprocedure
    ) as definition,
    public.najm_max_session_score() as current_cap
)
select
  current_cap,
  current_cap > 0 as cap_is_valid,
  definition like '%nullif(public.najm_max_session_score(), 0)%' as uses_dynamic_denominator,
  not (definition like '%100/30%' or definition like '%100 / 30%') as fixed_30_removed,
  has_function_privilege(
    'authenticated',
    'public.get_achievement_leaderboard(text,bigint,public.najm_term,text,integer)',
    'EXECUTE'
  ) as authenticated_can_execute,
  not has_function_privilege(
    'anon',
    'public.get_achievement_leaderboard(text,bigint,public.najm_term,text,integer)',
    'EXECUTE'
  ) as anon_cannot_execute,
  round(15::numeric * 100 / nullif(current_cap, 0), 1) as sample_percent_for_score_15
from inspected;
