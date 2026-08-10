
-- Add endereco to pacientes
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS endereco text;

-- Add tipo to receitas (medicamento or fralda)
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'medicamento';

-- Create medicos table
CREATE TABLE IF NOT EXISTS public.medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm text NOT NULL UNIQUE,
  nome text NOT NULL,
  especialidade text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage medicos"
  ON public.medicos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Storage bucket for uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos');

CREATE POLICY "Public can read documentos"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'documentos');
