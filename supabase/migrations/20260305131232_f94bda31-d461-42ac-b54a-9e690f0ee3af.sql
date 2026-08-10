-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Authenticated can manage documentos" ON public.documentos;
DROP POLICY IF EXISTS "Masters can delete documentos" ON public.documentos;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Authenticated can manage documentos"
ON public.documentos
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Masters can delete documentos"
ON public.documentos
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role));
