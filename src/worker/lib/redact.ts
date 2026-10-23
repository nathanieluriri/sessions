import { canSeeContacts } from "../../shared/permissions";
import type { SessionUser } from "../env";

/** Staff views of a booking never carry the payment token, and only the front desk sees how to reach the client. */
export function forStaff<T extends { contact_email?: string; contact_phone?: string; pay_token?: string | null }>(b: T, user: SessionUser) {
  const { pay_token: _token, ...rest } = b;
  return canSeeContacts(user) ? rest : { ...rest, contact_email: "", contact_phone: "" };
}
