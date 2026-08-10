
CREATE TABLE public.operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.operadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read operadores"
  ON public.operadores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Masters can manage operadores"
  ON public.operadores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- Add operador_id to dispensacoes for tracking
ALTER TABLE public.dispensacoes ADD COLUMN operador_id uuid REFERENCES public.operadores(id);

-- Add operador_id to receitas for tracking
ALTER TABLE public.receitas ADD COLUMN operador_id uuid REFERENCES public.operadores(id);
