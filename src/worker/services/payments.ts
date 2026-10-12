import type { Env } from "../env";
import { paymentsRepo } from "../repositories/bookings";
import { AppError } from "../lib/errors";

export interface VerifyResult { status: "success" | "failed" | "pending"; amount: number; channel: string | null }

/** Paystack when a secret key is configured; otherwise a simulated provider that keeps the same server-side verification path. */
export function paymentProvider(env: Env) {
  const key = env.PAYSTACK_SECRET_KEY;
  if (key) {
    const call = async (path: string, init?: RequestInit) => {
      const res = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
      const body = (await res.json()) as { status: boolean; message: string; data: any };
      if (!res.ok || !body.status) throw new AppError(502, `Paystack: ${body.message}`, "provider_error");
      return body.data;
    };
    return {
      name: "paystack" as const,
      async initialize(reference: string, amount: number, email: string, callbackUrl: string) {
        const d = await call("/transaction/initialize", { method: "POST", body: JSON.stringify({ reference, amount, email, callback_url: callbackUrl }) });
        return d.authorization_url as string;
      },
      async verify(reference: string): Promise<VerifyResult> {
        const d = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
        return { status: d.status === "success" ? "success" : d.status === "failed" || d.status === "abandoned" ? "failed" : "pending", amount: d.amount, channel: d.channel ?? null };
      },
      async refund(reference: string, amount: number) {
        await call("/refund", { method: "POST", body: JSON.stringify({ transaction: reference, amount }) });
      },
    };
  }
  return {
    name: "demo" as const,
    async initialize(reference: string, amount: number) {
      await paymentsRepo.demoCreate(env.DB, reference, amount);
      return `/pay/demo?reference=${encodeURIComponent(reference)}`;
    },
    async verify(reference: string): Promise<VerifyResult> {
      const t = await paymentsRepo.demoGet(env.DB, reference);
      return { status: (t?.status as VerifyResult["status"]) ?? "failed", amount: t?.amount_kobo ?? 0, channel: t?.channel ?? null };
    },
    async refund() {},
  };
}
