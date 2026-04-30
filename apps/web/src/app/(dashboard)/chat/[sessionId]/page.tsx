import { ChatWindow } from "@/components/chat/chat-window";

export default function ChatSessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return <ChatWindow sessionId={params.sessionId} />;
}
