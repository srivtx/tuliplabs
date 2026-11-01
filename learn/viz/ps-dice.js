/* Probability & Stats, chapter 1: chance, by simulation.
   Roll dice (or flip coins) in bulk. Every outcome has a column of voxels that grows with its
   frequency, next to a see-through "ghost" of the true probability. With few rolls the columns
   are jumpy; with many they settle onto the ghosts. That settling IS probability. */
VIZ.register("ps-dice", async (api) => {
  const W = await api.world3d();

  const MODES = {
    coin: { name: "one coin", outcomes: ["H", "T"], ppv: 2.5, roll: () => (Math.random() < 0.5 ? "H" : "T"), p: () => 0.5 },
    one: { name: "one die", outcomes: [1, 2, 3, 4, 5, 6], ppv: 1, roll: () => 1 + Math.floor(Math.random() * 6), p: () => 1 / 6 },
    two: { name: "sum of two dice", outcomes: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], ppv: 1,
      roll: () => 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6), p: (s) => (6 - Math.abs(s - 7)) / 36 },
  };
  const SP = 1.35, VH = 0.4; // column spacing, height of one voxel
  let mode = "two", counts = {}, n = 0, last = [], ghost = "true", done = false;

  const ways = (s) => { const w = []; for (let a = 1; a <= 6; a++) { const b = s - a; if (b >= 1 && b <= 6) w.push(`${a}+${b}`); } return w; };
  const pct = (x) => (100 * x).toFixed(1) + "%";
  const xOf = (i) => (i - (MODES[mode].outcomes.length - 1) / 2) * SP;

  function frame() {
    W.clear();
    const M = MODES[mode];
    counts = {}; n = 0;
    M.outcomes.forEach((o, i) => { counts[o] = 0; W.label("o" + o, String(o), [xOf(i), -0.7, 0.9], { color: "ink", size: 0.5 }); });
    W.box("floor", { x: 0, y: -0.35, z: 0, sx: M.outcomes.length * SP + 0.6, sy: 0.12, sz: 1.6, color: "line", opacity: 0.6,
      info: { title: "The outcomes", html: `<p>Each slot is one possible <b>outcome</b> of the experiment (${M.name}). All the slots together are the <b>sample space</b>.</p><p>Every roll lands in exactly one slot, so the column heights always add up to 100%.</p>` } });
    drawGhosts();
    const width = M.outcomes.length * SP;
    W.camera({ target: [0, 3.2, 0], dist: Math.max(15, width * 1.25), theta: 0.18, phi: 1.2 });
    drawDice();
    update();
  }

  function drawGhosts() {
    const M = MODES[mode];
    M.outcomes.forEach((o, i) => {
      const p = ghost === "true" ? M.p(o) : 1 / M.outcomes.length;
      const hgt = (p * 100 / M.ppv) * VH;
      W.box("g" + o, { x: xOf(i), y: hgt / 2 - 0.2, z: -0.9, sx: 1.05, sy: Math.max(0.05, hgt), sz: 0.25, color: ghost === "true" ? "c3" : "c1", opacity: 0.35,
        info: { title: ghost === "true" ? `True probability of ${o}` : `Naive guess for ${o}`, html: ghost === "true"
          ? `<p>The thin green slab behind the column is the <b>true</b> probability: ${mode === "two" ? `${ways(o).length} of the 36 equally likely (die 1, die 2) pairs give ${o}: <code>${ways(o).join(", ")}</code>, so P = ${ways(o).length}/36 = ${pct(M.p(o))}` : pct(M.p(o))}.</p><p>The blue column is only an <i>estimate</i>. It wobbles, but with more rolls it settles here.</p>`
          : `<p>The naive guess says every outcome is equally likely: 1/${M.outcomes.length} = ${pct(1 / M.outcomes.length)}.</p><p>${mode === "two" ? "For sums that's wrong: there are 11 sums but 36 equally likely pairs, and more pairs add up to 7 than to 2. Roll a lot and watch the columns refuse to match this ghost." : "For a fair coin or die this naive guess is actually right, because each outcome is one equally likely face."}</p>` } });
    });
  }

  function drawDice() {
    const k = mode === "two" ? 2 : 1;
    for (let d = 0; d < 2; d++) W.remove("d" + d);
    for (let d = 0; d < k; d++) {
      const face = last[d] ?? (mode === "coin" ? "H" : 1);
      W.box("d" + d, { x: (d - (k - 1) / 2) * 1.6, y: 0.6, z: 3.4, fromY: 5, s: mode === "coin" ? 1 : 1.1, sy: mode === "coin" ? 0.25 : 1.1,
        color: mode === "coin" ? "c4" : "card", label: String(face), labelSize: 0.6,
        info: { title: mode === "coin" ? "A coin" : `Die ${d + 1}`, html: mode === "coin"
          ? "<p>Two faces, each equally likely. One flip is unpredictable; a thousand flips are very predictable. That's the whole trick of probability.</p>"
          : `<p>Six faces, each with probability 1/6.</p><p>${mode === "two" ? "With two dice, the pair (die 1, die 2) has 6 × 6 = 36 equally likely results. That's the <b>multiplication rule</b>: choices that don't affect each other multiply." : "Any single face is as likely as any other."}</p>` } });
    }
  }

  function update(drop) {
    const M = MODES[mode];
    M.outcomes.forEach((o, i) => {
      const f = n ? counts[o] / n : 0;
      const k = Math.round(f * 100 / M.ppv);
      let j = 0;
      for (; j < k; j++) {
        const key = `v${o}_${j}`, fresh = !W.has(key);
        W.box(key, { x: xOf(i), y: j * VH, z: 0, fromY: drop ? 9 : j * VH, sx: 0.95, sy: VH * 0.92, sz: 0.95, color: o === 7 && mode === "two" ? "c4" : "c2", instant: fresh && !drop,
          info: { title: `Outcome ${o}`, html: `<p>Seen <b>${counts[o]}</b> times in ${n} rolls: frequency ${pct(f)} (each block is ${M.ppv}% of all rolls).</p><p>True probability: <b>${pct(M.p(o))}</b>. The gap is ${pct(Math.abs(f - M.p(o)))}.</p>${mode === "two" ? `<p>Ways to get ${o}: <code>${ways(o).join("  ")}</code>.</p>` : ""}` } });
      }
      while (W.has(`v${o}_${j}`)) W.remove(`v${o}_${j++}`);
    });
    // how far the estimate is from the truth, and from the naive guess
    let dTrue = 0, dNaive = 0;
    M.outcomes.forEach((o) => { const f = n ? counts[o] / n : 0; dTrue += Math.abs(f - M.p(o)) / 2; dNaive += Math.abs(f - 1 / M.outcomes.length) / 2; });
    let s = `${M.name}: ${n.toLocaleString()} rolls\n`;
    if (mode === "two") {
      const f7 = n ? counts[7] / n : 0;
      s += `P(sum = 7) estimate ${f7.toFixed(4)}   true 6/36 = 0.1667   off by ${Math.abs(f7 - 1 / 6).toFixed(4)}\n`;
    }
    s += `distance from true probabilities: ${dTrue.toFixed(3)}\ndistance from "all equally likely": ${dNaive.toFixed(3)}`;
    api.status(s);
    api.hud(`<b>${M.name}</b> · blue = what you rolled · ${ghost === "true" ? "green slab = true probability" : "red slab = naive guess (all equal)"}`);
    if (!done && mode === "two" && n >= 500 && Math.abs(counts[7] / n - 1 / 6) < 0.01) {
      done = true;
      api.explain("Within 0.01 of the truth", `<p>After ${n.toLocaleString()} rolls your estimate of P(7) is ${(counts[7] / n).toFixed(4)}, and the true value is 6/36 ≈ 0.1667.</p><p>The columns form a <b>triangle</b> because the number of ways to make each sum goes 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1.</p>`);
      api.done("Your simulation found P(sum = 7) within 0.01");
    }
  }

  function roll(k, drop) {
    const M = MODES[mode];
    for (let r = 0; r < k; r++) {
      let o;
      if (mode === "two") { const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6); o = a + b; last = [a, b]; }
      else { o = M.roll(); last = [o]; }
      counts[o]++; n++;
    }
    drawDice();
    update(drop);
  }

  const SIZES = [1, 10, 100, 1000, 10000];
  api.seg([{ label: "Coin", value: "coin" }, { label: "One die", value: "one" }, { label: "Two dice (sum)", value: "two" }], mode, (v) => { mode = v; last = []; frame(); });
  const per = api.slider("Rolls per press", { min: 0, max: 4, value: 2, format: (i) => SIZES[i].toLocaleString() });
  api.button("Roll", () => roll(SIZES[per.get()], SIZES[per.get()] <= 100), { primary: true });
  api.button("One roll", () => roll(1, true));
  api.button("Run (×20)", async () => { for (let i = 0; i < 20; i++) { roll(SIZES[per.get()], false); await api.sleep(120); } });
  api.button("Reset", () => { last = []; frame(); });
  api.seg([{ label: "Ghost: true P", value: "true" }, { label: "Ghost: naive (all equal)", value: "naive" }], ghost, (v) => { ghost = v; drawGhosts(); update(); });
  api.explain("How to read this", "<p>Each <b>blue column</b> is how often that outcome came up (as a % of all rolls). The <b>see-through slab</b> behind it is the true probability.</p><p>Roll 10 times: messy. Roll 10,000 times: the columns sit on the slabs. Probability is the <b>long-run frequency</b>.</p><p>Click any block to ask about it.</p>");
  frame();
  roll(30, false);
});
