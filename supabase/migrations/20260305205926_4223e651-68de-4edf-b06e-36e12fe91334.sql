-- Allow chefe to read logs
CREATE POLICY "Chefe can read logs"
ON public.logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'chefe'::app_role));

-- Allow chefe to read sugestoes
CREATE POLICY "Chefe can read sugestoes"
ON public.sugestoes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'chefe'::app_role));

-- Allow chefe to view all profiles
CREATE POLICY "Chefe can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'chefe'::app_role));