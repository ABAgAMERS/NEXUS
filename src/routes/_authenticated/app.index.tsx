import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/components/ChatView";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => <ChatView channelId={null} title="chat-geral" />,
});
