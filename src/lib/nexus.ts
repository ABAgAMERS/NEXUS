import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("not signed in");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
    if (error) throw error;
    return data;
  },
});

export const myCommunitiesQuery = (uid: string) =>
  queryOptions({
    queryKey: ["my-communities", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("community:communities(*)")
        .eq("user_id", uid)
        .order("joined_at");
      if (error) throw error;
      return data.map((r) => r.community).filter(Boolean) as { id: string; name: string; owner_id: string; description: string | null }[];
    },
  });

export const allCommunitiesQuery = queryOptions({
  queryKey: ["all-communities"],
  queryFn: async () => {
    const { data, error } = await supabase.from("communities").select("*, community_members(count)").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  },
});

export const channelsQuery = (cid: string) =>
  queryOptions({
    queryKey: ["channels", cid],
    queryFn: async () => {
      const { data, error } = await supabase.from("channels").select("*").eq("community_id", cid).order("created_at");
      if (error) throw error;
      return data;
    },
  });

export function canCreateCommunity() {
  return true;
}

export function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}
