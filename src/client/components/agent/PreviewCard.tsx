import { pendingGist, type PendingLike } from "../../../shared/agent-confirm";
import type { PendingChange } from "../../lib/agent";

export function PreviewCard({ pending, busy, onAccept, onDecline, onOther }: {
  pending: PendingChange;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onOther: () => void;
}) {
  const p = pending.preview;
  const gist = pendingGist(pending as PendingLike);
  const copy = pending.tool === "content_set";
  return (
    <div className="agent-preview">
      <b className="small">{p.available ? p.title : "Ready to save"}</b>
      {p.where && <span className="caption">{p.where}</span>}
      {p.available ? (
        <div className="agent-preview-diff">
          {p.before != null && <div><span className="mono faint">Now</span><p>{p.before}</p></div>}
          {p.after != null && <div className="after"><span className="mono faint">After Accept</span><p>{p.after}</p></div>}
        </div>
      ) : (
        <div className="agent-preview-diff">
          <div className="after"><span className="mono faint">Will save</span><p>{gist}</p></div>
          <p className="small">{p.note || "I couldn't draw a before/after. Accept still saves this."}</p>
        </div>
      )}
      {p.note && p.available && <p className="caption">{p.note}</p>}
      <p className="caption">Accept saves it. You can also type Accept.</p>
      <div className="agent-preview-actions">
        <button type="button" className="agent-form-go" disabled={busy} onClick={onAccept}>{busy ? "Saving…" : "Accept"}</button>
        <button type="button" className="chip" disabled={busy} onClick={onDecline}>Decline</button>
        {copy && <button type="button" className="chip" disabled={busy} onClick={onOther}>Find another</button>}
      </div>
    </div>
  );
}
