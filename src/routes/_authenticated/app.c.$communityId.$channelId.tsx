import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { channelsQuery } from "@/lib/nexus";
import { ChatView } from "@/components/ChatView";
import { VoiceRoom } from "@/components/VoiceRoom";

export const Route = createFileRoute("/_authenticated/app/c/$communityId/$channelId")({
  component: ChannelPage,
});

function ChannelPage() {
  const { communityId, channelId } = Route.useParams();
  const { data: channels } = useQuery(channelsQuery(communityId));
  const ch = channels?.find((c) => c.id === channelId);
  if (!ch) return <div className="flex flex-1 items-center justify-center text-muted-foreground">Carregando…</div>;
  return ch.kind === "voice" ? <VoiceRoom key={ch.id} channelId={ch.id} title={ch.name} /> : <ChatView key={ch.id} channelId={ch.id} title={ch.name} />;
}
