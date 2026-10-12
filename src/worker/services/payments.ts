import type { Env } from "../env";
import { bookingsRepo, paymentsRepo, type BookingRow } from "../repositories/bookings";
import { AppError } from "../lib/errors";
import { uuid } from "../lib/crypto";

export interface VerifyResult { status: "success" | "failed" | "pending"; amount: number; channel: string | null }

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newReference = (prefix = "PR") => prefix + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join("");

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

/**
 * Refunds up to `amount` across the booking's payments, newest first. Online payments go back through the provider;
 * cash and transfer payments are recorded so staff can return them by hand. Returns the amount that still needs a manual refund.
 */
export async function refundBooking(env: Env, b: BookingRow, amount: number, reason: string) {
  let left = amount, manual = 0;
  const provider = paymentProvider(env);
  const payments = (await paymentsRepo.forBooking(env.DB, b.id)).filter((p) => p.amount_kobo > p.refunded_kobo).reverse();
  for (const p of payments) {
    if (left <= 0) break;
    const take = Math.min(left, p.amount_kobo - p.refunded_kobo);
    if (p.provider === "manual") manual += take;
    else if (p.provider === provider.name) await provider.refund(p.reference, take);
    await env.DB.batch([
      paymentsRepo.addRefund(env.DB, { id: uuid(), paymentId: p.id, bookingId: b.id, amount: take, reason }),
      paymentsRepo.addRefunded(env.DB, p.id, take),
      bookingsRepo.addRefunded(env.DB, b.id, take),
    ]);
    left -= take;
  }
  return manual;
}
