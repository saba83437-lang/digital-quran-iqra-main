-- بررسی فقط‌خواندنی هسته افتخارات نسخه ۳
-- این Query هیچ داده‌ای را ایجاد، ویرایش یا حذف نمی‌کند.

select jsonb_pretty(
  jsonb_build_object(
    'status', case
      when (select count(*) from public.achievement_categories) >= 7
       and (select count(*) from public.special_activity_types) >= 6
       and (select count(*) from public.achievement_definitions) >= 12
       and (select count(*) from public.achievement_rules where is_active) >= 11
       and (select count(*) from public.achievement_settings) = 1
      then 'OK'
      else 'CHECK_REQUIRED'
    end,
    'counts', jsonb_build_object(
      'categories', (select count(*) from public.achievement_categories),
      'special_activity_types', (select count(*) from public.special_activity_types),
      'achievement_definitions', (select count(*) from public.achievement_definitions),
      'active_rules', (select count(*) from public.achievement_rules where is_active),
      'student_achievements', (select count(*) from public.student_achievements),
      'pending_candidates', (
        select count(*) from public.achievement_candidates where status = 'pending'
      ),
      'verified_special_activities', (
        select count(*) from public.student_special_activities where status = 'verified'
      ),
      'notifications', (select count(*) from public.app_notifications)
    ),
    'source_fields', jsonb_build_object(
      'achievement_source', exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'student_achievements'
          and column_name = 'achievement_source'
      ),
      'grant_method', exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'student_achievements'
          and column_name = 'grant_method'
      ),
      'candidate_source', exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'achievement_candidates'
          and column_name = 'achievement_source'
      )
    ),
    'key_functions', jsonb_build_object(
      'evaluate_student_achievements',
        to_regprocedure('public.evaluate_student_achievements(bigint,public.najm_term,text,uuid,uuid)') is not null,
      'admin_direct_grant',
        to_regprocedure('public.admin_grant_student_achievement(uuid,bigint,text,text,public.najm_term,text,uuid[],uuid[])') is not null,
      'teacher_nomination',
        to_regprocedure('public.nominate_student_achievement(uuid,bigint,text,public.najm_term,text,uuid[],uuid[])') is not null,
      'record_special_activity',
        to_regprocedure('public.record_student_special_activity(uuid,bigint,timestamptz,numeric,text,text,text,text,public.najm_term,text,jsonb)') is not null
    ),
    'key_triggers', jsonb_build_object(
      'najm_evaluation', exists (
        select 1 from pg_trigger where tgname = 'trg_evaluate_najm_achievements'
      ),
      'special_activity_evaluation', exists (
        select 1 from pg_trigger where tgname = 'trg_evaluate_verified_special_activity'
      ),
      'award_notification', exists (
        select 1 from pg_trigger where tgname = 'trg_notify_final_achievement'
      ),
      'candidate_notification', exists (
        select 1 from pg_trigger where tgname = 'trg_notify_pending_achievement_candidate'
      )
    )
  )
) as achievement_core_verification;
