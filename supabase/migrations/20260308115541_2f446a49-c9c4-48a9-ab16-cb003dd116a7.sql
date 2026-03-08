
CREATE OR REPLACE FUNCTION public.increment_points(_user_id uuid, _amount numeric)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  UPDATE profiles SET total_points = COALESCE(total_points, 0) + _amount, updated_at = now() WHERE id = _user_id;
$$;
