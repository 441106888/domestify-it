
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS requires_proof boolean NOT NULL DEFAULT true;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS rejection_reason text;
