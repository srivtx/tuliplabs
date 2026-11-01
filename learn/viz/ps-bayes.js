/* Probability & Stats, chapter 3: Bayes' rule with natural frequencies.
   1,000 people, each a voxel. Some are sick (red). Everyone takes a test; positives rise up.
   Among the risen, how many are really sick? That fraction is the posterior, and with a rare
   disease it's far below the test's "accuracy", because the healthy crowd is so much bigger. */
VIZ.register("ps-bayes", async (api) => {
  const W = await api.world3d();
  const N = 1000, COLS = 40, SP = 0.62;
  const PREV = [0.1, 0.5, 1, 2, 5, 10, 20, 30, 50];
  const SPEC = [50, 60, 70, 80, 90, 95, 98, 99, 99.5, 99.9];
  let prev = 10, sens = 90, spec = 90, layout = "scatter", retest = false, done = false;

  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const order = (() => { const r = rng(3), a = [...Array(N).keys()]; for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  const pct = (x) => (100 * x).toFixed(1) + "%";

  const GROUP = {
    TP: { color: "c1", title: "True positive", html: (c) => `<p>Sick, and the test caught it. There are <b>${c.TP}</b> of these.</p><p>How many depends on the <b>sensitivity</b> (${sens}%): the share of sick people who test positive.</p>` },
    FN: { color: "c1", title: "False negative", html: (c) => `<p>Sick, but the test missed it. <b>${c.FN}</b> people.</p><p>A more sensitive test leaves fewer of these. They stay on the ground, so they never appear in the positive group.</p>` },
    FP: { color: "c4", title: "False positive", html: (c) => `<p>Healthy, but the test said positive. <b>${c.FP}</b> people.</p><p>Only ${(100 - spec).toFixed(1)}% of healthy people get this (that's 100% − specificity). But it's ${(100 - spec).toFixed(1)}% of a <b>huge</b> group (${c.H} healthy people), so the count can beat the true positives. This is why rare diseases give so many false alarms.</p>` },
    TN: { color: "c5", title: "True negative", html: (c) => `<p>Healthy, and the test agreed. <b>${c.TN}</b> people.</p><p><b>Specificity</b> (${spec}%) is the share of healthy people who correctly test negative.</p>` },
  };

  function counts() {
    const S = Math.round(N * prev / 100), H = N - S;
    const TP = Math.round(S * sens / 100), FP = Math.round(H * (100 - spec) / 100);
    return { S, H, TP, FN: S - TP, FP, TN: H - FP, TP2: Math.round(TP * sens / 100), FP2: Math.round(FP * (100 - spec) / 100) };
  }

  function draw() {
    const c = counts();
    // rank r in the fixed shuffled order decides each person's group
    const groupOf = (r) => (r < c.S ? (r < c.TP ? "TP" : "FN") : (r - c.S < c.FP ? "FP" : "TN"));
    const second = (r, g) => (g === "TP" ? r < c.TP2 : g === "FP" ? r - c.S < c.FP2 : false);
    const seq = ["TP", "FP", "FN", "TN"];
    const sorted = [...Array(N).keys()].sort((a, b) => seq.indexOf(groupOf(a)) - seq.indexOf(groupOf(b)) || a - b);
    const slotOfRank = new Array(N);
    if (layout === "scatter") order.forEach((slot, r) => (slotOfRank[r] = slot));
    else sorted.forEach((r, slot) => (slotOfRank[r] = slot));
    for (let r = 0; r < N; r++) {
      const g = groupOf(r), slot = slotOfRank[r], G = GROUP[g];
      const pos = g === "TP" || g === "FP", twice = retest && pos && second(r, g);
      const x = (slot % COLS - (COLS - 1) / 2) * SP, z = (Math.floor(slot / COLS) - 12) * SP;
      W.box("q" + r, { x, y: twice ? 2.6 : pos ? 1.3 : 0, z, s: 0.5, sy: 0.7, color: G.color, opacity: retest && pos && !twice ? 0.3 : g === "FN" ? 0.45 : 1, glow: pos ? 0.25 : 0,
        info: { title: G.title + (twice ? " (positive twice)" : ""), html: G.html(c) + (twice ? "<p>Tested positive a <b>second</b> time. Two positives in a row are much stronger evidence: see the status box.</p>" : "") } });
    }
    const post = c.TP + c.FP ? c.TP / (c.TP + c.FP) : 0;
    const p = prev / 100, se = sens / 100, sp = spec / 100;
    const exact = (p * se) / (p * se + (1 - p) * (1 - sp));
    let s = `of 1,000 people: ${c.S} sick, ${c.H} healthy\n`;
    s += `test positive: ${c.TP} sick (true) + ${c.FP} healthy (false) = ${c.TP + c.FP}\n`;
    s += `P(sick | positive) = ${c.TP}/${c.TP + c.FP} = ${pct(post)}   (Bayes exact: ${pct(exact)})\n`;
    s += `naive guess "it's ${sens}% accurate" → ${sens}%   off by ${(sens - 100 * exact).toFixed(1)} points`;
    if (retest) {
      const e2 = (exact * se) / (exact * se + (1 - exact) * (1 - sp));
      s += `\n\nsecond test on the ${c.TP + c.FP} positives: ${c.TP2} sick + ${c.FP2} healthy positive again\nP(sick | 2 positives) = ${pct(e2)}`;
    }
    api.status(s);
    api.hud(`<b style="color:var(--c1)">■</b> sick  <b style="color:var(--c4)">■</b> healthy but tested positive  <b style="color:var(--c5)">■</b> healthy · raised = tested positive`);
    if (!done && sens >= 90 && spec >= 90 && exact < 0.2) {
      done = true;
      api.explain("A good test, a bad bet", `<p>Sensitivity ${sens}% and specificity ${spec}% sound great, yet a positive result means only <b>${pct(exact)}</b> chance of being sick.</p><p>The disease is rare (${prev}%), so the few percent of false alarms from ${c.H} healthy people outnumber the ${c.TP} real cases. The <b>base rate</b> matters as much as the test.</p>`);
      api.done("You found a 'good' test where a positive still means under 20%");
    }
  }

  const sp1 = api.slider("Prevalence (how many are sick)", { min: 0, max: PREV.length - 1, value: PREV.indexOf(prev), format: (i) => PREV[i] + "%" }, (i) => { prev = PREV[i]; retest = false; draw(); });
  api.slider("Sensitivity (sick → positive)", { min: 50, max: 100, value: sens, format: (v) => v + "%" }, (v) => { sens = v; retest = false; draw(); });
  api.slider("Specificity (healthy → negative)", { min: 0, max: SPEC.length - 1, value: SPEC.indexOf(spec), format: (i) => SPEC[i] + "%" }, (i) => { spec = SPEC[i]; retest = false; draw(); });
  api.seg([{ label: "Scattered", value: "scatter" }, { label: "Sorted into groups", value: "sorted" }], layout, (v) => { layout = v; draw(); });
  api.button("Test the positives again", () => { retest = !retest; draw(); }, { primary: true });
  api.button("Rare disease (1%)", () => { prev = 1; sp1.set(PREV.indexOf(1)); retest = false; draw(); });
  api.explain("How to read this", "<p>1,000 people. <b>Red</b> = sick. Everyone takes the test, and everyone who tests <b>positive rises</b> into the air.</p><p>The question Bayes answers: <i>of the people in the air, what fraction are red?</i></p><p>Click any person to see which of the four groups they're in. Try <b>Sorted into groups</b> to count them easily.</p>");
  W.camera({ target: [0, 0.5, 0], dist: 27, theta: 0.2, phi: 0.95, instant: true });
  draw();
});
