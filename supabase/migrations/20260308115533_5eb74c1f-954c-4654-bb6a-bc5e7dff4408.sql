
ALTER TABLE public.tasks ALTER COLUMN points TYPE numeric USING points::numeric;
ALTER TABLE public.tasks ALTER COLUMN points_awarded TYPE numeric USING points_awarded::numeric;
ALTER TABLE public.profiles ALTER COLUMN total_points TYPE numeric USING total_points::numeric;
