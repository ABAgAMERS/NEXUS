import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Hash, LogOut, Plus, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { channelsQuery, meQuery } from "@/lib/nexus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/c/$communityId")({
  component: CommunityLayout,
});

function CommunityLayout() {
  const { communityId } = Route.useParams();
  const { data: me } = useQuery(meQuery);
  const { data: community } = useQuery({
    queryKey: ["community", communityId],
    queryFn: async () => (await supabase.from("communities").select("*").eq("id", communityId).single()).data,
  });
  const { data: channels = [] } = useQuery(channelsQuery(communityId));
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isOwner = community && me && community.owner_id === me.id;

  async function leave() {
    if (!me) return;
    await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", me.id);
    await qc.invalidateQueries({ queryKey: ["my-communities"] });
    navigate({ to: "/app" });
  }

  const group = (kind: "text" | "voice") => channels.filter((c) => c.kind === kind);

  return (
    <>
      <aside className="flex w-60 shrink-0 flex-col bg-panel">
        <header className="flex h-14 items-center border-b px-4 font-display font-bold">
          <span className="truncate">{community?.name ?? "..."}</span>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          {(["text", "voice"] as const).map((kind) => (
            <div key={kind}>
              <div className="flex items-center justify-between px-2 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {kind === "text" ? "Canais de texto" : "Canais de voz"}
              </div>
              {group(kind).map((c) => (
                <Link
                  key={c.id}
                  to="/app/c/$communityId/$channelId"
                  params={{ communityId, channelId: c.id }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
                >
                  {kind === "text" ? <Hash className="size-4" /> : <Volume2 className="size-4" />}
                  <span className="truncate">{c.name}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t p-2">
          {isOwner && (
            <Button variant="ghost" className="w-full justify-start" onClick={() => setOpen(true)}><Plus /> Novo canal</Button>
          )}
          {!isOwner && (
            <Button variant="ghost" className="w-full justify-start text-destructive" onClick={leave}><LogOut /> Sair da comunidade</Button>
          )}
          {me && <div className="px-2 pt-1 text-sm text-muted-foreground">@{me.username}</div>}
        </div>
      </aside>
      <Outlet />
      <NewChannelDialog open={open} onOpenChange={setOpen} communityId={communityId} />
    </>
  );
}

function NewChannelDialog({ open, onOpenChange, communityId }: { open: boolean; onOpenChange: (o: boolean) => void; communityId: string }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  const qc = useQueryClient();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("channels").insert({ community_id: communityId, name: name.trim(), kind });
    if (error) return void toast.error("Não foi possível criar o canal");
    qc.invalidateQueries({ queryKey: ["channels", communityId] });
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo canal</DialogTitle></DialogHeader>
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={kind === "text" ? "neon" : "secondary"} onClick={() => setKind("text")}><Hash /> Texto</Button>
            <Button type="button" variant={kind === "voice" ? "neon" : "secondary"} onClick={() => setKind("voice")}><Volume2 /> Voz</Button>
          </div>
          <Input placeholder="nome-do-canal" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          <Button type="submit" variant="neon" className="w-full">Criar canal</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
