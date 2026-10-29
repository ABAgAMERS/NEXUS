import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/nexus";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Msg = { id: string; content: string; created_at: string; user_id: string; profile?: { username: string } | null };

export function ChatView({ channelId, title }: { channelId: string | null; title: string }) {
  const { data: me } = useQuery(meQuery);
  const qc = useQueryClient();
  const key = ["messages", channelId ?? "global"];
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("messages").select("id, content, created_at, user_id, profile:profiles(username)").order("created_at", { ascending: false }).limit(100);
      q = channelId ? q.eq("channel_id", channelId) : q.is("channel_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Msg[]).reverse();
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`msgs-${channelId ?? "global"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", ...(channelId ? { filter: `channel_id=eq.${channelId}` } : {}) },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !me) return;
    setText("");
    const { error } = await supabase.from("messages").insert({ content, channel_id: channelId, user_id: me.id });
    if (error) toast.error("Mensagem não enviada");
    else qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 font-display font-semibold">
        <Hash className="size-5 text-neon" /> {title}
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-center text-muted-foreground">Nenhuma mensagem ainda. Diga oi! 👾</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-display font-bold text-neon">
              {(m.profile?.username ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={m.user_id === me?.id ? "font-semibold text-neon" : "font-semibold text-neon-2"}>{m.profile?.username ?? "usuário"}</span>
                <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-4">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Conversar em #${title}`} maxLength={2000} className="bg-panel" />
        <Button type="submit" variant="neon" size="icon"><Send /></Button>
      </form>
    </div>
  );
}
