-- Allow masters to delete dispensacoes
CREATE POLICY "Masters can delete dispensacoes"
ON public.dispensacoes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

-- Allow masters to delete pacientes
CREATE POLICY "Masters can delete pacientes"
ON public.pacientes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

-- Allow masters to delete documentos
CREATE POLICY "Masters can delete documentos"
ON public.documentos
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

-- Allow masters to delete receitas
CREATE POLICY "Masters can delete receitas"
ON public.receitas
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

-- Allow masters to delete ciclos
CREATE POLICY "Masters can delete ciclos"
ON public.ciclos
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));