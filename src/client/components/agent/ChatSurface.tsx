import { useEffect, useRef, useState } from "react";
import { chat, getConversation, toolLabel, type Message, type ToolResult } from "../../lib/agent";
import { Icon } from "../brand";
import { renderMarkdown } from "./markdown";

function ToolLine({ t }: { t: ToolResult }) {
  return (
    <div className={`agent-tool ${t.status === "error" ? "err" : ""}`}>
      <Icon name={t.status === "error" ? "lock" : "check"} size={13} />
      <span className="agent-tool-name">{toolLabel(t.tool)}</span>
      <span className="agent-tool-sum">{t.summary}</span>
    </div>
  );
}

export function ChatSurface({ conversationId, onConversationId, layout = "page" }: { conversationId?: string; onConversationId?: (id: string) => void; layout?: "panel" | "page" }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cid, setCid] = useState(conversationId);
  const prev = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { setCid(conversationId); }, [conversationId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  useEffect(() => {
    if (!cid) {
      setMessages([]);
      setError("");
      setLoading(false);
      prev.current = undefined;
      return;
    }
    const switching = Boolean(prev.current && prev.current !== cid);
    prev.current = cid;
    let alive = true;
    if (switching) setMessages([]);
    setLoading(true);
    getConversation(cid)
      .then((c) => { if (alive) { setMessages(c.messages); setError(""); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not open this chat."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cid]);

  const adopt = (id: string) => {
    if (id && id !== cid) {
      prev.current = id;
      setCid(id);
      onConversationId?.(id);
    }
  };

  const send = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    setBusy(true);
    setError("");
    const mine: Message = { id: `local-${Date.now()}`, role: "user", text: value, steps: [], tool_results: [], suggestions: [], created_at: new Date().toISOString() };
    setMessages((m) => [...m, mine]);
    try {
      const r = await chat(value, cid);
      const reply: Message = { id: `local-${Date.now()}-a`, role: "assistant", text: r.text, steps: r.steps.map((s) => s.label), tool_results: r.toolResults, suggestions: r.suggestions, created_at: new Date().toISOString() };
      setMessages((m) => [...m, reply]);
      adopt(r.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "It didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const empty = messages.length === 0 && !busy && !loading;

  return (
    <div className={`agent-surface ${layout}`}>
      <div className="agent-scroll">
        {loading && empty && <p className="muted small" style={{ textAlign: "center", padding: 24 }}>Opening chat…</p>}
        {empty && !loading && !cid && (
          <div className="agent-empty">
            <span className="agent-mark"><Icon name="chat" size={22} /></span>
            <p><b>Studio assistant</b></p>
            <p className="muted">Ask about bookings, payments, clients or reports, or ask me to record a payment, approve a request, or reply to an enquiry. I only do what your permissions allow.</p>
          </div>
        )}
        {empty && !loading && cid && (
          <div className="agent-empty">
            <p className="muted">This chat has no saved messages yet. Send one below and it will stay here.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`agent-msg ${m.role}`}>
            {m.role === "assistant" && <span className="agent-avatar"><Icon name="chat" size={15} /></span>}
            <div className="agent-bubble">
              {m.tool_results?.length > 0 && <div className="agent-tools">{m.tool_results.map((t, i) => <ToolLine key={i} t={t} />)}</div>}
              <div className="agent-text">{renderMarkdown(m.text)}</div>
              {m.suggestions?.length > 0 && (
                <div className="agent-suggs">{m.suggestions.map((s, i) => <button key={i} type="button" className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="agent-msg assistant"><span className="agent-avatar"><Icon name="chat" size={15} /></span><div className="agent-bubble"><span className="agent-dots">…</span></div></div>}
        {error && <div className="agent-msg error"><div className="agent-bubble">{error}</div></div>}
        <div ref={bottom} />
      </div>
      <div className="agent-composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask the assistant…"
          rows={1}
          disabled={busy}
        />
        <button type="button" className="agent-send" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
