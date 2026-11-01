/* Probability & Stats, chapter 8: confidence intervals.
   100 samples -> 100 intervals, stacked as voxel bars against a "truth" plane.
   The "why": the 95% is about the METHOD (how often the net catches the truth), and using
   z = 1.96 with a small sample's s instead of t misses far more often than it promises. */
VIZ.register("ps-ci", async (api) => {
  const W = await api.world3d();
  W.camera({ target: [0, 4.6, 3.75], dist: 24, theta: 0.32, phi: 1.32, instant: true });

  // ---- maths helpers (same ideas the chapter writes in Python)
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  function zq(p) { // inverse normal CDF (Acklam)
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const q = Math.min(p, 1 - p);
    let x;
    if (q < 0.02425) { const t = Math.sqrt(-2 * Math.log(q)); x = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
    else { const t = q - 0.5, r = t * t; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); x = -x; }
    return p < 0.5 ? -x : x;
  }
  function lgamma(z) { const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; z -= 1; let x = 0.99999999999980993; for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1); const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
  function tq(p, nu) { // inverse t CDF by bisection on a Simpson-integrated pdf
    const k = Math.exp(lgamma((nu + 1) / 2) - lgamma(nu / 2)) / Math.sqrt(nu * Math.PI);
    const pdf = (t) => k * Math.pow(1 + t * t / nu, -(nu + 1) / 2);
    const cdf = (t) => { const m = 200, hh = t / m; let s = pdf(0) + pdf(t); for (let i = 1; i < m; i++) s += pdf(i * hh) * (i % 2 ? 4 : 2); return 0.5 + s * hh / 3; };
    let lo = 0, hi = 60;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (cdf(mid) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---- the world: true mean delivery time 32 min, sd 8 (the learner never "knows" this in real life)
  const MU = 32, SD = 8, K = 100, ROWS = 25, LAYERS = 4, XS = 0.45, DY = 0.4, DZ = 2.5;
  const X = (v) => (v - MU) * XS;
  let seed = 7, intervals = [], method = "t", tried = new Set(), triedN = new Set(), triedC = new Set(), boot = null, totalHit = 0, totalAll = 0;
  const conf = api.slider("Confidence level", { min: 50, max: 99, step: 1, value: 95, format: (v) => v + "%" }, () => draw());
  const nS = api.slider("Sample size n (deliveries per sample)", { min: 3, max: 100, step: 1, value: 10 }, () => draw());
  api.seg([{ label: "t-interval", value: "t" }, { label: "z = 1.96 with s (naive)", value: "z" }, { label: "bootstrap", value: "boot" }], "t", (v) => { method = v; draw(); });
  api.button("New 100 samples", () => { seed++; draw(); }, { primary: true });
  api.button("Show resamples of #1", () => showResamples());

  // truth plane: everything that sits on x = 0 is "the real average"
  const H = ROWS * DY, D = (LAYERS - 1) * DZ;
  W.box("truth", { x: 0, y: H / 2, z: D / 2, sx: 0.06, sy: H + 0.6, sz: D + 1.2, color: "c4", opacity: 0.45, label: "truth: 32 min", instant: true,
    info: { title: "The truth plane", html: "<p>The real average delivery time, 32 minutes. In real life you <b>never see this</b>: you only see your one sample.</p><p>An interval \"catches\" the truth when its bar crosses this plane. The confidence level is the long-run fraction of bars that cross it.</p>" } });
  W.box("floor", { x: 0, y: -0.15, z: D / 2, sx: 26, sy: 0.1, sz: D + 1.6, color: "line", opacity: 0.5, instant: true });
  for (let m = 20; m <= 44; m += 4) W.label("ax" + m, m + (m === 44 ? " min" : ""), [X(m), -0.5, D + 1], { color: "muted", size: 0.4 });

  function sample(r, n) { const s = []; for (let i = 0; i < n; i++) s.push(MU + SD * gauss(r)); return s; }
  const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
  const sdev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / (a.length - 1)); };
  function bootCI(s, c, r, B = 300) {
    const means = [];
    for (let b = 0; b < B; b++) { let t = 0; for (let i = 0; i < s.length; i++) t += s[(r() * s.length) | 0]; means.push(t / s.length); }
    means.sort((a, b) => a - b);
    return [means[Math.floor(((1 - c) / 2) * B)], means[Math.min(B - 1, Math.floor(((1 + c) / 2) * B))], means];
  }

  function draw() {
    const c = conf.get() / 100, n = nS.get(), r = rng(seed * 7919 + n * 31);
    const crit = method === "z" ? 1.96 : tq((1 + c) / 2, n - 1);
    intervals = [];
    for (let i = 0; i < K; i++) {
      const s = sample(r, n), m = mean(s), se = sdev(s) / Math.sqrt(n);
      let lo, hi;
      if (method === "boot") [lo, hi] = bootCI(s, c, r);
      else [lo, hi] = [m - crit * se, m + crit * se];
      intervals.push({ s, m, lo, hi, se, hit: lo <= MU && MU <= hi });
    }
    const hits = intervals.filter((v) => v.hit).length, avgW = mean(intervals.map((v) => v.hi - v.lo));
    totalHit += hits; totalAll += K;
    intervals.forEach((v, i) => {
      const row = i % ROWS, layer = Math.floor(i / ROWS);
      const w = Math.max(0.05, (v.hi - v.lo) * XS);
      W.box("iv" + i, { x: X((v.lo + v.hi) / 2), y: row * DY + 0.2, z: layer * DZ, sx: w, sy: 0.26, sz: 0.35, color: v.hit ? "c2" : "bad", glow: v.hit ? 0 : 0.55,
        info: { title: `Interval #${i + 1}: ${v.lo.toFixed(1)} to ${v.hi.toFixed(1)} min`, html: `<p>Sample of ${n} deliveries, average <b>${v.m.toFixed(1)}</b> min, standard error ${v.se.toFixed(2)}.</p><p>${v.hit ? "This net <b>caught</b> the truth (32 min)." : "This net <b>missed</b> the truth. Nothing went wrong: the sample just happened to be unusual. A " + conf.get() + "% method is <i>supposed</i> to miss about " + (100 - conf.get()) + " in 100."}</p><p>Why not just report ${v.m.toFixed(1)}? Because a single number hides how much it could wobble. The bar's width <i>is</i> that wobble.</p>` } });
      W.box("ct" + i, { x: X(v.m), y: row * DY + 0.2, z: layer * DZ, s: 0.14, sy: 0.34, color: "ink" });
    });
    tried.add(c + "|" + n); triedN.add(n); triedC.add(c);
    const promised = method === "z" ? "(z says 95%)" : `(promised ${conf.get()}%)`;
    api.status(`${method === "boot" ? "bootstrap" : method === "z" ? "z=1.96 with s" : "t = " + crit.toFixed(2)}   n = ${n}   level ${conf.get()}%\ncaught the truth: ${hits}/100 ${promised}\nmissed (red): ${100 - hits}\naverage width: ${avgW.toFixed(1)} min\nall draws so far: ${(100 * totalHit / totalAll).toFixed(1)}% caught` + (method === "boot" && n < 15 ? "\n(bootstrap under-covers at small n)" : "") + (method === "z" && n < 15 ? "\n(1.96 trusts s too much at small n)" : ""));
    api.hud(`${100 - hits} misses · width ${avgW.toFixed(1)} min`);
    if (boot) clearBoot();
    if (!api.wasDone && triedN.size >= 2 && triedC.size >= 2 && tried.size >= 3) api.done("You saw it: more confidence = wider nets; more data = narrower nets");
  }
  function clearBoot() { for (let i = 0; i < 40; i++) W.remove("bs" + i); W.label("bsl", null); boot = null; W.camera({ target: [0, 4.6, 3.75], dist: 24 }); }
  async function showResamples() {
    const v = intervals[0], r = rng(seed + 99);
    clearBoot();
    const [, , means] = bootCI(v.s, conf.get() / 100, r, 400);
    // histogram of 400 resample means, drawn as a little voxel skyline above the stack
    const bins = new Array(40).fill(0), lo = MU - 14, wd = 28 / 40;
    for (const m of means) { const k = Math.floor((m - lo) / wd); if (k >= 0 && k < 40) bins[k]++; }
    const top = Math.max(...bins);
    boot = true;
    W.camera({ target: [0, 6.2, 3.75], dist: 30 });
    W.label("bsl", "400 resample averages\nof sample #1", [X(MU + 13), H + 2.2, 0], { color: "c4", size: 0.4 });
    for (let k = 0; k < 40; k++) {
      const hgt = Math.max(0.02, (bins[k] / top) * 2.4), xm = lo + (k + 0.5) * wd;
      const inside = xm >= v.lo && xm <= v.hi;
      W.box("bs" + k, { x: X(xm), y: H + 0.6 + hgt / 2, z: 0, fromY: 0.2, sx: wd * XS * 0.92, sy: hgt, sz: 0.5, color: inside ? "c4" : "c5",
        info: { title: "Bootstrap resample averages", html: "<p>Each resample draws <b>n deliveries from sample #1 itself</b>, with replacement, and takes the average. Doing that 400 times shows how much the average wobbles, using only the data you have.</p><p>The middle of this skyline (yellow) is the bootstrap interval. No formula, no σ/√n needed, which is why it also works for medians and other statistics that have no simple formula.</p>" } });
      await api.sleep(12);
    }
    api.explain("Bootstrap: resample your own sample", `<p>Sample #1 had ${v.s.length} deliveries. The yellow middle of the skyline runs from about ${v.lo.toFixed(1)} to ${v.hi.toFixed(1)} min when the bootstrap method is selected.</p><p>Pick <b>bootstrap</b> above to build all 100 intervals this way and compare the miss rate with t.</p>`);
  }
  api.explain("How to read this", "<p>Each <b>bar</b> is one interval from one sample of deliveries. The yellow <b>plane</b> is the real average. Bars that cross it caught the truth; <b style='color:var(--bad)'>red</b> bars missed.</p><p>Move the sliders and press <b>New 100 samples</b>. Then try the naive z with n = 5: it promises 95% but misses far more.</p>");
  draw();
});
