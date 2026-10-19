-- ============================================================================
-- مرحله ۱۹ — Verification فقط‌خواندنی پیوست و زمان‌بندی پیام
-- ============================================================================

with checks as (
  select 10 as sort_order,'existing_messages_preserved'::text as item,
         count(*)>=19 and count(*) filter(where sender_user_id is null
           or recipient_user_id is null or campaign_id is null)=0 as passed,
         'rows='||count(*)::text||' | campaigns='||count(distinct campaign_id)::text||
         ' | trusted_null='||count(*) filter(where sender_user_id is null
           or recipient_user_id is null or campaign_id is null)::text as details
  from public.messages

  union all
  select 20,'delivery_schema',count(*)=6,
         string_agg(column_name||':'||udt_name||':nullable='||is_nullable,
           ' ؛ ' order by ordinal_position)
  from information_schema.columns
  where table_schema='public' and table_name='messages'
    and column_name in (
      'scheduled_at','attachments','delivery_status','delivered_at','cancelled_at','campaign_id'
    )

  union all
  select 30,'new_message_constraints',count(*)=3 and bool_and(convalidated),
         'count='||count(*)::text||'/3'
  from pg_catalog.pg_constraint
  where conrelid='public.messages'::regclass and conname in (
    'messages_attachments_valid','messages_delivery_status_check',
    'messages_delivery_state_consistency'
  )

  union all
  select 40,'old_fake_constraints_removed',count(*)=0,
         'remaining='||count(*)::text
  from pg_catalog.pg_constraint
  where conrelid='public.messages'::regclass
    and conname in ('messages_no_fake_schedule','messages_no_fake_attachments')

  union all
  select 50,'existing_delivery_state_valid',count(*) filter(where
         delivery_status='delivered' and delivered is true and delivered_at is not null)=count(*),
         'delivered='||count(*) filter(where delivery_status='delivered')::text||
         ' | scheduled='||count(*) filter(where delivery_status='scheduled')::text||
         ' | cancelled='||count(*) filter(where delivery_status='cancelled')::text
  from public.messages

  union all
  select 60,'participant_policy_hides_pending',count(*)=1
         and bool_and(qual like '%delivery_status%delivered%'),
         coalesce(string_agg(policyname||':'||qual,' ؛ '),'missing')
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='messages'
    and policyname='secure_messages_participant_read'

  union all
  select 70,'message_policy_and_grants',
         (select count(*) from pg_catalog.pg_policies
          where schemaname='public' and tablename='messages')=2
         and has_table_privilege('authenticated','public.messages','SELECT')
         and not has_table_privilege('authenticated','public.messages','INSERT')
         and not has_table_privilege('authenticated','public.messages','UPDATE')
         and not has_table_privilege('authenticated','public.messages','DELETE')
         and not has_table_privilege('anon','public.messages','SELECT'),
         'policies=2 | authenticated=SELECT only | anon=closed'

  union all
  select 80,'secure_message_v2_api',
         to_regprocedure(
           'public.secure_send_message_v2(text,text,text,text,text,text,bigint,jsonb,timestamptz)'
         ) is not null
         and has_function_privilege('authenticated',
           'public.secure_send_message_v2(text,text,text,text,text,text,bigint,jsonb,timestamptz)','EXECUTE')
         and not has_function_privilege('anon',
           'public.secure_send_message_v2(text,text,text,text,text,text,bigint,jsonb,timestamptz)','EXECUTE'),
         'authenticated only'

  union all
  select 90,'schedule_cancel_delivery_apis',count(*)=2
         and count(*) filter(where proc.proname='secure_cancel_scheduled_message'
           and has_function_privilege('authenticated',proc.oid,'EXECUTE'))=1
         and count(*) filter(where has_function_privilege('anon',proc.oid,'EXECUTE'))=0,
         'functions='||count(*)::text||'/2'
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace and proc.proname in (
    'deliver_due_scheduled_messages','secure_cancel_scheduled_message'
  )

  union all
  select 100,'pg_cron_scheduler',
         exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')
         and count(*)=1 and bool_and(active)
         and not has_schema_privilege('authenticated','cron','USAGE'),
         'active_jobs='||count(*)::text||' | auth_cron_usage='||
           has_schema_privilege('authenticated','cron','USAGE')::text
  from cron.job where jobname='darolquran-deliver-scheduled-messages'

  union all
  select 110,'private_attachment_bucket',count(*)=1 and bool_and(public=false)
         and bool_and(file_size_limit=10485760),
         'public='||bool_and(public)::text||
         ' | objects='||(select count(*) from storage.objects
           where bucket_id='message-attachments')::text||
         ' | limit='||max(file_size_limit)::text
  from storage.buckets where id='message-attachments'

  union all
  select 120,'attachment_storage_policies',count(*)=12
         and count(*) filter(where permissive='RESTRICTIVE')=8,
         'count='||count(*)::text||'/12 | restrictive='||
         count(*) filter(where permissive='RESTRICTIVE')::text||'/8'
  from pg_catalog.pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'p19_%'

  union all
  select 130,'attachment_helpers',count(*)=3
         and count(*) filter(where has_function_privilege('anon',proc.oid,'EXECUTE'))=0,
         'count='||count(*)::text||'/3'
  from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace and proc.proname in (
    'message_attachment_referenced','can_read_message_attachment',
    'can_delete_message_attachment'
  )

  union all
  select 140,'attachment_validation_trigger',count(*)=1,
         coalesce(string_agg(tgname,' ؛ '),'missing')
  from pg_catalog.pg_trigger
  where tgrelid='public.messages'::regclass
    and tgname='trg_validate_message_attachment_objects' and not tgisinternal

  union all
  select 150,'clean_start_no_fake_feature_data',
         count(*) filter(where scheduled_at is not null)=0
         and count(*) filter(where jsonb_array_length(attachments)>0)=0,
         'scheduled='||count(*) filter(where scheduled_at is not null)::text||
         ' | attached='||count(*) filter(where jsonb_array_length(attachments)>0)::text
  from public.messages

  union all
  select 160,'previous_storage_preserved',
         (select count(*) from storage.objects where bucket_id='student-files')=20
         and (select count(*) from storage.objects where bucket_id='assignments')=3
         and (select count(*) from storage.objects where bucket_id='finance-receipts')=1
         and (select count(*) from storage.objects where bucket_id='najm-posters')=1,
         'student-files=20 | assignments=3 | finance=1 | najm-posters=1'

  union all
  select 170,'previous_security_preserved',
         (select count(*) from pg_catalog.pg_policies where schemaname='public'
           and tablename in (
             'admins','teachers','students','parents','student_parents','classes',
             'najm_terms','najm_settings','najm_score_items','najm_sessions',
             'najm_session_records','attendance','grades','student_documents'
           ))=40
         and (select count(*) from pg_catalog.pg_policies
              where schemaname='public' and policyname like 'p15_video%')=6
         and (select count(*) from pg_catalog.pg_policies
              where schemaname='storage' and policyname like 'p15_%')=20,
         'phase14=40 | video=6 | p15_storage=20'
)
select item,passed,details from checks order by sort_order;
