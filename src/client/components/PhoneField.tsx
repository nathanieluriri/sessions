import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { countryName, flagOf, loadPhone, TOP, type CountryCode, type PhoneLib } from "../lib/phone";
import { Icon } from "./brand";

interface Props { label: string; name: string; value: string; onChange: (value: string, valid: boolean) => void; required?: boolean; hint?: string }

/** Phone input with a searchable country code picker. Emits the number in international format. */
export function PhoneField({ label, name, value, onChange, required, hint }: Props) {
  const [lib, setLib] = useState<PhoneLib | null>(null);
  const [country, setCountry] = useState<CountryCode>("NG");
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [touched, setTouched] = useState(false);
  const sent = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => { loadPhone().then(setLib); }, []);
  // Values set by the page (a saved profile, a prefilled draft) replace what is shown; values this field emitted do not.
  useEffect(() => {
    if (!lib || value === sent.current) return;
    sent.current = value;
    const p = value ? lib.parsePhoneNumberFromString(value, country) : undefined;
    if (p?.country && p.countryCallingCode !== lib.getCountryCallingCode(country)) setCountry(p.country);
    setText(p?.country ? p.formatNational() : value);
  }, [value, lib]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const countries = useMemo(() => {
    if (!lib) return [];
    const all = lib.getCountries().map((c) => ({ iso: c, name: countryName(c), code: lib.getCountryCallingCode(c) as string }));
    all.sort((a, b) => a.name.localeCompare(b.name));
    return [...TOP.map((t) => all.find((c) => c.iso === t)!).filter(Boolean), ...all.filter((c) => !TOP.includes(c.iso))];
  }, [lib]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^\+/, "");
    if (!s) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(s) || c.iso.toLowerCase() === s || c.code.startsWith(s));
  }, [q, countries]);

  const parse = (raw: string, c: CountryCode) => (raw.trim() ? lib?.parsePhoneNumberFromString(raw, c) : undefined);
  const emit = (raw: string, c: CountryCode) => {
    const p = parse(raw, c);
    const out = !raw.trim() ? "" : p ? p.formatInternational() : raw.trim();
    sent.current = out;
    onChange(out, raw.trim() ? !!p?.isValid() : !required);
  };
  const type = (raw: string) => {
    if (!lib) { setText(raw); sent.current = raw; onChange(raw, true); return; }
    const intl = raw.trim().startsWith("+");
    const t = new lib.AsYouType(intl ? undefined : country);
    const formatted = t.input(raw);
    const c = intl ? t.getCountry() : undefined;
    if (c && t.getCallingCode() !== lib.getCountryCallingCode(country)) setCountry(c);
    // While deleting, keep exactly what was typed so a backspace over a space is not undone; it is tidied on blur.
    setText(raw.length < text.length ? raw : formatted);
    emit(raw, c ?? country);
  };
  const pick = (c: CountryCode) => {
    setCountry(c); setOpen(false); setQ("");
    const local = text.trim().startsWith("+") ? "" : text;
    setText(local);
    emit(local, c);
    requestAnimationFrame(() => input.current?.focus());
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, Math.min(shown.length - 1, hi + (e.key === "ArrowDown" ? 1 : -1)));
      setHi(n);
      list.current?.children[n]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") { e.preventDefault(); if (shown[hi]) pick(shown[hi].iso); }
    else if (e.key === "Escape") { setOpen(false); input.current?.focus(); }
  };

  const p = parse(text, country);
  const bad = touched && !!text.trim() && !!lib && !p?.isValid();
  const code = lib ? lib.getCountryCallingCode(country) : "234";
  return (
    <div className="field telfield" ref={box}>
      <label htmlFor={name}>{label}</label>
      <div className={`telbox ${bad ? "bad" : ""}`}>
        <button type="button" className="tel-cc" onClick={() => { setOpen(!open); setHi(0); setQ(""); }} aria-haspopup="listbox" aria-expanded={open} aria-label={`Country code: ${countryName(country)}, +${code}`}>
          <span className="flag" aria-hidden>{flagOf(country)}</span><span>+{code}</span><Icon name="chevron" size={14} />
        </button>
        <input ref={input} id={name} name={name} type="tel" inputMode="tel" autoComplete="tel" required={required} value={text}
          placeholder={country === "NG" ? "0803 000 0000" : "Phone number"}
          onChange={(e) => type(e.target.value)}
          onBlur={() => { setTouched(true); if (p?.isValid()) setText(p.countryCallingCode === code ? p.formatNational() : p.formatInternational()); }}
          aria-invalid={bad || undefined} />
      </div>
      {open && (
        <div className="tel-pop" role="dialog" aria-label="Choose a country">
          <div className="tel-search"><Icon name="search" size={16} /><input autoFocus placeholder="Search country or code" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={keys} aria-label="Search countries" /></div>
          <ul ref={list} role="listbox" aria-label="Countries">
            {shown.length === 0 && <li className="tel-none">No country matches “{q}”.</li>}
            {shown.map((c, i) => (
              <li key={c.iso} role="option" aria-selected={c.iso === country} className={`${i === hi ? "hi" : ""} ${c.iso === country ? "on" : ""} ${!q && i === TOP.length - 1 ? "sep" : ""}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(c.iso); }}>
                <span className="flag" aria-hidden>{flagOf(c.iso)}</span><span className="grow">{c.name}</span><span className="tel-code">+{c.code}</span>
                {c.iso === country && <Icon name="check" size={16} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bad ? <span className="hint bad">Enter a valid {countryName(country)} number{country === "NG" ? ", like 0803 000 0000" : ""}.</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}
