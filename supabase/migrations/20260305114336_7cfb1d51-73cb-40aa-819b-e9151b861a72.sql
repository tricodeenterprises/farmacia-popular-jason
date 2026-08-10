
-- Add sexo column to pacientes
ALTER TABLE public.pacientes ADD COLUMN sexo text DEFAULT NULL;

-- Create sugestoes table for user feedback
CREATE TABLE public.sugestoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'sugestao',
  mensagem text NOT NULL,
  tela text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sugestoes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert
CREATE POLICY "Authenticated can insert sugestoes"
  ON public.sugestoes FOR INSERT TO authenticated
  WITH CHECK (true);

-- Masters can read all
CREATE POLICY "Masters can read sugestoes"
  ON public.sugestoes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));
