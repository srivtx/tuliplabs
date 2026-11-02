/* DSA, chapter 1: counting steps.
   Six bars, one per way an algorithm's work can grow with the input size n: constant, log n, n,
   n log n, n², 2ⁿ. Each bar's height is the number of steps on a log scale (every unit up is ×10).
   The flat sheet is about 10⁸ simple steps: roughly what fits in one second of a judge's time.
   The "why": a problem's limits tell you which algorithm is allowed before you write any code. With
   n ≤ 200 000, an n² solution does 4·10¹⁰ steps (minutes); n log n does 3.5·10⁶ (milliseconds). */
VIZ.register("ds-bigo", async (api) => {
  const W = await api.world3d();
  const NS = [10, 20, 100, 1000, 5000, 1e5, 2e5, 1e6, 1e9];
  const L2 = Math.log10(2);
  // log10 of the step count for each growth rate; 2ⁿ is done in logs so it never overflows.
  const KINDS = [
    { key: "1", name: "O(1)", f: () => 0, ex: "Read a[i], push onto a stack, look up a key in a hash map.", why: "The work doesn't depend on n at all." },
    { key: "log", name: "O(log n)", f: (n) => Math.log10(Math.max(1, Math.log2(n))), ex: "Binary search in a sorted array; one step in a balanced tree.", why: "Each step halves what's left, so a billion items take only 30 steps." },
    { key: "n", name: "O(n)", f: (n) => Math.log10(n), ex: "One pass: the sum, the maximum, counting with a hash map.", why: "You touch each item a fixed number of times." },
    { key: "nlogn", name: "O(n log n)", f: (n) => Math.log10(n * Math.max(1, Math.log2(n))), ex: "Sorting; n binary searches; a heap with n pushes.", why: "n items, and a log n amount of work for each." },
    { key: "n2", name: "O(n²)", f: (n) => 2 * Math.log10(n), ex: "Two nested loops over all pairs i, j.", why: "Every item is compared with every other: n·n steps." },
    { key: "2n", name: "O(2ⁿ)", f: (n) => n * L2, ex: "Trying every subset (take it or leave it, for each item).", why: "Each extra item doubles the work. Fine for n ≤ 20, hopeless at 60." },
  ];
  const LIMIT = 8, SCALE = 0.45, CAP = 14; // 10⁸ steps per second; bars stop growing at 10¹⁴
  const PUZZLES = [{ n: 2e5, ans: "nlogn" }, { n: 20, ans: "2n" }, { n: 5000, ans: "n2" }];
  let ni = 6, solved = new Set(), puzzle = 0;
  const fmtN = (n) => (n >= 1e5 ? n.toExponential(0).replace("e+", "·10^") : n.toLocaleString("en"));
  const fmtSteps = (lg) => (lg > 15 ? `10^${Math.round(lg)}` : Math.round(10 ** lg).toLocaleString("en"));
  const steps = (lg) => `${fmtSteps(lg)} step${Math.round(10 ** lg) === 1 ? "" : "s"}`;
  const secs = (lg) => {
    const s = 10 ** (lg - LIMIT);
    if (s < 1e-3) return "no time at all";
    if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
    if (s < 120) return `${s.toFixed(0)} s`;
    if (s < 2 * 86400) return `${(s / 3600).toFixed(1)} hours`;
    if (s < 3.15e9) return `${(s / 3.15e7).toFixed(1)} years`;
    return "longer than the universe has existed";
  };
  function draw() {
    const n = NS[ni];
    KINDS.forEach((k, i) => {
      const lg = k.f(n), h = Math.max(0.15, Math.min(lg, CAP) * SCALE), fits = lg <= LIMIT, x = -5.5 + i * 2.2;
      W.box("bar" + k.key, { x, y: h / 2, z: 0, sx: 1.5, sy: h, sz: 1.5, color: fits ? "c3" : "bad", opacity: 0.92,
        label: `${k.name}\n${steps(lg)}`, labelSize: 0.34, labelUp: 0.5 / h + 0.55,
        info: { title: `${k.name} at n = ${fmtN(n)}`, html: `<p><b>${fmtSteps(lg)}</b> steps, about <b>${secs(lg)}</b> at 10⁸ steps per second.</p><p>Example: ${k.ex}</p><p>Why it grows like this: ${k.why}</p>` } });
    });
    W.box("limit", { x: 0, y: LIMIT * SCALE, z: 0, sx: 13.4, sy: 0.04, sz: 2.4, color: "c4", opacity: 0.35,
      info: { title: "About one second", html: "<p>A judge (or your laptop running Python's C-speed parts) does roughly <b>10⁸ simple steps a second</b>. Pure Python loops are slower, closer to 10⁷, so in Python aim even lower.</p><p>Green bars are under the sheet: they finish in time.</p>" } });
  }
  function show(extra = "") {
    const n = NS[ni], ok = KINDS.filter((k) => k.f(n) <= LIMIT).map((k) => k.name);
    api.status(`n = ${fmtN(n)} · fits in a second: ${ok.join(", ")}` + (extra ? "\n" + extra : ""));
  }
  const sl = api.slider("n (input size)", { min: 0, max: NS.length - 1, value: ni, format: (v) => fmtN(NS[v]) }, (v) => { ni = v; draw(); show(); });
  function ask() {
    const p = PUZZLES[puzzle];
    ni = NS.indexOf(p.n); sl.set(ni); draw();
    show(`Puzzle ${puzzle + 1} of 3: a problem says n ≤ ${fmtN(p.n)}. Which is the most work you can afford (the fastest-growing one that still fits)?`);
  }
  const row = api.row();
  KINDS.forEach((k) => api.button(k.name, () => answer(k), { row }));
  function answer(k) {
    const p = PUZZLES[puzzle], n = p.n;
    if (NS[ni] !== n) { ni = NS.indexOf(n); sl.set(ni); draw(); }
    W.flash("bar" + k.key);
    if (k.key === p.ans) {
      solved.add(puzzle);
      api.explain("Right", `<p>At n = ${fmtN(n)}, <b>${k.name}</b> is about ${fmtSteps(k.f(n))} steps: it fits. The next one up is too slow. So the problem setter is telling you: <i>"${{ nlogn: "sort, or use a heap or binary search", "2n": "you may try every subset", n2: "a double loop over pairs is fine" }[k.key]}"</i>.</p>`);
      if (solved.size === PUZZLES.length) { show("All three puzzles solved."); api.done("You can read a problem's limits"); return; }
      puzzle = (puzzle + 1) % PUZZLES.length;
      while (solved.has(puzzle)) puzzle = (puzzle + 1) % PUZZLES.length;
      ask();
    } else {
      const fits = k.f(n) <= LIMIT;
      api.explain(fits ? "It fits, but you can afford more" : "Too slow", fits
        ? `<p>${k.name} fits easily at n = ${fmtN(n)}, but so does something that grows faster. The question is the <b>most</b> work you can afford: that tells you how simple your solution is allowed to be.</p>`
        : `<p>${k.name} at n = ${fmtN(n)} is ${fmtSteps(k.f(n))} steps: about ${secs(k.f(n))}. It's above the sheet.</p>`);
    }
  }
  W.camera({ target: [0, 2.4, 0], dist: 20.5, theta: 0, phi: 1.35, instant: true });
  api.hud("height = steps (×10 per unit) · yellow sheet = about 1 second · green fits under it · click a bar");
  draw();
  ask();
  api.explain("How to read this", "<p>Each bar is how many steps an algorithm takes on an input of size n. Drag the <b>n</b> slider and watch n² and 2ⁿ shoot through the one-second sheet.</p><p>Then answer the puzzle with the buttons: the most work you can afford for that n.</p>");
});
