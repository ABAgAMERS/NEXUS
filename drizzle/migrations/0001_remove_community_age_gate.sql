CREATE OR REPLACE FUNCTION public.can_create_community(_uid uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT true $$;

COMMENT ON FUNCTION public.can_create_community(uuid) IS 'Returns true: the account-age waiting period for creating communities was removed at the owner''s request.';