/* Probability & Stats, chapter 11: Bayesian updating on a grid.
   A coin with an unknown bias p. Two people watch the same flips: Ada starts with no opinion (flat prior),
   Bo is sure the coin favours tails (prior bunched near 0.25). Each row of bars is a belief about p,
   updated as posterior ∝ prior × likelihood after every flip.
   The "why": with enough shared evidence, different starting beliefs end up in the same place. */
VIZ.register("ps-posterior", async (api) => {
  const W = await api.world3d();
  const N = 41, GRID = Array.from({ length: N }, (_, i) => (i + 0.5) / N), SP = 0.32;
  const SEED = 918273645; let seed = SEED;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const TRUE_P = 0.68;
  let heads = 0, flips = 0, strength = 16;
  const people = [
    { key: "a", name: "Ada", z: -1.6, color: "c2", logPrior: () => GRID.map(() => 0),
      prior: "a flat prior: every bias from 0 to 1 seems equally likely to her" },
    { key: "b", name: "Bo", z: 1.6, color: "c1", logPrior: () => GRID.map((p) => strength * (0.25 * Math.log(p) + 0.75 * Math.log(1 - p))),
      prior: "a confident prior bunched near 0.25: he's sure this coin favours tails" },
  ];
  function posterior(person) {
    const lp = person.logPrior().map((l, i) => l + heads * Math.log(GRID[i]) + (flips - heads) * Math.log(1 - GRID[i]));
    const m = Math.max(...lp), w = lp.map((l) => Math.exp(l - m)), s = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / s);
  }
  function summary(post) {
    const mean = post.reduce((a, w, i) => a + w * GRID[i], 0);
    let c = 0, lo = 0, hi = 1;
    for (let i = 0; i < N; i++) { c += post[i]; if (c >= 0.05 && !lo) lo = GRID[i]; if (c >= 0.95) { hi = GRID[i]; break; } }
    return { mean, lo, hi };
  }
  function draw() {
    const res = {};
    for (const person of people) {
      const post = posterior(person), top = Math.max(...post), s = summary(post);
      res[person.key] = s;
      post.forEach((w, i) => {
        const h = 0.04 + (w / top) * 3.6;
        W.box(person.key + i, { x: (i - N / 2) * SP, y: h / 2, z: person.z, sx: SP * 0.86, sy: h, sz: 0.9, color: GRID[i] >= s.lo && GRID[i] <= s.hi ? person.color : "c5", opacity: 0.9,
          info: { title: `${person.name}: p = ${GRID[i].toFixed(2)}`, html: `<p>How much ${person.name} believes the coin's heads-probability is about <b>${GRID[i].toFixed(2)}</b>: ${(w * 100).toFixed(2)}% of the belief.</p><p>${person.name} started with ${person.prior}. Each flip multiplies every bar by the chance of that flip under that p (the <b>likelihood</b>), then rescales so the bars add to 100%. That is Bayes' rule, done once per bar.</p><p>Coloured bars form the 90% <b>credible interval</b>: ${person.name} is 90% sure p is in there.</p>` } });
      });
      W.label("n" + person.key, `${person.name}  mean ${s.mean.toFixed(2)}`, [(-N / 2 + 5) * SP, 2.4, person.z], { color: person.color, size: 0.3 });
    }
    const diff = Math.abs(res.a.mean - res.b.mean);
    api.status(`flips: ${flips}   heads: ${heads}\nAda:  mean ${res.a.mean.toFixed(3)}  90% interval [${res.a.lo.toFixed(2)}, ${res.a.hi.toFixed(2)}]\nBo:   mean ${res.b.mean.toFixed(3)}  90% interval [${res.b.lo.toFixed(2)}, ${res.b.hi.toFixed(2)}]\ngap between their means: ${diff.toFixed(3)}`);
    api.hud(`p axis: 0 on the left, 1 on the right · ${flips} flips so far`);
    if (flips > 0 && diff < 0.03) {
      api.explain("The evidence won", `<p>After <b>${flips}</b> flips, Ada and Bo disagree by only ${diff.toFixed(3)}, even though Bo started out sure the coin favoured tails. The coin's true bias was <b>${TRUE_P}</b>.</p><p>The prior matters a lot when data is scarce and very little when data is plentiful. A stronger prior (the slider) just takes more flips to overcome.</p>`);
      api.done("Two different priors met in the middle");
    }
  }
  function flip(k) {
    for (let i = 0; i < k; i++) { flips++; if (rnd() < TRUE_P) heads++; }
    draw();
    if (Math.abs(summary(posterior(people[0])).mean - summary(posterior(people[1])).mean) >= 0.03)
      api.explain(k === 1 ? "One more flip" : `${k} more flips`, "<p>Every bar got multiplied by p (for heads) or 1 − p (for tails), then the row was rescaled. Bars that explain the data well grow; the rest fade.</p><p>Bo's prior is pulling his belief to the left. How many flips until the data outweighs it?</p>");
  }
  api.button("Flip 1", () => flip(1), { primary: true });
  api.button("Flip 10", () => flip(10));
  api.button("Flip 100", () => flip(100));
  api.button("Reset", () => { heads = 0; flips = 0; seed = SEED; draw(); });
  api.slider("Bo's prior strength (like this many imaginary flips)", { min: 0, max: 60, step: 2, value: strength }, (v) => { strength = v; draw(); });
  for (const [i, t] of [[0, "0"], [N / 2, "0.5"], [N, "1"]]) W.label("ax" + i, t, [(i - N / 2) * SP - SP / 2, -0.3, 2.9], { color: "muted", size: 0.28 });
  W.camera({ target: [0, 1.2, 0.4], dist: 19.5, theta: 0.0, phi: 1.0, instant: true });
  api.explain("How to read this", "<p>A coin has some unknown chance p of landing heads. Each row of bars is a person's <b>belief</b> about p: tall bars are values they find likely. Blue is Ada (no opinion yet), red is Bo (sure it favours tails).</p><p>Flip the coin and watch both rows update from the <i>same</i> evidence. Click a bar to see the rule.</p>");
  draw();
});
