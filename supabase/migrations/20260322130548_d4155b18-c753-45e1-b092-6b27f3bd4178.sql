
-- Recurring task definitions (admin creates these)
CREATE TABLE public.recurring_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_time time NOT NULL, -- e.g. '00:30' for 12:30 AM
  deadline_time time NOT NULL, -- e.g. '01:00' for 1:00 AM
  penalty_points numeric NOT NULL DEFAULT 2,
  reward_points numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Daily logs for each recurring task
CREATE TABLE public.daily_task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_task_id uuid NOT NULL REFERENCES public.recurring_tasks(id) ON DELETE CASCADE,
  task_date date NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  deadline_checked boolean NOT NULL DEFAULT false,
  penalty_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(recurring_task_id, task_date)
);

ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_task_logs ENABLE ROW LEVEL SECURITY;

-- RLS for recurring_tasks
CREATE POLICY "Admins can manage recurring tasks" ON public.recurring_tasks FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members can view own recurring tasks" ON public.recurring_tasks FOR SELECT TO public USING (assigned_to = auth.uid());

-- RLS for daily_task_logs
CREATE POLICY "Admins can manage daily logs" ON public.daily_task_logs FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members can view own daily logs" ON public.daily_task_logs FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.recurring_tasks rt WHERE rt.id = recurring_task_id AND rt.assigned_to = auth.uid())
);
CREATE POLICY "Members can update own daily logs" ON public.daily_task_logs FOR UPDATE TO public USING (
  EXISTS (SELECT 1 FROM public.recurring_tasks rt WHERE rt.id = recurring_task_id AND rt.assigned_to = auth.uid())
);
