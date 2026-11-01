/* Probability & Stats, chapter 12: a Metropolis walker.
   Grey glass columns are a target distribution with two islands of probability. An amber walker hops around:
   propose a random nearby cell, always move uphill, move downhill only sometimes (ratio of heights).
   Blue columns count where it has been. If the walker is doing its job, blue ends up the same shape as grey.
   The "why": you can sample from a shape you can only evaluate point by point, but step size matters. */
VIZ.register("ps-mcmc", async (api) => {
  const W = await api.world3d();
  const G = 21, SP = 0.5;
  const bump = (i, j, ci, cj, s) => Math.exp(-((i - ci) ** 2 + (j - cj) ** 2) / s);
  const target = [];
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) target.push(bump(i, j, 5, 6, 7) + 0.8 * bump(i, j, 15, 14, 5) + 0.0005);
  const T = target.reduce((a, b) => a + b, 0), tMax = Math.max(...target);
  const SEED = 482711293;
  let seed = SEED;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let pos, visits, n, accepted, step = 1;
  const at = (i, j) => i * G + j, cx = (i) => (i - G / 2 + 0.5) * SP;
  function reset() { seed = SEED; pos = [5, 6]; visits = new Array(G * G).fill(0); n = 0; accepted = 0; }
  function move() {
    const di = Math.round((rnd() * 2 - 1) * step), dj = Math.round((rnd() * 2 - 1) * step);
    const ni = pos[0] + di, nj = pos[1] + dj;
    if (ni >= 0 && nj >= 0 && ni < G && nj < G) {
      const ratio = target[at(ni, nj)] / target[at(pos[0], pos[1])];
      if (rnd() < ratio) { pos = [ni, nj]; accepted++; }
    }
    visits[at(pos[0], pos[1])]++; n++;
  }
  // mismatch measured on 3×3 blocks of cells, so a few thousand samples are enough to judge the shape
  const tv = () => {
    const b = {};
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const k = ((i / 3) | 0) * 7 + ((j / 3) | 0);
      b[k] = (b[k] || 0) + visits[at(i, j)] / Math.max(1, n) - target[at(i, j)] / T;
    }
    return 0.5 * Object.values(b).reduce((a, x) => a + Math.abs(x), 0);
  };
  const island = () => { let a = 0; for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) if (i + j < G) a += visits[at(i, j)]; return n ? a / n : 0; };
  function draw() {
    const vMax = Math.max(1, ...visits), tShare = tMax / T;
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const k = at(i, j), th = 0.03 + (target[k] / tMax) * 3.2, share = visits[k] / Math.max(1, n);
      const vh = 0.02 + Math.min(4, (share / tShare) * 3.2);
      W.box("t" + k, { x: cx(i), y: th / 2, z: cx(j), sx: SP * 0.92, sy: th, sz: SP * 0.92, color: "c5", opacity: 0.18, instant: true,
        info: { title: `Target height here: ${(target[k] / T * 100).toFixed(2)}%`, html: "<p>The grey glass is the distribution we want samples from. The walker never sees the whole shape; it can only ask \"how high is it <i>here</i>, compared to where I am?\"</p><p>That's the trick that makes MCMC useful: in Bayesian models you can compute prior × likelihood at any point, but not the total you'd need to normalise it.</p>" } });
      W.box("v" + k, { x: cx(i), y: vh / 2, z: cx(j), sx: SP * 0.5, sy: vh, sz: SP * 0.5, color: "c2", opacity: visits[k] ? 0.95 : 0,
        info: { title: `Visited ${visits[k]} times (${(share * 100).toFixed(2)}%)`, html: `<p>The share of time the walker spent here. The target says it should be ${(target[k] / T * 100).toFixed(2)}%.</p><p>A Markov chain built this way has the target as its <b>stationary distribution</b>: run it long enough and the time spent in each place matches the target.</p>` } });
    }
    W.box("w", { x: cx(pos[0]), y: 4.2, z: cx(pos[1]), s: 0.36, color: "c4", glow: true,
      info: { title: "The walker", html: `<p>Each step: propose a cell up to ${step} away. If it's higher, go. If it's lower, go with probability (new height ÷ old height); otherwise stay put (and count this cell again).</p>` } });
    const d = tv(), share = island();
    api.status(`steps: ${n}   step size: ${step}\naccepted moves: ${n ? (accepted / n * 100).toFixed(0) : 0}%\ntime on the left island: ${(share * 100).toFixed(0)}%  (target ${(leftTarget * 100).toFixed(0)}%)\nmismatch with target (3×3 blocks): ${d.toFixed(3)}`);
    api.hud(`mismatch ${d.toFixed(3)} · goal below 0.10 after 6000 steps`);
    return d;
  }
  let leftTarget = 0;
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) if (i + j < G) leftTarget += target[at(i, j)] / T;
  function run(k) {
    for (let s = 0; s < k; s++) move();
    const d = draw();
    if (n >= 6000 && d < 0.1) {
      api.explain("The samples match the shape", `<p>After ${n} steps with step size ${step}, the blue columns match the grey glass: mismatch ${d.toFixed(3)}. The walker spent ${(island() * 100).toFixed(0)}% of its time on the left island; the target says ${(leftTarget * 100).toFixed(0)}%.</p><p>Small steps get accepted a lot but can't cross the valley; huge steps get rejected a lot. Good MCMC lives in between.</p>`);
      api.done("You tuned a sampler that found both islands");
    } else if (n >= 6000 && step <= 1)
      api.explain("Stuck on one island", "<p>With step size 1, every move into the valley is a big drop in height, so it's almost always refused. The walker never learns the right-hand island exists, and its samples look nothing like the target.</p><p>Reset, make the steps bigger, and run again.</p>");
  }
  api.slider("Step size (how far a proposal can jump)", { min: 1, max: 12, step: 1, value: step }, (v) => { step = v; });
  api.button("Step", () => run(1));
  api.button("Run 2000 steps", () => run(2000), { primary: true });
  api.button("Reset", () => { reset(); draw(); api.explain("Reset", "<p>The walker starts on the left island again.</p>"); });
  W.camera({ target: [0, 1, 0], dist: 17, theta: 0.6, phi: 0.95, instant: true });
  api.explain("How to read this", "<p>Grey glass is the <b>target</b>: two islands of probability with a deep valley between them. The amber walker hops by a simple rule, and blue columns count where it has been.</p><p>Run it with small steps first. Does blue end up the same shape as grey?</p>");
  reset(); draw();
});
