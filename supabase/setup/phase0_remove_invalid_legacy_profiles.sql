-- حذف نگاشت‌های قدیمی و ناقص user_roles
-- این دستور حساب Auth را حذف نمی‌کند؛ فقط نقش ناقصی را که به هیچ پرونده‌ای متصل نیست پاک می‌کند.

begin;

delete from public.user_roles
where (role = 'admin' and admin_id is null)
   or (role = 'teacher' and teacher_id is null)
   or (role = 'student' and student_id is null)
   or (role = 'parent' and parent_id is null);

commit;

-- نتیجه صحیح برای مدیر باید فقط یک ردیف با admin_id غیر NULL باشد.
select
  id as auth_user_id,
  role,
  name,
  admin_id,
  is_active
from public.user_roles
where role = 'admin'
order by created_at;
