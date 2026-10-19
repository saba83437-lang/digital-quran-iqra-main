-- ============================================================================
-- FINAL_EXECUTABLE — مرحله ۱۹: پیوست خصوصی و زمان‌بندی واقعی پیام‌ها
-- تاریخ: 2026-07-31
--
-- * ۱۹ پیام/کمپین موجود بدون تغییر محتوایی حفظ می‌شوند.
-- * secure_send_message قدیمی برای سازگاری ارسال فوری حفظ می‌شود.
-- * UI جدید از secure_send_message_v2 استفاده می‌کند.
-- * Scheduler هر دقیقه پیام‌های موعدرسیده را تحویل می‌دهد.
-- ============================================================================

begin;
set local lock_timeout='10s';
set local statement_timeout='120s';

-- --------------------------------------------------------------------------
-- 1) Guard
-- --------------------------------------------------------------------------
do $preflight_guard$
declare
  trusted_null_count integer;
  message_policy_count integer;
  attachment_nonempty integer;
  scheduled_nonnull integer;
begin
  if to_regprocedure(
       'public.secure_send_message_v2(text,text,text,text,text,text,bigint,jsonb,timestamptz)'
     ) is not null
     or to_regclass('storage.buckets') is null
     or exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='messages'
         and column_name='delivery_status') then
    raise exception 'Phase 19 already exists or is partial; verify instead of re-running.';
  end if;

  select count(*) filter(where
    sender_user_id is null or recipient_user_id is null or campaign_id is null
  ),
  count(*) filter(where jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)>0),
  count(*) filter(where scheduled_at is not null)
  into trusted_null_count,attachment_nonempty,scheduled_nonnull
  from public.messages;

  if (select count(*) from public.messages)<19
     or trusted_null_count<>0 or attachment_nonempty<>0 or scheduled_nonnull<>0
     or exists(select 1 from public.messages where not coalesce(delivered,false)) then
    raise exception
      'Phase 19 aborted: message snapshot changed (rows %, trusted null %, attachments %, scheduled %).',
      (select count(*) from public.messages),trusted_null_count,attachment_nonempty,scheduled_nonnull;
  end if;

  select count(*) into message_policy_count from pg_catalog.pg_policies
  where schemaname='public' and tablename='messages';
  if message_policy_count<>2
     or not exists(select 1 from pg_catalog.pg_policies
       where schemaname='public' and tablename='messages'
         and policyname='secure_messages_participant_read')
     or not (select relrowsecurity from pg_catalog.pg_class where oid='public.messages'::regclass)
     or not has_table_privilege('authenticated','public.messages','SELECT')
     or has_table_privilege('authenticated','public.messages','INSERT')
     or has_table_privilege('anon','public.messages','SELECT') then
    raise exception 'Phase 19 aborted: secure message policy/grant snapshot changed.';
  end if;

  if to_regprocedure('public.secure_send_message(text,text,text,text,text,text,bigint)') is null
     or to_regprocedure('public.secure_update_message_state(bigint,boolean,boolean,boolean,boolean,boolean)') is null
     or to_regprocedure('public.app_is_admin()') is null then
    raise exception 'Phase 19 aborted: required secure message/Auth APIs are missing.';
  end if;

  if exists(select 1 from storage.buckets where id='message-attachments')
     or exists(select 1 from pg_catalog.pg_policies policy
       where policy.schemaname='storage' and policy.tablename='objects'
         and (policy.policyname like 'p19_%'
           or coalesce(policy.qual,'') like '%message-attachments%'
           or coalesce(policy.with_check,'') like '%message-attachments%')) then
    raise exception 'Phase 19 aborted: message attachment Storage already exists.';
  end if;

  if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')
     or to_regclass('cron.job') is not null then
    raise exception 'Phase 19 aborted: pg_cron state changed; re-audit scheduler jobs.';
  end if;
end
$preflight_guard$;

-- --------------------------------------------------------------------------
-- 2) Scheduler extension
-- --------------------------------------------------------------------------
create extension if not exists pg_cron;

-- --------------------------------------------------------------------------
-- 3) Attachment validation
-- --------------------------------------------------------------------------
create function public.valid_message_attachments(input jsonb,sender_id uuid)
returns boolean
language plpgsql
immutable
set search_path=public,pg_temp
as $function$
declare
  item jsonb;
  path_value text;
  name_value text;
  mime_value text;
  size_value bigint;
  total_size bigint:=0;
begin
  if input is null then return true; end if;
  if jsonb_typeof(input)<>'array' or jsonb_array_length(input)>5 then return false; end if;

  for item in select value from jsonb_array_elements(input)
  loop
    if jsonb_typeof(item)<>'object' then return false; end if;
    path_value:=nullif(trim(item->>'path'),'');
    name_value:=nullif(trim(item->>'name'),'');
    mime_value:=lower(nullif(trim(item->>'mime_type'),''));
    if coalesce(item->>'size','')!~'^\d{1,10}$' then return false; end if;
    size_value:=(item->>'size')::bigint;
    total_size:=total_size+size_value;

    if path_value is null or name_value is null or mime_value is null
       or sender_id is null
       or split_part(path_value,'/',1)<>sender_id::text
       or path_value~*'^https?://'
       or path_value like '%..%'
       or length(path_value)>700
       or length(name_value)>255
       or size_value<1 or size_value>10485760
       or total_size>26214400
       or mime_value not in (
         'image/jpeg','image/png','image/webp','image/gif',
         'audio/mpeg','audio/wav','audio/webm','audio/ogg','audio/mp4',
         'application/pdf','text/plain',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation'
       ) then return false;
    end if;
  end loop;
  return true;
end
$function$;

create function public.validate_message_attachment_objects()
returns trigger
language plpgsql
security definer
set search_path=public,storage,pg_temp
as $function$
declare item jsonb;object_row storage.objects%rowtype;declared_size bigint;
begin
  if not public.valid_message_attachments(new.attachments,new.sender_user_id) then
    raise exception 'Invalid private message attachments.';
  end if;
  for item in select value from jsonb_array_elements(coalesce(new.attachments,'[]'::jsonb))
  loop
    select * into object_row from storage.objects object
    where object.bucket_id='message-attachments' and object.name=item->>'path';
    if not found then raise exception 'Message attachment object does not exist.'; end if;
    declared_size:=(item->>'size')::bigint;
    if coalesce(object_row.metadata->>'size','')~'^\d+$'
       and (object_row.metadata->>'size')::bigint<>declared_size then
      raise exception 'Message attachment size mismatch.';
    end if;
  end loop;
  return new;
end
$function$;

revoke all on function public.valid_message_attachments(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.validate_message_attachment_objects() from public,anon,authenticated;

-- --------------------------------------------------------------------------
-- 4) Message schema and status model
-- --------------------------------------------------------------------------
alter table public.messages
  drop constraint messages_no_fake_schedule,
  drop constraint messages_no_fake_attachments;

alter table public.messages
  alter column scheduled_at type timestamptz
    using nullif(trim(scheduled_at),'')::timestamptz;

update public.messages set attachments='[]'::jsonb where attachments is null;

alter table public.messages
  alter column attachments set default '[]'::jsonb,
  alter column attachments set not null,
  add column delivery_status text not null default 'delivered',
  add column delivered_at timestamptz default now(),
  add column cancelled_at timestamptz;

update public.messages
set delivery_status='delivered',
    delivered=true,
    delivered_at=coalesce(delivered_at,created_at,now()),
    cancelled_at=null;

alter table public.messages
  add constraint messages_attachments_valid
    check(public.valid_message_attachments(attachments,sender_user_id)),
  add constraint messages_delivery_status_check
    check(delivery_status in ('scheduled','delivered','cancelled')),
  add constraint messages_delivery_state_consistency check(
    (delivery_status='delivered' and delivered is true and delivered_at is not null
      and cancelled_at is null)
    or
    (delivery_status='scheduled' and delivered is false and coalesce(unread,false) is false
      and scheduled_at is not null and delivered_at is null and cancelled_at is null)
    or
    (delivery_status='cancelled' and delivered is false and coalesce(unread,false) is false
      and delivered_at is null and cancelled_at is not null)
  );

create index messages_delivery_due_idx
  on public.messages(delivery_status,scheduled_at)
  where delivery_status='scheduled';
create index messages_sender_status_idx
  on public.messages(sender_user_id,delivery_status,created_at desc);

create trigger trg_validate_message_attachment_objects
before insert or update of attachments,sender_user_id on public.messages
for each row execute function public.validate_message_attachment_objects();

-- Recipient cannot see scheduled/cancelled deliveries; sender/admin can.
drop policy secure_messages_participant_read on public.messages;
create policy secure_messages_participant_read on public.messages
for select to authenticated
using(
  sender_user_id=auth.uid()
  or (recipient_user_id=auth.uid() and delivery_status='delivered')
);

-- --------------------------------------------------------------------------
-- 5) Secure send v2 (same trusted target matrix + attachments/scheduling)
-- --------------------------------------------------------------------------
create function public.secure_send_message_v2(
  p_target_type text,
  p_target_id text,
  p_subject text,
  p_content text,
  p_priority text default 'normal',
  p_topic text default 'other',
  p_parent_message_id bigint default null,
  p_attachments jsonb default '[]'::jsonb,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,storage,pg_temp
as $function$
declare
  sender_profile public.user_roles%rowtype;
  new_campaign_id uuid:=gen_random_uuid();
  inserted_count integer:=0;
  normalized_target text:=lower(trim(coalesce(p_target_type,'')));
  normalized_target_id text:=nullif(trim(coalesce(p_target_id,'')),'');
  normalized_attachments jsonb:=coalesce(p_attachments,'[]'::jsonb);
  is_scheduled boolean:=p_scheduled_at is not null;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into sender_profile from public.user_roles
  where id=auth.uid() and is_active=true limit 1;
  if not found then raise exception 'Active application profile is required.'; end if;

  if normalized_target not in (
    'admin','teacher','student','parent','all','all_teachers','all_students','all_parents',
    'class_students','class_parents'
  ) then raise exception 'Unsupported message target.'; end if;
  if normalized_target in ('teacher','student','parent','class_students','class_parents')
     and normalized_target_id is null then raise exception 'Target id is required.'; end if;
  if length(trim(coalesce(p_subject,'')))=0 or length(p_subject)>200 then
    raise exception 'Message subject is required and must be at most 200 characters.';
  end if;
  if length(trim(coalesce(p_content,'')))=0 or length(p_content)>10000 then
    raise exception 'Message content is required and must be at most 10000 characters.';
  end if;
  if not public.valid_message_attachments(normalized_attachments,auth.uid()) then
    raise exception 'Invalid message attachments.';
  end if;
  if is_scheduled then
    if sender_profile.role<>'admin' then raise exception 'Only admin can schedule messages.'; end if;
    if p_scheduled_at<now()+interval '1 minute'
       or p_scheduled_at>now()+interval '366 days' then
      raise exception 'Scheduled time must be between one minute and one year in the future.';
    end if;
  end if;

  if p_parent_message_id is not null and not exists(
    select 1 from public.messages message
    where message.id=p_parent_message_id and message.delivery_status='delivered'
      and (public.app_is_admin() or message.sender_user_id=auth.uid()
        or message.recipient_user_id=auth.uid())
  ) then raise exception 'Reply root message is not accessible.'; end if;

  with candidates as (
    select role_row.id recipient_user_id,role_row.role recipient_role,
      role_row.admin_id,role_row.teacher_id,role_row.student_id,role_row.parent_id
    from public.user_roles role_row
    where role_row.is_active=true and role_row.id<>auth.uid() and (
      normalized_target='all'
      or (normalized_target='all_teachers' and role_row.role='teacher')
      or (normalized_target='all_students' and role_row.role='student')
      or (normalized_target='all_parents' and role_row.role='parent')
      or (normalized_target='class_students' and role_row.role='student' and exists(
        select 1 from public.students student where student.id=role_row.student_id
          and student.class_id=public.secure_message_safe_bigint(normalized_target_id)))
      or (normalized_target='class_parents' and role_row.role='parent' and exists(
        select 1 from public.student_parents link
        join public.students student on student.id=link.student_id
        where link.parent_id=role_row.parent_id
          and student.class_id=public.secure_message_safe_bigint(normalized_target_id)))
      or (normalized_target=role_row.role and (
        (role_row.role='admin' and (normalized_target_id is null
          or normalized_target_id='admin' or role_row.admin_id::text=normalized_target_id))
        or (role_row.role='teacher' and role_row.teacher_id=
          public.secure_message_safe_bigint(normalized_target_id))
        or (role_row.role='student' and role_row.student_id=
          public.secure_message_safe_bigint(normalized_target_id))
        or (role_row.role='parent' and (
          role_row.parent_id::text=normalized_target_id or exists(
            select 1 from public.student_parents link
            where link.parent_id=role_row.parent_id
              and link.student_id=public.secure_message_safe_bigint(normalized_target_id))))
      ))
    )
  ),authorized as (
    select candidate.* from candidates candidate where
      sender_profile.role='admin'
      or (sender_profile.role='teacher' and (
        candidate.recipient_role='admin'
        or (candidate.recipient_role='student' and
          public.teacher_can_access_student(candidate.student_id))
        or (candidate.recipient_role='parent' and exists(
          select 1 from public.student_parents link
          where link.parent_id=candidate.parent_id
            and public.teacher_can_access_student(link.student_id)))))
      or (sender_profile.role='student' and (
        candidate.recipient_role='admin'
        or (candidate.recipient_role='teacher' and exists(
          select 1 from public.students student
          join public.classes class_row on class_row.id=student.class_id
          where student.id=sender_profile.student_id
            and class_row.teacher_id=candidate.teacher_id and class_row.deleted_at is null))))
      or (sender_profile.role='parent' and (
        candidate.recipient_role='admin'
        or (candidate.recipient_role='teacher' and exists(
          select 1 from public.student_parents link
          join public.students student on student.id=link.student_id
          join public.classes class_row on class_row.id=student.class_id
          where link.parent_id=sender_profile.parent_id
            and class_row.teacher_id=candidate.teacher_id and class_row.deleted_at is null))))
  ),inserted as (
    insert into public.messages(
      sender_user_id,recipient_user_id,campaign_id,from_name,from_role,to_id,to_role,
      subject,content,date,unread,priority,topic,replied,delivered,parent_message_id,
      scheduled_at,channels,attachments,delivery_status,delivered_at,cancelled_at
    )
    select auth.uid(),authorized.recipient_user_id,new_campaign_id,
      coalesce(nullif(trim(sender_profile.name),''),case sender_profile.role
        when 'admin' then 'مدیریت مرکز' when 'teacher' then 'استاد'
        when 'student' then 'قرآن‌آموز' else 'ولی قرآن‌آموز' end),
      sender_profile.role,
      case when normalized_target in ('class_students','class_parents') then normalized_target_id
        when normalized_target like 'all%' or normalized_target='all' then null
        when authorized.recipient_role='admin' then 'admin'
        when authorized.recipient_role='teacher' then authorized.teacher_id::text
        when authorized.recipient_role='student' then authorized.student_id::text
        else authorized.parent_id::text end,
      case when normalized_target in (
        'all','all_teachers','all_students','all_parents','class_students','class_parents'
      ) then normalized_target else authorized.recipient_role end,
      trim(p_subject),trim(p_content),
      to_char(coalesce(p_scheduled_at,now()) at time zone 'Asia/Tehran','YYYY/MM/DD'),
      not is_scheduled,coalesce(nullif(trim(p_priority),''),'normal'),
      coalesce(nullif(trim(p_topic),''),'other'),false,not is_scheduled,p_parent_message_id,
      p_scheduled_at,jsonb_build_array('internal'),normalized_attachments,
      case when is_scheduled then 'scheduled' else 'delivered' end,
      case when is_scheduled then null else now() end,null
    from authorized
    returning id
  ) select count(*) into inserted_count from inserted;

  if inserted_count=0 then
    raise exception 'No active and authorized Auth recipient was found.';
  end if;
  return jsonb_build_object(
    'campaign_id',new_campaign_id,'recipient_count',inserted_count,
    'delivery_status',case when is_scheduled then 'scheduled' else 'delivered' end,
    'scheduled_at',p_scheduled_at
  );
end
$function$;

revoke all on function public.secure_send_message_v2(
  text,text,text,text,text,text,bigint,jsonb,timestamptz
) from public,anon;
grant execute on function public.secure_send_message_v2(
  text,text,text,text,text,text,bigint,jsonb,timestamptz
) to authenticated;

-- --------------------------------------------------------------------------
-- 6) Delivery/cancel APIs and cron job
-- --------------------------------------------------------------------------
create function public.deliver_due_scheduled_messages()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare delivered_count integer;
begin
  with due as (
    update public.messages message
    set delivery_status='delivered',delivered=true,unread=true,
        delivered_at=now(),cancelled_at=null,
        date=to_char(now() at time zone 'Asia/Tehran','YYYY/MM/DD')
    where message.delivery_status='scheduled' and message.scheduled_at<=now()
    returning message.id
  ) select count(*) into delivered_count from due;
  return delivered_count;
end
$function$;

create function public.secure_cancel_scheduled_message(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare cancelled_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  with cancelled as (
    update public.messages message
    set delivery_status='cancelled',delivered=false,unread=false,
        delivered_at=null,cancelled_at=now()
    where message.campaign_id=p_campaign_id and message.delivery_status='scheduled'
      and (public.app_is_admin() or message.sender_user_id=auth.uid())
    returning message.id
  ) select count(*) into cancelled_count from cancelled;
  if cancelled_count=0 then raise exception 'Scheduled campaign not found or not cancellable.'; end if;
  return cancelled_count;
end
$function$;

revoke all on function public.deliver_due_scheduled_messages() from public,anon,authenticated;
revoke all on function public.secure_cancel_scheduled_message(uuid) from public,anon;
grant execute on function public.secure_cancel_scheduled_message(uuid) to authenticated;

select cron.schedule(
  'darolquran-deliver-scheduled-messages',
  '* * * * *',
  'select public.deliver_due_scheduled_messages();'
);

-- API roles must never manage cron jobs.
revoke all on schema cron from public,anon,authenticated;
revoke all on all tables in schema cron from public,anon,authenticated;
revoke execute on all functions in schema cron from public,anon,authenticated;

-- --------------------------------------------------------------------------
-- 7) Private Storage authorization
-- --------------------------------------------------------------------------
create function public.message_attachment_referenced(
  object_name text,statuses text[] default array['scheduled','delivered']::text[]
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select exists(
    select 1 from public.messages message
    where message.delivery_status=any(statuses)
      and exists(select 1 from jsonb_array_elements(message.attachments) item
        where item->>'path'=object_name)
  )
$function$;

create function public.can_read_message_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or split_part(object_name,'/',1)=auth.uid()::text
    or exists(
      select 1 from public.messages message
      where exists(select 1 from jsonb_array_elements(message.attachments) item
        where item->>'path'=object_name)
        and (message.sender_user_id=auth.uid()
          or (message.recipient_user_id=auth.uid() and message.delivery_status='delivered'))
    ),false
  )
$function$;

create function public.can_delete_message_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or (split_part(object_name,'/',1)=auth.uid()::text
      and not public.message_attachment_referenced(object_name)),false
  )
$function$;

revoke all on function public.message_attachment_referenced(text,text[]) from public,anon,authenticated;
revoke all on function public.can_read_message_attachment(text) from public,anon;
revoke all on function public.can_delete_message_attachment(text) from public,anon;
grant execute on function public.can_read_message_attachment(text) to authenticated;
grant execute on function public.can_delete_message_attachment(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'message-attachments','message-attachments',false,10485760,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/mpeg','audio/wav','audio/webm','audio/ogg','audio/mp4',
    'application/pdf','text/plain','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
);

create policy p19_message_files_select on storage.objects for select to authenticated
using(bucket_id='message-attachments' and public.can_read_message_attachment(name));
create policy p19_message_files_insert on storage.objects for insert to authenticated
with check(bucket_id='message-attachments' and split_part(name,'/',1)=auth.uid()::text);
create policy p19_message_files_update on storage.objects for update to authenticated
using(bucket_id='message-attachments' and public.app_is_admin())
with check(bucket_id='message-attachments' and public.app_is_admin());
create policy p19_message_files_delete on storage.objects for delete to authenticated
using(bucket_id='message-attachments' and public.can_delete_message_attachment(name));

create policy p19_message_files_anon_select on storage.objects as restrictive for select to anon
using(bucket_id<>'message-attachments');
create policy p19_message_files_anon_insert on storage.objects as restrictive for insert to anon
with check(bucket_id<>'message-attachments');
create policy p19_message_files_anon_update on storage.objects as restrictive for update to anon
using(bucket_id<>'message-attachments') with check(bucket_id<>'message-attachments');
create policy p19_message_files_anon_delete on storage.objects as restrictive for delete to anon
using(bucket_id<>'message-attachments');

create policy p19_message_files_auth_select on storage.objects as restrictive for select to authenticated
using(bucket_id<>'message-attachments' or public.can_read_message_attachment(name));
create policy p19_message_files_auth_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'message-attachments' or split_part(name,'/',1)=auth.uid()::text);
create policy p19_message_files_auth_update on storage.objects as restrictive for update to authenticated
using(bucket_id<>'message-attachments' or public.app_is_admin())
with check(bucket_id<>'message-attachments' or public.app_is_admin());
create policy p19_message_files_auth_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'message-attachments' or public.can_delete_message_attachment(name));

-- --------------------------------------------------------------------------
-- 8) Postflight
-- --------------------------------------------------------------------------
do $postflight_guard$
declare
  p19_policy_count integer;
  message_policy_count integer;
  cron_job_count integer;
begin
  select count(*) into p19_policy_count from pg_catalog.pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'p19_%';
  select count(*) into message_policy_count from pg_catalog.pg_policies
  where schemaname='public' and tablename='messages';
  select count(*) into cron_job_count from cron.job
  where jobname='darolquran-deliver-scheduled-messages' and active=true;

  if (select count(*) from public.messages)<19
     or exists(select 1 from public.messages where delivery_status<>'delivered')
     or exists(select 1 from public.messages where attachments<>'[]'::jsonb)
     or message_policy_count<>2
     or p19_policy_count<>12
     or not exists(select 1 from storage.buckets
       where id='message-attachments' and public=false and file_size_limit=10485760)
     or to_regprocedure(
       'public.secure_send_message_v2(text,text,text,text,text,text,bigint,jsonb,timestamptz)'
     ) is null
     or to_regprocedure('public.secure_cancel_scheduled_message(uuid)') is null
     or not exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')
     or cron_job_count<>1
     or has_schema_privilege('authenticated','cron','USAGE')
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='public' and tablename in (
           'admins','teachers','students','parents','student_parents','classes',
           'najm_terms','najm_settings','najm_score_items','najm_sessions',
           'najm_session_records','attendance','grades','student_documents'
         ))<>40
     or (select count(*) from pg_catalog.pg_policies
         where schemaname='storage' and policyname like 'p15_%')<>20 then
    raise exception
      'Phase 19 postflight failed (message policies %, storage policies %, cron jobs %).',
      message_policy_count,p19_policy_count,cron_job_count;
  end if;
end
$postflight_guard$;

commit;
