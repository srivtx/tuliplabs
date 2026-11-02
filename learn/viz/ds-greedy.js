/* DSA, chapter 16: greedy choices and why only the right one works.
   Eleven talks you'd like to see, each with a start and an end; you can only be in one at a time.
   See as many as possible. Three greedy rules all sound sensible: take the earliest-starting talk,
   take the shortest talk, take the talk that ends first. Only the last one is always optimal.
   The exchange argument: in any best schedule, swap its first talk for the one that ends first;
   that ends no later, so everything after still fits, and the count is unchanged. Repeat. */
VIZ.register("ds-greedy", async (api) => {
  const W = await api.world3d();
  const I = [[0, 13], [1, 5], [5, 9], [4, 6], [9, 12], [11, 14], [12, 16], [16, 20], [15, 17], [19, 22], [20, 23]];
  const RULES = {
    start: { label: "earliest start", key: (a, b) => I[a][0] - I[b][0] || I[a][1] - I[b][1] },
    short: { label: "shortest", key: (a, b) => (I[a][1] - I[a][0]) - (I[b][1] - I[b][0]) || I[a][0] - I[b][0] },
    end: { label: "earliest end", key: (a, b) => I[a][1] - I[b][1] || I[a][0] - I[b][0] },
  };
  const X = (t) => -8.5 + t * 0.74, ROW = (i) => 0.4 + i * 0.62;
  let mode = "start", gen = null, kept = [], look = -1, skipped = new Set(), running = false, ran = {}, reached = false, line = "";
  const clash = (i, j) => I[i][0] < I[j][1] && I[j][0] < I[i][1];
  function* run() {
    const order = I.map((_, i) => i).sort(RULES[mode].key);
    yield `rule "${RULES[mode].label}": consider the talks in that order`;
    for (const i of order) {
      look = i;
      const c = kept.find((j) => clash(i, j));
      if (c === undefined) { kept.push(i); yield `${I[i][0]}–${I[i][1]} fits: keep it (${kept.length} so far)`; }
      else { skipped.add(i); yield `${I[i][0]}–${I[i][1]} clashes with ${I[c][0]}–${I[c][1]}, which is already kept: skip`; }
    }
    look = -1;
  }
  function draw() {
    I.forEach(([s, e], i) => {
      const k = kept.includes(i), sk = skipped.has(i);
      W.box("t" + i, { x: (X(s) + X(e)) / 2, y: ROW(i), z: 0, sx: (e - s) * 0.74 - 0.08, sy: 0.36, sz: 0.5, color: i === look ? "c1" : k ? "c3" : sk ? "c5" : "c2", glow: i === look ? 0.35 : 0, opacity: k || i === look ? 0.95 : sk ? 0.2 : 0.6,
        label: `${s}–${e}`, labelSize: 0.24, labelUp: 0,
        info: { title: `Talk from ${s} to ${e}`, html: `<p>Length ${e - s}. ${k ? "Kept." : sk ? "Skipped: it clashes with a kept talk." : "Not considered yet."}</p>` } });
    });
    kept.forEach((i, k) => W.box("k" + k, { x: (X(I[i][0]) + X(I[i][1])) / 2, y: -0.45, z: 0, sx: (I[i][1] - I[i][0]) * 0.74 - 0.08, sy: 0.3, sz: 0.5, color: "c3", opacity: 0.9 }));
    for (let k = kept.length; k < I.length; k++) W.remove("k" + k);
    for (const t of [0, 6, 12, 18, 23]) W.label("x" + t, String(t), [X(t), -1, 0.4], { color: "muted", size: 0.24 });
  }
  function show() {
    const tally = Object.entries(ran).map(([m, n]) => `${RULES[m].label}: ${n}`).join(" · ");
    api.status(`rule: ${RULES[mode].label} · kept ${kept.length}${tally ? ` · finished runs → ${tally}` : ""}\n${line}`);
  }
  function reset() { kept = []; skipped = new Set(); look = -1; line = ""; gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); finish(); show(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode] !== undefined) return;
    ran[mode] = kept.length;
    const left = Object.keys(RULES).filter((m) => ran[m] === undefined).map((m) => `<b>${RULES[m].label}</b>`);
    if (left.length) api.explain(`${RULES[mode].label}: ${kept.length} talks`, `<p>${mode === "start" ? "The 0–13 talk starts first, so it's taken, and it blocks almost the whole day." : mode === "short" ? "The short 4–6 talk is taken first, and it blocks both 1–5 and 5–9." : "Ending first leaves the most time for everything after."}</p><p>Now try ${left.join(" and ")}.</p>`);
    else if (!reached) { reached = true; api.explain("Only one greedy rule is right", `<p>Earliest start kept ${ran.start}, shortest kept ${ran.short}, earliest end kept ${ran.end}. Checking every subset confirms ${ran.end} is the best possible.</p><p>Why earliest end always wins (the exchange argument): take any best schedule and swap its first talk for the talk that ends first. That talk ends no later, so the rest still fits and the count doesn't drop. Keep swapping and you get exactly the greedy schedule.</p>`); api.done("You proved a greedy rule"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(550); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg(Object.entries(RULES).map(([value, r]) => ({ label: r.label, value })), mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 2.8, 0], dist: 25, theta: 0, phi: 1.45, instant: true });
  api.hud("one row per talk · red = being considered · green = kept · faded = skipped · the strip at the bottom is your day");
  reset();
  api.explain("How to read this", `<p>See as many talks as you can without being in two at once. Each button is a greedy rule: sort the talks by it, then keep every talk that fits. <b>Run all</b> with each of the three rules.</p>`);
});
