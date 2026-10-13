import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Btn, ErrorBox, Field, NameField, toast } from "./ui";
import { PhoneField } from "./PhoneField";

/** Details and password forms, shared by the client account and the staff dashboard. */
export function ProfileForms() {
  const { user, refresh } = useAuth();
  const staff = user?.role !== "client";
  const [f, setF] = useState({ name: user?.name ?? "", phone: user?.phone ?? "" });
  const [pw, setPw] = useState({ current: "", password: "", confirmPassword: "" });
  const [err, setErr] = useState<{ p?: string; w?: string }>({});
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { await api("/auth/profile", { method: "PUT", body: f }); await refresh(); toast("Details saved"); setErr({}); } catch (x: any) { setErr({ p: x.message }); }
  };
  const change = async (e: FormEvent) => {
    e.preventDefault();
    try { await api("/auth/password", { method: "PUT", body: pw }); toast("Password changed"); setPw({ current: "", password: "", confirmPassword: "" }); setErr({}); } catch (x: any) { setErr({ w: x.message }); }
  };
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <form className="card stack gap16" onSubmit={save}>
        <h3 className="h4">Your details</h3>
        <NameField label="Full name" name="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Email" name="email" value={user?.email ?? ""} disabled hint={staff ? `${user?.role === "ceo" ? "CEO" : user?.title || "Staff"} account` : user?.emailVerified ? "Verified" : "Not verified yet"} />
        <PhoneField label="Phone number" name="phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} required={!staff} />
        <ErrorBox error={err.p} /><Btn>Save details</Btn>
      </form>
      <form className="card stack gap16" onSubmit={change}>
        <h3 className="h4">Change password</h3>
        <Field label="Current password" name="current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters, with a number" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
        <Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
        <ErrorBox error={err.w} /><Btn kind="neutral">Change password</Btn>
      </form>
    </div>
  );
}
