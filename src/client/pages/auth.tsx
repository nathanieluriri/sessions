import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mark, Waveform } from "../components/brand";
import { Btn, EmailField, ErrorBox, Field, NameField } from "../components/ui";
import { PhoneField } from "../components/PhoneField";
import { TactileLink } from "../components/kitchen";
import { PHOTOS } from "../lib/catalog";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

function AuthShell({ photo, quote, by, title, sub, children }: { photo: string; quote: string; by: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="authsplit">
      <div className="authphoto" style={{ backgroundImage: `url(${photo})` }}>
        <Link to="/" className="brandmark" style={{ top: 32, left: 32, color: "#fff" }}><Mark tone="neon" /> Psych Records</Link>
        <div style={{ left: 32, right: 32, bottom: 40 }} className="stack gap16">
          <Waveform className="authwave" step={10} />
          <p style={{ fontSize: 26, lineHeight: 1.2, letterSpacing: "-.02em", fontWeight: 500, maxWidth: 460 }}>“{quote}”</p>
          <span className="mono" style={{ opacity: .7 }}>{by}</span>
        </div>
      </div>
      <div className="authform">
        <div className="inner">
          <div className="stack gap8"><h1 className="h2">{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function useForm<T extends Record<string, string>>(init: T) {
  const [f, setF] = useState(init);
  const bind = (k: keyof T) => ({ name: String(k), value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  return [f, bind, setF] as const;
}

function useSubmit(fn: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await fn(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return { error, busy, submit };
}

function LoginForm({ staff }: { staff?: boolean }) {
  const [f, bind] = useForm({ email: "", password: "" });
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const { error, busy, submit } = useSubmit(async () => {
    const r = await api("/auth/login", { body: { ...f, staff } });
    setUser(r.user);
    nav(q.get("next") ?? (r.user.role === "client" ? "/account" : "/admin"), { replace: true });
  });
  return (
    <form className="stack gap16" onSubmit={submit}>
      <EmailField label="Email" required {...bind("email")} />
      <Field label="Password" type="password" autoComplete="current-password" required {...bind("password")} />
      <Link to="/forgot-password" className="small" style={{ color: "var(--brand)", fontWeight: 500 }}>Forgot password?</Link>
      <ErrorBox error={error} />
      <Btn arrow block disabled={busy}>{busy ? "Signing in…" : "Log in"}</Btn>
    </form>
  );
}

export function Login() {
  return (
    <AuthShell photo={PHOTOS.singer} quote="Booked at midnight, recorded the next afternoon." by="Amaka Eze · Artist" title="Welcome back." sub="Log in to see your bookings, receipts and requests.">
      <LoginForm />
      <p className="small muted">New to Psych Records? <Link to="/register" style={{ color: "var(--brand)", fontWeight: 500 }}>Create an account</Link></p>
    </AuthShell>
  );
}

export function StaffLogin() {
  return (
    <AuthShell photo={PHOTOS.control} quote="Every session starts on time when the calendar is right." by="Psych Records · Staff" title="Staff sign in." sub="For studio staff accounts created by the CEO. Client accounts cannot sign in here.">
      <LoginForm staff />
    </AuthShell>
  );
}

export function Register() {
  const [f, bind, setF] = useForm({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const { setUser } = useAuth();
  const nav = useNavigate();
  const { error, busy, submit } = useSubmit(async () => {
    const r = await api("/auth/register", { body: f });
    setUser(r.user);
    nav("/account", { replace: true });
  });
  return (
    <AuthShell photo={PHOTOS.performer} quote="Walk in ready, walk out with the record, the video or the shoot." by="Psych Records Entertainment" title="Create your account." sub="Manage bookings, payments and receipts in one place.">
      <form className="stack gap16" onSubmit={submit}>
        <NameField label="Full name" required {...bind("name")} />
        <EmailField label="Email" required {...bind("email")} />
        <PhoneField label="Phone number" name="phone" required value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <Field label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, with a number" required {...bind("password")} />
        <Field label="Confirm password" type="password" autoComplete="new-password" required {...bind("confirmPassword")} />
        <ErrorBox error={error} />
        <Btn arrow block disabled={busy}>{busy ? "Creating…" : "Create account"}</Btn>
      </form>
      <p className="small muted">Already have an account? <Link to="/login" style={{ color: "var(--brand)", fontWeight: 500 }}>Log in</Link></p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [f, bind] = useForm({ email: "" });
  const [sent, setSent] = useState(false);
  const { error, busy, submit } = useSubmit(async () => { await api("/auth/forgot-password", { body: f }); setSent(true); });
  return (
    <AuthShell photo={PHOTOS.voiceover} quote="Locked out? We will get you back in." by="Psych Records Entertainment" title="Reset your password." sub="Enter your email and we will send a reset link that works for one hour.">
      {sent ? <div className="panel">If an account exists for {f.email}, a reset link is on its way.</div> : (
        <form className="stack gap16" onSubmit={submit}>
          <EmailField label="Email" required {...bind("email")} />
          <ErrorBox error={error} />
          <Btn arrow block disabled={busy}>Send reset link</Btn>
        </form>
      )}
      <Link to="/login" className="small" style={{ color: "var(--brand)", fontWeight: 500 }}>Back to log in</Link>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [q] = useSearchParams();
  const [f, bind] = useForm({ password: "", confirmPassword: "" });
  const [done, setDone] = useState(false);
  const { error, busy, submit } = useSubmit(async () => { await api("/auth/reset-password", { body: { ...f, token: q.get("token") ?? "" } }); setDone(true); });
  return (
    <AuthShell photo={PHOTOS.producer} quote="Fresh start, same sound." by="Psych Records Entertainment" title="Choose a new password.">
      {done ? <><div className="panel">Your password was changed. Other devices were signed out.</div><TactileLink to="/login" size="lg">Log in</TactileLink></> : (
        <form className="stack gap16" onSubmit={submit}>
          <Field label="New password" type="password" hint="At least 8 characters, with a number" required {...bind("password")} />
          <Field label="Confirm password" type="password" required {...bind("confirmPassword")} />
          <ErrorBox error={error} />
          <Btn arrow block disabled={busy}>Save password</Btn>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmail() {
  const [q] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("/auth/verify-email", { body: { token: q.get("token") ?? "" } })
      .then(() => { setState("ok"); refresh(); })
      .catch((e) => { setState("error"); setMsg(e.message); });
  }, [q, refresh]);
  return (
    <AuthShell photo={PHOTOS.editing} quote="One quick check and you are set." by="Psych Records Entertainment" title={state === "ok" ? "Email verified." : state === "error" ? "That link did not work." : "Verifying your email…"}>
      {state === "ok" && <TactileLink to="/account" size="lg">Go to my account</TactileLink>}
      {state === "error" && <><ErrorBox error={msg} /><TactileLink to="/account/profile" variant="light" size="lg">Send a new link</TactileLink></>}
    </AuthShell>
  );
}
