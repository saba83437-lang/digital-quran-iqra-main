-- بررسی خلاصه و خوانا؛ هیچ داده‌ای تغییر نمی‌کند.
select
  case
    when (select count(*) from public.achievement_categories) >= 7
     and (select count(*) from public.special_activity_types) >= 6
     and (select count(*) from public.achievement_definitions) >= 12
     and (select count(*) from public.achievement_rules where is_active) >= 11
     and to_regprocedure('public.evaluate_student_achievements(bigint,public.najm_term,text,uuid,uuid)') is not null
    then 'OK'
    else 'CHECK_REQUIRED'
  end as status,
  (select count(*) from public.achievement_categories) as categories,
  (select count(*) from public.special_activity_types) as activity_types,
  (select count(*) from public.achievement_definitions) as achievements,
  (select count(*) from public.achievement_rules where is_active) as active_rules,
  (select count(*) from public.student_achievements) as awarded_records,
  (select count(*) from public.achievement_candidates where status = 'pending') as pending_candidates;
