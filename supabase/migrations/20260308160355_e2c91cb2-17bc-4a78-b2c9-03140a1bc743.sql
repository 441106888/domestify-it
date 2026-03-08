CREATE POLICY "Admins can delete notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));