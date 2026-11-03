/* Build your own X, chapter 39: a payments system.
   Five customers each tap "Pay 20" once, over a patchy mobile network. The charge goes through,
   but sometimes the reply gets lost on the way back, so the phone times out and sends the
   request again.
   The "why": a server that charges on every request it receives charges a customer once per
   retry: 11 charges for 5 purchases. An idempotency key (one random id per purchase, sent with
   every retry) lets the server notice "I've already done this one" and replay the saved result,
   so each customer pays exactly once however many times the phone retries. */
VIZ.register("bx-pay", async (api) => {
  const W = await api.world3d();
  const NAMES = ["Ana", "Ben", "Chi", "Dev", "Eli"], LOST = [0, 2, 1, 3, 0], PRICE = 20;
  let mode = "plain", gen = null, cells = [], charged = [], running = false, ran = {}, reached = false, line = "";
  function* run() {
    const seen = new Set();
    for (let c = 0; c < NAMES.length; c++) {
      const key = `k-${NAMES[c].toLowerCase()}`;
      for (let a = 0; a <= LOST[c]; a++) {
        const lost = a < LOST[c];
        let kind;
        if (mode === "key" && seen.has(key)) kind = "replay";
        else { kind = charged[c] ? "again" : "ok"; charged[c] += PRICE; seen.add(key); }
        cells[c][a] = { kind, lost };
        const what = kind === "replay" ? `the server has seen key ${key}, so it sends back the saved reply without charging` : kind === "again" ? `the server charges ${NAMES[c]} again` : `the server charges ${NAMES[c]} ${PRICE}`;
        yield `${NAMES[c]}, try ${a + 1}${mode === "key" ? ` (key ${key})` : ""}: ${what}${lost ? ". The reply is lost, so the phone retries" : ". The reply arrives"}`;
      }
    }
    const tot = charged.reduce((x, y) => x + y, 0);
    yield `done. Customers paid ${tot} for ${NAMES.length * PRICE} of shopping`;
  }
  function draw() {
    const tot = charged.reduce((x, y) => x + y, 0);
    NAMES.forEach((n, c) => {
      const y = 1.75 - c * 0.85;
      W.label("n" + c, n, [-3.6, y, 0.2], { color: "ink", size: 0.16 });
      for (let a = 0; a < 4; a++) {
        const e = cells[c][a], x = -2.6 + a * 1.0;
        W.box(`c${c}_${a}`, { x, y, z: 0, sx: 0.9, sy: 0.6, sz: 0.25, visible: !!e,
          color: !e ? "line" : e.kind === "ok" ? "c3" : e.kind === "again" ? "c1" : "c4", opacity: 0.92,
          info: { title: `${n}, try ${a + 1}`, html: `<p>${!e ? "" : e.kind === "ok" ? "Charged." : e.kind === "again" ? "Charged a second time for the same purchase." : "Seen this key before: no charge, the saved reply is sent back."}${e && e.lost ? " The reply was lost on the way back." : ""}</p>` } });
        W.label(`l${c}_${a}`, e && e.lost ? "reply lost" : "", [x, y, 0.3], { color: "ink", size: 0.12 });
      }
      W.label("p" + c, charged[c] ? `paid ${charged[c]}` : "", [1.6, y, 0.2], { color: charged[c] > PRICE ? "c1" : "c3", size: 0.15 });
    });
    const h = tot * 0.011;
    W.box("tot", { x: 3.1, y: -1.6 + h / 2, z: 0, sx: 0.6, sy: Math.max(0.02, h), sz: 0.3, color: tot > NAMES.length * PRICE ? "c1" : "c3", opacity: 0.9,
      info: { title: "Total charged", html: `<p>${tot} (the shopping cost ${NAMES.length * PRICE}).</p>` } });
    W.box("fair", { x: 3.1, y: -1.6 + NAMES.length * PRICE * 0.011, z: 0.17, sx: 0.8, sy: 0.03, sz: 0.03, color: "c4", opacity: 0.9 });
    W.label("tl", "charged", [3.1, -1.9, 0.2], { color: "ink", size: 0.15 });
    W.label("tv", String(tot), [3.1, -1.45 + Math.max(h, NAMES.length * PRICE * 0.011), 0.2], { color: tot > NAMES.length * PRICE ? "c1" : "muted", size: 0.14 });
  }
  function show() { api.status(`${mode === "plain" ? "charge every time" : "idempotency keys"} · charged ${charged.reduce((x, y) => x + y, 0)}\n${line}`); }
  function reset() { cells = NAMES.map(() => []); charged = NAMES.map(() => 0); line = ""; gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = charged.reduce((x, y) => x + y, 0);
    if (mode === "plain") api.explain(`${ran.plain} charged for ${NAMES.length * PRICE} of shopping`, `<p>Each retry looked like a new purchase, so Dev paid four times. The phone can't know whether a lost reply meant "failed" or "worked", so it has to retry.</p><p>Switch to <b>idempotency keys</b> and run it.</p>`);
    else if (ran.plain !== undefined && !reached) { reached = true; api.explain("Retry as much as you like", `<p>${ran.key} charged, against ${ran.plain}. The phone makes one key per purchase and sends it with every retry; the server stores key → result and answers repeats from that store.</p><p>Stripe, Adyen and PayPal all take an <code>Idempotency-Key</code> header for exactly this.</p>`); api.done("You charged everyone exactly once"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "charge every time", value: "plain" }, { label: "idempotency keys", value: "key" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0.0, 0.0, 0], dist: 10.2, theta: 0, phi: 1.5, instant: true });
  api.hud("one row per customer, one square per try · green = charged · red = charged again · amber = replayed, no charge · right: total charged, amber line = what the shopping cost");
  reset();
  api.explain("How to read this", `<p>Five customers each buy one thing for ${PRICE}; some replies get lost and the phone retries. <b>Run all</b> with <b>charge every time</b>, then with <b>idempotency keys</b>.</p>`);
});
