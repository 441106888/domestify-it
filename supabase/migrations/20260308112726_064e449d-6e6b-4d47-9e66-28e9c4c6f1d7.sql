-- Give all existing admins the member role too (if they don't already have it)
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'member'::app_role
FROM public.user_roles ur
WHERE ur.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'member'
  );

-- Also ensure admins have a members table entry
INSERT INTO public.members (id, pin_code, created_by)
SELECT ur.user_id, 'admin', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.members m WHERE m.id = ur.user_id
  );