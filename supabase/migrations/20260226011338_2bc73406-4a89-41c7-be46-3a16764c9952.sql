
-- Add username column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (lower(username));

-- Add ativo column to pacientes for soft delete
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
