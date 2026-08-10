-- Allow inspetor to read logs
CREATE POLICY "Inspetors can read logs"
ON public.logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'inspetor'::app_role));

-- Allow inspetor to read sugestoes
CREATE POLICY "Inspetors can read sugestoes"
ON public.sugestoes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'inspetor'::app_role));

-- Allow inspetor to view all profiles
CREATE POLICY "Inspetors can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'inspetor'::app_role));