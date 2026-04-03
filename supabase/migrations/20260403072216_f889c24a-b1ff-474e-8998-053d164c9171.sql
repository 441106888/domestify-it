CREATE TABLE public.saved_task_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  default_points numeric NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.saved_task_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage saved titles" ON public.saved_task_titles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing unique titles
INSERT INTO public.saved_task_titles (title, default_points)
SELECT DISTINCT ON (title) title, points FROM public.tasks
ON CONFLICT (title) DO NOTHING;