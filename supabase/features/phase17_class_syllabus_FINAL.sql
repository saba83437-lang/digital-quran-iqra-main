-- ============================================================================
-- FINAL_EXECUTABLE — مرحله ۱۷: برنامه آموزشی واقعی کلاس‌ها
-- تاریخ: 2026-07-30
--
-- داده اولیه ساخته نمی‌شود؛ هیچ سرفصل نمایشی یا Hardcoded وارد دیتابیس نمی‌شود.
-- Write فقط از RPC امن مدیر/استاد و Read با RLS نقش‌محور انجام می‌شود.
-- ============================================================================

begin;
set local lock_timeout='10s';
set local statement_timeout='90s';

-- --------------------------------------------------------------------------
-- 1) Guard
-- --------------------------------------------------------------------------
do $preflight_guard$
declare
  helper_count integer;
  active_profile_count integer;
begin
  if to_regclass('public.class_syllabus_items') is not null
     or to_regprocedure('public.secure_save_class_syllabus_item(bigint,text,text,text,date,integer,uuid)') is not null then
    raise exception 'Phase 17 already exists or is partial; verify instead of re-running.';
  end if;

  if (select count(*) from public.classes)<>11
     or (select count(*) from public.classes where deleted_at is null and coalesce(is_active,true))<>5
     or (select count(*) from public.classes where deleted_at is not null)<>6
     or (select count(*) from public.students student left join public.classes class_row
         on class_row.id=student.class_id
         where student.class_id is not null and class_row.id is null)<>0 then
    raise exception 'Phase 17 aborted: class snapshot changed.';
  end if;

  select count(*) into active_profile_count from public.user_roles where is_active=true;
  if active_profile_count<>4 then
    raise exception 'Phase 17 aborted: active Auth profile snapshot changed (%).',active_profile_count;
  end if;

  select count(*) into helper_count from pg_catalog.pg_proc proc
  where proc.pronamespace='public'::regnamespace and proc.proname in (
    'app_is_admin','current_app_role','current_teacher_id','current_student_id',
    'current_parent_id','teacher_owns_class','app_can_read_class'
  );
  if helper_count<>7
     or to_regprocedure('public.audit_sensitive_admin_change()') is null then
    raise exception 'Phase 17 aborted: required authorization/audit helpers are missing.';
  end if;
end
$preflight_guard$;

-- --------------------------------------------------------------------------
-- 2) Table and integrity
-- --------------------------------------------------------------------------
create table public.class_syllabus_items(
  id uuid primary key default gen_random_uuid(),
  class_id bigint not null references public.classes(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'planned'
    check(status in ('planned','in_progress','completed')),
  target_date date,
  sort_order integer not null default 10 check(sort_order>=0),
  is_active boolean not null default true,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_syllabus_title_length
    check(length(trim(title)) between 2 and 200),
  constraint class_syllabus_description_length
    check(length(description)<=5000),
  constraint class_syllabus_completion_consistency
    check(
      (status='completed' and completed_at is not null)
      or (status<>'completed' and completed_at is null and completed_by_user_id is null)
    )
);

create index class_syllabus_class_order_idx
  on public.class_syllabus_items(class_id,is_active,sort_order,created_at);
create index class_syllabus_class_status_idx
  on public.class_syllabus_items(class_id,status) where is_active=true;

create function public.prepare_class_syllabus_item()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $function$
begin
  new.title:=trim(new.title);
  new.description:=trim(coalesce(new.description,''));
  new.updated_at:=now();

  if tg_op='INSERT' then
    if auth.uid() is null then raise exception 'Authentication required.'; end if;
    new.created_by_user_id:=auth.uid();
    new.created_at:=now();
  else
    new.created_by_user_id:=old.created_by_user_id;
    new.created_at:=old.created_at;
  end if;

  if new.status='completed' then
    if tg_op='INSERT' or old.status is distinct from 'completed' then
      new.completed_at:=now();
      new.completed_by_user_id:=auth.uid();
    else
      new.completed_at:=old.completed_at;
      new.completed_by_user_id:=old.completed_by_user_id;
    end if;
  else
    new.completed_at:=null;
    new.completed_by_user_id:=null;
  end if;
  return new;
end
$function$;

create trigger trg_prepare_class_syllabus_item
before insert or update on public.class_syllabus_items
for each row execute function public.prepare_class_syllabus_item();

revoke all on function public.prepare_class_syllabus_item() from public,anon,authenticated;

-- --------------------------------------------------------------------------
-- 3) Authorization helper
-- --------------------------------------------------------------------------
create function public.can_manage_class_syllabus(target_class_id bigint)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select coalesce(
    public.app_is_admin()
    or (
      public.current_app_role()='teacher'
      and public.teacher_owns_class(target_class_id)
    ),false
  )
$function$;

revoke all on function public.can_manage_class_syllabus(bigint) from public,anon,authenticated;
grant execute on function public.can_manage_class_syllabus(bigint) to authenticated;

-- --------------------------------------------------------------------------
-- 4) Secure write APIs
-- --------------------------------------------------------------------------
create function public.secure_save_class_syllabus_item(
  p_class_id bigint,
  p_title text,
  p_description text default '',
  p_status text default 'planned',
  p_target_date date default null,
  p_sort_order integer default null,
  p_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  saved_id uuid;
  current_class_id bigint;
  resolved_order integer;
begin
  if not public.can_manage_class_syllabus(p_class_id) then
    raise exception 'Class syllabus management denied.';
  end if;
  if not exists(
    select 1 from public.classes class_row
    where class_row.id=p_class_id and class_row.deleted_at is null
  ) then raise exception 'Active class not found.'; end if;
  if length(trim(coalesce(p_title,'')))<2 then raise exception 'Syllabus title is required.'; end if;
  if p_status not in ('planned','in_progress','completed') then
    raise exception 'Invalid syllabus status.';
  end if;

  if p_item_id is null then
    select coalesce(max(item.sort_order),0)+10 into resolved_order
    from public.class_syllabus_items item where item.class_id=p_class_id;
    resolved_order:=coalesce(p_sort_order,resolved_order);

    insert into public.class_syllabus_items(
      class_id,title,description,status,target_date,sort_order
    ) values(
      p_class_id,trim(p_title),coalesce(p_description,''),p_status,
      p_target_date,greatest(coalesce(resolved_order,10),0)
    ) returning id into saved_id;
  else
    select item.class_id into current_class_id
    from public.class_syllabus_items item where item.id=p_item_id for update;
    if current_class_id is null then raise exception 'Syllabus item not found.'; end if;
    if not public.can_manage_class_syllabus(current_class_id) then
      raise exception 'Existing syllabus item access denied.';
    end if;

    update public.class_syllabus_items item
    set class_id=p_class_id,
        title=trim(p_title),
        description=coalesce(p_description,''),
        status=p_status,
        target_date=p_target_date,
        sort_order=greatest(coalesce(p_sort_order,item.sort_order),0)
    where item.id=p_item_id
    returning item.id into saved_id;
  end if;
  return saved_id;
end
$function$;

create function public.secure_delete_class_syllabus_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare target_class_id bigint;
begin
  select item.class_id into target_class_id
  from public.class_syllabus_items item where item.id=p_item_id for update;
  if target_class_id is null then return false; end if;
  if not public.can_manage_class_syllabus(target_class_id) then
    raise exception 'Class syllabus deletion denied.';
  end if;
  delete from public.class_syllabus_items where id=p_item_id;
  return found;
end
$function$;

create function public.secure_reorder_class_syllabus(
  p_class_id bigint,p_item_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare item_id uuid;position_index integer:=0;
begin
  if not public.can_manage_class_syllabus(p_class_id) then
    raise exception 'Class syllabus reorder denied.';
  end if;
  if exists(
    select value from unnest(coalesce(p_item_ids,'{}'::uuid[])) value
    group by value having count(*)>1
  ) then raise exception 'Duplicate syllabus item in order.'; end if;
  if (select count(*) from public.class_syllabus_items
      where class_id=p_class_id and id=any(coalesce(p_item_ids,'{}'::uuid[])))
     <>cardinality(coalesce(p_item_ids,'{}'::uuid[])) then
    raise exception 'Invalid syllabus item order.';
  end if;

  foreach item_id in array coalesce(p_item_ids,'{}'::uuid[])
  loop
    position_index:=position_index+1;
    update public.class_syllabus_items
    set sort_order=position_index*10 where id=item_id and class_id=p_class_id;
  end loop;
  return true;
end
$function$;

revoke all on function public.secure_save_class_syllabus_item(
  bigint,text,text,text,date,integer,uuid
) from public,anon;
revoke all on function public.secure_delete_class_syllabus_item(uuid) from public,anon;
revoke all on function public.secure_reorder_class_syllabus(bigint,uuid[]) from public,anon;
grant execute on function public.secure_save_class_syllabus_item(
  bigint,text,text,text,date,integer,uuid
) to authenticated;
grant execute on function public.secure_delete_class_syllabus_item(uuid) to authenticated;
grant execute on function public.secure_reorder_class_syllabus(bigint,uuid[]) to authenticated;

-- --------------------------------------------------------------------------
-- 5) RLS: read related class; no direct client write
-- --------------------------------------------------------------------------
alter table public.class_syllabus_items enable row level security;
create policy syllabus_read_related_class on public.class_syllabus_items
for select to authenticated using(public.app_can_read_class(class_id));

revoke all on table public.class_syllabus_items from public,anon,authenticated;
grant select on table public.class_syllabus_items to authenticated;

create trigger trg_server_audit_class_syllabus
  after insert or update or delete on public.class_syllabus_items
  for each row execute function public.audit_sensitive_admin_change();

-- --------------------------------------------------------------------------
-- 6) Postflight
-- --------------------------------------------------------------------------
do $postflight_guard$
declare
  policy_count integer;
  auth_rpc_count integer;
  anon_rpc_count integer;
begin
  select count(*) into policy_count from pg_catalog.pg_policies
  where schemaname='public' and tablename='class_syllabus_items';
  select count(*) into auth_rpc_count from unnest(array[
    'public.secure_save_class_syllabus_item(bigint,text,text,text,date,integer,uuid)',
    'public.secure_delete_class_syllabus_item(uuid)',
    'public.secure_reorder_class_syllabus(bigint,uuid[])'
  ]::text[]) signature
  where has_function_privilege('authenticated',signature,'EXECUTE');
  select count(*) into anon_rpc_count from unnest(array[
    'public.secure_save_class_syllabus_item(bigint,text,text,text,date,integer,uuid)',
    'public.secure_delete_class_syllabus_item(uuid)',
    'public.secure_reorder_class_syllabus(bigint,uuid[])'
  ]::text[]) signature
  where has_function_privilege('anon',signature,'EXECUTE');

  if not (select relrowsecurity from pg_catalog.pg_class
          where oid='public.class_syllabus_items'::regclass)
     or policy_count<>1
     or not has_table_privilege('authenticated','public.class_syllabus_items','SELECT')
     or has_table_privilege('authenticated','public.class_syllabus_items','INSERT')
     or has_table_privilege('authenticated','public.class_syllabus_items','UPDATE')
     or has_table_privilege('authenticated','public.class_syllabus_items','DELETE')
     or auth_rpc_count<>3 or anon_rpc_count<>0
     or (select count(*) from public.class_syllabus_items)<>0
     or not exists(select 1 from pg_catalog.pg_trigger
       where tgrelid='public.class_syllabus_items'::regclass
         and tgname='trg_server_audit_class_syllabus' and not tgisinternal) then
    raise exception 'Phase 17 postflight failed (policies %, auth rpc %, anon rpc %).',
      policy_count,auth_rpc_count,anon_rpc_count;
  end if;
end
$postflight_guard$;

commit;
