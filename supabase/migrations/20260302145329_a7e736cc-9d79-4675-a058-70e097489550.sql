-- Add ciclo_id to documentos to link documents to specific cycles
ALTER TABLE public.documentos ADD COLUMN ciclo_id uuid REFERENCES public.ciclos(id) ON DELETE SET NULL;

-- Add motivo_encerramento to ciclos for tracking why a cycle was closed
ALTER TABLE public.ciclos ADD COLUMN motivo_encerramento text;
ALTER TABLE public.ciclos ADD COLUMN encerrado_em timestamp with time zone;
ALTER TABLE public.ciclos ADD COLUMN encerrado_por uuid;