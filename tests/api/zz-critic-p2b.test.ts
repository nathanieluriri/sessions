import { afterAll, beforeAll, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { createHarness, nextWeekday, type Harness } from "../helpers/harness";

vi.setConfig({ testTimeout: 120_000 });
let h: Harness;
beforeAll(async () => { h = await createHarness(); }, 120000);
afterAll(() => h?.dispose());

const OUT = "/tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad/critic-p2b/probe.txt";
const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactPhone: "+234 805 111 2233" };
const d = (serviceSlug: string, packageId: string, date: string, start: number, over: Record<string, unknown> = {}) =>
  ({ serviceSlug, packageId, date, start, extraHours: 0, extras: [], people: 2, project: "", notes: "", links: "", ...who, ...over });

it("probe", async () => {
  const log: string[] = [];
  const sat = nextWeekday(6, 10), mon = nextWeekday(1, 10), tue = nextWeekday(2, 10);
  const cases: [string, Record<string, unknown>, string][] = [
    ["recording", d("recording", "pkg_recording_session", mon, 750), "full"],
    ["fullprod", d("full-production", "pkg_full_production", sat, 1380), "deposit"],
    ["beat", d("beat-production", "pkg_beat_production", "", 0), "full"],
    ["cover", d("song-covers", "pkg_song_cover", "", 0), "full"],
    ["express", d("mixing-mastering", "pkg_mm_express", "", 0), "full"],
  ];
  for (const [name, body, plan] of cases) {
    const { client, email } = await h.newClient();
    const q = await client.post("/api/quote", { ...body, contactEmail: email });
    log.push(`## ${name} quote ${q.status} ${JSON.stringify(q.body).slice(0, 1500)}`);
    const hold = await client.post("/api/holds", { ...body, contactEmail: email });
    log.push(`hold ${hold.status} ${JSON.stringify(hold.body).slice(0, 600)}`);
    if (hold.status !== 200) continue;
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan });
    log.push(`checkout ${co.status} ${JSON.stringify(co.body).slice(0, 300)}`);
    const paid = await h.payDemo(client, co.body.reference);
    const id = paid.body.booking?.id;
    const acct = await client.get(`/api/account/bookings/${id}`);
    log.push(`account policy ${JSON.stringify(acct.body.policy ?? acct.body.booking?.policy)}`);
    const mails = await h.sql("SELECT subject, body FROM email_outbox WHERE to_email = ? ORDER BY rowid", email);
    for (const m of mails) log.push(`--- MAIL ${m.subject}\n${m.body}`);
  }
  // EP request
  const { client, email } = await h.newClient();
  const ep = await client.post("/api/holds", { ...d("produce-ep", "pkg_produce_ep", tue, 600, { extras: ["album-art", "independent-distribution", "pr-campaign"] }), contactEmail: email });
  log.push(`## EP hold ${ep.status} ${JSON.stringify(ep.body).slice(0, 1500)}`);
  const req = await client.post("/api/requests", { holdId: ep.body.holdId });
  log.push(`EP request ${req.status} ${JSON.stringify(req.body).slice(0, 500)}`);
  for (const m of await h.sql("SELECT to_email, subject, body FROM email_outbox WHERE subject LIKE '%request%' OR subject LIKE '%Request%' ORDER BY rowid")) log.push(`--- MAIL to ${m.to_email} ${m.subject}\n${m.body}`);
  const boss = await h.ceo(); const ap = await boss.post(`/api/admin/bookings/${req.body.booking.id}/approve`, { note: "" }); log.push(`approve ${ap.status} ${JSON.stringify(ap.body).slice(0,200)}`);
  for (const m of await h.sql("SELECT to_email, subject, body FROM email_outbox WHERE subject LIKE ? ORDER BY rowid", "Approved%")) log.push(`--- MAIL to ${m.to_email} ${m.subject}\n${m.body}`);
  writeFileSync(OUT, log.join("\n"));
});
