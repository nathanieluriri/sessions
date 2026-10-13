/** Tidies spacing and capitalises names typed all in lower or upper case. Mixed case is kept as typed, so "McDonald" stays. */
export function tidyName(v: string) {
  const s = v.replace(/\s+/g, " ").trim();
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export const tidyEmail = (v: string) => v.trim().toLowerCase();
