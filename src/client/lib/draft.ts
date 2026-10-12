// The booking draft lives in localStorage so it survives sign up, log in and the payment redirect.
export interface BookingDraft {
  serviceSlug?: string; packageId?: string; date?: string; start?: number; extraHours: number; extras: string[];
  people: number; artistName: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; holdId?: string;
}
const KEY = "sessions.draft";
export const emptyDraft: BookingDraft = { extraHours: 0, extras: [], people: 1, artistName: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" };
export const loadDraft = (): BookingDraft => { try { return { ...emptyDraft, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { ...emptyDraft }; } };
export const saveDraft = (d: BookingDraft) => localStorage.setItem(KEY, JSON.stringify(d));
export const clearDraft = () => localStorage.removeItem(KEY);
