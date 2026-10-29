import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Headphones, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/nexus";
import { Button } from "@/components/ui/button";

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

type Signal = { from: string; to: string; kind: "offer" | "answer" | "ice"; payload: unknown };
type Member = { id: string; username: string; muted: boolean };

export function VoiceRoom({ channelId, title }: { channelId: string; title: string }) {
  const { data: me } = useQuery(meQuery);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [preview, setPreview] = useState<Member[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const audioBox = useRef<HTMLDivElement>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);

  // Lobby presence (see who's inside without joining)
  const previewRef = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    if (joined) return;
    const ch = supabase.channel(`voice-rtc:${channelId}`);
    previewRef.current = ch;
    ch.on("presence", { event: "sync" }, () => setPreview(flatten(ch.presenceState()))).subscribe();
    return () => {
      supabase.removeChannel(ch);
      previewRef.current = null;
    };
  }, [channelId, joined]);

  useEffect(() => () => leave(), [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  function flatten(state: Record<string, unknown[]>): Member[] {
    return Object.values(state).map((arr) => arr[0] as Member).filter(Boolean);
  }

  function makePeer(remoteId: string, ch: RealtimeChannel, myId: string) {
    const pc = new RTCPeerConnection(ICE);
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) ch.send({ type: "broadcast", event: "signal", payload: { from: myId, to: remoteId, kind: "ice", payload: e.candidate.toJSON() } satisfies Signal });
    };
    pc.ontrack = (e) => {
      let el = document.getElementById(`audio-${remoteId}`) as HTMLAudioElement | null;
      if (!el) {
        el = document.createElement("audio");
        el.id = `audio-${remoteId}`;
        el.autoplay = true;
        audioBox.current?.appendChild(el);
      }
      el.srcObject = e.streams[0] ?? null;
    };
    peers.current.set(remoteId, pc);
    return pc;
  }

  function dropPeer(id: string) {
    peers.current.get(id)?.close();
    peers.current.delete(id);
    document.getElementById(`audio-${id}`)?.remove();
  }

  async function join() {
    if (!me) return;
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return void toast.error("Permita o acesso ao microfone para entrar na voz");
    }
    const myId = me.id;
    if (previewRef.current) {
      await supabase.removeChannel(previewRef.current);
      previewRef.current = null;
    }
    const ch = supabase.channel(`voice-rtc:${channelId}`, { config: { presence: { key: myId }, broadcast: { self: false } } });
    chanRef.current = ch;

    ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const s = payload as Signal;
      if (s.to !== myId) return;
      let pc = peers.current.get(s.from);
      if (s.kind === "offer") {
        if (!pc) pc = makePeer(s.from, ch, myId);
        await pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        ch.send({ type: "broadcast", event: "signal", payload: { from: myId, to: s.from, kind: "answer", payload: ans } satisfies Signal });
      } else if (s.kind === "answer" && pc) {
        await pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);
      } else if (s.kind === "ice" && pc) {
        try { await pc.addIceCandidate(s.payload as RTCIceCandidateInit); } catch { /* ignore */ }
      }
    });

    ch.on("presence", { event: "sync" }, async () => {
      const list = flatten(ch.presenceState());
      setMembers(list);
      const ids = new Set(list.map((m) => m.id));
      for (const id of [...peers.current.keys()]) if (!ids.has(id)) dropPeer(id);
      for (const m of list) {
        // the peer with the smaller id starts the call to avoid double offers
        if (m.id === myId || peers.current.has(m.id) || myId > m.id) continue;
        const pc = makePeer(m.id, ch, myId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ch.send({ type: "broadcast", event: "signal", payload: { from: myId, to: m.id, kind: "offer", payload: offer } satisfies Signal });
      }
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ id: myId, username: me.username, muted: false });
        setJoined(true);
      }
    });
  }

  function leave() {
    for (const id of [...peers.current.keys()]) dropPeer(id);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (chanRef.current) supabase.removeChannel(chanRef.current);
    chanRef.current = null;
    setJoined(false);
    setMembers([]);
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    if (me) chanRef.current?.track({ id: me.id, username: me.username, muted: next });
  }

  const shown = joined ? members : preview;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 font-display font-semibold">
        <Volume2 className="size-5 text-neon" /> {title}
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="flex flex-wrap justify-center gap-6">
          {shown.length === 0 && <p className="text-muted-foreground">Ninguém na sala ainda.</p>}
          {shown.map((m) => (
            <div key={m.id} className="flex flex-col items-center gap-2">
              <div className={`flex size-24 items-center justify-center rounded-full font-display text-3xl font-bold ${m.muted ? "bg-muted text-muted-foreground" : "bg-neon-gradient text-primary-foreground shadow-neon"}`}>
                {m.username.slice(0, 1).toUpperCase()}
              </div>
              <span className="flex items-center gap-1 font-semibold">
                {m.muted && <MicOff className="size-4 text-destructive" />} {m.username}
              </span>
            </div>
          ))}
        </div>
        {joined ? (
          <div className="flex gap-3">
            <Button variant={muted ? "destructive" : "secondary"} size="lg" onClick={toggleMute}>
              {muted ? <MicOff /> : <Mic />} {muted ? "Desmutar" : "Mutar"}
            </Button>
            <Button variant="destructive" size="lg" onClick={leave}><PhoneOff /> Sair</Button>
          </div>
        ) : (
          <Button variant="neon" size="lg" className="h-12 px-8" onClick={join}><Headphones /> Entrar na voz</Button>
        )}
      </div>
      <div ref={audioBox} className="hidden" />
    </div>
  );
}
