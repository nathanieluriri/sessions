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
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    let alive = true;
    getConversation(conversationId).then((c) => { if (alive) setMessages(c.messages); }).catch(() => {});
    return () => { alive = false; };
  }, [conversationId]);

  const send = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    setBusy(true);
    setError("");
    const mine: Message = { id: `local-${Date.now()}`, role: "user", text: value, steps: [], tool_results: [], suggestions: [], created_at: new Date().toISOString() };
    setMessages((m) => [...m, mine]);
    try {
      const r = await chat(value, conversationId);
      const reply: Message = { id: `local-${Date.now()}-a`, role: "assistant", text: r.text, steps: r.steps.map((s) => s.label), tool_results: r.toolResults, suggestions: r.suggestions, created_at: new Date().toISOString() };
      setMessages((m) => [...m, reply]);
      if (!conversationId && r.conversationId) onConversationId?.(r.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "It didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`agent-surface ${layout}`}>
      <div className="agent-scroll">
        {messages.length === 0 && !busy && (
          <div className="agent-empty">
            <span className="agent-mark"><Icon name="chat" size={22} /></span>
            <p><b>Studio assistant</b></p>
            <p className="muted">Ask about bookings, payments, clients or reports, or ask me to record a payment, approve a request, or reply to an enquiry. I only do what your permissions allow.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`agent-msg ${m.role}`}>
            {m.role === "assistant" && <span className="agent-avatar"><Icon name="chat" size={15} /></span>}
            <div className="agent-bubble">
              {m.tool_results?.length > 0 && <div className="agent-tools">{m.tool_results.map((t, i) => <ToolLine key={i} t={t} />)}</div>}
              <div className="agent-text">{renderMarkdown(m.text)}</div>
              {m.suggestions?.length > 0 && (
                <div className="agent-suggs">{m.suggestions.map((s, i) => <button key={i} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
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
        <button className="agent-send" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
