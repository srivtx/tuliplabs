/* Probability & Stats, chapter 5: the law of large numbers.
   Several independent streams of rolls, each drawn as its running average (a ribbon of voxels,
   x = number of rolls on a log scale). They all funnel toward the expected value, and the funnel
   narrows like 1/sqrt(n). A balance beam shows the expected value as the distribution's balance point. */
VIZ.register("ps-lln", async (api) => {
  const W = await api.world3d();
  const SOURCES = {
    coin: { label: "coin (1 = heads)", vals: [0, 1], probs: [0.5, 0.5] },
    die: { label: "fair die", vals: [1, 2, 3, 4, 5, 6], probs: [1, 1, 1, 1, 1, 1].map((x) => x / 6) },
    ticket: { label: "raffle ticket", vals: [0, 20], probs: [0.9, 0.1] },
  };
  const CHECK = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000];
  const XS = (n) => Math.log10(n) * 3.2 - 5.5;
  let src = "die", K = 8, streams, n;
  const S = () => SOURCES[src];
  const mean = () => S().vals.reduce((a, v, i) => a + v * S().probs[i], 0);
  const sd = () => Math.sqrt(S().vals.reduce((a, v, i) => a + (v - mean()) ** 2 * S().probs[i], 0));
  const lo = () => Math.min(...S().vals), hi = () => Math.max(...S().vals);
  const Y = (v) => 3 + ((v - mean()) / sd()) * 1.6;   // height in standard deviations around the mean, so the funnel shows

  function draw1(v) { const r = Math.random(); let c = 0; for (let i = 0; i < S().vals.length; i++) { c += S().probs[i]; if (r < c) return S().vals[i]; } return S().vals[S().vals.length - 1]; }
  function reset() {
    W.clear();
    streams = Array.from({ length: K }, () => ({ sum: 0, at: {} }));
    n = 0;
    const m = mean();
    W.box("ev", { x: XS(70), y: Y(m), z: (K - 1) * 0.35, sx: XS(5000) - XS(1) + 1.5, sy: 0.04, sz: K * 0.7 + 0.6, color: "c3", opacity: 0.35, instant: true,
      info: { title: `Expected value: ${m.toFixed(3)}`, html: `<p>The long-run average: each value weighted by its probability, Σ x·P(x) = <b>${m.toFixed(3)}</b>.</p><p>It's often not a value you can actually roll (no die shows 3.5). It's where the average <i>settles</i>, not where any single roll lands.</p>` } });
    W.label("evl", `expected value ${m.toFixed(2)}`, [XS(1500), Y(m) + 0.5, -0.6], { color: "c3", size: 0.34 });
    for (const c of [1, 10, 100, 1000]) W.label("ax" + c, `n=${c}`, [XS(c), -0.8, 0], { color: "muted", size: 0.3 });
    // the balance beam: the distribution's probabilities as weights on a ruler
    S().vals.forEach((v, i) => {
      W.box("w" + i, { x: -8.5, y: Y(v), z: 0, sx: 0.3 + S().probs[i] * 4, sy: 0.35, sz: 0.35, color: "c4", instant: true, label: `${v}: ${(S().probs[i] * 100).toFixed(0)}%`, labelSize: 0.26,
        info: { title: `Value ${v}, probability ${S().probs[i].toFixed(3)}`, html: "<p>Think of each probability as a weight hung at its value. The expected value is the point where the ruler balances.</p>" } });
    });
    W.box("pivot", { x: -8.5, y: Y(m), z: 0.6, s: 0.3, color: "c3", instant: true, info: { title: "The balance point", html: `<p>Weights × positions balance at <b>${m.toFixed(3)}</b>: that's the expected value. A rare big value (like the raffle's 20) drags the balance point a long way.</p>` } });
    W.camera({ target: [-1.5, 3, K * 0.3], dist: 21, theta: 0.16, phi: 1.36, instant: true });
    roll(1);
  }
  function roll(more) {
    const target = Math.min(5000, n + more);
    for (const s of streams) {
      for (let j = n; j < target; j++) { s.sum += draw1(); if (CHECK.includes(j + 1)) s.at[j + 1] = s.sum / (j + 1); }
    }
    n = target;
    streams.forEach((s, k) => {
      let prev = null;
      for (const c of CHECK) {
        if (!(c in s.at)) continue;
        const key = `s${k}_${c}`;
        W.box(key, { x: XS(c), y: Y(s.at[c]), z: k * 0.7, s: 0.28, color: k % 2 ? "c2" : "c1", fromY: Y(mean()),
          info: { title: `Stream ${k + 1} after ${c} rolls: average ${s.at[c].toFixed(3)}`, html: `<p>This stream's running average after <b>${c}</b> rolls. Early on, one lucky roll moves it a lot. After ${c} rolls, one new roll can only move it by about 1/${c + 1} of its size.</p>` } });
        if (prev) W.line(`l${k}_${c}`, prev, key, { color: k % 2 ? "c2" : "c1", opacity: 0.5 });
        prev = key;
      }
    });
    report();
  }
  function spreadAt(c) {
    const xs = streams.map((s) => s.at[c]).filter((x) => x != null);
    if (xs.length < 2) return null;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  }
  function report() {
    const lines = [`${K} streams × ${n} rolls each   (expected value ${mean().toFixed(3)}, sd of one roll ${sd().toFixed(3)})`];
    for (const c of [10, 100, 1000]) {
      const sp = spreadAt(c);
      if (sp != null) lines.push(`spread of averages at n=${String(c).padEnd(4)}: ${sp.toFixed(3)}   theory sd/√n = ${(sd() / Math.sqrt(c)).toFixed(3)}`);
    }
    api.status(lines.join("\n"));
    api.hud(`<b>${S().label}</b> · n = ${n}`);
    const a = spreadAt(10), b = spreadAt(1000);
    if (a && b && n >= 1000 && K >= 8) {
      const ratio = a / b;
      api.explain("The funnel narrows like 1/√n", `<p>From 10 rolls to 1,000 rolls is <b>100×</b> more data, but the spread only fell <b>${ratio.toFixed(1)}×</b> (theory: √100 = 10).</p><p>That's the law of large numbers with its speed limit: averages <i>do</i> settle on the expected value, but to halve the wobble you need <b>four times</b> the data.</p>`);
      if (ratio > 4 && ratio < 40) api.done("You watched the spread shrink like 1/√n");
    }
  }
  api.seg(Object.entries(SOURCES).map(([k, v]) => ({ label: v.label, value: k })), src, (v) => { src = v; reset(); });
  api.slider("Independent streams", { min: 2, max: 16, value: K }, (v) => { K = v; reset(); });
  api.button("+10 rolls", () => roll(10), { primary: true });
  api.button("+100", () => roll(100));
  api.button("→ 1,000", () => roll(1000 - n));
  api.button("→ 5,000", () => roll(5000 - n));
  api.button("Restart", reset);
  api.explain("How to read this", "<p>Each coloured ribbon is one person rolling over and over and tracking their <b>running average</b>. The x-axis is the number of rolls on a log scale (1, 10, 100, 1000). The green sheet is the <b>expected value</b>.</p><p>On the left, the amber blocks are the distribution as weights on a ruler; the green pivot is where it balances. Click anything to ask why.</p>");
  reset();
});
