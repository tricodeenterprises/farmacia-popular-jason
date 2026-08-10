
-- Enum para perfis
CREATE TYPE public.app_role AS ENUM ('master', 'operador');

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'operador',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabela de roles separada (segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função security definer para checar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Pacientes
CREATE TABLE public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  telefone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- Documentos (versionados)
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('paciente', 'representante', 'procuracao')),
  arquivo_url TEXT NOT NULL,
  versao INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'substituido')),
  validade_ate TIMESTAMPTZ NOT NULL,
  dados_extraidos JSONB,
  score_qualidade NUMERIC,
  score_confianca NUMERIC,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- Receitas
CREATE TABLE public.receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  arquivo_url TEXT NOT NULL,
  data_emissao DATE NOT NULL,
  validade_ate DATE NOT NULL,
  nome_paciente_ocr TEXT,
  crm TEXT,
  nome_medico TEXT,
  score_qualidade NUMERIC,
  score_confianca NUMERIC,
  dados_extraidos JSONB,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;

-- Ciclos (180 dias)
CREATE TABLE public.ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  receita_id UUID NOT NULL REFERENCES public.receitas(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  intervalo_dias INT NOT NULL DEFAULT 30,
  ultima_retirada DATE,
  total_dispensacoes INT NOT NULL DEFAULT 0,
  limite_maximo INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ciclos ENABLE ROW LEVEL SECURITY;

-- Dispensações (imutáveis)
CREATE TABLE public.dispensacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES public.ciclos(id),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  tipo_retirada TEXT NOT NULL CHECK (tipo_retirada IN ('proprio', 'representante')),
  documento_representante_id UUID REFERENCES public.documentos(id),
  procuracao_id UUID REFERENCES public.documentos(id),
  snapshot_ciclo JSONB NOT NULL,
  cancelada BOOLEAN NOT NULL DEFAULT false,
  justificativa_cancelamento TEXT,
  cancelada_por UUID REFERENCES auth.users(id),
  registrada_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dispensacoes ENABLE ROW LEVEL SECURITY;

-- Logs de auditoria
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Configurações do sistema
CREATE TABLE public.configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles: usuário vê seu próprio, master vê todos
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'master'));

CREATE POLICY "Masters can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- User roles: apenas master
CREATE POLICY "Masters can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Pacientes: todos autenticados
CREATE POLICY "Authenticated can manage pacientes" ON public.pacientes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Documentos: todos autenticados
CREATE POLICY "Authenticated can manage documentos" ON public.documentos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Receitas: todos autenticados
CREATE POLICY "Authenticated can manage receitas" ON public.receitas
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Ciclos: todos autenticados
CREATE POLICY "Authenticated can manage ciclos" ON public.ciclos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Dispensações: todos autenticados podem ler e inserir
CREATE POLICY "Authenticated can read dispensacoes" ON public.dispensacoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert dispensacoes" ON public.dispensacoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Masters can update dispensacoes" ON public.dispensacoes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- Logs: inserir todos, ler master
CREATE POLICY "Authenticated can insert logs" ON public.logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Masters can read logs" ON public.logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- Configurações: ler todos, escrever master
CREATE POLICY "Authenticated can read config" ON public.configuracoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Masters can manage config" ON public.configuracoes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Inserir configs padrão
INSERT INTO public.configuracoes (chave, valor) VALUES
  ('timeout_minutos', '10'),
  ('intervalo_fraldas_dias', '30');
