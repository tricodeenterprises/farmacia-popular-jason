-- Trigger to sync profiles.role when user_roles is updated
CREATE OR REPLACE FUNCTION public.sync_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET role = NEW.role, updated_at = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_user_role_change
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_role();
