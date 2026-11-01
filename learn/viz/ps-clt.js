/* Probability & Stats, chapter 6: the central limit theorem.
   Left: a weird source distribution as voxel bars. Right: the histogram of sample MEANS (n draws each),
   with the normal curve the CLT predicts as amber ghosts. Make n bigger and any source turns into a bell.
   The "why": averaging lets the lumps of many independent draws cancel; only the mean and spread survive. */
VIZ.register("ps-clt", async (api) => {
  const W = await api.world3d();
  const SRC = {
    die: { label: "die", vals: [1, 2, 3, 4, 5, 6], w: [1, 1, 1, 1, 1, 1] },
    skew: { label: "skewed (waiting times)", vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], w: [30, 21, 15, 10, 7, 5, 4, 3, 2, 1, 1, 1] },
    twin: { label: "two humps", vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], w: [9, 14, 8, 1, 0, 0, 1, 8, 14, 9] },
    jackpot: { label: "jackpot", vals: [0, 10], w: [19, 1] },
  };
  let key = "skew", n = 1, means = [];
  const BINS = 31;
  const S = () => SRC[key];
  const P = () => { const t = S().w.reduce((a, b) => a + b, 0); return S().w.map((x) => x / t); };
  const mu = () => S().vals.reduce((a, v, i) => a + v * P()[i], 0);
  const sd = () => Math.sqrt(S().vals.reduce((a, v, i) => a + (v - mu()) ** 2 * P()[i], 0));
  const lo = () => Math.min(...S().vals), hi = () => Math.max(...S().vals);
  function draw1() { const r = Math.random(), p = P(); let c = 0; for (let i = 0; i < p.length; i++) { c += p[i]; if (r < c) return S().vals[i]; } return S().vals[p.length - 1]; }
  const binOf = (m) => Math.min(BINS - 1, Math.max(0, Math.floor(((m - lo()) / (hi() - lo() || 1)) * BINS)));
  const binMid = (b) => lo() + ((b + 0.5) / BINS) * (hi() - lo());
  const BX = (b) => 0.6 + b * 0.27;      // the means histogram sits on the right

  function drawSource() {
    for (let i = 0; i < 16; i++) if (W.has("s" + i)) W.remove("s" + i);
    const p = P(), top = Math.max(...p);
    S().vals.forEach((v, i) => {
      const h = Math.max(0.03, (p[i] / top) * 4);
      W.box("s" + i, { x: -8 + i * (7 / S().vals.length), y: h / 2, z: 0, sx: 0.45, sy: h, sz: 0.55, color: "c1", instant: true, label: String(v), labelSize: 0.26, labelUp: 0.2,
        info: { title: `Source: value ${v}, probability ${p[i].toFixed(3)}`, html: `<p>This is <b>one</b> draw's distribution. It's ${key === "die" ? "flat" : key === "skew" ? "lopsided: lots of small values, a long tail of big ones" : key === "twin" ? "two humps with a gap in the middle" : "almost always 0, rarely 10"}. Nothing bell-shaped about it.</p><p>Mean μ = ${mu().toFixed(2)}, standard deviation σ = ${sd().toFixed(2)}.</p>` } });
    });
    W.label("srcl", `ONE draw (${S().label})`, [-4.6, 5, 0], { color: "c1", size: 0.34 });
  }
  function drawMeans() {
    const counts = new Array(BINS).fill(0);
    for (const m of means) counts[binOf(m)]++;
    const width = (hi() - lo()) / BINS;
    const ghost = (b) => { // normal density with the CLT's mean and spread, times bin width and count
      const s = sd() / Math.sqrt(n), x = binMid(b);
      return (means.length * width * Math.exp(-0.5 * ((x - mu()) / s) ** 2)) / (s * Math.sqrt(2 * Math.PI));
    };
    const top = Math.max(1, ...counts, ...(means.length >= 50 && n > 1 ? counts.map((_, b) => ghost(b)) : [0]));
    const u = 5 / top;
    for (let b = 0; b < BINS; b++) {
      const h = counts[b] * u;
      if (counts[b]) W.box("m" + b, { x: BX(b), y: h / 2, z: 0, sx: 0.24, sy: h, sz: 0.5, color: "c2",
        info: { title: `${counts[b]} sample means near ${binMid(b).toFixed(2)}`, html: `<p>Each of these came from averaging <b>${n}</b> draws. Averages near the middle can be built in many ways (high draws cancelling low ones); averages at the extremes need almost every draw to be extreme.</p>` } });
      else if (W.has("m" + b)) W.remove("m" + b);
      const gh = ghost(b) * u;
      if (means.length >= 50 && n > 1 && gh > 0.03) W.box("g" + b, { x: BX(b), y: gh / 2, z: -0.4, sx: 0.26, sy: gh, sz: 0.1, color: "c4", opacity: 0.4, instant: true,
        info: { title: "The CLT's prediction", html: `<p>A normal curve with mean μ = ${mu().toFixed(2)} and spread σ/√n = ${(sd() / Math.sqrt(n)).toFixed(3)}. The theorem says the means' histogram approaches this shape <b>whatever the source looks like</b>, as n grows.</p>` } });
      else if (W.has("g" + b)) W.remove("g" + b);
    }
    W.label("ml", `MEANS of ${n} draws (${means.length} samples)`, [BX(BINS / 2), 5.6, 0], { color: "c2", size: 0.34 });
  }
  function skewness(xs) {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const s2 = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    return xs.reduce((a, b) => a + (b - m) ** 3, 0) / xs.length / (s2 ** 1.5 || 1);
  }
  function sample(k) {
    for (let j = 0; j < k; j++) { let t = 0; for (let i = 0; i < n; i++) t += draw1(); means.push(t / n); }
    drawMeans();
    const m = means.reduce((a, b) => a + b, 0) / means.length;
    const s = Math.sqrt(means.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, means.length - 1));
    const sk = skewness(means);
    api.status(`samples: ${means.length}   n = ${n}\nmean of the means: ${m.toFixed(3)}   (μ = ${mu().toFixed(3)})\nspread of the means: ${s.toFixed(3)}   (σ/√n = ${(sd() / Math.sqrt(n)).toFixed(3)})\nlopsidedness (skewness): ${sk.toFixed(2)}   (a bell has 0)`);
    if ((key === "skew" || key === "jackpot") && n >= 20 && means.length >= 1000 && Math.abs(sk) < 0.45) {
      api.explain("A bell from a lopsided source", `<p>Each single draw is ${key === "skew" ? "heavily lopsided" : "almost always 0"}, yet the averages of ${n} draws form a near-symmetric bell (skewness ${sk.toFixed(2)}).</p><p>That's the <b>central limit theorem</b>: sums and averages of many independent draws are approximately normal, with mean μ and spread σ/√n. It's why the bell curve shows up everywhere: heights, measurement errors, poll results are all sums of many small effects.</p>`);
      api.done("You built a bell curve out of a lopsided distribution");
    }
  }
  function reset() { means = []; W.clear(); drawSource(); drawMeans(); api.hud(`source: <b>${S().label}</b> · n = ${n}`); }
  api.seg(Object.entries(SRC).map(([k, v]) => ({ label: v.label, value: k })), key, (v) => { key = v; reset(); });
  api.slider("Draws per sample n", { min: 1, max: 60, value: n }, (v) => { n = v; reset(); });
  api.button("+100 samples", () => sample(100), { primary: true });
  api.button("+1,000", () => sample(1000));
  api.button("Clear", reset);
  W.camera({ target: [0.2, 2.6, 0], dist: 25, theta: 0.06, phi: 1.36, instant: true });
  api.explain("How to read this", "<p><b>Left (red):</b> the distribution of a single draw. <b>Right (blue):</b> take <b>n</b> draws, average them, and drop that average into this histogram. Repeat.</p><p>With n = 1 the right side just copies the left. Raise n and watch it turn into a bell (amber ghosts are the normal curve the theorem predicts). Click anything to ask why.</p>");
  reset();
  sample(300);
});
