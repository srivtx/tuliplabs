/* Build your own X, chapter 40: an auction engine.
   Six bidders want one painting. Each knows what it's worth to them (their "value"). Bids are
   sealed: nobody sees anyone else's.
   The "why": in a first-price auction the winner pays their own bid, so everyone bids less than
   their value and guesses how much less. The guesses differ, and the painting can go to someone
   who wanted it less. In a second-price (Vickrey) auction the winner pays the second-highest bid,
   so bidding your true value is always your best move: no guessing, and the painting goes to the
   person who values it most. */
VIZ.register("bx-auction", async (api) => {
  const W = await api.world3d();
  const VAL = [62, 90, 75, 48, 84, 70], SHADE = [0.9, 0.7, 0.95, 0.9, 0.8, 0.85];
  let mode = "first", gen = null, shown = 0, winner = -1, price = 0, running = false, ran = {}, reached = false, line = "";
  const bidOf = (i) => (mode === "first" ? Math.round(VAL[i] * SHADE[i]) : VAL[i]);
  function* run() {
    for (shown = 1; shown <= VAL.length; shown++) {
      const i = shown - 1, b = bidOf(i);
      yield mode === "first"
        ? `bidder ${i + 1} values it at ${VAL[i]} and bids ${b}: paying your own bid means bidding less, and they guess ${Math.round((1 - SHADE[i]) * 100)}% less`
        : `bidder ${i + 1} values it at ${VAL[i]} and bids ${b}: with second price, the truth is the best bid`;
    }
    const order = VAL.map((_, i) => i).sort((a, b) => bidOf(b) - bidOf(a) || a - b);
    winner = order[0];
    price = mode === "first" ? bidOf(winner) : bidOf(order[1]);
    yield `bidder ${winner + 1} wins with ${bidOf(winner)} and pays ${price}${mode === "first" ? " (their own bid)" : " (the second-highest bid)"}. They valued it at ${VAL[winner]}; the highest value was ${Math.max(...VAL)}`;
  }
  function draw() {
    VAL.forEach((v, i) => {
      const x = -3.0 + i * 1.0, on = i < shown, b = bidOf(i);
      W.box("v" + i, { x, y: -1.6 + v * 0.016, z: -0.2, sx: 0.7, sy: v * 0.032, sz: 0.1, color: "c5", opacity: 0.25,
        info: { title: `Bidder ${i + 1}`, html: `<p>Worth ${v} to them.</p>` } });
      W.box("b" + i, { x, y: -1.6 + b * 0.016, z: 0, sx: 0.5, sy: b * 0.032, sz: 0.3, visible: on, color: i === winner ? "c3" : "c2", opacity: 0.92,
        info: { title: `Bidder ${i + 1}'s bid`, html: `<p>Bid ${b}, value ${v}.</p>` } });
      W.label("bl" + i, on ? String(b) : "", [x, -1.45 + b * 0.032, 0.25], { color: i === winner ? "c3" : "ink", size: 0.14 });
      W.label("vl" + i, `value ${v}`, [x, -1.85, 0.2], { color: "muted", size: 0.12 });
      W.label("nl" + i, `#${i + 1}`, [x, -2.1, 0.2], { color: "ink", size: 0.14 });
    });
    W.box("price", { x: 0, y: -1.6 + price * 0.032, z: 0.2, sx: 6.4, sy: 0.03, sz: 0.03, color: "c4", opacity: winner >= 0 ? 0.9 : 0 });
    W.label("pl", winner >= 0 ? `price paid ${price}` : "", [2.6, -1.45 + price * 0.032, 0.25], { color: "c4", size: 0.14 });
  }
  function show() { api.status(`${mode === "first" ? "first price: pay your own bid" : "second price: pay the runner-up's bid"}\n${line}`); }
  function reset() { shown = 0; winner = -1; price = 0; line = ""; gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = { w: winner, p: price };
    if (mode === "first") api.explain(`The painting went to bidder ${winner + 1}`, `<p>Bidder 2 valued it most (90) but guessed low and bid 63. Everyone was guessing what the others would do, and the guesses decided the winner.</p><p>Switch to <b>second price</b> and run it.</p>`);
    else if (ran.first && !reached) { reached = true; api.explain("No guessing needed", `<p>Paying the runner-up's bid means your bid only decides <i>whether</i> you win, never what you pay, so bidding your true value is always safe. The painting went to the bidder who valued it most, for ${price}.</p><p>eBay's proxy bidding and Google's ad auctions are built on this idea.</p>`); api.done("You ran a truthful auction"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1000); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "first price", value: "first" }, { label: "second price", value: "second" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.3, 0.0, 0], dist: 10.2, theta: 0, phi: 1.5, instant: true });
  api.hud("faint bar = what the painting is worth to that bidder · solid bar = their sealed bid · green = winner · amber line = price paid");
  reset();
  api.explain("How to read this", `<p>Six sealed bids for one painting. <b>Run all</b> with <b>first price</b>, then with <b>second price</b>.</p>`);
});
