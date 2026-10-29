CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower ON public.profiles (lower(username));
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.username_available(_username text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_username))
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_for_username(_username text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(_username) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.email_for_username(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO service_role;

CREATE OR REPLACE FUNCTION public.can_create_community(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND created_at <= now() - interval '2 days')
$$;
GRANT EXECUTE ON FUNCTION public.can_create_community(uuid) TO authenticated;

CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  description text,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communities readable" ON public.communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "create community after 2 days" ON public.communities FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.can_create_community(auth.uid()));
CREATE POLICY "owner updates" ON public.communities FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "owner deletes" ON public.communities FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_member(_cid uuid, _uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _cid AND user_id = _uid)
$$;
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;

CREATE POLICY "members readable" ON public.community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "join self" ON public.community_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "leave self" ON public.community_members FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels readable" ON public.channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manages channels" ON public.channels FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_community() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id) VALUES (NEW.id, NEW.owner_id);
  INSERT INTO public.channels (community_id, name, kind) VALUES (NEW.id, 'geral', 'text'), (NEW.id, 'Sala de voz', 'voice');
  RETURN NEW;
END $$;
CREATE TRIGGER on_community_created AFTER INSERT ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.handle_new_community();

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_channel_idx ON public.messages (channel_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read messages" ON public.messages FOR SELECT TO authenticated USING (
  channel_id IS NULL OR EXISTS (SELECT 1 FROM public.channels ch WHERE ch.id = channel_id AND public.is_member(ch.community_id, auth.uid()))
);
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (channel_id IS NULL OR EXISTS (SELECT 1 FROM public.channels ch WHERE ch.id = channel_id AND ch.kind = 'text' AND public.is_member(ch.community_id, auth.uid())))
);
CREATE POLICY "delete own messages" ON public.messages FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;