/* Probability & Stats, chapter 9: a permutation test, then p-hacking.
   Two groups of voxel columns (height = daily sign-ups). Shuffle the labels: if the design did
   nothing, the labels are arbitrary, so shuffled differences show what "pure luck" looks like.
   The "why": a p-value is just "how often does luck alone look this extreme?", and running many
   tests on noise guarantees some will look extreme. */
VIZ.register("ps-permute", async (api) => {
  const W = await api.world3d();
  const home = () => W.camera({ target: [0, 2.6, -2.5], dist: 23, theta: 0.42, phi: 1.12 });
  W.camera({ target: [0, 2.6, -2.5], dist: 23, theta: 0.42, phi: 1.12, instant: true });

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const r = rng(2024);
  function shuffle(a, rr) { for (let i = a.length - 1; i > 0; i--) { const j = (rr() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;

  // ---- the experiment: 8 days on the old design, 8 days on the new one (daily sign-ups)
  const OLD = [31, 28, 35, 30, 27, 33, 29, 32], NEW = [34, 30, 38, 33, 29, 36, 31, 37];
  const VALUES = OLD.concat(NEW), N = 8, HS = 0.1;  // height scale: 10 sign-ups = 1 voxel
  const OBS = mean(NEW) - mean(OLD);
  let labels = VALUES.map((_, i) => (i < N ? 0 : 1)); // 0 = old (control), 1 = new (treatment)
  let diffs = [], mode = "one", alpha = "plain", phackRuns = 0, phackAny = 0, didPhack = false;
  const BIN0 = -8, BW = 0.5, NB = 32, HX = 0.5, HZ = -6;
  const binX = (k) => (BIN0 + (k + 0.5) * BW) * HX * 2;

  const modeSeg = api.seg([{ label: "One experiment", value: "one" }, { label: "p-hacking: 20 tests on noise", value: "hack" }], "one", (v) => { mode = v; build(); });
  const rowA = api.row();
  const bShuf = api.button("Shuffle labels", () => shuffleOnce(true), { primary: true, row: rowA });
  const b100 = api.button("×100", () => many(100), { row: rowA });
  const b1k = api.button("×1000", () => many(1000), { row: rowA });
  const bReal = api.button("Real labels", () => { labels = VALUES.map((_, i) => (i < N ? 0 : 1)); place(); api.status(summary()); }, { row: rowA });
  const rowB = api.row();
  const bRun20 = api.button("Run 20 tests on noise", () => phack(1, true), { primary: true, row: rowB });
  const bRep = api.button("Repeat 100 times", () => phack(100, false), { row: rowB });
  const aSeg = api.seg([{ label: "α = 0.05 each", value: "plain" }, { label: "Bonferroni: 0.05 / 20", value: "bonf" }], "plain", (v) => { alpha = v; if (mode === "hack") phack(1, true); });

  function controls() {
    rowA.style.display = mode === "one" ? "" : "none";
    rowB.style.display = aSeg.el.style.display = mode === "hack" ? "" : "none";
  }

  // ---- one experiment
  function slotX(group, slot) { return (group === 0 ? -8.1 : 1.35) + slot * 0.75; }
  function place() {
    const slots = [0, 0];
    VALUES.forEach((v, i) => {
      const g = labels[i], sy = v * HS;
      W.box("v" + i, { x: slotX(g, slots[g]++), y: sy / 2, z: 0, sx: 0.6, sy, sz: 0.6, color: g ? "c1" : "c2",
        info: { title: `A day with ${v} sign-ups (${g ? "labelled NEW" : "labelled OLD"})`, html: `<p>Each column is one day. Its height is the number of sign-ups that day.</p><p>Right now it carries the label <b>${g ? "new design" : "old design"}</b>. When you shuffle, the <b>heights stay</b> and only the labels move. That's the whole trick: if the design really did nothing, any day could just as well have had either label.</p>` } });
    });
    const mO = mean(VALUES.filter((_, i) => !labels[i])), mN = mean(VALUES.filter((_, i) => labels[i]));
    W.box("mO", { x: slotX(0, 4.5), y: mO * HS, z: 0, sx: 7.6, sy: 0.06, sz: 1.1, color: "c2", opacity: 0.5, info: { title: "Average of the OLD group", html: "<p>The test statistic is the gap between the two averages. Why the averages? Because that's what the business question is about: does the new page bring <i>more</i> sign-ups per day?</p>" } });
    W.box("mN", { x: slotX(1, 4.5), y: mN * HS, z: 0, sx: 7.6, sy: 0.06, sz: 1.1, color: "c1", opacity: 0.5, info: { title: "Average of the NEW group", html: "<p>Compare this plate with the blue one. The height difference between them is the number that goes into the histogram on every shuffle.</p>" } });
    return mN - mO;
  }
  function drawHist() {
    const counts = new Array(NB).fill(0);
    for (const d of diffs) { const k = Math.floor((d - BIN0) / BW); if (k >= 0 && k < NB) counts[k]++; }
    const top = Math.max(1, ...counts);
    for (let k = 0; k < NB; k++) {
      const mid = BIN0 + (k + 0.5) * BW, ext = Math.abs(mid) >= OBS - 1e-9, hgt = Math.max(0.03, (counts[k] / top) * 4);
      W.box("h" + k, { x: binX(k), y: hgt / 2, z: HZ, sx: BW * HX * 2 * 0.9, sy: hgt, sz: 0.8, color: ext ? "c1" : "c5", visible: counts[k] > 0 || k === 0,
        info: { title: `Shuffled gap ≈ ${mid.toFixed(2)}: ${counts[k]} shuffles`, html: `<p>This histogram is the <b>null distribution</b>: the gaps you get when labels are random. It's what "no effect" looks like for <i>this</i> data.</p><p>${ext ? "Red bins are at least as extreme as the real gap (either direction). Their share of all shuffles is the p-value." : "Grey bins are gaps smaller than the real one: luck easily makes these."}</p>` } });
    }
  }
  function summary() {
    const ext = diffs.filter((d) => Math.abs(d) >= OBS - 1e-9).length;
    const p = diffs.length ? ext / diffs.length : NaN;
    api.hud(`real gap ${OBS.toFixed(1)} · ${diffs.length} shuffles${diffs.length ? " · p ≈ " + p.toFixed(3) : ""}`);
    return `real gap (new − old): ${OBS.toFixed(2)} sign-ups/day\nshuffles so far:      ${diffs.length}\nat least as extreme:  ${ext}\np-value ≈ ${diffs.length ? ext + "/" + diffs.length + " = " + p.toFixed(3) : "(shuffle first)"}` + (diffs.length < 1000 ? `\n\nWith ${diffs.length} shuffles the estimate is still rough.\nGet to 1000+.` : "\n\nNow try the p-hacking mode.");
  }
  async function shuffleOnce(animate) {
    labels = shuffle(labels.slice(), r);
    const d = animate ? place() : mean(VALUES.filter((_, i) => labels[i])) - mean(VALUES.filter((_, i) => !labels[i]));
    diffs.push(d);
    if (animate) {
      drawHist();
      const k = Math.floor((d - BIN0) / BW);
      if (k >= 0 && k < NB) W.flash("h" + k);
      api.status(`this shuffle's gap: ${d.toFixed(2)}\n` + summary());
    }
    check();
  }
  function many(k) { for (let i = 0; i < k; i++) shuffleOnce(false); place(); drawHist(); api.status(summary()); }
  function buildOne() {
    W.clear(); home();
    W.box("floorA", { x: 0, y: -0.06, z: 0, sx: 18, sy: 0.08, sz: 1.6, color: "line", opacity: 0.6, instant: true });
    W.box("floorH", { x: 0, y: -0.06, z: HZ, sx: 18, sy: 0.08, sz: 1.4, color: "line", opacity: 0.6, instant: true });
    W.label("lo", "OLD design (control)", [slotX(0, 4.5), 5.9, 0], { color: "c2", size: 0.42 });
    W.label("ln", "NEW design (treatment)", [slotX(1, 4.5), 5.9, 0], { color: "c1", size: 0.42 });
    W.label("lh", "gaps from shuffled labels", [0, 5.3, HZ], { color: "muted", size: 0.42 });
    for (const v of [-6, -3, 0, 3, 6]) W.label("hx" + v, String(v), [v * HX * 2, -0.5, HZ + 0.8], { color: "muted", size: 0.36 });
    for (const s of [1, -1]) W.box("obs" + s, { x: s * OBS * HX * 2, y: 2.4, z: HZ + 0.1, sx: 0.08, sy: 4.8, sz: 1.2, color: "c4", opacity: s > 0 ? 1 : 0.45, glow: 0.3, label: s > 0 ? "real gap " + OBS.toFixed(1) : "−" + OBS.toFixed(1),
      info: { title: "The gap we actually saw", html: `<p>The real experiment: new design days averaged <b>${OBS.toFixed(1)}</b> more sign-ups than old design days.</p><p>The question a test asks: <i>if the design did nothing</i>, how often would random labels give a gap this big (in either direction)? The faint pillar is −${OBS.toFixed(1)}: a big gap the other way would be just as surprising, so a two-sided test counts both tails.</p>` } });
    place(); drawHist();
    api.status(summary());
  }

  // ---- p-hacking: 20 experiments where nothing is going on
  function permP(a, b, rr, S = 400) {
    const all = a.concat(b), obs = Math.abs(mean(b) - mean(a));
    let ext = 0;
    for (let s = 0; s < S; s++) { shuffle(all, rr); if (Math.abs(mean(all.slice(a.length)) - mean(all.slice(0, a.length))) >= obs - 1e-9) ext++; }
    return (ext + 1) / (S + 1);
  }
  function batch() {
    const ps = [];
    for (let t = 0; t < 20; t++) {
      const a = [], b = [];
      for (let i = 0; i < N; i++) { a.push(40 + 4 * gauss(r)); b.push(40 + 4 * gauss(r)); } // SAME true average: no effect at all
      ps.push(permP(a, b, r));
    }
    return ps;
  }
  const thr = () => (alpha === "bonf" ? 0.05 / 20 : 0.05);
  const PH = (p) => Math.min(5, -Math.log10(p) * 1.6);
  function phack(times, show) {
    let ps;
    for (let k = 0; k < times; k++) { ps = batch(); phackRuns++; if (ps.some((p) => p < thr())) phackAny++; }
    const NAMES = ["button colour", "headline", "font", "photo", "price font", "logo size", "CTA text", "footer", "menu order", "hero video", "testimonials", "badge", "form length", "emoji", "dark mode", "spacing", "icon set", "trust seal", "banner", "tagline"];
    ps.forEach((p, t) => {
      const sig = p < thr(), x = (t % 5) * 2.6 - 5.2, z = Math.floor(t / 5) * 2.2 - 4.5, hgt = Math.max(0.1, PH(p));
      W.box("p" + t, { x, y: hgt / 2, z, sx: 1, sy: hgt, sz: 1, color: sig ? "bad" : "c5", glow: sig ? 0.5 : 0, label: `${NAMES[t]}\np=${p.toFixed(3)}`, labelSize: 0.3, labelColor: sig ? "bad" : "muted",
        info: { title: `Test of "${NAMES[t]}": p = ${p.toFixed(3)}`, html: `<p>Both groups came from <b>exactly the same</b> distribution: this change did nothing.</p><p>${sig ? "Yet the test calls it significant. That's a <b>false positive</b> (type I error). Run 20 tests at α = 0.05 and you expect about one of these, every time." : "Correctly not significant."}</p><p>Taller = smaller p-value. The glass sheet is the significance threshold.</p>` } });
    });
    W.box("thr", { x: 0, y: PH(thr()), z: -1.2, sx: 13, sy: 0.04, sz: 8.6, color: "c4", opacity: 0.35, info: { title: "The significance threshold", html: `<p>Columns poking through this sheet have p &lt; ${thr() === 0.05 ? "0.05" : "0.0025"}.</p><p>${alpha === "bonf" ? "<b>Bonferroni</b> divides α by the number of tests, so the chance of <i>any</i> false positive across all 20 stays near 5%." : "With 20 tests each at 0.05, the chance that <i>at least one</i> pokes through by luck is 1 − 0.95²⁰ ≈ 64%."}</p>` } });
    const nsig = ps.filter((p) => p < thr()).length;
    api.status(`threshold: p < ${thr() === 0.05 ? "0.05" : "0.0025 (Bonferroni)"}\nthis batch: ${nsig} of 20 "significant" (all are noise)\nbatches with ≥1 false positive: ${phackAny}/${phackRuns} = ${(100 * phackAny / phackRuns).toFixed(0)}%\n(theory: ${alpha === "bonf" ? "about 5%" : "1 − 0.95^20 ≈ 64%"})`);
    api.hud(`${nsig} fake discoveries this batch`);
    didPhack = true;
    check();
  }
  function buildHack() {
    W.clear();
    W.camera({ target: [0, 1.8, -1.2], dist: 20, theta: 0.3, phi: 1.05 });
    W.box("floorP", { x: 0, y: -0.06, z: -1.2, sx: 14, sy: 0.08, sz: 9, color: "line", opacity: 0.5, instant: true });
    phackRuns = 0; phackAny = 0;
    phack(1, true);
    api.explain("p-hacking: test enough things and something 'works'", "<p>20 page changes, <b>none</b> of which do anything. Each gets a fair permutation test at α = 0.05.</p><p>Press <b>Repeat 100 times</b>: most batches contain at least one 'discovery'. A team that tests 20 things and reports only the winner is publishing noise. Switch to <b>Bonferroni</b> to see the fix.</p>");
  }
  function check() {
    if (!api.wasDone && didPhack && diffs.length >= 1000) api.done("p-value estimated, and you've seen how 20 tests on noise produce fake wins");
  }
  function build() { controls(); phackRuns = 0; phackAny = 0; if (mode === "one") buildOne(); else buildHack(); }
  api.explain("How to read this", "<p><b>Front:</b> 20 days of sign-ups, blue = old design, red = new design. The plates are group averages.</p><p><b>Back:</b> each time you press <b>Shuffle labels</b>, the days get random labels and the new gap drops into the histogram. Red bins are as extreme as the real gap: their share is the <b>p-value</b>.</p>");
  build();
});
