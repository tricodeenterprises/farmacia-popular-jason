
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_tipo_check;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_tipo_check CHECK (tipo IN ('paciente', 'representante', 'procuracao', 'identidade', 'identidade_com_cpf', 'cpf', 'doc_representante', 'cupom_fiscal', 'cupom_fiscal_qr', 'receita'));
