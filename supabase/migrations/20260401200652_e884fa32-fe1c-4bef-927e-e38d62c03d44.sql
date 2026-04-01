
ALTER TABLE public.recurring_tasks ADD COLUMN start_time time without time zone;

ALTER TABLE public.daily_task_logs ADD COLUMN admin_opened boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks ADD COLUMN decision_at timestamp with time zone;
