import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/brand";
import { ChatSurface } from "../../components/agent/ChatSurface";
import { deleteConversation, listConversations, type ConversationSummary } from "../../lib/agent";
import { Loading } from "../../components/ui";

export function Chat() {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [active, setActive] = useState<string | undefined>(undefined);

  const reload = useCallback(() => { listConversations().then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => { reload(); }, [reload]);

  const remove = async (id: string) => {
    await deleteConversation(id);
    if (active === id) setActive(undefined);
    reload();
  };

  return (
    <div className="agent-page">
      <aside className="agent-history">
        <div className="agent-history-head">
          <b className="small">Chats</b>
          <button type="button" className="link" onClick={() => setActive(undefined)} aria-label="New chat"><Icon name="plus" size={16} /></button>
        </div>
        {!items ? <Loading /> : items.length === 0 ? <p className="muted small">No chats yet.</p> : (
          <div className="agent-threads">
            {items.map((c) => (
              <div key={c.id} className={`agent-thread ${c.id === active ? "on" : ""}`}>
                <button type="button" className="link grow" style={{ textAlign: "left" }} onClick={() => setActive(c.id)}>{c.title}</button>
                <span className="caption">{c.message_count}</span>
                <button type="button" className="link" onClick={() => remove(c.id)} aria-label="Delete chat"><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </aside>
      <div className="agent-main">
        <ChatSurface
          conversationId={active}
          onConversationId={(id) => { setActive(id); reload(); }}
          layout="page"
        />
      </div>
    </div>
  );
}
