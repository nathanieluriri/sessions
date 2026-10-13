import type { CountryCode } from "libphonenumber-js/min";

export type PhoneLib = typeof import("libphonenumber-js/min");
export type { CountryCode };

let lib: Promise<PhoneLib> | null = null;
/** The phone library is only fetched on pages with a phone field. */
export const loadPhone = () => (lib ??= import("libphonenumber-js/min"));

export const flagOf = (iso: string) => String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

let names: Intl.DisplayNames | null = null;
export const countryName = (iso: string) => {
  try { return (names ??= new Intl.DisplayNames(["en"], { type: "region" })).of(iso) ?? iso; } catch { return iso; }
};

/** Countries clients are most likely to book from, shown above the full list. */
export const TOP: CountryCode[] = ["NG", "GH", "GB", "US", "ZA", "KE", "CA"];
