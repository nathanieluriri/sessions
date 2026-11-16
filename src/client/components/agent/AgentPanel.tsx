import { useState } from "react";
import { Icon } from "../brand";
import { ChatSurface } from "./ChatSurface";

/** Floating assistant widget for the admin dashboard. */
export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  if (!open) {
    return (
      <button type="button" className="agent-fab" onClick={() => setOpen(true)} aria-label="Open studio assistant">
        <Icon name="chat" size={22} />
        <span>Assistant</span>
      </button>
    );
  }

  return (
    <aside className="agent-panel" role="dialog" aria-label="Studio assistant">
      <header className="agent-panel-head">
        <span className="agent-mark"><Icon name="chat" size={16} /></span>
        <b>Studio assistant</b>
        <span className="grow" />
        <button className="link" onClick={() => { setConversationId(undefined); }} aria-label="New chat" title="New chat"><Icon name="plus" size={15} /></button>
        <button className="link" onClick={() => setOpen(false)} aria-label="Close" title="Close"><Icon name="x" size={16} /></button>
      </header>
      <ChatSurface conversationId={conversationId} onConversationId={setConversationId} layout="panel" />
    </aside>
  );
}
