/* Build your own X, chapter 41: a fraud detector.
   Thirteen card payments by one customer. Four of them are a thief testing then using a stolen
   card number abroad.
   The "why": one fixed rule ("block anything over 500") blocks the customer's own rent and
   flight and lets three of the four fraudulent payments through, because thieves know the rule
   and stay under it. Scoring each payment against this customer's own history (is the country
   new? the shop new? the amount unusual for them? several payments in a few minutes?) catches
   all four and blocks nothing real. */
VIZ.register("bx-fraud", async (api) => {
  const W = await api.world3d();
  // [minute, merchant, short label, amount, abroad, fraud]
  const TX = [
    [0, "grocer", "groc", 42, 0, 0], [300, "café", "café", 6, 0, 0], [900, "landlord", "rent", 820, 0, 0],
    [1500, "grocer", "groc", 38, 0, 0], [2000, "airline", "air", 540, 0, 0], [2600, "bakery", "bake", 9, 0, 0],
    [3100, "grocer", "groc", 51, 0, 0], [3500, "GiftCardz", "gift", 45, 1, 1], [3502, "GiftCardz", "gift", 48, 1, 1],
    [3503, "GiftCardz", "gift", 49, 1, 1], [3506, "TechMart", "tech", 650, 1, 1], [3900, "café", "café", 5, 0, 0],
    [4400, "grocer", "groc", 33, 0, 0],
  ];
  const KNOWN = ["grocer", "café", "landlord", "airline"], TYPICAL = 40;
  let mode = "rule", gen = null, seen = 0, flag = [], score = [], running = false, ran = {}, reached = false, line = "";
  function scoreOf(i, approved) {
    const [t, m, , amt, abroad] = TX[i];
    const recent = TX.slice(0, i).filter((x) => t - x[0] <= 10).length;
    const newShop = !approved.has(m);
    const why = [];
    let s = 0;
    if (abroad) { s += 2; why.push("new country +2"); }
    if (newShop) { s += 1; why.push("new shop +1"); }
    if (newShop && amt > 5 * TYPICAL) { s += 2; why.push("big for this customer +2"); }
    if (recent >= 2) { s += 2; why.push(`${recent} payments in 10 min +2`); }
    return [s, why];
  }
  function* run() {
    const approved = new Set(KNOWN);
    for (seen = 1; seen <= TX.length; seen++) {
      const i = seen - 1, [, m, , amt] = TX[i];
      if (mode === "rule") {
        flag[i] = amt > 500;
        yield `${m} ${amt}: ${flag[i] ? "over 500, blocked" : "under 500, allowed"}`;
      } else {
        const [s, why] = scoreOf(i, approved);
        score[i] = s; flag[i] = s >= 3;
        if (!flag[i]) approved.add(m);
        yield `${m} ${amt}: score ${s}${why.length ? ` (${why.join(", ")})` : " (a usual shop, a usual amount)"} → ${flag[i] ? "blocked" : "allowed"}`;
      }
    }
    const c = caught(), f = falseAlarms();
    yield `done: caught ${c} of 4 fraudulent payments, ${f} real payment${f === 1 ? "" : "s"} blocked`;
  }
  const caught = () => TX.filter((x, i) => x[5] && flag[i]).length;
  const falseAlarms = () => TX.filter((x, i) => !x[5] && flag[i]).length;
  function draw() {
    const end = seen > TX.length;
    TX.forEach(([, m, short, amt, abroad, fraud], i) => {
      const x = -3.3 + i * 0.55, h = Math.sqrt(amt) * 0.085, on = i < seen;
      const col = !on ? "line" : flag[i] ? (fraud || !end ? "c1" : "c4") : fraud && end ? "c1" : "c3";
      W.box("t" + i, { x, y: -1.5 + h / 2, z: 0, sx: 0.42, sy: h, sz: 0.3, color: col, opacity: !on ? 0.2 : fraud && end && !flag[i] ? 0.35 : 0.92,
        info: { title: `${m}, ${amt}`, html: `<p>${abroad ? "Abroad. " : ""}${on ? (flag[i] ? "Blocked." : "Allowed.") : "Not seen yet."}${end ? (fraud ? " This was fraud." : " This was the real customer.") : ""}</p>` } });
      W.label("a" + i, String(amt), [x, -1.35 + h, 0.25], { color: "muted", size: 0.11 });
      W.label("m" + i, short, [x, -1.75, 0.2], { color: abroad ? "c1" : "ink", size: 0.12 });
      W.label("s" + i, mode === "score" && on ? `${score[i]}` : "", [x, 1.9, 0.2], { color: flag[i] ? "c1" : "muted", size: 0.13 });
      W.label("f" + i, end ? (fraud ? (flag[i] ? "caught" : "missed") : flag[i] ? "false alarm" : "") : "", [x, -2.0 - (i % 2) * 0.22, 0.2], { color: fraud && flag[i] ? "c3" : "c1", size: 0.1 });
    });
    W.label("sh", mode === "score" ? "risk score (3 or more = block)" : "", [-1.9, 2.2, 0.2], { color: "muted", size: 0.12 });
    W.box("lim", { x: 0, y: -1.5 + Math.sqrt(500) * 0.085, z: 0.2, sx: 7.2, sy: 0.025, sz: 0.025, color: "c4", opacity: 0.9, visible: mode === "rule" });
  }
  function show() { api.status(`${mode === "rule" ? "one rule: block over 500" : "score against this customer's history"} · caught ${caught()}/4 · ${falseAlarms()} false alarms\n${line}`); }
  function reset() { seen = 0; flag = []; score = []; line = ""; gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = true;
    if (mode === "rule") api.explain(`Caught ${caught()} of 4, blocked ${falseAlarms()} real payments`, `<p>The customer's rent and flight were blocked, and the thief's small gift-card payments sailed under the limit. Fixed thresholds are easy to learn and easy to dodge.</p><p>Switch to <b>score per customer</b> and run it.</p>`);
    else if (ran.rule && !reached) { reached = true; api.explain("Normal for whom?", `<p>Caught ${caught()} of 4 with no false alarms. Rent at the usual landlord is normal <i>for this customer</i>; gift cards abroad, three in a few minutes, are not. Each signal is weak alone; added up, they're clear.</p><p>Stripe Radar, Visa and every bank score payments like this, with the weights learned from past fraud.</p>`); api.done("You caught the thief, not the customer"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(700); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "block over 500", value: "rule" }, { label: "score per customer", value: "score" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 10.2, theta: 0, phi: 1.5, instant: true });
  api.hud("one bar per payment, in time order · green = allowed · red = blocked (or fraud that got through, faded) · amber = a real payment blocked · red shop name = abroad");
  reset();
  api.explain("How to read this", `<p>Thirteen payments on one card; four are a thief. <b>Run all</b> with <b>block over 500</b>, then with <b>score per customer</b>.</p>`);
});
