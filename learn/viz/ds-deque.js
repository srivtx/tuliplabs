/* DSA, chapter 12: the monotonic deque.
   Sliding window maximum: the biggest number in every window of 4 in a row.
   The "why": rescanning each window costs k per window: O(n·k). A deque of indices whose values
   go DOWN from front to back fixes it: the front is always the window's maximum. A new number
   pops smaller numbers off the back (they can never be a maximum again while it's around), and
   the front is dropped once it slides out of the window. Each index enters once and leaves once:
   O(n). */
VIZ.register("ds-deque", async (api) => {
  const W = await api.world3d();
  const A = [1, 3, 2, 5, 4, 2, 1, 6, 3, 2, 2, 4, 1, 3], K = 4;
  const N = A.length, X = (i) => -7.2 + i * 0.84, H = (v) => 0.3 + v * 0.55;
  let mode = "naive", gen = null, steps = 0, dq = [], out = [], cur = -1, look = -1, win = [-1, -1], running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let r = K - 1; r < N; r++) {
      win = [r - K + 1, r]; cur = r; let m = -Infinity;
      for (let i = r - K + 1; i <= r; i++) { steps++; look = i; m = Math.max(m, A[i]); yield `window ${r - K + 1}..${r}: look at ${A[i]}, max so far ${m}`; }
      out.push(m); look = -1; yield `window ${r - K + 1}..${r}: max ${m}`;
    }
  }
  function* deque() {
    for (let r = 0; r < N; r++) {
      cur = r; win = [Math.max(0, r - K + 1), r];
      while (dq.length && dq[0] <= r - K) { const j = dq.shift(); steps++; look = j; yield `index ${j} slid out of the window: drop it from the front`; }
      while (dq.length && A[dq[dq.length - 1]] <= A[r]) { const j = dq.pop(); steps++; look = j; yield `${A[r]} ≥ ${A[j]}: ${A[j]} can never be a maximum again, pop it from the back`; }
      dq.push(r); steps++; look = -1;
      if (r >= K - 1) { out.push(A[dq[0]]); yield `push ${A[r]}; the front, ${A[dq[0]]}, is this window's max`; }
      else yield `push ${A[r]}`;
    }
  }
  function draw() {
    A.forEach((v, i) => {
      const inW = i >= win[0] && i <= win[1], inD = mode === "deque" && dq.includes(i), front = mode === "deque" && dq[0] === i;
      W.box("n" + i, { x: X(i), y: H(v) / 2, z: 0, sx: 0.66, sy: H(v), sz: 0.66, color: i === look ? "c1" : front ? "c3" : inD ? "c2" : i === cur ? "c4" : "c5", glow: i === look || front ? 0.35 : 0, opacity: inW || inD ? 0.95 : 0.3,
        label: String(v), labelSize: 0.28, labelUp: 0.35,
        info: { title: `A[${i}] = ${v}`, html: inD ? "<p>In the deque: it might still become a window's maximum.</p>" : "<p>Not in the deque. Either it hasn't arrived, it slid out, or a bigger number came after it (so it can never be the maximum while that one is in the window).</p>" } });
    });
    W.box("win", { x: (X(win[0]) + X(win[1])) / 2, y: -0.12, z: 0, sx: Math.max(0, win[1] - win[0] + 1) * 0.84, sy: 0.12, sz: 0.9, color: "c4", opacity: win[1] >= 0 ? 0.7 : 0 });
    out.forEach((m, k) => W.label("o" + k, String(m), [X(k + K - 1), -0.6, 0.4], { color: "c3", size: 0.32 }));
    for (let k = out.length; k < N; k++) W.label("o" + k, null, [0, 0, 0]);
    for (let k = 0; k < K + 1; k++) {
      const j = mode === "deque" ? dq[k] : undefined;
      if (j === undefined) { W.remove("q" + k); continue; }
      W.box("q" + k, { x: -3.2 + k * 0.8, y: -1.6, z: 0, sx: 0.7, sy: 0.6, sz: 0.7, color: k === 0 ? "c3" : "c2", label: String(A[j]), labelSize: 0.28, labelUp: 0,
        info: { title: k === 0 ? "Front of the deque" : "In the deque", html: "<p>Values go <b>down</b> from front (left) to back (right). The front is the window's maximum.</p>" } });
    }
    W.label("ql", mode === "deque" ? "deque: front → back" : null, [-1.6, -2.35, 0.4], { color: "muted", size: 0.26 });
  }
  function show() { api.status(`${mode === "naive" ? "rescan every window" : "monotonic deque"} · window ${K} · ${steps} step${steps === 1 ? "" : "s"} · maxima: ${out.join(" ") || "–"}\n${line}`); }
  function reset() { steps = 0; dq = []; out = []; cur = -1; look = -1; win = [-1, -1]; line = ""; for (let k = 0; k <= K; k++) W.remove("q" + k); gen = mode === "naive" ? naive() : deque(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { look = -1; draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "naive") api.explain(`${steps} looks`, `<p>Each window of ${K} was scanned from scratch, so neighbouring windows re-read ${K - 1} of the same numbers. With n = 10⁵ and k = 10⁴ that's 10⁹.</p><p>Switch to <b>monotonic deque</b> and step through it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("In once, out once", `<p>${steps} deque operations instead of ${ran.naive} looks. Every index is pushed once and removed once (from the front when it slides out, or from the back when a bigger number arrives): O(n) whatever k is.</p>`); api.done("You used a monotonic deque"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 80 : 450); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "rescan every window", value: "naive" }, { label: "monotonic deque", value: "deque" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-1.7, 0.9, 0], dist: 19.5, theta: 0, phi: 1.4, instant: true });
  api.hud(`max of every ${K} in a row · amber = window · red = being removed · blue = in the deque · green = front (the max) · numbers below = answers`);
  reset();
  api.explain("How to read this", `<p>For every window of ${K} numbers in a row, find the biggest. <b>Run all</b> with <b>rescan every window</b>, then switch to <b>monotonic deque</b>.</p>`);
});
