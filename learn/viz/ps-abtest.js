/* Probability & Stats, chapter 13: the peeking problem.
   Each experiment sends visitors to page A or B and checks the z-score 20 times as data arrives.
   The latest experiment's z-scores rise as a row of bars between two glass walls at ±1.96.
   Two tally towers compare policies on the same experiments: "stop the first time it looks significant"
   vs "look once, at the planned end". In an A/A test (no real difference) every "win" is a false alarm.
   The "why": each extra look is another lottery ticket for a fluke. */
VIZ.register("ps-abtest", async (api) => {
  const W = await api.world3d();
  const LOOKS = 20, PER_LOOK = 100, BASE = 0.1, SP = 0.38, ZS = 0.95;
  const SEED = 771234567;
  let seed = SEED;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let mode = "aa", stats, busy = false;
  const fresh = () => ({ aa: { runs: 0, peek: 0, fixed: 0 }, ab: { runs: 0, peek: 0, fixed: 0 } });
  stats = fresh();
  function experiment() {
    const pB = mode === "aa" ? BASE : 0.12;
    let ca = 0, cb = 0, n = 0, peekWin = false;
    const zs = [];
    for (let l = 0; l < LOOKS; l++) {
      for (let v = 0; v < PER_LOOK; v++) { if (rnd() < BASE) ca++; if (rnd() < pB) cb++; }
      n += PER_LOOK;
      const p = (ca + cb) / (2 * n), se = Math.sqrt(p * (1 - p) * 2 / n) || 1;
      const z = (cb / n - ca / n) / se;
      zs.push(z);
      if (Math.abs(z) > 1.96) peekWin = true;
    }
    return { zs, peekWin, fixedWin: Math.abs(zs[LOOKS - 1]) > 1.96, ca, cb, n };
  }
  function drawWalls() {
    for (const s of [1, -1]) W.box("wall" + s, { x: 0, y: 2 + s * 1.96 * ZS, z: 0, sx: LOOKS * SP + 0.4, sy: 0.04, sz: 1.4, color: "c1", opacity: 0.25, instant: true,
      info: { title: `The significance line, z = ${s > 0 ? "+" : "−"}1.96`, html: "<p>If there were no real difference, a z-score beyond this line would happen only 5% of the time <i>at one pre-planned look</i>.</p><p>Look 20 times and the wobbling z-score gets 20 chances to poke through. That's the trap.</p>" } });
    W.box("zero", { x: 0, y: 2, z: 0, sx: LOOKS * SP + 0.4, sy: 0.02, sz: 0.3, color: "c5", opacity: 0.5, instant: true });
    W.label("lt", "z-score at each look →", [-LOOKS * SP / 2 + 1.8, 0.4, 0], { color: "muted", size: 0.28 });
  }
  async function showRun(r, animate) {
    for (let l = 0; l < LOOKS; l++) {
      const z = r.zs[l], h = Math.max(0.03, Math.abs(z) * ZS), out = Math.abs(z) > 1.96;
      W.box("z" + l, { x: (l - LOOKS / 2 + 0.5) * SP, y: 2 + (z > 0 ? h / 2 : -h / 2), z: 0, sx: SP * 0.7, sy: h, sz: 0.5, color: out ? "c1" : "c2",
        info: { title: `Look ${l + 1}: ${(l + 1) * PER_LOOK} visitors per page, z = ${z.toFixed(2)}`, html: `<p>z is the gap between B's and A's conversion rates, measured in standard errors. ${out ? "This look poked past ±1.96, so a peeker would stop here and declare a winner." : "Inside the walls: not significant at this look."}</p>${mode === "aa" ? "<p>Remember: in this A/A test the pages are <b>identical</b>. Any winner is a false alarm.</p>" : ""}` } });
      if (animate) await api.sleep(45);
    }
  }
  function drawTowers() {
    const s = stats[mode];
    const rate = (k) => (s.runs ? k / s.runs : 0);
    const towers = [["peek", "stop at first 'significant' look", 4.7, "c1"], ["fixed", "one look at the planned end", 5.9, "c3"]];
    for (const [k, label, x, color] of towers) {
      const h = 0.05 + rate(s[k]) * 12;
      W.box("tw" + k, { x, y: h / 2, z: 0, sx: 0.9, sy: h, sz: 0.9, color,
        info: { title: `${label}: ${(rate(s[k]) * 100).toFixed(1)}% declared a winner`, html: mode === "aa" ? `<p>Out of ${s.runs} A/A experiments (no real difference), this policy cried "winner" ${s[k]} times. ${k === "fixed" ? "That's close to the 5% you signed up for." : "That's the real false-alarm rate of peeking, far above 5%."}</p>` : `<p>Out of ${s.runs} experiments where B really is better (12% vs 10%), this policy found it ${s[k]} times: that's its <b>power</b>.</p>` } });
      W.label("tl" + k, `${(rate(s[k]) * 100).toFixed(0)}%`, [x, h + 0.4, 0], { color, size: 0.34 });
    }
    W.box("five", { x: 5.3, y: 0.05 * 12, z: 0, sx: 2.4, sy: 0.03, sz: 1.2, color: "c4", opacity: 0.6, instant: true,
      info: { title: "The 5% line", html: "<p>The false-alarm rate you think you're getting when you use p < 0.05.</p>" } });
    W.label("towers", "winners declared", [5.3, -0.4, 0], { color: "muted", size: 0.26 });
  }
  function report(r) {
    const s = stats[mode];
    api.status(`${mode === "aa" ? "A/A test: both pages convert 10%" : "A/B test: A 10%, B 12%"}\nexperiments run: ${s.runs}\npeeking declared a winner:   ${s.peek}  (${s.runs ? (s.peek / s.runs * 100).toFixed(1) : 0}%)\none planned look declared:   ${s.fixed}  (${s.runs ? (s.fixed / s.runs * 100).toFixed(1) : 0}%)\nlast run: A ${r.ca}/${r.n}, B ${r.cb}/${r.n}, final z ${r.zs[LOOKS - 1].toFixed(2)}`);
    if (mode === "aa" && s.runs >= 200 && s.peek >= 2 * Math.max(1, s.fixed)) {
      api.explain("Peeking manufactures winners", `<p>${s.runs} experiments on two <b>identical</b> pages. Checking after every 100 visitors and stopping at the first p < 0.05 declared a winner <b>${(s.peek / s.runs * 100).toFixed(0)}%</b> of the time. Looking once at the planned end: <b>${(s.fixed / s.runs * 100).toFixed(0)}%</b>, close to the promised 5%.</p><p>Fix it by deciding the sample size in advance, or by using methods built for repeated looks (sequential tests, or a Bayesian analysis with a stopping rule you wrote down first).</p>`);
      api.done("You measured how peeking inflates false alarms");
    }
  }
  async function run(k) {
    if (busy) return;
    busy = true;
    let r;
    for (let i = 0; i < k; i++) {
      r = experiment();
      stats[mode].runs++; if (r.peekWin) stats[mode].peek++; if (r.fixedWin) stats[mode].fixed++;
    }
    await showRun(r, k === 1);
    drawTowers(); report(r);
    busy = false;
  }
  api.seg([{ label: "A/A: pages identical", value: "aa" }, { label: "A/B: B really better", value: "ab" }], mode, (v) => {
    mode = v; drawTowers();
    api.explain(v === "aa" ? "A/A test" : "A/B test", v === "aa" ? "<p>Both pages convert exactly 10%. A good testing process should almost never call a winner here.</p>" : "<p>B truly converts 12% vs A's 10%. Now a declared winner is a <i>correct</i> find; the tower heights show each policy's power.</p>");
  });
  api.button("Run 1 experiment", () => run(1), { primary: true });
  api.button("Run 100 experiments", () => run(100));
  api.button("Reset tallies", () => { stats = fresh(); seed = SEED; drawTowers(); api.status(""); });
  W.camera({ target: [0.8, 2, 0], dist: 16.5, theta: 0.06, phi: 1.32, instant: true });
  api.hud("each experiment: up to 2000 visitors per page, checked every 100");
  drawWalls(); drawTowers();
  api.explain("How to read this", "<p>An experiment sends visitors to two versions of a signup page. After every 100 visitors per page we compute a z-score (bars). Past the red glass at ±1.96 means \"p < 0.05\".</p><p>The towers on the right count how often each policy declared a winner. Start with the A/A test, where the pages are identical. Run lots of experiments.</p>");
});
