/* Build your own X, chapter 35: a stock-exchange order book.
   Five sell orders are resting on the book at three prices. A buy order for 200 shares arrives,
   willing to pay up to 101.00.
   The "why": filling the buyer from whichever sell orders arrived first ignores price, so the buyer
   pays 101.00 while cheaper shares sit unsold. An exchange uses price-time priority: the best price
   first, and among orders at the same price, the oldest first. The book keeps each price level as a
   queue, and the levels sorted (a heap or a sorted map), so the best price is always at the top. */
VIZ.register("bx-orderbook", async (api) => {
  const W = await api.world3d();
  const ASKS = [{ id: "S1", px: 101.0, q: 100 }, { id: "S2", px: 100.5, q: 100 }, { id: "S3", px: 100.0, q: 50 }, { id: "S4", px: 100.5, q: 80 }, { id: "S5", px: 100.0, q: 70 }];
  const LEVELS = [101.0, 100.5, 100.0], WANT = 200;
  let mode = "fifo", gen = null, left = {}, fills = [], need = WANT, cost = 0, running = false, ran = {}, reached = false, line = "";
  function* fill(order, why) {
    for (const o of order) {
      if (need === 0) break;
      const q = Math.min(need, left[o.id]);
      left[o.id] -= q; need -= q; cost += q * o.px; fills.push({ id: o.id, q, px: o.px });
      yield `${why(o)}: buy ${q} from ${o.id} at ${o.px.toFixed(2)}. ${need ? `${need} still to buy` : "Filled"}`;
    }
  }
  function* fifo() {
    yield* fill(ASKS, (o) => `${o.id} arrived ${["first", "second", "third", "fourth", "fifth"][ASKS.indexOf(o)]}`);
    yield `paid ${cost.toFixed(2)} for ${WANT} shares, average ${(cost / WANT).toFixed(3)}, while 120 shares at 100.00 were never touched`;
  }
  function* priority() {
    const order = ASKS.map((o, t) => ({ ...o, t })).sort((a, b) => a.px - b.px || a.t - b.t);
    yield `sort the sell side by price, then by arrival: ${order.map((o) => o.id).join(", ")}`;
    yield* fill(order, (o) => `best price left is ${o.px.toFixed(2)}, and ${o.id} is the oldest order there`);
    yield `paid ${cost.toFixed(2)} for ${WANT} shares, average ${(cost / WANT).toFixed(3)}. S2 keeps its last 20 shares at the front of the 100.50 queue, ahead of S4`;
  }
  function draw() {
    LEVELS.forEach((px, k) => {
      const y = 1.4 - k * 1.0;
      W.label("px" + k, px.toFixed(2), [-3.5, y, 0.2], { color: "ink", size: 0.22 });
      let x = -2.8;
      ASKS.filter((o) => o.px === px).forEach((o) => {
        const w = o.q / 40, l = left[o.id], used = o.q - l;
        W.box("o" + o.id, { x: x + w / 2, y, z: 0, sx: Math.max(0.05, w - 0.06), sy: 0.6, sz: 0.4, color: l === 0 ? "line" : used ? "c4" : "c1", opacity: l === 0 ? 0.3 : 0.92,
          label: `${o.id} · ${l}${used && l ? ` of ${o.q}` : ""}`, labelSize: 0.15, labelUp: 0,
          info: { title: `Sell order ${o.id}`, html: `<p>${o.q} shares at ${o.px.toFixed(2)}, arrived ${["first", "second", "third", "fourth", "fifth"][ASKS.indexOf(o)]}. ${l} left.</p>` } });
        x += w;
      });
    });
    W.label("hd", "sell orders, by price · queue order left to right", [-1.1, 2.15, 0.2], { color: "muted", size: 0.16 });
    const got = WANT - need;
    W.box("buy", { x: 2.5, y: -0.9 + (got / WANT) * 0.9, z: 0, sx: 1.0, sy: 0.08 + (got / WANT) * 1.8, sz: 0.4, color: "c3", opacity: 0.92, label: `${got} / ${WANT}`, labelSize: 0.18, labelUp: 0.3,
      info: { title: "The buy order", html: `<p>Wants ${WANT} shares at up to 101.00.</p>` } });
    W.label("bl", `paid ${cost.toFixed(2)}`, [2.4, -1.4, 0.2], { color: "ink", size: 0.18 });
  }
  function show() { api.status(`${mode === "fifo" ? "first come, any price" : "price-time priority"} · ${WANT - need} of ${WANT} bought · ${cost.toFixed(2)} paid\n${line}`); }
  function reset() { left = Object.fromEntries(ASKS.map((o) => [o.id, o.q])); fills = []; need = WANT; cost = 0; line = ""; gen = mode === "fifo" ? fifo() : priority(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cost;
    if (mode === "fifo") api.explain(`Paid ${cost.toFixed(2)}`, `<p>The buyer got the oldest orders, not the cheapest. On a real exchange that would be illegal: orders must fill at the best available price.</p><p>Switch to <b>price-time priority</b> and run it.</p>`);
    else if (ran.fifo !== undefined && !reached) { reached = true; api.explain("Best price, then oldest", `<p>${cost.toFixed(2)} against ${ran.fifo.toFixed(2)}: ${(ran.fifo - cost).toFixed(2)} saved on one order. Within a price, arriving first is rewarded, which is why traders race for microseconds.</p>`); api.done("You matched an order"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1000); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "first come, any price", value: "fifo" }, { label: "price-time priority", value: "prio" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.3, 0.3, 0], dist: 10, theta: 0, phi: 1.5, instant: true });
  api.hud("rows = price levels of sell orders, cheapest at the bottom · box width = shares · amber = partly filled · green bar = shares the buyer has");
  reset();
  api.explain("How to read this", `<p>A buyer wants ${WANT} shares at up to 101.00. <b>Run all</b> with <b>first come, any price</b>, then with <b>price-time priority</b>.</p>`);
});
