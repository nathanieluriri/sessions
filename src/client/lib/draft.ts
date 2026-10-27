import { canonicalService } from "./booking";

// The booking draft lives in localStorage so it survives sign up, log in and the payment redirect.
export interface BookingDraft {
  serviceSlug?: string; packageId?: string; date?: string; start?: number; extraHours: number; extras: string[]; people: number;
  artistName: string; contactName: string; contactEmail: string; contactPhone: string; project: string; notes: string; links: string;
  plan: "deposit" | "full"; holdId?: string; cartHoldId?: string; cartItems: BookingCartItem[];
}
export interface BookingCartItem { id: string; serviceSlug: string; packageId: string; date: string; start: number; extraHours: number; extras: string[]; people: number }
const KEY = "psych.draft";
export const emptyDraft: BookingDraft = { extraHours: 0, extras: [], people: 1, artistName: "", contactName: "", contactEmail: "", contactPhone: "", project: "", notes: "", links: "", plan: "deposit", cartItems: [] };
let memory: Partial<BookingDraft> = {};
export const loadDraft = (): BookingDraft => {
  let saved = memory;
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? memory; } catch { /* storage blocked or corrupt */ }
  const d: BookingDraft = { ...emptyDraft, ...saved };
  return { ...d, serviceSlug: canonicalService(d.serviceSlug), extras: Array.isArray(d.extras) ? d.extras : [], cartItems: Array.isArray(d.cartItems) ? d.cartItems : [] };
};
export const saveDraft = (d: BookingDraft) => { memory = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
export const clearDraft = () => { memory = {}; try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
