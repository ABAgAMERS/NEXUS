import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Compass, Gamepad2, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, myCommunitiesQuery, allCommunitiesQuery, canCreateCommunity, initials, TWO_DAYS_MS } from "@/lib/nexus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "NEXUS — App" },
      { name: "description", content: "Suas comunidades no NEXUS." },
      { property: "og:title", content: "NEXUS — App" },
      { property: "og:description", content: "Suas comunidades no NEXUS." },
    ],
  }),
  component: AppLayout,
});

function RailButton({ to, params, label, children }: { to: string; params?: Record<string, string>; label: string; children: React.ReactNode }) {
  return (
    <Link
      to={to as "/app"}
      params={params as never}
      title={label}
      activeOptions={{ exact: to === "/app" }}
      className="flex size-12 items-center justify-center rounded-2xl bg-panel font-display font-bold text-foreground transition-all hover:rounded-xl hover:bg-primary hover:text-primary-foreground data-[status=active]:rounded-xl data-[status=active]:bg-neon-gradient data-[status=active]:text-primary-foreground data-[status=active]:shadow-neon"
    >
      {children}
    </Link>
  );
}

function AppLayout() {
  const { data: me } = useQuery(meQuery);
  const { data: communities = [] } = useQuery({ ...myCommunitiesQuery(me?.id ?? ""), enabled: !!me });
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail py-3">
        <RailButton to="/app" label="Chat geral"><Gamepad2 className="size-6" /></RailButton>
        <div className="my-1 h-px w-8 bg-border" />
        {communities.map((c) => (
          <RailButton key={c.id} to="/app/c/$communityId" params={{ communityId: c.id }} label={c.name}>
            {initials(c.name)}
          </RailButton>
        ))}
        <button
          title="Criar comunidade"
          onClick={() => setCreateOpen(true)}
          className="flex size-12 items-center justify-center rounded-2xl bg-panel text-neon transition-all hover:rounded-xl hover:bg-primary hover:text-primary-foreground"
        >
          <Plus />
        </button>
        <button
          title="Explorar comunidades"
          onClick={() => setBrowseOpen(true)}
          className="flex size-12 items-center justify-center rounded-2xl bg-panel text-neon-2 transition-all hover:rounded-xl hover:bg-accent"
        >
          <Compass />
        </button>
        <div className="flex-1" />
        <button title="Sair" onClick={signOut} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-destructive">
          <LogOut className="size-5" />
        </button>
      </nav>
      <div className="flex min-w-0 flex-1">
        <Outlet />
      </div>
      {me && <CreateDialog open={createOpen} onOpenChange={setCreateOpen} me={me} />}
      {me && <BrowseDialog open={browseOpen} onOpenChange={setBrowseOpen} uid={me.id} joined={new Set(communities.map((c) => c.id))} />}
    </div>
  );
}

function CreateDialog({ open, onOpenChange, me }: { open: boolean; onOpenChange: (o: boolean) => void; me: { id: string; created_at: string } }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const allowed = canCreateCommunity(me.created_at);
  const remainingH = Math.ceil((TWO_DAYS_MS - (Date.now() - new Date(me.created_at).getTime())) / 3600000);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from("communities").insert({ name: name.trim(), description: description.trim() || null, owner_id: me.id }).select().single();
    if (error) return void toast.error("Não foi possível criar a comunidade");
    await qc.invalidateQueries({ queryKey: ["my-communities"] });
    onOpenChange(false);
    setName("");
    setDescription("");
    navigate({ to: "/app/c/$communityId", params: { communityId: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Criar comunidade</DialogTitle></DialogHeader>
        {allowed ? (
          <form onSubmit={create} className="space-y-3">
            <Input placeholder="Nome da comunidade" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={40} required />
            <Input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />
            <Button type="submit" variant="neon" className="w-full">Criar</Button>
          </form>
        ) : (
          <p className="text-muted-foreground">
            Sua conta precisa ter pelo menos 2 dias para criar comunidades. Faltam cerca de{" "}
            <span className="text-neon">{remainingH}h</span>. Enquanto isso, explore e entre em comunidades existentes!
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BrowseDialog({ open, onOpenChange, uid, joined }: { open: boolean; onOpenChange: (o: boolean) => void; uid: string; joined: Set<string> }) {
  const { data = [] } = useQuery({ ...allCommunitiesQuery, enabled: open });
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function join(id: string) {
    if (!joined.has(id)) {
      const { error } = await supabase.from("community_members").insert({ community_id: id, user_id: uid });
      if (error) return void toast.error("Não foi possível entrar");
      await qc.invalidateQueries({ queryKey: ["my-communities"] });
    }
    onOpenChange(false);
    navigate({ to: "/app/c/$communityId", params: { communityId: id } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Explorar comunidades</DialogTitle></DialogHeader>
        {data.length === 0 && <p className="text-muted-foreground">Nenhuma comunidade ainda.</p>}
        <div className="space-y-2">
          {data.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-background p-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-neon-gradient font-display font-bold text-primary-foreground">{initials(c.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="truncate text-sm text-muted-foreground">{c.description || `${(c.community_members as unknown as { count: number }[])[0]?.count ?? 0} membros`}</div>
              </div>
              <Button size="sm" variant={joined.has(c.id) ? "secondary" : "neon"} onClick={() => join(c.id)}>
                {joined.has(c.id) ? "Abrir" : "Entrar"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
