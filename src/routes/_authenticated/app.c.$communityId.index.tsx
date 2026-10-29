import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { channelsQuery } from "@/lib/nexus";

export const Route = createFileRoute("/_authenticated/app/c/$communityId/")({
  component: CommunityHome,
});

function CommunityHome() {
  const { communityId } = Route.useParams();
  const { data: channels } = useQuery(channelsQuery(communityId));
  const first = channels?.find((c) => c.kind === "text") ?? channels?.[0];
  if (first) return <Navigate to="/app/c/$communityId/$channelId" params={{ communityId, channelId: first.id }} replace />;
  return <div className="flex flex-1 items-center justify-center text-muted-foreground">Carregando…</div>;
}
