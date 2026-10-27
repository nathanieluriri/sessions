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

describe("upload protocol", () => {
  it("takes a 17 MiB file in three parts sent out of order, replaces a replayed part and serves it back byte for byte", async () => {
    const order = await mine();
    const data = noise(17 * MiB + 123, 7);
    const part = (n: number) => data.subarray((n - 1) * PART, Math.min(data.length, n * PART));
    const begun = await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "Album stems.zip", size: data.length, contentType: "application/zip" });
    expect(begun.status).toBe(200);
    expect(begun.body).toMatchObject({ partSize: PART, parts: 3 });
    const id = begun.body.id;
    const put = (n: number, bytes: Uint8Array) => alice.client.call("PUT", `${CLIENT}/files/${id}/parts/${n}`, { raw: bytes });
    const complete = () => alice.client.post(`${CLIENT}/files/${id}/complete`);

    expect((await put(3, part(3))).body).toEqual({ ok: true, size: part(3).length });
    expect((await put(2, noise(PART, 99))).status).toBe(200);
    expect((await complete()).status).toBe(400);
    expect((await put(2, part(2))).status).toBe(200);
    expect((await complete()).status).toBe(400);
    expect((await put(1, part(1))).status).toBe(200);
    const recorded = JSON.parse((await row(id)).parts);
    expect(recorded.map((p: any) => p.partNumber).sort()).toEqual([1, 2, 3]);
    expect(recorded.every((p: any) => p.etag && p.size > 0)).toBe(true);

    const done = await complete();
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ id, booking_id: order.id, direction: "upload", name: "Album stems.zip", size: data.length, content_type: "application/zip", locked: false, released: false, downloads: 0, first_downloaded_at: null });
    const stored = await row(id);
    expect(stored).toMatchObject({ state: "ready", size: data.length, upload_id: null, parts: "[]", r2_key: `portal/${order.id}/${id}` });
    expect(stored.completed_at).toBeTruthy();

    const want = await sha(data);
    const full = await boss.get(`${STAFF}/files/${id}/download`);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-length")).toBe(String(data.length));
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(await sha(await bytesOf(full))).toBe(want);

    const slice = async (range: string) => (await boss.call("GET", `${STAFF}/files/${id}/download`, { headers: { range } }));
    const across = await slice(`bytes=${PART - 8}-${PART + 7}`);
    expect(across.status).toBe(206);
    expect(across.headers.get("content-range")).toBe(`bytes ${PART - 8}-${PART + 7}/${data.length}`);
    expect(across.headers.get("content-length")).toBe("16");
    expect(await sha(await bytesOf(across))).toBe(await sha(data.subarray(PART - 8, PART + 8)));
    const tail = await slice("bytes=-100");
    expect(tail.status).toBe(206);
    expect(await sha(await bytesOf(tail))).toBe(await sha(data.subarray(data.length - 100)));
    const open = await slice(`bytes=${data.length - 10}-`);
    expect(open.headers.get("content-range")).toBe(`bytes ${data.length - 10}-${data.length - 1}/${data.length}`);
    const past = await slice(`bytes=${data.length}-`);
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe(`bytes */${data.length}`);
    const ignored = await slice("bytes=0-5,10-20");
    expect(ignored.status).toBe(200);
    expect(ignored.headers.get("content-length")).toBe(String(data.length));
    const probe = await head(boss, `${STAFF}/files/${id}/download`);
    expect(probe.status).toBe(200);
    expect(probe.headers.get("content-length")).toBe(String(data.length));
    expect(probe.headers.get("etag")).toBeTruthy();
  }, 120000);

  it("refuses parts of the wrong size or number, and a finish with parts missing", async () => {
    const order = await mine();
    const size = 20 * MiB;
    const begun = await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "demo.wav", size });
    const id = begun.body.id;
    expect(begun.body.parts).toBe(3);
    const put = (n: number | string, bytes: Uint8Array) => alice.client.call("PUT", `${CLIENT}/files/${id}/parts/${n}`, { raw: bytes });
    for (const [n, bytes] of [[0, noise(PART, 1)], [4, noise(PART, 1)], ["x", noise(PART, 1)], ["1.5", noise(PART, 1)], [-1, noise(PART, 1)], [1, noise(1 * MiB, 1)], [1, noise(PART + 1, 1)], [1, new Uint8Array(0)], [3, noise(PART, 1)], [2, noise(4 * MiB, 1)]] as const) {
      const r = await put(n, bytes);
      expect(r.status, `part ${n} of ${bytes.length}`).toBe(400);
    }
    expect(JSON.parse((await row(id)).parts)).toEqual([]);
    const early = await alice.client.post(`${CLIENT}/files/${id}/complete`);
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/parts have not arrived/);
    expect((await put(3, noise(4 * MiB, 3))).status).toBe(200);
    expect((await alice.client.del(`${CLIENT}/files/${id}`)).status).toBe(200);
    expect((await put(1, noise(PART, 1))).status).toBe(404);
    expect((await alice.client.post(`${CLIENT}/files/${id}/complete`)).status).toBe(404);
    expect((await row(id)).state).toBe("removed");
  }, 60000);

  it("finishes once however many times and however simultaneously complete is called", async () => {
    const order = await mine();
    const data = noise(100_000, 3);
    const begun = await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "twice.mp3", size: data.length });
    const id = begun.body.id;
    expect((await alice.client.call("PUT", `${CLIENT}/files/${id}/parts/1`, { raw: data })).status).toBe(200);
    const replies = await Promise.all([1, 2, 3, 4].map(() => alice.client.post(`${CLIENT}/files/${id}/complete`)));
    expect(replies.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(replies.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect((await alice.client.post(`${CLIENT}/files/${id}/complete`)).body).toMatchObject({ id, size: data.length });
    const logged = await h.sql("SELECT * FROM audit_logs WHERE action = 'Uploaded file' AND target = ?", order.ref);
    expect(logged).toHaveLength(1);
    expect((await alice.client.call("PUT", `${CLIENT}/files/${id}/parts/1`, { raw: data })).status).toBe(409);
  });

  it("only accepts music, video, images, documents, archives and DAW files, and decides the type itself", async () => {
    const order = await mine();
    const begin = (name: string, size: number | string | null = 10, extra: object = {}) => alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name, size, ...extra });
    for (const name of ["x.html", "x.htm", "x.svg", "x.exe", "x.js", "x.php", "x.sh", "noextension", ".htaccess", "..\\..\\boot.ini", "x.mp3.exe", "", "x.xhtml"]) {
      const r = await begin(name);
      expect(r.status, JSON.stringify(name)).toBe(400);
    }
    expect((await begin("clip.mp3", 0)).body.error).toMatch(/empty/);
    expect((await begin("clip.mp3", -5)).status).toBe(400);
    expect((await begin("clip.mp3", 1.5)).status).toBe(400);
    expect((await begin("clip.mp3", "100")).status).toBe(400);
    expect((await begin("clip.mp3", null)).status).toBe(400);
    expect((await begin("clip.mp3", 2 ** 40)).body.error).toMatch(/up to 1 GB/);
    expect((await begin("clip.mp3", 1024 ** 3 + 1)).status).toBe(400);
    expect((await begin("clip.mp3", Number.MAX_SAFE_INTEGER)).status).toBe(400);
    for (const name of ["Song.MP3", "stems.zip", "cover.PNG", "notes.pdf", "session.ptx", "x.html.mp3", "take.wav", "  spaced out.mp3  "]) {
      const r = await begin(name, 10, { contentType: "text/html" });
      expect(r.status, name).toBe(200);
      await alice.client.del(`${CLIENT}/files/${r.body.id}`);
    }
    const biggest = await begin("long.wav", 1024 ** 3);
    expect(biggest.body).toMatchObject({ partSize: PART, parts: 128 });
    await alice.client.del(`${CLIENT}/files/${biggest.body.id}`);

    const liar = await send(alice.client, CLIENT, order.id, "pretend.mp3", new TextEncoder().encode("<html><script>alert(1)</script></html>"));
    expect((await row(liar.id)).content_type).toBe("audio/mpeg");
    const served = await alice.client.get(`${CLIENT}/files/${liar.id}/download`);
    expect(served.headers.get("content-type")).toBe("audio/mpeg");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("stores hostile names safely and sends them in headers that cannot be split or smuggled through", async () => {
    const order = await mine();
    const cases: [string, string | RegExp][] = [
      ['a"b\r\nSet-Cookie: pwn=1.mp3', "a_b Set-Cookie_ pwn=1.mp3"], ["../../../etc/passwd.mp3", "passwd.mp3"], ["歌曲 – 终极版.mp3", "歌曲 – 终极版.mp3"],
      [`${"x".repeat(500)}.mp3`, /^x{196}\.mp3$/], ["‮fdp.mp3", "fdp.mp3"], ["lone\ud800surrogate.mp3", "lone_surrogate.mp3"], ["it's (1) [final] {v2}.mp3", "it's (1) [final] {v2}.mp3"],
    ];
    for (const [given, expected] of cases) {
      const file = await send(alice.client, CLIENT, order.id, given, noise(2000, 5));
      typeof expected === "string" ? expect(file.name).toBe(expected) : expect(file.name).toMatch(expected);
      for (const who of [alice.client, boss]) {
        const r = await who.get(`${who === boss ? STAFF : CLIENT}/files/${file.id}/download`);
        const disposition = r.headers.get("content-disposition")!;
        expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~!$&+^`|#-]*$/);
        expect(disposition).not.toMatch(/[\r\n]/);
        expect(r.headers.get("content-type")).toBe("audio/mpeg");
        expect(r.headers.get("x-content-type-options")).toBe("nosniff");
        expect(r.headers.get("cache-control")).toBe("private, no-store");
        expect(r.headers.get("set-cookie")).toBeNull();
        expect(r.headers.get("content-length")).toBe("2000");
        expect(r.headers.get("etag")).toBeTruthy();
        await r.res.arrayBuffer();
      }
    }
  }, 60000);

  it("plays audio inline only when asked and only for audio", async () => {
    const order = await mine();
    const song = await send(alice.client, CLIENT, order.id, "demo.mp3", noise(5000, 2));
    const archive = await send(alice.client, CLIENT, order.id, "stems.zip", noise(5000, 3));
    const plain = await alice.client.get(`${CLIENT}/files/${song.id}/download`);
    const inline = await alice.client.get(`${CLIENT}/files/${song.id}/download?inline=1`);
    const zipped = await alice.client.get(`${CLIENT}/files/${archive.id}/download?inline=1`);
    expect(plain.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(zipped.headers.get("content-disposition")).toMatch(/^attachment;/);
    for (const r of [plain, inline, zipped]) await r.res.arrayBuffer();
  });

  it("says plainly when file storage is not set up", async () => {
    const order = await mine();
    const bare = new Client({ ...h.env, MEDIA: undefined } as never, h.ctx);
    await bare.login(alice.email, "studio2026");
    const r = await bare.post(`${CLIENT}/bookings/${order.id}/files`, { name: "a.mp3", size: 10 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "storage_unavailable" });
    expect(r.body.error).toMatch(/not set up/);
  });
});

describe("who may do what", () => {
  it("answers 404 with the same body for another client's ids as for ids that do not exist", async () => {
    const order = await mine();
    const delivery = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: delivery.id, title: "Shared" }]);
    const staged = await stage(order.id, "later.mp3", 5000, 2);
    const upload = await send(alice.client, CLIENT, order.id, "mine.wav", noise(4000, 4));
    const pending = (await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "half.wav", size: 3 * PART })).body.id;
    const ghost = crypto.randomUUID();
    const probes = (booking: string, file: string) => [
      ["POST", `${CLIENT}/bookings/${booking}/files`, { name: "a.mp3", size: 10 }], ["PUT", `${CLIENT}/files/${file}/parts/1`, undefined], ["POST", `${CLIENT}/files/${file}/complete`, {}],
      ["DELETE", `${CLIENT}/files/${file}`, undefined], ["GET", `${CLIENT}/files/${file}/download`, undefined], ["GET", `${CLIENT}/files/${file}/download?inline=1`, undefined],
      ["POST", `${CLIENT}/bookings/${booking}/files/notify`, { fileIds: [file] }], ["POST", `${CLIENT}/bookings/${booking}/revisions`, { note: "change the bass" }],
      ["POST", `${CLIENT}/bookings/${booking}/approve`, {}], ["GET", `${CLIENT}/bookings/${booking}`, undefined],
    ] as const;
    const hit = async (c: Client, method: string, path: string, body: unknown) => {
      const r = body === undefined ? await c.call(method, path, { raw: method === "PUT" ? new Uint8Array(10) : undefined }) : await c.call(method, path, { body });
      return { status: r.status, body: r.body };
    };
    for (const file of [delivery.id, staged.id, upload.id, pending]) {
      const foreign = probes(order.id, file), missing = probes(ghost, ghost);
      for (let i = 0; i < foreign.length; i++) {
        const [method, path, body] = foreign[i];
        const a = await hit(bob.client, method, path, body), b = await hit(bob.client, missing[i][0], missing[i][1], missing[i][2]);
        expect(a.status, `${method} ${path}`).toBe(404);
        expect(a.body, `${method} ${path}`).toEqual(NOT_FOUND);
        expect(b).toEqual({ status: 404, body: NOT_FOUND });
      }
    }
    const overview = await bob.client.get(`${CLIENT}/files`);
    expect(JSON.stringify(overview.body)).not.toContain(order.id);
    expect(JSON.stringify(overview.body)).not.toContain(order.ref);
    const range = await bob.client.call("GET", `${CLIENT}/files/${delivery.id}/download`, { headers: { range: "bytes=0-10" } });
    expect({ status: range.status, body: range.body }).toEqual({ status: 404, body: NOT_FOUND });
  }, 60000);

  it("hides a staged delivery from its own client by every route", async () => {
    const order = await mine();
    const staged = await stage(order.id);
    for (const path of [`/files/${staged.id}/download`, `/files/${staged.id}/download?inline=1`]) {
      const r = await alice.client.get(`${CLIENT}${path}`);
      expect({ status: r.status, body: r.body }).toEqual({ status: 404, body: NOT_FOUND });
    }
    const ranged = await alice.client.call("GET", `${CLIENT}/files/${staged.id}/download`, { headers: { range: "bytes=0-99" } });
    expect(ranged.status).toBe(404);
    expect((await head(alice.client, `${CLIENT}/files/${staged.id}/download`)).status).toBe(404);
    const listed = await alice.client.get(`${CLIENT}/files`);
    expect(JSON.stringify(listed.body)).not.toContain(staged.id);
    const detail = await alice.client.get(`${CLIENT}/bookings/${order.id}`);
    expect(detail.body.files.deliveries).toEqual([]);
    for (const [method, path] of [["DELETE", `/files/${staged.id}`], ["POST", `/files/${staged.id}/complete`], ["PUT", `/files/${staged.id}/parts/1`]] as const) {
      const r = await alice.client.call(method, `${CLIENT}${path}`);
      expect(r.status, `${method} ${path}`).toBe(404);
    }
    expect((await row(staged.id)).state).toBe("ready");
  });

  it("keeps clients off a published delivery's write routes and staff off client uploads", async () => {
    const order = await mine({ paid: 10_000_000 });
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Final" }]);
    expect((await alice.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(200);
    expect((await alice.client.del(`${CLIENT}/files/${file.id}`)).status).toBe(404);
    expect((await alice.client.post(`${CLIENT}/files/${file.id}/complete`)).status).toBe(404);
    expect((await row(file.id)).state).toBe("ready");

    const begun = await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "theirs.wav", size: 1000 });
    const asStaff = await maker.client.call("PUT", `${STAFF}/files/${begun.body.id}/parts/1`, { raw: new Uint8Array(1000) });
    expect(asStaff.status).toBe(403);
    expect((await maker.client.post(`${STAFF}/files/${begun.body.id}/complete`)).status).toBe(403);
    const made = await maker.client.post(`${STAFF}/bookings/${order.id}/files`, { name: "mine.wav", size: 10 });
    expect((await row(made.body.id)).direction).toBe("delivery");
    expect((await row(begun.body.id)).direction).toBe("upload");
  });

  it("needs deliver_files for every staff route and a login for every client route", async () => {
    const order = await mine();
    const file = await stage(order.id);
    const staffRoutes = [
      ["GET", `/bookings/${order.id}/files`], ["POST", `/bookings/${order.id}/files`], ["PUT", `/files/${file.id}/parts/1`], ["POST", `/files/${file.id}/complete`], ["DELETE", `/files/${file.id}`],
      ["POST", `/bookings/${order.id}/deliver`], ["POST", `/bookings/${order.id}/finalize`], ["POST", `/files/${file.id}/release`], ["GET", `/files/${file.id}/download`], ["GET", "/deliveries"],
    ] as const;
    const anonymous = h.client();
    for (const [method, path] of staffRoutes) {
      for (const who of [desk.client, alice.client]) expect((await who.call(method, `${STAFF}${path}`, { body: method === "GET" ? undefined : {} })).status, `${method} ${path}`).toBe(403);
      expect((await anonymous.call(method, `${STAFF}${path}`)).status, `${method} ${path}`).toBe(401);
    }
    const clientRoutes = [["GET", "/files"], ["POST", `/bookings/${order.id}/files`], ["PUT", `/files/${file.id}/parts/1`], ["GET", `/files/${file.id}/download`], ["POST", `/bookings/${order.id}/revisions`], ["POST", `/bookings/${order.id}/approve`]] as const;
    for (const [method, path] of clientRoutes) expect((await anonymous.call(method, `${CLIENT}${path}`)).status, `${method} ${path}`).toBe(401);
    expect((await maker.client.get(`${STAFF}/bookings/${order.id}/files`)).status).toBe(200);
    expect((await boss.get(`${STAFF}/bookings/${order.id}/files`)).status).toBe(200);
    expect((await boss.get(`${STAFF}/bookings/${crypto.randomUUID()}/files`)).status).toBe(404);
  });

  it("gives producers the files without any way to reach the client", async () => {
    const order = await mine();
    const file = await stage(order.id);
    const up = await send(alice.client, CLIENT, order.id, "notes.pdf", noise(3000, 9));
    const view = await maker.client.get(`${STAFF}/bookings/${order.id}/files`);
    expect(view.status).toBe(200);
    expect(view.body.client).toEqual({ hasAccount: true, hasEmail: true });
    expect(view.body.deliveries.map((f: any) => f.id)).toEqual([file.id]);
    expect(view.body.uploads.map((f: any) => f.id)).toEqual([up.id]);
    for (const path of [`/bookings/${order.id}/files`, "/deliveries?tab=todo", "/deliveries?tab=client", "/deliveries?tab=delivered", "/deliveries?tab=revisions"]) {
      const r = await maker.client.get(`${STAFF}${path}`);
      expect(JSON.stringify(r.body), path).not.toMatch(new RegExp(`${alice.email}|805 111 2233|tok-secret-123|pay_token|contact_email|contact_phone`));
    }
  });
});

describe("delivery and the payment gate", () => {
  it("keeps a delivery locked on every route until the balance is paid or staff release it", async () => {
    const order = await mine({ total: 10_000_000 });
    const file = await stage(order.id, "Midnight_master_v3.mp3", 300_000, 11);
    const bytes = await sha(noise(300_000, 11));

    const done = await deliver(maker.client, order.id, [{ fileId: file.id, title: "Midnight (Master)" }], { note: "Final levels" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ ok: true, notified: true, final: false });
    expect(done.body.delivered[0]).toMatchObject({ id: file.id, title: "Midnight (Master)", version: 1, note: "Final levels", locked: false, released: false, direction: "delivery" });
    expect(done.body.delivered[0].delivered_at).toBeTruthy();

    const listed = (await alice.client.get(`${CLIENT}/files`)).body.bookings.find((b: any) => b.id === order.id);
    expect(listed).toMatchObject({ ref: order.ref, balance_kobo: 10_000_000, final: false, canUpload: true, canApprove: false, canRequest: false, revision_limit: 3, revisions_used: 0, openRevision: null });
    expect(listed.deliveries).toHaveLength(1);
    expect(listed.deliveries[0]).toMatchObject({ id: file.id, title: "Midnight (Master)", locked: true, released: false, version: 1 });

    const attempts: [string, Record<string, string>?][] = [["", undefined], ["?inline=1", undefined], ["", { range: "bytes=0-99" }], ["?inline=1", { range: "bytes=0-" }], ["", { range: "bytes=-5" }], ["", { range: "garbage" }]];
    for (const [query, headers] of attempts) {
      const r = await alice.client.call("GET", `${CLIENT}/files/${file.id}/download${query}`, { headers });
      expect(r.status, `${query} ${JSON.stringify(headers)}`).toBe(403);
      expect(r.body).toMatchObject({ code: "locked" });
      expect(r.body.error).toMatch(/₦100,000/);
    }
    expect((await head(alice.client, `${CLIENT}/files/${file.id}/download`)).status).toBe(403);
    expect((await row(file.id)).download_count).toBe(0);

    const staffCopy = await maker.client.get(`${STAFF}/files/${file.id}/download`);
    expect(staffCopy.status).toBe(200);
    expect(await sha(await bytesOf(staffCopy))).toBe(bytes);
    expect((await maker.client.get(`${STAFF}/bookings/${order.id}/files`)).body.deliveries[0].locked).toBe(false);

    const refused = await maker.client.post(`${STAFF}/files/${file.id}/release`, { released: true });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/record payments/);
    expect((await alice.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(403);
    const released = await boss.post(`${STAFF}/files/${file.id}/release`, { released: true });
    expect(released.body).toMatchObject({ id: file.id, released: true });
    const open = await alice.client.get(`${CLIENT}/files/${file.id}/download?inline=1`);
    expect(open.status).toBe(200);
    expect(await sha(await bytesOf(open))).toBe(bytes);
    const piece = await alice.client.call("GET", `${CLIENT}/files/${file.id}/download`, { headers: { range: "bytes=100-199" } });
    expect(piece.status).toBe(206);
    await piece.res.arrayBuffer();

    await maker.client.post(`${STAFF}/files/${file.id}/release`, { released: false });
    expect((await alice.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(403);
    await pay(order.id);
    const paid = await alice.client.get(`${CLIENT}/files/${file.id}/download`);
    expect(paid.status).toBe(200);
    await paid.res.arrayBuffer();
    const after = (await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body;
    expect(after.files.deliveries[0].locked).toBe(false);
    expect(after.booking.balance_kobo).toBe(0);
  }, 60000);

  it("cannot be fetched around the gate through the public media route, whatever the spelling of the key", async () => {
    const order = await mine({ total: 10_000_000 });
    const file = await stage(order.id, "locked.mp3", 40_000, 8);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Locked" }]);
    const staged = await stage(order.id, "staged.mp3", 40_000, 9);
    const key = `portal/${order.id}/${file.id}`;
    const spellings = [key, key.replace("/", "%2F"), key.replace("p", "%70"), `./${key}`, `x/../${key}`, `/${key}`, `portal//${order.id}/${file.id}`, `${key}?x=1`, `portal/${order.id}/${staged.id}`];
    for (const who of [alice.client, bob.client, h.client(), maker.client]) {
      for (const spelling of spellings) {
        const res = await worker.fetch!(new Request(`https://test.local/media/${spelling}`, { headers: { cookie: who.cookie } }) as never, h.env, h.ctx);
        expect(res.status, spelling).toBe(404);
        expect(res.headers.get("content-type") ?? "").not.toMatch(/audio/);
        await res.arrayBuffer();
      }
    }
    const image = `2026-10/${crypto.randomUUID()}.png`;
    await h.env.MEDIA!.put(image, noise(3000, 1), { httpMetadata: { contentType: "image/png" } });
    const shown = await worker.fetch!(new Request(`https://test.local/media/${image}`) as never, h.env, h.ctx);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/png");
    await shown.arrayBuffer();
    const broken = await worker.fetch!(new Request("https://test.local/media/%E0%A4%A") as never, h.env, h.ctx);
    expect(broken.status).toBe(404);
  }, 60000);

  it("does not unlock a delivery again when a refund brings the balance back", async () => {
    const order = await mine({ total: 10_000_000, paid: 10_000_000 });
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Paid up" }]);
    expect((await alice.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(200);
    await h.env.DB.prepare("UPDATE bookings SET refunded_kobo = 2500000 WHERE id = ?").bind(order.id).run();
    const r = await alice.client.get(`${CLIENT}/files/${file.id}/download`);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/₦25,000/);
  });

  it("counts downloads only for the person the file is for and audits every one", async () => {
    const order = await mine({ paid: 10_000_000 });
    const file = await stage(order.id, "count.mp3", 50_000, 4);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Counted" }]);
    expect((await row(file.id)).download_count).toBe(0);
    const staffGet = await boss.get(`${STAFF}/files/${file.id}/download`);
    await staffGet.res.arrayBuffer();
    expect(await row(file.id)).toMatchObject({ download_count: 0, first_downloaded_at: null });
    const first = await alice.client.get(`${CLIENT}/files/${file.id}/download`);
    await first.res.arrayBuffer();
    const stamp = (await row(file.id)).first_downloaded_at;
    expect(stamp).toBeTruthy();
    const second = await alice.client.get(`${CLIENT}/files/${file.id}/download?inline=1`);
    await second.res.arrayBuffer();
    const resumed = await alice.client.call("GET", `${CLIENT}/files/${file.id}/download`, { headers: { range: "bytes=1000-" } });
    await resumed.res.arrayBuffer();
    expect((await head(alice.client, `${CLIENT}/files/${file.id}/download`)).status).toBe(200);
    expect(await row(file.id)).toMatchObject({ download_count: 1, first_downloaded_at: stamp });
    const view = (await alice.client.get(`${CLIENT}/files`)).body.bookings.find((b: any) => b.id === order.id).deliveries[0];
    expect(view).toMatchObject({ downloads: 1, first_downloaded_at: stamp });

    const logs = await h.sql("SELECT * FROM audit_logs WHERE action = 'Downloaded delivery' AND target = ? ORDER BY created_at", order.ref);
    expect(logs).toHaveLength(2);
    expect(logs.filter((l: any) => /\(CLIENT\)$/.test(l.actor_label))).toHaveLength(1);
    expect(logs.some((l: any) => /\(CEO\)$/.test(l.actor_label))).toBe(true);
    expect(logs[0].detail).toContain("Counted");
    expect(logs[0].detail).toContain("count.mp3");
  });

  it("emails the client once with the titles, the portal link and the pay link when a balance is due, and never an attachment", async () => {
    const order = await mine({ total: 10_000_000, paid: 5_000_000 });
    const [a, b] = [await stage(order.id, "a.mp3"), await stage(order.id, "b.wav")];
    const before = (await h.sql("SELECT COUNT(*) n FROM email_outbox"))[0].n;
    const res = await deliver(maker.client, order.id, [{ fileId: a.id, title: "Song One" }, { fileId: b.id, title: "Song Two" }], { note: "Mixed at -14 LUFS" });
    expect(res.body.delivered).toHaveLength(2);
    const mails = await outbox(alice.email, `%${order.ref}`);
    const ready = mails.filter((m: any) => /ready/.test(m.subject));
    expect(ready).toHaveLength(1);
    expect((await h.sql("SELECT COUNT(*) n FROM email_outbox"))[0].n).toBe(before + 1);
    expect(ready[0].subject).toBe(`Your music is ready · ${order.ref}`);
    const text: string = ready[0].body;
    expect(text).toContain("Song One");
    expect(text).toContain("Song Two");
    expect(text).toContain("Mixed at -14 LUFS");
    expect(text).toContain(`/account/bookings/${order.id}`);
    expect(text).toContain("₦50,000");
    expect(text).toMatch(/unlock as soon as it is paid/);
    expect(text).toContain(`/pay/${order.id}?t=tok-secret-123`);
    expect(text).toMatch(/2 revisions? left|3 revisions left/);
    expect(text).not.toMatch(/attach/i);
    const note = (await alice.client.get(`${CLIENT}/overview`)).body.notifications.find((n: any) => n.title === "Your music is ready" && n.body.startsWith(order.ref));
    expect(note.body).toBe(`${order.ref} · 2 files`);

    const paidOrder = await mine({ total: 10_000_000, paid: 10_000_000 });
    const c = await stage(paidOrder.id);
    await deliver(maker.client, paidOrder.id, [{ fileId: c.id, title: "Paid" }]);
    const paidMail = (await outbox(alice.email, `%${paidOrder.ref}`)).find((m: any) => /ready/.test(m.subject));
    expect(paidMail.body).not.toMatch(/balance|\/pay\//);
  });

  it("says files are in the portal for work that is not music, and explains how to get an account when there is none", async () => {
    const order = await makeBooking({ email: "walkin.client@example.com", userId: null });
    await h.env.DB.prepare("UPDATE bookings SET category = 'video' WHERE id = ?").bind(order.id).run();
    const file = await stage(order.id);
    const res = await deliver(maker.client, order.id, [{ fileId: file.id, title: "Video" }]);
    expect(res.body).toMatchObject({ notified: true });
    const mail = (await outbox("walkin.client@example.com", `%${order.ref}`))[0];
    expect(mail.subject).toBe(`Your files are ready · ${order.ref}`);
    expect(mail.body).toMatch(/create a free account with this email address at .*\/register/);
    expect(mail.body).not.toContain(`/account/bookings/${order.id}`);
  });

  it("still succeeds, and says so, when the booking has no way to reach the client", async () => {
    const order = await makeBooking({ email: "", userId: null });
    const file = await stage(order.id);
    const before = (await h.sql("SELECT COUNT(*) n FROM email_outbox"))[0].n;
    const res = await deliver(maker.client, order.id, [{ fileId: file.id, title: "Orphan" }]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, notified: false, reason: "no_contact" });
    expect((await h.sql("SELECT COUNT(*) n FROM email_outbox"))[0].n).toBe(before);
    expect((await row(file.id)).delivered_at).toBeTruthy();
    expect((await maker.client.get(`${STAFF}/bookings/${order.id}/files`)).body.client).toEqual({ hasAccount: false, hasEmail: false });
  });

  it("numbers versions per title and keeps files of one batch on the same version", async () => {
    const order = await mine();
    const first = [await stage(order.id, "one.mp3"), await stage(order.id, "one.wav")];
    const r1 = await deliver(maker.client, order.id, [{ fileId: first[0].id, title: "Midnight" }, { fileId: first[1].id, title: "Midnight" }]);
    expect(r1.body.delivered.map((f: any) => f.version)).toEqual([1, 1]);
    const again = [await stage(order.id, "two.mp3"), await stage(order.id, "three.mp3")];
    const r2 = await deliver(maker.client, order.id, [{ fileId: again[0].id, title: "midnight" }, { fileId: again[1].id, title: "Sunrise" }]);
    const byTitle = Object.fromEntries(r2.body.delivered.map((f: any) => [f.title, f.version]));
    expect(byTitle).toEqual({ midnight: 2, Sunrise: 1 });
  });

  it("refuses to deliver files that are not staged on that booking, twice, or without a title", async () => {
    const order = await mine();
    const other = await mine();
    const mineStaged = await stage(order.id);
    const foreign = await stage(other.id);
    const upload = await send(alice.client, CLIENT, order.id, "u.wav", noise(1000, 1));
    const half = (await maker.client.post(`${STAFF}/bookings/${order.id}/files`, { name: "half.wav", size: 1000 })).body.id;
    const item = (fileId: string, title = "T") => ({ fileId, title });
    for (const [label, items] of [
      ["another booking's file", [item(foreign.id)]], ["a mix of valid and foreign", [item(mineStaged.id), item(foreign.id)]], ["unknown id", [item(crypto.randomUUID())]],
      ["a client upload", [item(upload.id)]], ["an unfinished upload", [item(half)]], ["the same file twice", [item(mineStaged.id), item(mineStaged.id)]],
    ] as const) {
      const r = await deliver(maker.client, order.id, items as never);
      expect(r.status, label).toBe(400);
    }
    expect((await deliver(maker.client, order.id, [])).status).toBe(400);
    expect((await deliver(maker.client, order.id, [item(mineStaged.id, "   ")])).status).toBe(400);
    expect((await deliver(maker.client, order.id, [item(mineStaged.id, "‮​")])).status).toBe(400);
    expect((await deliver(maker.client, order.id, Array.from({ length: 51 }, () => item(mineStaged.id)))).status).toBe(400);
    expect((await row(mineStaged.id)).delivered_at).toBeNull();
    expect((await row(foreign.id)).delivered_at).toBeNull();
    expect((await deliver(maker.client, order.id, [item(mineStaged.id)])).status).toBe(200);
    expect((await deliver(maker.client, order.id, [item(mineStaged.id)])).status).toBe(400);
  }, 60000);

  it("publishes a batch once when the same request is sent twice at the same time", async () => {
    const order = await mine();
    const files = [await stage(order.id, "x.mp3"), await stage(order.id, "y.mp3")];
    const payload = { items: files.map((f: any, i: number) => ({ fileId: f.id, title: `Track ${i + 1}` })), note: "" };
    const before = (await outbox(alice.email, `%${order.ref}`)).length;
    const replies = await Promise.all([1, 2, 3].map(() => maker.client.post(`${STAFF}/bookings/${order.id}/deliver`, payload)));
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect((await outbox(alice.email, `%${order.ref}`)).length).toBe(before + 1);
    expect((await h.sql("SELECT version FROM booking_files WHERE booking_id = ? AND delivered_at IS NOT NULL", order.id)).map((r: any) => r.version)).toEqual([1, 1]);
  });

  it("only takes deliveries for confirmed work that is not complete, and never for closed bookings", async () => {
    for (const status of ["pending", "approved", "cancelled", "rejected", "no_show"]) {
      const order = await mine({ status });
      const r = await maker.client.post(`${STAFF}/bookings/${order.id}/files`, { name: "a.mp3", size: 10 });
      expect(r.status, status).toBe(400);
      expect((await deliver(maker.client, order.id, [{ fileId: crypto.randomUUID(), title: "T" }])).status, status).toBe(400);
      expect((await maker.client.post(`${STAFF}/bookings/${order.id}/finalize`)).status, status).toBe(400);
    }
    const done = await mine({ status: "completed" });
    expect((await maker.client.post(`${STAFF}/bookings/${done.id}/files`, { name: "a.mp3", size: 10 })).status).toBe(200);
  });

  it("lets staff remove a finished file and frees the storage at once", async () => {
    const order = await mine();
    const file = await stage(order.id);
    const key = `portal/${order.id}/${file.id}`;
    expect(await h.env.MEDIA!.head(key)).not.toBeNull();
    expect((await maker.client.del(`${STAFF}/files/${file.id}`)).status).toBe(200);
    expect(await h.env.MEDIA!.head(key)).toBeNull();
    expect(await row(file.id)).toMatchObject({ state: "removed", size: 0 });
    expect((await maker.client.get(`${STAFF}/files/${file.id}/download`)).status).toBe(404);
    expect((await maker.client.del(`${STAFF}/files/${file.id}`)).status).toBe(200);
    expect((await maker.client.get(`${STAFF}/bookings/${order.id}/files`)).body.deliveries).toEqual([]);
    expect(await h.sql("SELECT 1 FROM audit_logs WHERE action = 'Removed file' AND target = ?", order.ref)).toHaveLength(1);
  });
});

describe("revisions, approval and completion", () => {
  it("lets a revision be asked for only when the rules allow it", async () => {
    const order = await mine({ paid: 10_000_000, limit: 2 });
    const ask = (note: string, who = alice.client) => who.post(`${CLIENT}/bookings/${order.id}/revisions`, { note });
    expect((await ask("make the vocals louder")).status).toBe(400);
    const first = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: first.id, title: "Draft" }]);
    expect((await ask("")).status).toBe(400);
    expect((await ask("ab")).status).toBe(400);
    expect((await ask("x".repeat(2001))).status).toBe(400);
    expect((await ask("   \u0000  ")).status).toBe(400);
    const okay = await ask("make the vocals louder on the second verse");
    expect(okay.status).toBe(200);
    expect(okay.body.request).toMatchObject({ status: "open", note: "make the vocals louder on the second verse" });
    expect(okay.body.revisions).toMatchObject({ limit: 2, used: 1, left: 1, final: false, canRequest: false });
    expect((await ask("one more thing")).status).toBe(409);
    expect((await booking(order.id)).revisions_used).toBe(1);

    const detail = (await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body;
    expect(detail.revisions).toMatchObject({ limit: 2, used: 1, left: 1, final: false, canRequest: false });
    expect(detail.revisions.open).toMatchObject({ id: okay.body.request.id, status: "open" });

    const second = await stage(order.id, "v2.mp3");
    const redo = await deliver(maker.client, order.id, [{ fileId: second.id, title: "Draft" }]);
    expect(redo.body).toMatchObject({ resolvedRevision: true });
    expect((await h.sql("SELECT status, resolved_by FROM revision_requests WHERE booking_id = ?", order.id))[0].status).toBe("done");
    const detail2 = (await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body;
    expect(detail2.revisions).toMatchObject({ used: 1, left: 1, open: null, canRequest: true });
    expect((await ask("the kick is too quiet")).status).toBe(200);
    const third = await stage(order.id, "v3.mp3");
    await deliver(maker.client, order.id, [{ fileId: third.id, title: "Draft" }]);
    const spent = await ask("one more please");
    expect(spent.status).toBe(400);
    expect(spent.body.error).toMatch(/used all 2 revisions/);
    expect((await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body.revisions).toMatchObject({ used: 2, left: 0, canRequest: false });
    expect((await booking(order.id)).revisions_used).toBe(2);
  }, 60000);

  it("does not offer revisions on a package that has none", async () => {
    const order = await mine({ paid: 10_000_000, limit: 0 });
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Done" }]);
    const r = await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "please change the intro" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/does not include revisions/);
    expect((await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body.revisions).toMatchObject({ limit: 0, canRequest: false });
  });

  it("never lets simultaneous requests go past the limit", async () => {
    const order = await mine({ paid: 10_000_000, limit: 2 });
    const ask = () => alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "fix the snare" });
    const deliverAgain = async (name: string) => { const f = await stage(order.id, name); await deliver(maker.client, order.id, [{ fileId: f.id, title: "Mix" }]); };
    await deliverAgain("a.mp3");
    let replies = await Promise.all([1, 2, 3, 4, 5, 6].map(ask));
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await booking(order.id)).revisions_used).toBe(1);
    expect(await h.sql("SELECT 1 FROM revision_requests WHERE booking_id = ?", order.id)).toHaveLength(1);
    await deliverAgain("b.mp3");
    replies = await Promise.all([1, 2, 3, 4, 5, 6].map(ask));
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    await deliverAgain("c.mp3");
    replies = await Promise.all([1, 2, 3, 4, 5, 6].map(ask));
    expect(replies.filter((r) => r.status === 200)).toHaveLength(0);
    expect((await booking(order.id)).revisions_used).toBe(2);
    expect(await h.sql("SELECT 1 FROM revision_requests WHERE booking_id = ?", order.id)).toHaveLength(2);
    expect(await h.sql("SELECT 1 FROM revision_requests WHERE booking_id = ? AND status = 'open'", order.id)).toHaveLength(0);
  }, 60000);

  it("tells the staff who deliver, without any way to reach the client", async () => {
    const order = await mine({ paid: 10_000_000, limit: 3, artist: "Alice Wonder" });
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Mix" }]);
    await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: `call me on +234 805 111 2233 or ${alice.email} to fix the bass` });
    const mails = await h.sql("SELECT * FROM email_outbox WHERE subject LIKE ?", `Revision requested · ${order.ref}`);
    expect(mails.map((m: any) => m.to_email)).toContain(maker.email);
    for (const m of mails) {
      expect(m.body).toContain(order.ref);
      expect(m.body).toContain("Alice Wonder");
      expect(m.body).toContain("revision 1 of 3");
      expect(m.body).toContain("/admin/deliveries");
      expect(m.body).not.toMatch(new RegExp(`${alice.email}|805 111 2233|tok-secret-123|/pay/`));
    }
    expect(mails.map((m: any) => m.to_email)).not.toContain(desk.email);
    const inApp = await h.sql("SELECT n.* FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ? AND n.title = ?", maker.email, `Revision requested · ${order.ref}`);
    expect(inApp).toHaveLength(1);
  });

  it("completes the order when the client approves and then closes everything", async () => {
    const order = await mine({ paid: 10_000_000, limit: 3 });
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/approve`)).status).toBe(400);
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Master" }]);
    await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "slightly brighter" });
    const done = await alice.client.post(`${CLIENT}/bookings/${order.id}/approve`);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ ok: true, final: true });
    expect(await booking(order.id)).toMatchObject({ status: "completed" });
    expect((await booking(order.id)).delivered_final_at).toBeTruthy();
    expect((await h.sql("SELECT status FROM revision_requests WHERE booking_id = ?", order.id))[0].status).toBe("done");

    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/approve`)).body).toMatchObject({ ok: true, final: true });
    expect(await h.sql("SELECT 1 FROM audit_logs WHERE action = 'Approved delivery' AND target = ?", order.ref)).toHaveLength(1);
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "actually one more" })).status).toBe(400);
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "late.wav", size: 10 })).status).toBe(400);
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/files`, { name: "late.wav", size: 10 })).status).toBe(400);
    expect((await deliver(maker.client, order.id, [{ fileId: crypto.randomUUID(), title: "Late" }])).status).toBe(400);
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/finalize`)).body).toMatchObject({ ok: true, final: true });
    const view = (await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body;
    expect(view.revisions).toMatchObject({ final: true, canRequest: false, canApprove: false });
    expect(view.files.canUpload).toBe(false);
    expect((await alice.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(200);

    const cancel = await boss.post(`${STAFF}/bookings/${order.id}/cancel`, { reason: "changed my mind", fullRefund: true });
    expect(cancel.status).toBe(400);
    const asked = await alice.client.post(`${CLIENT}/bookings/${order.id}/requests`, { kind: "cancel", reason: "refund please" });
    expect(asked.status).toBe(400);
    const staffMail = await h.sql("SELECT * FROM email_outbox WHERE subject = ?", `Delivery approved · ${order.ref}`);
    expect(staffMail.length).toBeGreaterThan(0);
    for (const m of staffMail) expect(m.body).not.toMatch(new RegExp(`${alice.email}|805 111 2233|/pay/`));
  }, 60000);

  it("completes the order when staff finalize it, tells the client, and keeps the files reachable once paid", async () => {
    const order = await mine({ paid: 10_000_000, limit: 3 });
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/finalize`)).status).toBe(400);
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Master" }]);
    const done = await maker.client.post(`${STAFF}/bookings/${order.id}/finalize`);
    expect(done.body).toEqual({ ok: true, final: true });
    expect((await booking(order.id)).status).toBe("completed");
    const mail = (await outbox(alice.email, `%complete · ${order.ref}`))[0];
    expect(mail.body).toContain(`/account/bookings/${order.id}`);
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/finalize`)).status).toBe(200);
    expect(await outbox(alice.email, `%complete · ${order.ref}`)).toHaveLength(1);
    expect((await alice.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(200);
    expect(await h.sql("SELECT 1 FROM audit_logs WHERE action = 'Completed order' AND target = ?", order.ref)).toHaveLength(1);
  });

  it("can deliver and complete in one step, only for confirmed or completed bookings", async () => {
    const order = await mine({ paid: 10_000_000, limit: 3 });
    const file = await stage(order.id);
    await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "too early to ask" });
    const res = await deliver(maker.client, order.id, [{ fileId: file.id, title: "All done" }], { final: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ final: true, notified: true });
    expect(await booking(order.id)).toMatchObject({ status: "completed" });
    expect((await booking(order.id)).delivered_final_at).toBeTruthy();
    const mail = (await outbox(alice.email, `%ready · ${order.ref}`))[0];
    expect(mail.body).toMatch(/final delivery/);
    expect(mail.body).not.toMatch(/Not quite right/);

    const sessionDone = await mine({ status: "completed" });
    const f2 = await stage(sessionDone.id);
    expect((await deliver(maker.client, sessionDone.id, [{ fileId: f2.id, title: "After the session" }], { final: true })).status).toBe(200);
    expect((await booking(sessionDone.id)).delivered_final_at).toBeTruthy();

    const approvedOnly = await mine({ status: "approved" });
    const refused = await deliver(maker.client, approvedOnly.id, [{ fileId: crypto.randomUUID(), title: "No" }], { final: true });
    expect(refused.status).toBe(400);
    expect((await booking(approvedOnly.id)).status).toBe("approved");
    expect((await booking(approvedOnly.id)).delivered_final_at).toBeNull();
  });

  it("only lets a client approve, request or upload on a booking that is theirs and open", async () => {
    for (const status of ["cancelled", "rejected", "no_show"]) {
      const order = await mine({ status });
      expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "a.mp3", size: 10 })).status, status).toBe(400);
      expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "anything" })).status, status).toBe(400);
      expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/approve`)).status, status).toBe(400);
    }
    for (const status of ["pending", "approved", "confirmed", "completed"]) {
      const order = await mine({ status });
      const r = await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "reference.mp3", size: 10 });
      expect(r.status, status).toBe(200);
    }
  });
});

describe("client uploads and the studio notice", () => {
  it("tells the staff once per two minutes, counts only that booking's finished uploads, and gives no contact details", async () => {
    const order = await mine({ artist: "Alice Wonder", pkg: "Produce your EP" });
    const other = await mine();
    const [a, b] = [await send(alice.client, CLIENT, order.id, "beat.wav", noise(5000, 1)), await send(alice.client, CLIENT, order.id, "lyrics.pdf", noise(5000, 2))];
    const elsewhere = await send(alice.client, CLIENT, other.id, "elsewhere.wav", noise(5000, 3));
    const half = (await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name: "half.wav", size: 5000 })).body.id;
    const staged = await stage(order.id);
    const removed = await send(alice.client, CLIENT, order.id, "gone.wav", noise(5000, 4));
    await alice.client.del(`${CLIENT}/files/${removed.id}`);
    const ids = [a.id, b.id, elsewhere.id, half, staged.id, removed.id, crypto.randomUUID()];

    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/files/notify`, { fileIds: [] })).status).toBe(400);
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/files/notify`, { fileIds: [half, staged.id, removed.id, elsewhere.id] })).status).toBe(400);
    const sent = await alice.client.post(`${CLIENT}/bookings/${order.id}/files/notify`, { fileIds: ids });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ ok: true, notified: 2 });

    const mails = await h.sql("SELECT * FROM email_outbox WHERE subject = ?", `Files from Alice Wonder · ${order.ref}`);
    expect(mails.map((m: any) => m.to_email)).toEqual(expect.arrayContaining([maker.email, "uririnathaniel@gmail.com"]));
    expect(mails.map((m: any) => m.to_email)).not.toContain(desk.email);
    for (const m of mails) {
      expect(m.body).toContain("sent 2 files for");
      expect(m.body).toContain(order.ref);
      expect(m.body).toContain("Produce your EP");
      expect(m.body).toContain("/admin/deliveries");
      expect(m.body).not.toMatch(new RegExp(`${alice.email}|805 111 2233|tok-secret-123|/pay/`));
    }
    const again = await alice.client.post(`${CLIENT}/bookings/${order.id}/files/notify`, { fileIds: ids });
    expect(again.status).toBe(429);
    expect(again.body.code).toBe("rate_limited");
    expect(await h.sql("SELECT * FROM email_outbox WHERE subject = ?", `Files from Alice Wonder · ${order.ref}`)).toHaveLength(mails.length);
    const sibling = await alice.client.post(`${CLIENT}/bookings/${other.id}/files/notify`, { fileIds: [elsewhere.id] });
    expect(sibling.status).toBe(200);
    const parallel = await mine();
    const p = await send(alice.client, CLIENT, parallel.id, "p.wav", noise(1000, 5));
    const burst = await Promise.all([1, 2, 3, 4].map(() => alice.client.post(`${CLIENT}/bookings/${parallel.id}/files/notify`, { fileIds: [p.id] })));
    expect(burst.map((r) => r.status).sort()).toEqual([200, 429, 429, 429]);
    expect(await h.sql("SELECT * FROM email_outbox WHERE subject = ? AND to_email = ?", `Files from Alice Wonder · ${parallel.ref}`, maker.email)).toHaveLength(1);
  }, 60000);

  it("lets staff download what the client sent and notes the first time", async () => {
    const order = await mine();
    const data = noise(70_000, 12);
    const up = await send(alice.client, CLIENT, order.id, "reference.mp3", data);
    expect(up.first_downloaded_at).toBeNull();
    const own = await alice.client.get(`${CLIENT}/files/${up.id}/download`);
    expect(await sha(await bytesOf(own))).toBe(await sha(data));
    expect(await row(up.id)).toMatchObject({ download_count: 0, first_downloaded_at: null });
    const got = await maker.client.get(`${STAFF}/files/${up.id}/download`);
    expect(got.status).toBe(200);
    expect(await sha(await bytesOf(got))).toBe(await sha(data));
    const after = await row(up.id);
    expect(after.download_count).toBe(1);
    expect(after.first_downloaded_at).toBeTruthy();
    const seen = (await maker.client.get(`${STAFF}/bookings/${order.id}/files`)).body.uploads[0];
    expect(seen).toMatchObject({ id: up.id, downloads: 1, direction: "upload" });
    expect(await h.sql("SELECT actor_label FROM audit_logs WHERE action = 'Downloaded client file' AND target = ?", order.ref)).toHaveLength(2);
  });

  it("lets a client remove their own upload, which is gone for staff too", async () => {
    const order = await mine();
    const up = await send(alice.client, CLIENT, order.id, "oops.wav", noise(3000, 1));
    expect((await alice.client.del(`${CLIENT}/files/${up.id}`)).status).toBe(200);
    expect(await h.env.MEDIA!.head(`portal/${order.id}/${up.id}`)).toBeNull();
    expect((await maker.client.get(`${STAFF}/files/${up.id}/download`)).status).toBe(404);
    expect((await alice.client.get(`${CLIENT}/files`)).body.bookings.find((b: any) => b.id === order.id).uploads).toEqual([]);
  });
});

describe("production queue", () => {
  const tabIds = async (tab: string, c: Client = maker.client) => (await c.get(`${STAFF}/deliveries?tab=${tab}`)).body.rows.map((r: any) => r.id);

  it("sorts bookings into the four tabs", async () => {
    const yesterday = new Date(Date.now() + 3_600_000 - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 3_600_000 + 86_400_000).toISOString().slice(0, 10);
    const late = await mine({ scheduling: "project", due: yesterday });
    const soon = await mine({ scheduling: "project", due: tomorrow });
    const open = await mine({ scheduling: "project", due: null });
    const sessionDue = await mine({ scheduling: "slot", due: tomorrow, status: "completed" });
    const sessionPlain = await mine({ scheduling: "flex", due: null });
    const pending = await mine({ scheduling: "project", status: "pending" });
    const delivered = await mine({ scheduling: "project", due: yesterday });
    const finished = await mine({ scheduling: "project", due: yesterday });
    const withRevision = await mine({ scheduling: "project", due: tomorrow, paid: 10_000_000 });
    const uploaded = await mine({ scheduling: "flex" });
    const closedUploads = await mine({ scheduling: "flex" });

    const d = await stage(delivered.id);
    await deliver(maker.client, delivered.id, [{ fileId: d.id, title: "Out" }]);
    const f = await stage(finished.id);
    await deliver(maker.client, finished.id, [{ fileId: f.id, title: "Out" }], { final: true });
    const r = await stage(withRevision.id);
    await deliver(maker.client, withRevision.id, [{ fileId: r.id, title: "Out" }]);
    await alice.client.post(`${CLIENT}/bookings/${withRevision.id}/revisions`, { note: "add more reverb to the chorus" });
    const u = await send(alice.client, CLIENT, uploaded.id, "stems.zip", noise(2000, 1));
    await send(alice.client, CLIENT, closedUploads.id, "late.zip", noise(2000, 2));
    await h.env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(closedUploads.id).run();

    const todo = await tabIds("todo");
    for (const b of [late, soon, open, sessionDue]) expect(todo, b.ref).toContain(b.id);
    for (const b of [sessionPlain, pending, delivered, finished, withRevision, uploaded]) expect(todo, b.ref).not.toContain(b.id);
    expect(todo.indexOf(late.id)).toBeLessThan(todo.indexOf(soon.id));
    expect(todo.indexOf(soon.id)).toBeLessThan(todo.indexOf(open.id));

    const rows = (await maker.client.get(`${STAFF}/deliveries?tab=todo`)).body.rows;
    expect(rows.find((x: any) => x.id === late.id)).toMatchObject({ ref: late.ref, artist_name: "Alice Wonder", due_date: yesterday, overdue: true, balance_kobo: 10_000_000, final: false, revision_limit: 3 });
    expect(rows.find((x: any) => x.id === soon.id)).toMatchObject({ overdue: false });
    expect(rows.find((x: any) => x.id === open.id)).toMatchObject({ due_date: null, overdue: false });

    expect(await tabIds("revisions")).toContain(withRevision.id);
    expect(await tabIds("revisions")).not.toContain(delivered.id);
    const revRow = (await maker.client.get(`${STAFF}/deliveries?tab=revisions`)).body.rows.find((x: any) => x.id === withRevision.id);
    expect(revRow.open_revision).toMatchObject({ note: "add more reverb to the chorus" });
    expect(revRow.counts).toMatchObject({ delivered: 1, staged: 0 });

    const delivery = await tabIds("delivered");
    for (const b of [delivered, finished, withRevision]) expect(delivery, b.ref).toContain(b.id);
    for (const b of [late, open, uploaded]) expect(delivery, b.ref).not.toContain(b.id);
    const overdueFinished = (await maker.client.get(`${STAFF}/deliveries?tab=delivered`)).body.rows.find((x: any) => x.id === finished.id);
    expect(overdueFinished).toMatchObject({ final: true, overdue: false });
    expect((await maker.client.get(`${STAFF}/deliveries?tab=delivered`)).body.rows.find((x: any) => x.id === delivered.id)).toMatchObject({ final: false, overdue: false });

    expect(await tabIds("client")).toContain(uploaded.id);
    expect(await tabIds("client")).not.toContain(closedUploads.id);
    await maker.client.get(`${STAFF}/files/${u.id}/download`).then((x) => x.res.arrayBuffer());
    expect(await tabIds("client")).not.toContain(uploaded.id);

    const counts = (await maker.client.get(`${STAFF}/deliveries?tab=todo`)).body.counts;
    expect(counts).toEqual({ todo: (await tabIds("todo")).length, revisions: (await tabIds("revisions")).length, client: (await tabIds("client")).length, delivered: (await tabIds("delivered")).length });
    expect((await maker.client.get(`${STAFF}/deliveries?tab=nonsense`)).status).toBe(400);
    expect((await maker.client.get(`${STAFF}/deliveries`)).body.tab).toBe("todo");
  }, 60000);

  it("shows no client contact details or payment tokens to anyone who can open it", async () => {
    for (const who of [maker.client, boss]) {
      for (const tab of ["todo", "revisions", "client", "delivered"]) {
        const r = await who.get(`${STAFF}/deliveries?tab=${tab}`);
        expect(r.status).toBe(200);
        const system = r.body.rows.map((x: any) => ({ ...x, open_revision: x.open_revision && { ...x.open_revision, note: "" } }));
        expect(JSON.stringify(system)).not.toMatch(new RegExp(`${alice.email}|805 111 2233|tok-secret-123|pay_token|contact_email|contact_phone`));
      }
    }
  });
});

describe("walk-in clients", () => {
  it("links a booking to a verified client account by email and nothing else", async () => {
    const friend = await h.newClient("Walk In");
    await h.env.DB.prepare("UPDATE users SET email_verified_at = ? WHERE email = ?").bind(new Date().toISOString(), friend.email).run();
    const unverified = await h.newClient("Not Yet");
    const stranger = await makeBooking({ userId: null, email: "" });
    const details = { people: 1, artist_name: "Walk In", contact_phone: "+234 803 000 0000", notes: "" };

    expect((await maker.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details, contact_email: friend.email })).status).toBe(403);
    expect((await desk.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details, contact_email: "not an email" })).status).toBe(400);
    const none = await desk.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details, contact_email: unverified.email });
    expect(none.body).toEqual({ ok: true, linked: false });
    expect(await booking(stranger.id)).toMatchObject({ contact_email: unverified.email, user_id: null });

    const linked = await desk.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details, contact_email: friend.email.toUpperCase() });
    expect(linked.body).toEqual({ ok: true, linked: true });
    expect(await booking(stranger.id)).toMatchObject({ contact_email: friend.email, user_id: friend.user.id });
    const file = await stage(stranger.id);
    const res = await deliver(maker.client, stranger.id, [{ fileId: file.id, title: "Hello" }]);
    expect(res.body).toMatchObject({ notified: true });
    expect((await friend.client.get(`${CLIENT}/files`)).body.bookings.find((b: any) => b.id === stranger.id).deliveries).toHaveLength(1);

    const taken = await desk.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details, contact_email: unverified.email });
    expect(taken.body).toEqual({ ok: true, linked: false });
    expect((await booking(stranger.id)).user_id).toBe(friend.user.id);
    const noEmail = await desk.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details });
    expect(noEmail.body).toEqual({ ok: true });
    const empty = await desk.client.put(`${STAFF}/bookings/${stranger.id}/details`, { ...details, contact_email: "" });
    expect(empty.body).toEqual({ ok: true });
    expect((await booking(stranger.id)).contact_email).toBe(unverified.email);

    const logs = await h.sql("SELECT * FROM audit_logs WHERE action = 'Set booking contact email' AND target = ?", stranger.ref);
    expect(logs.length).toBe(3);
    expect(JSON.stringify(logs)).not.toMatch(new RegExp(`${friend.email}|${unverified.email}`));
  }, 60000);
});

describe("housekeeping and limits", () => {
  it("aborts uploads nobody finished within a day and deletes the leftovers of removed files after a week", async () => {
    const order = await mine();
    const begin = async (name: string) => (await alice.client.post(`${CLIENT}/bookings/${order.id}/files`, { name, size: 3 * MiB })).body.id as string;
    const old = await begin("left behind.wav");
    const recent = await begin("still going.wav");
    await alice.client.call("PUT", `${CLIENT}/files/${old}/parts/1`, { raw: noise(3 * MiB, 1) });
    const { upload_id, parts } = await row(old);
    await h.env.DB.prepare("UPDATE booking_files SET created_at = ? WHERE id = ?").bind(ago(25 * 3_600_000), old).run();
    await h.env.DB.prepare("UPDATE booking_files SET created_at = ? WHERE id = ?").bind(ago(23 * 3_600_000), recent).run();

    const stuck = await send(alice.client, CLIENT, order.id, "removed long ago.wav", noise(4000, 2));
    const fresh = await send(alice.client, CLIENT, order.id, "removed today.wav", noise(4000, 3));
    const unpublished = await stage(order.id, "never published.mp3", 3000, 4);
    for (const [id, age] of [[stuck.id, 8 * 86_400_000], [fresh.id, 2 * 86_400_000]] as const) {
      await h.env.DB.prepare("UPDATE booking_files SET state = 'removed', created_at = ? WHERE id = ?").bind(ago(age), id).run();
    }
    await h.env.DB.prepare("UPDATE booking_files SET created_at = ? WHERE id = ?").bind(ago(40 * 86_400_000), unpublished.id).run();

    await filesService.housekeeping(h.env);

    expect(await row(old)).toMatchObject({ state: "removed", upload_id: null });
    expect((await row(recent)).state).toBe("uploading");
    await expect(h.env.MEDIA!.resumeMultipartUpload(`portal/${order.id}/${old}`, upload_id).complete(JSON.parse(parts).map((p: any) => ({ partNumber: p.partNumber, etag: p.etag })))).rejects.toThrow();
    expect(await h.env.MEDIA!.head(`portal/${order.id}/${stuck.id}`)).toBeNull();
    expect((await row(stuck.id)).size).toBe(0);
    expect(await h.env.MEDIA!.head(`portal/${order.id}/${fresh.id}`)).not.toBeNull();
    expect((await row(fresh.id)).size).toBe(4000);
    expect(await h.env.MEDIA!.head(`portal/${order.id}/${unpublished.id}`)).not.toBeNull();
    expect((await row(unpublished.id)).state).toBe("ready");
    expect((await alice.client.post(`${CLIENT}/files/${old}/complete`)).status).toBe(404);
    expect(await h.sql("SELECT 1 FROM audit_logs WHERE action = 'Cleared stored files'")).not.toHaveLength(0);
    await filesService.housekeeping(h.env);
  }, 60000);

  it("holds a booking to a fixed number of files, bytes and uploads in flight, even for simultaneous starts", async () => {
    const insert = (booking: string, direction: string, state: string, declared: number, n: number) =>
      h.env.DB.prepare("INSERT INTO booking_files (id, booking_id, direction, name, r2_key, declared_size, size, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), booking, direction, `f${n}.wav`, `portal/${booking}/seed-${n}-${crypto.randomUUID()}`, declared, state === "ready" ? declared : 0, state).run();

    const crowded = await mine();
    for (let i = 0; i < 99; i++) await insert(crowded.id, "upload", "ready", 10, i);
    const racers = await Promise.all([1, 2, 3, 4, 5].map((i) => alice.client.post(`${CLIENT}/bookings/${crowded.id}/files`, { name: `racer${i}.wav`, size: 10 })));
    expect(racers.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of racers.filter((x) => x.status !== 200)) expect(r.body.error).toMatch(/already holds 100 files/);
    expect((await h.sql("SELECT COUNT(*) n FROM booking_files WHERE booking_id = ? AND direction = 'upload' AND state != 'removed'", crowded.id))[0].n).toBe(100);
    expect((await maker.client.post(`${STAFF}/bookings/${crowded.id}/files`, { name: "delivery.wav", size: 10 })).status).toBe(200);

    const heavy = await mine();
    await insert(heavy.id, "upload", "ready", 10 * 1024 ** 3 - 1 * MiB, 1);
    const over = await alice.client.post(`${CLIENT}/bookings/${heavy.id}/files`, { name: "straw.wav", size: 2 * MiB });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/10 GB limit/);
    expect((await alice.client.post(`${CLIENT}/bookings/${heavy.id}/files`, { name: "fits.wav", size: 1 * MiB })).status).toBe(200);

    const busy = await mine();
    for (let i = 0; i < 20; i++) await insert(busy.id, "upload", "uploading", 10, i);
    const blocked = await alice.client.post(`${CLIENT}/bookings/${busy.id}/files`, { name: "one more.wav", size: 10 });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/in progress/);
  }, 120000);
});

describe("round two fixes", () => {
  const audits = (action: string, ref: string) => h.sql("SELECT * FROM audit_logs WHERE action = ? AND target = ? ORDER BY created_at", action, ref);

  it("audits every download once per person and file per ten minutes, whatever the range", async () => {
    const order = await mine({ paid: 10_000_000 });
    const file = await stage(order.id, "trace.mp3", 30_000, 6);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Trace" }]);
    const probe = await head(alice.client, `${CLIENT}/files/${file.id}/download`);
    expect(probe.status).toBe(200);
    expect(await audits("Downloaded delivery", order.ref)).toHaveLength(0);
    const taken = await alice.client.call("GET", `${CLIENT}/files/${file.id}/download`, { headers: { range: "bytes=1-" } });
    expect(taken.status).toBe(206);
    expect((await bytesOf(taken)).length).toBe(29_999);
    expect(await audits("Downloaded delivery", order.ref)).toHaveLength(1);
    expect(await row(file.id)).toMatchObject({ download_count: 1 });
    expect((await row(file.id)).first_downloaded_at).toBeTruthy();
    for (const range of ["bytes=5-9", "bytes=0-"]) await (await alice.client.call("GET", `${CLIENT}/files/${file.id}/download`, { headers: { range } })).res.arrayBuffer();
    expect(await audits("Downloaded delivery", order.ref)).toHaveLength(1);
    expect((await row(file.id)).download_count).toBe(1);
    await h.env.DB.prepare("UPDATE audit_logs SET created_at = ? WHERE action = 'Downloaded delivery' AND target = ?").bind(ago(11 * 60_000), order.ref).run();
    await (await alice.client.call("GET", `${CLIENT}/files/${file.id}/download`, { headers: { range: "bytes=2-3" } })).res.arrayBuffer();
    expect(await audits("Downloaded delivery", order.ref)).toHaveLength(2);
    expect((await row(file.id)).download_count).toBe(2);
    expect((await bob.client.get(`${CLIENT}/files/${file.id}/download`)).status).toBe(404);
    expect(await audits("Downloaded delivery", order.ref)).toHaveLength(2);
  });

  it("tells a walk-in client once an email is added, and again lists nothing twice", async () => {
    const order = await makeBooking({ email: "", userId: null });
    const file = await stage(order.id);
    expect((await deliver(maker.client, order.id, [{ fileId: file.id, title: "Waiting" }])).body).toMatchObject({ notified: false, reason: "no_contact" });
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/notify-delivery`)).body).toMatchObject({ ok: true, notified: false, reason: "no_contact" });
    const details = { people: 1, artist_name: "Walk In", contact_phone: "+234 803 000 0000", notes: "" };
    expect((await desk.client.put(`${STAFF}/bookings/${order.id}/details`, { ...details, contact_email: "late.walkin@example.com" })).status).toBe(200);
    const mails = await outbox("late.walkin@example.com", `%ready · ${order.ref}`);
    expect(mails).toHaveLength(1);
    expect(mails[0].body).toContain("Waiting");
    expect((await booking(order.id)).delivery_notified_at).toBeTruthy();
    await desk.client.put(`${STAFF}/bookings/${order.id}/details`, { ...details, contact_email: "late.walkin@example.com" });
    expect(await outbox("late.walkin@example.com", `%ready · ${order.ref}`)).toHaveLength(1);
  });

  it("tells a guest when their account is verified and the booking is linked", async () => {
    const guest = await h.newClient("Guest Later");
    const order = await makeBooking({ email: "", userId: null });
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "For the guest" }]);
    await h.env.DB.prepare("UPDATE bookings SET contact_email = ? WHERE id = ?").bind(guest.email, order.id).run();
    const token = (await outbox(guest.email, "%Verify%"))[0].body.match(/token=(\S+)/)![1];
    expect((await h.client().post("/api/auth/verify-email", { token })).status).toBe(200);
    const mails = await outbox(guest.email, `%ready · ${order.ref}`);
    expect(mails).toHaveLength(1);
    const note = (await guest.client.get(`${CLIENT}/overview`)).body.notifications.find((n: any) => n.booking_id === order.id);
    expect(note.title).toBe("Your music is ready");
  });

  it("lets staff resend the ready notice, at most every two minutes, without client contacts in anything they see", async () => {
    const order = await mine({ paid: 10_000_000 });
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/notify-delivery`)).status).toBe(400);
    const file = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: file.id, title: "Again" }]);
    const resent = await maker.client.post(`${STAFF}/bookings/${order.id}/notify-delivery`);
    expect(resent.body).toMatchObject({ ok: true, notified: true, notified_via: "outbox" });
    expect(JSON.stringify(resent.body)).not.toContain(alice.email);
    expect(await outbox(alice.email, `%ready · ${order.ref}`)).toHaveLength(2);
    expect((await maker.client.post(`${STAFF}/bookings/${order.id}/notify-delivery`)).status).toBe(429);
    expect((await desk.client.post(`${STAFF}/bookings/${order.id}/notify-delivery`)).status).toBe(403);
  });

  it("reports a refused email as not notified, and an unconfigured provider as the outbox", async () => {
    const order = await mine();
    const [a, b] = [await stage(order.id), await stage(order.id, "b.mp3")];
    const plain = await deliver(maker.client, order.id, [{ fileId: a.id, title: "One" }]);
    expect(plain.body).toMatchObject({ notified: true, notified_via: "outbox" });
    const env = h.env as any;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((async (url: any, init: any) => (String(url).includes("resend.com") ? new Response("no", { status: 500 }) : fetch(url, init))) as never);
    env.RESEND_API_KEY = "re_test";
    try {
      const failed = await deliver(maker.client, order.id, [{ fileId: b.id, title: "Two" }]);
      expect(failed.status).toBe(200);
      expect(failed.body).toMatchObject({ notified: false, reason: "send_failed" });
      expect((await outbox(alice.email, `%ready · ${order.ref}`)).pop().status).toBe("failed");
    } finally {
      delete env.RESEND_API_KEY;
      spy.mockRestore();
    }
  });

  it("freezes a completed order against every status change", async () => {
    const order = await mine({ status: "completed", final: true, scheduling: "flex", paid: 10_000_000 });
    const checks: [string, string, object][] = [
      ["POST", "outcome", { outcome: "no_show" }], ["POST", "cancel", { reason: "x", fullRefund: true }], ["POST", "reject", { reason: "x" }], ["POST", "approve", { note: "" }],
      ["POST", "confirm", { note: "" }], ["POST", "reschedule", { date: "2030-01-01", start: 600 }],
    ];
    for (const [method, path, body] of checks) {
      const r = await boss.call(method, `${STAFF}/bookings/${order.id}/${path}`, { body });
      expect(r.status, path).toBe(400);
      expect(r.body.error, path).toMatch(/complete|cannot|Only/);
    }
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/requests`, { kind: "cancel", reason: "x" })).status).toBe(400);
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/withdraw`)).status).toBe(400);
    expect(await booking(order.id)).toMatchObject({ status: "completed" });
    const open = await mine({ status: "confirmed", final: true, scheduling: "flex" });
    expect((await boss.post(`${STAFF}/bookings/${open.id}/outcome`, { outcome: "no_show" })).body.error).toMatch(/complete and can no longer/);
    expect((await booking(open.id)).status).toBe("confirmed");
  });

  it("completes a paid, delivered order by itself after seven quiet days, and only then", async () => {
    const make = async (o: { paid: number; days: number; revision?: boolean }) => {
      const order = await mine({ paid: o.paid, limit: 3 });
      const f = await stage(order.id);
      await deliver(maker.client, order.id, [{ fileId: f.id, title: "Auto" }]);
      if (o.revision) await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "needs more bass" });
      await h.env.DB.prepare("UPDATE booking_files SET delivered_at = ? WHERE booking_id = ?").bind(ago(o.days * 86_400_000), order.id).run();
      return order;
    };
    const ready = await make({ paid: 10_000_000, days: 8 });
    const young = await make({ paid: 10_000_000, days: 6 });
    const owing = await make({ paid: 5_000_000, days: 30 });
    const asking = await make({ paid: 10_000_000, days: 30, revision: true });
    await filesService.housekeeping(h.env);
    await filesService.housekeeping(h.env);
    expect(await booking(ready.id)).toMatchObject({ status: "completed" });
    expect((await booking(ready.id)).delivered_final_at).toBeTruthy();
    for (const o of [young, owing, asking]) expect((await booking(o.id)).delivered_final_at).toBeNull();
    const logs = await audits("Completed order automatically", ready.ref);
    expect(logs).toHaveLength(1);
    expect(logs[0].actor_label).toBe("System");
    expect(await outbox(alice.email, `Your order is complete · ${ready.ref}`)).toHaveLength(1);
    expect((await h.sql("SELECT 1 FROM email_outbox WHERE subject = ?", `Order completed automatically · ${ready.ref}`)).length).toBeGreaterThan(0);
    const mail = (await outbox(alice.email, `%ready · ${young.ref}`))[0];
    expect(mail.body).toContain("within 7 days the order is marked complete");
  });

  it("refuses approval and revisions while every delivery is locked by an unpaid balance", async () => {
    const order = await mine({ paid: 0, limit: 3 });
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Locked" }]);
    const a = await alice.client.post(`${CLIENT}/bookings/${order.id}/approve`);
    expect(a.status).toBe(400);
    expect(a.body.error).toBe("Pay the balance to open your files before you approve.");
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "change it" })).status).toBe(400);
    expect((await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body.revisions).toMatchObject({ canApprove: false, canRequest: false });
    await boss.post(`${STAFF}/files/${f.id}/release`, { released: true });
    expect((await alice.client.get(`${CLIENT}/bookings/${order.id}`)).body.revisions).toMatchObject({ canApprove: true, canRequest: true });
    expect((await alice.client.post(`${CLIENT}/bookings/${order.id}/revisions`, { note: "change it" })).status).toBe(200);
  });

  it("says in the payment email that files are unlocked, and gives notices a booking id", async () => {
    const order = await mine({ paid: 5_000_000 });
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Pay me" }]);
    expect((await boss.post(`${STAFF}/bookings/${order.id}/payments`, { amount: 5_000_000, method: "cash" })).status).toBe(200);
    const mail = (await outbox(alice.email, `Payment received · ${order.ref}`))[0];
    expect(mail.body).toContain("now unlocked");
    expect(mail.body).toContain(`/account/bookings/${order.id}`);
    const mine2 = (await alice.client.get(`${CLIENT}/overview`)).body.notifications;
    expect(mine2.find((n: any) => n.title === "Your music is ready" && n.body.startsWith(order.ref)).booking_id).toBe(order.id);
  });

  it("groups versions of a title and marks the newest", async () => {
    const order = await mine({ paid: 10_000_000 });
    for (const title of ["Mix", " mix ", "Other"]) {
      const f = await stage(order.id);
      await deliver(maker.client, order.id, [{ fileId: f.id, title }]);
    }
    const list = (await alice.client.get(`${CLIENT}/files`)).body.bookings.find((b: any) => b.id === order.id).deliveries;
    const mix = list.filter((f: any) => f.group === "mix").sort((a: any, b: any) => a.version - b.version);
    expect(mix.map((f: any) => [f.version, f.latest])).toEqual([[1, false], [2, true]]);
    expect(list.find((f: any) => f.group === "other")).toMatchObject({ version: 1, latest: true });
    const up = await send(alice.client, CLIENT, order.id, "u.wav", noise(500, 1));
    expect(up).toMatchObject({ group: null, latest: true });
  });

  it("sweeps only files still uploading, refuses expired requests, and keeps delivered files with the owners", async () => {
    const finished = await mine();
    const f = await stage(finished.id);
    expect(await filesRepo.markStale(h.env.DB, f.id)).toBe(false);
    expect((await row(f.id)).state).toBe("ready");
    const expired = await mine({ status: "pending" });
    await h.env.DB.prepare("UPDATE bookings SET expires_at = ? WHERE id = ?").bind(ago(60_000), expired.id).run();
    const r = await alice.client.post(`${CLIENT}/bookings/${expired.id}/files`, { name: "late.wav", size: 10 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/expired/);
    const live = await mine({ status: "pending" });
    await h.env.DB.prepare("UPDATE bookings SET expires_at = ? WHERE id = ?").bind(new Date(Date.now() + 3_600_000).toISOString(), live.id).run();
    expect((await alice.client.post(`${CLIENT}/bookings/${live.id}/files`, { name: "ok.wav", size: 10 })).status).toBe(200);

    await deliver(maker.client, finished.id, [{ fileId: f.id, title: "Given" }]);
    expect((await maker.client.del(`${STAFF}/files/${f.id}`)).status).toBe(403);
    expect((await row(f.id)).state).toBe("ready");
    const upload = await send(alice.client, CLIENT, finished.id, "theirs.wav", noise(900, 2));
    expect((await maker.client.del(`${STAFF}/files/${upload.id}`)).status).toBe(200);
    expect((await boss.del(`${STAFF}/files/${f.id}`)).status).toBe(200);

    const kept = await send(alice.client, CLIENT, finished.id, "needs r2.wav", noise(900, 3));
    const bare = new Client({ ...h.env, MEDIA: undefined } as never, h.ctx);
    await bare.login(alice.email, "studio2026");
    const none = await bare.get(`${CLIENT}/files/${kept.id}/download`);
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("storage_unavailable");
  });
});

describe("round three fixes", () => {
  it("lets only owners and staff who record payments open files before payment", async () => {
    const order = await mine();
    const [a, b] = [await stage(order.id), await stage(order.id, "b.mp3")];
    const early = await deliver(maker.client, order.id, [{ fileId: a.id, title: "Early" }], { released: true });
    expect(early.status).toBe(403);
    expect((await row(a.id)).delivered_at).toBeNull();
    const cashier = await h.newStaff("custom", ["deliver_files", "record_payments"]);
    const ok = await deliver(cashier.client, order.id, [{ fileId: a.id, title: "Early" }], { released: true });
    expect(ok.status).toBe(200);
    expect((await alice.client.get(`${CLIENT}/files/${a.id}/download`)).status).toBe(200);
    expect((await maker.client.post(`${STAFF}/files/${a.id}/release`, { released: false })).status).toBe(200);
    expect((await alice.client.get(`${CLIENT}/files/${a.id}/download`)).status).toBe(403);
    expect((await deliver(maker.client, order.id, [{ fileId: b.id, title: "Locked" }])).status).toBe(200);
  });

  it("keeps an order with a pending change request from being completed, by anyone", async () => {
    const order = await mine({ paid: 10_000_000, limit: 3 });
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Mix" }]);
    await h.env.DB.prepare("INSERT INTO change_requests (id, booking_id, user_id, kind, reason, status) VALUES (?, ?, ?, 'cancel', 'x', 'pending')").bind(crypto.randomUUID(), order.id, alice.user.id).run();
    const mine409 = await alice.client.post(`${CLIENT}/bookings/${order.id}/approve`);
    expect(mine409.status).toBe(409);
    expect(mine409.body.error).toMatch(/pending request/);
    const staff409 = await maker.client.post(`${STAFF}/bookings/${order.id}/finalize`);
    expect(staff409.status).toBe(409);
    expect(staff409.body.error).toMatch(/Decide the pending/);
    await h.env.DB.prepare("UPDATE booking_files SET delivered_at = ? WHERE booking_id = ?").bind(ago(9 * 86_400_000), order.id).run();
    await filesService.housekeeping(h.env);
    expect((await booking(order.id)).delivered_final_at).toBeNull();
    const row0 = (await maker.client.get(`${STAFF}/deliveries?tab=delivered`)).body.rows.find((r: any) => r.id === order.id);
    expect(row0.pending_request).toBe("cancel");
  });

  it("lets staff decline a request on an order that completed anyway", async () => {
    const order = await mine({ status: "completed", final: true, scheduling: "flex" });
    const id = crypto.randomUUID();
    await h.env.DB.prepare("INSERT INTO change_requests (id, booking_id, user_id, kind, reason, status) VALUES (?, ?, ?, 'cancel', 'x', 'pending')").bind(id, order.id, alice.user.id).run();
    expect((await boss.post(`${STAFF}/requests/${id}`, { approve: true })).status).toBe(200);
    expect((await h.sql("SELECT status FROM change_requests WHERE id = ?", id))[0].status).toBe("declined");
    expect((await booking(order.id)).status).toBe("completed");
  });

  it("sends the ready email once when a form is saved twice at the same time", async () => {
    const order = await makeBooking({ email: "", userId: null });
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Twice" }]);
    const d = { people: 1, artist_name: "W", contact_phone: "+234 803 000 0000", notes: "", contact_email: "double.save@example.com" };
    await Promise.all([desk.client.put(`${STAFF}/bookings/${order.id}/details`, d), desk.client.put(`${STAFF}/bookings/${order.id}/details`, d)]);
    expect(await outbox("double.save@example.com", `%ready · ${order.ref}`)).toHaveLength(1);
  });

  it("stops serving deliveries of a cancelled booking, and emails both addresses when they differ", async () => {
    const order = await mine({ paid: 10_000_000 });
    await h.env.DB.prepare("UPDATE bookings SET contact_email = 'typed.by.staff@example.com' WHERE id = ?").bind(order.id).run();
    const f = await stage(order.id);
    await deliver(maker.client, order.id, [{ fileId: f.id, title: "Both" }], { released: false });
    expect(await outbox("typed.by.staff@example.com", `%ready · ${order.ref}`)).toHaveLength(1);
    expect(await outbox(alice.email, `%ready · ${order.ref}`)).toHaveLength(1);
    expect((await alice.client.get(`${CLIENT}/files/${f.id}/download`)).status).toBe(200);
    for (const status of ["cancelled", "rejected"]) {
      await h.env.DB.prepare("UPDATE bookings SET status = ? WHERE id = ?").bind(status, order.id).run();
      expect((await alice.client.get(`${CLIENT}/files/${f.id}/download`)).status).toBe(404);
      expect((await maker.client.get(`${STAFF}/files/${f.id}/download`)).status).toBe(200);
    }
  });
});

describe("round four fixes", () => {
  const openRequest = (bookingId: string) => h.env.DB.prepare("INSERT INTO change_requests (id, booking_id, user_id, kind, reason, status) VALUES (?, ?, ?, 'cancel', 'x', 'pending')").bind(crypto.randomUUID(), bookingId, alice.user.id).run();

  it("refuses every delivery, final or not, while a client's cancel or reschedule request waits", async () => {
    const order = await mine({ paid: 10_000_000 });
    const f = await stage(order.id);
    await openRequest(order.id);
    for (const final of [false, true]) {
      const r = await deliver(maker.client, order.id, [{ fileId: f.id, title: "Mix" }], { final });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/Decide the pending/);
    }
    expect((await row(f.id)).delivered_at).toBeNull();
    expect((await booking(order.id)).delivered_final_at).toBeNull();
  });

  it("keeps contact details out of delivery titles and notes for staff who cannot see client contacts", async () => {
    const order = await mine();
    const f = await stage(order.id);
    for (const note of ["call me on 0803 555 1234", "text +234 803 555 1234", "mail me: dj@example.com"]) {
      const r = await deliver(maker.client, order.id, [{ fileId: f.id, title: "Mix" }], { note });
      expect(r.status).toBe(400);
    }
    expect((await deliver(maker.client, order.id, [{ fileId: f.id, title: "dj@example.com" }])).status).toBe(400);
    expect((await row(f.id)).delivered_at).toBeNull();
    expect((await deliver(maker.client, order.id, [{ fileId: f.id, title: "Mix v2" }], { note: "Bumped the vocals by 2 dB, 24-bit 48000 Hz" })).status).toBe(200);
    const g = await stage(order.id, "other.mp3", 5000, 3);
    expect((await deliver(boss, order.id, [{ fileId: g.id, title: "Mix" }], { note: "Call me on 0803 555 1234" })).status).toBe(200);
  });

  it("does not auto-complete a paid session booking until the session has ended", async () => {
    const make = async (date: string, start: number, end: number, scheduling: string) => {
      const order = await mine({ paid: 10_000_000, scheduling });
      await h.env.DB.prepare("UPDATE bookings SET date = ?, start_min = ?, end_min = ? WHERE id = ?").bind(date, start, end, order.id).run();
      const f = await stage(order.id);
      await deliver(maker.client, order.id, [{ fileId: f.id, title: "Early" }]);
      await h.env.DB.prepare("UPDATE booking_files SET delivered_at = ? WHERE booking_id = ?").bind(ago(9 * 86_400_000), order.id).run();
      return order;
    };
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const future = await make(day(21), 600, 720, "slot");
    const overnight = await make(day(1), 1380, 1740, "slot");
    const past = await make(day(-9), 600, 720, "slot");
    const overnightPast = await make(day(-9), 1380, 1740, "slot");
    await filesService.housekeeping(h.env);
    for (const o of [future, overnight]) expect((await booking(o.id)).delivered_final_at, o.ref).toBeNull();
    for (const o of [past, overnightPast]) expect((await booking(o.id)).delivered_final_at, o.ref).toBeTruthy();
  });
});
