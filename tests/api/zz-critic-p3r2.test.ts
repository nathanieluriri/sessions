import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client, createHarness, type Harness } from "../helpers/harness";
import { filesService } from "../../src/worker/services/files";
import { filesRepo } from "../../src/worker/repositories/files";
import worker from "../../src/worker/index";

const MiB = 1024 * 1024;
const PART = 8 * MiB;
const CLIENT = "/api/account";
const STAFF = "/api/admin";
const NOT_FOUND = { error: "Not found.", code: "not_found" };

let h: Harness;
let boss: Client;
let alice: { client: Client; email: string; user: any };
let bob: { client: Client; email: string; user: any };
let maker: { client: Client; email: string };
let desk: { client: Client; email: string };
let seq = 0;

function noise(n: number, seed: number) {
  const out = new Uint8Array(n);
  let x = (Math.imul(seed, 2654435761) >>> 0) || 1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 255; }
  return out;
}
const sha = async (data: ArrayBuffer | Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesOf = async (r: { res: Response }) => new Uint8Array(await r.res.arrayBuffer());
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Inserts a booking directly so these tests do not depend on how the booking engine prices and schedules. */
async function makeBooking(o: { userId?: string | null; email?: string; status?: string; total?: number; paid?: number; limit?: number; scheduling?: string; due?: string | null; final?: boolean; artist?: string; pkg?: string } = {}) {
  const id = crypto.randomUUID();
  const ref = `PR-T-${String(++seq).padStart(4, "0")}`;
  await h.env.DB.prepare(
    `INSERT INTO bookings (id, ref, user_id, category, service_name, package_id, package_name, package_price_kobo, total_kobo, amount_paid_kobo, date, start_min, end_min, people,
       artist_name, contact_name, contact_email, contact_phone, status, policy_version, scheduling, due_date, revision_limit, delivered_final_at, pay_token)
     VALUES (?1, ?2, ?3, 'music', 'Mixing and mastering', 'pkg-test', ?14, ?4, ?4, ?5, '2026-11-02', 0, 0, 1, ?6, 'Kemi Balogun', ?7, '+234 805 111 2233', ?8, 1, ?9, ?10, ?11, ?12, 'tok-secret-123')`,
  ).bind(id, ref, o.userId ?? null, o.total ?? 10_000_000, o.paid ?? 0, o.artist ?? "Test Artist", o.email ?? "", o.status ?? "confirmed", o.scheduling ?? "project", o.due ?? null, o.limit ?? 3,
    o.final ? new Date().toISOString() : null, null, o.pkg ?? "Mixing and mastering (Standard)").run();
  return { id, ref };
}
const mine = (o: Parameters<typeof makeBooking>[0] = {}) => makeBooking({ userId: alice.user.id, email: alice.email, artist: "Alice Wonder", ...o });
const pay = (id: string) => h.env.DB.prepare("UPDATE bookings SET amount_paid_kobo = total_kobo WHERE id = ?").bind(id).run();
const row = async (id: string) => (await h.sql("SELECT * FROM booking_files WHERE id = ?", id))[0];
const booking = async (id: string) => (await h.sql("SELECT * FROM bookings WHERE id = ?", id))[0];
const outbox = (to: string, subject: string) => h.sql("SELECT * FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at", to, subject);

/** Runs the whole upload protocol and returns the finished File. */
async function send(c: Client, base: string, bookingId: string, name: string, data: Uint8Array) {
  const begun = await c.post(`${base}/bookings/${bookingId}/files`, { name, size: data.length, contentType: "audio/mpeg" });
  if (begun.status !== 200) throw new Error(`begin ${begun.status} ${JSON.stringify(begun.body)}`);
  const { id, partSize, parts } = begun.body;
  for (let n = 1; n <= parts; n++) {
    const r = await c.call("PUT", `${base}/files/${id}/parts/${n}`, { raw: data.subarray((n - 1) * partSize, n * partSize) });
    if (r.status !== 200) throw new Error(`part ${n} ${r.status} ${JSON.stringify(r.body)}`);
  }
  const done = await c.post(`${base}/files/${id}/complete`);
  if (done.status !== 200) throw new Error(`complete ${done.status} ${JSON.stringify(done.body)}`);
  return done.body;
}
const stage = (booking: string, name = "mix.mp3", size = 200_000, seed = 1) => send(maker.client, STAFF, booking, name, noise(size, seed));
const head = async (c: Client, path: string) => {
  const res = await worker.fetch!(new Request(`https://test.local${path}`, { method: "HEAD", headers: { cookie: c.cookie } }) as never, h.env, h.ctx);
  return { status: res.status, headers: res.headers };
};
const deliver = (c: Client, bookingId: string, items: { fileId: string; title: string }[], extra: object = {}) => c.post(`${STAFF}/bookings/${bookingId}/deliver`, { items, note: "", ...extra });

beforeAll(async () => {
  h = await createHarness();
  boss = await h.ceo();
  alice = await h.newClient("Alice Wonder");
  bob = await h.newClient("Bob Builder");
  maker = await h.newStaff("producer", ["view_calendar", "deliver_files"], "Mo Producer");
  desk = await h.newStaff("receptionist", ["view_calendar", "manage_bookings", "update_booking_details"], "Front Desk");
}, 120000);
afterAll(() => h?.dispose());

const log = (...a: unknown[]) => console.log("CRITIC", ...a);

describe("critic r2", () => {
  it("A auto-complete with a pending client cancellation request; request becomes undecidable", async () => {
    const order = await mine({ paid: 10_000_000, scheduling: "project" });
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Disputed" }]);
    const asked = await alice.client.post(`${CLIENT}/bookings/${order.id}/requests`, { kind: "cancel", reason: "The mix is not what I paid for" });
    log("A cancel request", asked.status, JSON.stringify(asked.body));
    await h.env.DB.prepare("UPDATE booking_files SET delivered_at = ? WHERE booking_id = ?").bind(ago(8 * 86_400_000), order.id).run();
    await filesService.housekeeping(h.env);
    const b = await booking(order.id);
    log("A after housekeeping", b.status, b.delivered_final_at);
    const reqs = await h.sql("SELECT id, status FROM change_requests WHERE booking_id = ?", order.id);
    log("A change requests", JSON.stringify(reqs));
    if (reqs[0]) {
      const decide = await boss.post(`${STAFF}/requests/${reqs[0].id}`, { approve: false });
      log("A decide decline", decide.status, JSON.stringify(decide.body));
      const list = await boss.get(`${STAFF}/requests`);
      log("A pending list contains", JSON.stringify(list.body).includes(order.ref));
    }
    // and with the client approve path
    const o2 = await mine({ paid: 10_000_000 });
    const f2 = await stage(o2.id);
    await deliver(maker.client, o2.id, [{ fileId: f2.id, title: "X" }]);
    await alice.client.post(`${CLIENT}/bookings/${o2.id}/requests`, { kind: "cancel", reason: "please" });
    const fin = await maker.client.post(`${STAFF}/bookings/${o2.id}/finalize`);
    log("A2 staff finalize with pending cancel request", fin.status, JSON.stringify(fin.body));
  }, 60000);

  it("B approve racing cancel", async () => {
    for (let i = 0; i < 6; i++) {
      const order = await mine({ paid: 10_000_000, scheduling: "project" });
      const f = await stage(order.id);
      await deliver(maker.client, order.id, [{ fileId: f.id, title: "Race" }]);
      const [a, c] = await Promise.all([
        alice.client.post(`${CLIENT}/bookings/${order.id}/approve`),
        boss.post(`${STAFF}/bookings/${order.id}/cancel`, { reason: "race", fullRefund: true }),
      ]);
      const b = await booking(order.id);
      log("B", i, a.status, c.status, b.status, !!b.delivered_final_at, b.refunded_kobo);
    }
  }, 120000);

  it("C auto-complete racing a revision request", async () => {
    for (let i = 0; i < 6; i++) {
      const order = await mine({ paid: 10_000_000, limit: 3 });
      const f = await stage(order.id);
      await deliver(maker.client, order.id, [{ fileId: f.id, title: "R" }]);
      await h.env.DB.prepare("UPDATE booking_files SET delivered_at = ? WHERE booking_id = ?").bind(ago(8 * 86_400_000), order.id).run();
      const [, r] = await Promise.all([filesService.housekeeping(h.env), alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "louder vocals" })]);
      const b = await booking(order.id);
      const revs = await h.sql("SELECT status FROM revision_requests WHERE booking_id = ?", order.id);
      log("C", i, r.status, b.status, !!b.delivered_final_at, b.revisions_used, JSON.stringify(revs));
    }
  }, 120000);

  it("D producer releases unpaid delivery", async () => {
    const order = await mine({ paid: 0 });
    const f = await stage(order.id);
    const d = await deliver(maker.client, order.id, [{ fileId: f.id, title: "Unpaid" }], { released: true });
    log("D deliver released by producer", d.status);
    const dl = await alice.client.get(`${CLIENT}/files/${f.id}/download`);
    log("D client download unpaid", dl.status);
  });

  it("E concurrent details puts send double catch-up email", async () => {
    const order = await makeBooking({ email: "", userId: null });
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Waiting" }]);
    const details = { people: 1, artist_name: "Walk In", contact_phone: "+234 803 000 0000", notes: "" };
    await Promise.all([1, 2, 3].map(() => desk.client.put(`${STAFF}/bookings/${order.id}/details`, { ...details, contact_email: "dbl.walkin@example.com" })));
    log("E emails", (await outbox("dbl.walkin@example.com", `%ready%`)).length);
    // change to a second address after notified
    await desk.client.put(`${STAFF}/bookings/${order.id}/details`, { ...details, contact_email: "second@example.com" });
    log("E second address emails", (await outbox("second@example.com", `%ready%`)).length);
  });

  it("F final delivery with balance, pay later, unlock; auto-complete never for unpaid", async () => {
    const order = await mine({ paid: 5_000_000 });
    const f = await stage(order.id);
    const d = await deliver(maker.client, order.id, [{ fileId: f.id, title: "Final" }], { final: true });
    log("F final with balance", d.status, (await booking(order.id)).status);
    log("F locked", (await alice.client.get(`${CLIENT}/files/${f.id}/download`)).status);
    const pay = await alice.client.post(`/api/bookings/${order.id}/pay`, { plan: "full" });
    log("F pay start", pay.status, JSON.stringify(pay.body).slice(0, 200));
  });

  it("G walk-in contact email of another client with existing user booking; and setContact on completed", async () => {
    const order = await mine({ paid: 10_000_000 });
    const details = { people: 1, artist_name: "Alice Wonder", contact_phone: "+234 803 000 0000", notes: "" };
    const r = await desk.client.put(`${STAFF}/bookings/${order.id}/details`, { ...details, contact_email: bob.email });
    log("G set bob email on alice booking", r.status, JSON.stringify(r.body), (await booking(order.id)).user_id === alice.user.id);
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Who gets it" }]);
    log("G mail to bob", (await outbox(bob.email, `%ready · ${order.ref}`)).length, "to alice", (await outbox(alice.email, `%ready · ${order.ref}`)).length);
  });

  it("H producer reads audit log / outbox / notifications for contacts", async () => {
    for (const p of ["/api/admin/audit", "/api/admin/outbox", "/api/admin/notifications", "/api/admin/overview", "/api/admin/deliveries?tab=delivered", "/api/admin/requests"]) {
      const r = await maker.client.get(p);
      const s = JSON.stringify(r.body ?? "");
      log("H", p, r.status, s.includes(alice.email) || s.includes("805 111 2233") || s.includes("803 000 0000"));
    }
  });

  it("I upload/remove churn bypasses file count and floods audit", async () => {
    const order = await mine();
    for (let i = 0; i < 5; i++) {
      const up = await send(alice.client, CLIENT, order.id, `churn${i}.wav`, noise(100, i));
      await alice.client.del(`${CLIENT}/files/${up.id}`);
    }
    log("I audit rows", (await h.sql("SELECT COUNT(*) n FROM audit_logs WHERE target = ?", order.ref))[0].n);
  });

  it("J deliver on cancelled-after-delivery booking; download after full refund of released", async () => {
    const order = await mine({ paid: 10_000_000 });
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Then cancelled" }], { released: true });
    const c = await boss.post(`${STAFF}/bookings/${order.id}/cancel`, { reason: "dispute", fullRefund: true });
    const b = await booking(order.id);
    log("J cancel", c.status, JSON.stringify(c.body), b.status, b.refunded_kobo);
    log("J client download after full refund", (await alice.client.get(`${CLIENT}/files/${f.id}/download`)).status);
    log("J files listing", JSON.stringify((await alice.client.get(`${CLIENT}/files`)).body.bookings.find((x: any) => x.id === order.id) ?? null).slice(0, 300));
  });
});

describe("critic r2 real flow", () => {
  const who = { artistName: "Kemi B", contactName: "Kemi Balogun", contactPhone: "+234 805 111 2233" };
  const MIXP = { serviceSlug: "mixing-mastering", packageId: "pkg_mm_standard" };
  async function bookProject(plan: "full" | "deposit") {
    const { client, email, user } = await h.newClient("Real Artist");
    const hold = await client.post("/api/holds", { ...MIXP, extraHours: 0, extras: [], people: 1, project: "", notes: "", links: "", ...who, contactEmail: email });
    if (hold.status !== 200) throw new Error(JSON.stringify(hold.body));
    const co = await client.post("/api/checkout", { holdId: hold.body.holdId, plan });
    if (co.status !== 200) throw new Error("co " + JSON.stringify(co.body));
    const paid = await h.payDemo(client, co.body.reference);
    return { client, email, user, id: paid.body.booking.id as string, ref: paid.body.booking.ref as string };
  }
  it("K deposit, deliver locked, pay balance, revise, auto-complete, then refund attempt", async () => {
    let k;
    try { k = await bookProject("deposit"); } catch (e) { log("K book failed", String(e)); return; }
    const b0 = await booking(k.id);
    log("K booked", b0.status, b0.scheduling, b0.total_kobo, b0.amount_paid_kobo, b0.revision_limit, b0.due_date);
    const f = await stage(k.id, "master.wav", 50_000, 9);
    const d = await deliver(maker.client, k.id, [{ fileId: f.id, title: "Master" }]);
    log("K deliver", d.status, d.body.notified, d.body.notified_via);
    log("K locked dl", (await k.client.get(`${CLIENT}/files/${f.id}/download`)).status, (await k.client.call("GET", `${CLIENT}/files/${f.id}/download?inline=1`, { headers: { range: "bytes=0-10" } })).status);
    const mail = (await h.sql("SELECT body FROM email_outbox WHERE to_email = ? AND subject LIKE ?", k.email, `%ready%`))[0]?.body ?? "";
    log("K ready mail", JSON.stringify(mail).slice(0, 700));
    const p = await k.client.post(`/api/pay/${k.id}`, { plan: "full" });
    log("K pay start", p.status, JSON.stringify(p.body).slice(0, 150));
    if (p.body?.reference) { const v = await h.payDemo(k.client, p.body.reference); log("K pay", v.status, (await booking(k.id)).amount_paid_kobo); }
    log("K unlocked dl", (await k.client.get(`${CLIENT}/files/${f.id}/download`)).status);
    const rv = await k.client.post(`${CLIENT}/bookings/${k.id}/revisions`, { note: "more bass please" });
    log("K revision", rv.status);
    const f2 = await stage(k.id, "master2.wav", 50_000, 10);
    await deliver(maker.client, k.id, [{ fileId: f2.id, title: "Master" }]);
    await h.env.DB.prepare("UPDATE booking_files SET delivered_at = ? WHERE booking_id = ?").bind(ago(8 * 86_400_000), k.id).run();
    await filesService.housekeeping(h.env);
    const b1 = await booking(k.id);
    log("K after auto", b1.status, !!b1.delivered_final_at);
    const c = await boss.post(`${STAFF}/bookings/${k.id}/cancel`, { reason: "x", fullRefund: true });
    log("K cancel after complete", c.status);
    const comp = await h.sql("SELECT subject, to_email FROM email_outbox WHERE subject LIKE ?", `%${k.ref}%`);
    log("K mails", JSON.stringify(comp));
  }, 120000);

  it("L project full pay, delivered+released, then staff cancel with full refund: client keeps files?", async () => {
    let k;
    try { k = await bookProject("full"); } catch (e) { log("L book failed", String(e)); return; }
    const f = await stage(k.id, "song.wav", 40_000, 11);
    await deliver(maker.client, k.id, [{ fileId: f.id, title: "Song" }], { released: true });
    const c = await boss.post(`${STAFF}/bookings/${k.id}/cancel`, { reason: "refund dispute", fullRefund: true });
    const b = await booking(k.id);
    log("L cancel", c.status, JSON.stringify(c.body), b.status, b.amount_paid_kobo, b.refunded_kobo);
    log("L dl after full refund", (await k.client.get(`${CLIENT}/files/${f.id}/download`)).status);
  }, 60000);
});
