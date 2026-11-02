/* DSA, chapter 11: the monotonic stack.
   Daily temperatures: for each day, how many days until a warmer one?
   The "why": scanning right from every day re-reads the same days again and again: O(n²) when it's
   a long cold spell. A stack of days still WAITING for a warmer day fixes it: a new day pops every
   waiting day colder than it (it's their answer) and then waits itself. The stack's temperatures
   only go down from bottom to top (monotonic), and each day is pushed once and popped at most
   once: O(n). */
VIZ.register("ds-stack", async (api) => {
  const W = await api.world3d();
  const T = [76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 78, 72];
  const N = T.length, X = (i) => -7.2 + i * 0.9, H = (t) => 0.4 + (t - 66) * 0.32;
  let mode = "naive", gen = null, steps = 0, ans = [], stack = [], cur = -1, look = -1, running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let i = 0; i < N; i++) {
      cur = i; ans[i] = 0;
      for (let j = i + 1; j < N; j++) {
        steps++; look = j;
        if (T[j] > T[i]) { ans[i] = j - i; yield `day ${i} (${T[i]}°): day ${j} is ${T[j]}°, warmer, wait ${j - i}`; break; }
        yield `day ${i} (${T[i]}°): day ${j} is ${T[j]}°, not warmer`;
      }
      look = -1;
    }
    cur = -1;
  }
  function* mono() {
    for (let i = 0; i < N; i++) {
      cur = i;
      while (stack.length && T[stack[stack.length - 1]] < T[i]) {
        const j = stack.pop(); steps++; ans[j] = i - j; look = j;
        yield `${T[i]}° is warmer than waiting day ${j} (${T[j]}°): pop it, its answer is ${i - j}`;
      }
      look = -1; stack.push(i); steps++;
      yield `day ${i} (${T[i]}°) waits on the stack`;
    }
    for (const j of stack) ans[j] = 0;
    cur = -1;
    yield `left on the stack: never a warmer day, answer 0`;
  }
  function draw() {
    T.forEach((t, i) => {
      const onS = mode === "mono" && stack.includes(i), done = ans[i] !== undefined;
      W.box("d" + i, { x: X(i), y: H(t) / 2, z: 0, sx: 0.72, sy: H(t), sz: 0.72, color: i === cur ? "c4" : i === look ? "c1" : onS ? "c2" : done ? "c3" : "c5", glow: i === cur || i === look ? 0.4 : 0, opacity: done || onS || i === cur ? 0.95 : 0.4,
        label: `${t}°`, labelSize: 0.26, labelUp: 0.35,
        info: { title: `Day ${i}: ${t}°`, html: done ? `<p>Answer: ${ans[i] ? `wait <b>${ans[i]}</b> day${ans[i] > 1 ? "s" : ""}` : "no warmer day ever comes (0)"}.</p>` : "<p>Not answered yet.</p>" } });
      W.label("a" + i, done ? String(ans[i]) : null, [X(i), -0.45, 0.4], { color: "ink", size: 0.34 });
    });
    for (let k = 0; k < N; k++) {
      const j = mode === "mono" ? stack[k] : undefined;
      if (j === undefined) { W.remove("s" + k); continue; }
      W.box("s" + k, { x: 4.7, y: 0.35 + k * 0.62, z: 0, sx: 1.6, sy: 0.54, sz: 0.8, color: "c2", label: `day ${j}: ${T[j]}°`, labelSize: 0.24, labelUp: 0,
        info: { title: "The stack of waiting days", html: "<p>Days still waiting for a warmer day. From bottom to top the temperatures only go <b>down</b>: a warmer day would already have popped everything colder below it.</p>" } });
    }
    W.label("sl", mode === "mono" ? "stack" : null, [4.7, -0.4, 0.4], { color: "muted", size: 0.3 });
  }
  function show() { api.status(`${mode === "naive" ? "scan right from every day" : "monotonic stack"} · ${steps} step${steps === 1 ? "" : "s"}\n${line}`); }
  function reset() { steps = 0; ans = []; stack = []; cur = -1; look = -1; line = ""; for (let k = 0; k < N; k++) W.remove("s" + k); gen = mode === "naive" ? naive() : mono(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "naive") api.explain(`${steps} steps`, `<p>Each day scanned forward on its own, re-reading days others had already read. A month-long cold spell before a heatwave makes this O(n²).</p><p>Switch to <b>monotonic stack</b> and step through it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Pushed once, popped once", `<p>${steps} steps (pushes + pops) instead of ${ran.naive}. Every day goes onto the stack once and comes off at most once: at most 2n steps, O(n).</p><p>Use it for "next greater / next smaller element", spans, and histogram areas.</p>`); api.done("You used a monotonic stack"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 110 : 600); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "scan right", value: "naive" }, { label: "monotonic stack", value: "mono" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-1.2, 2, 0], dist: 21, theta: 0, phi: 1.4, instant: true });
  api.hud("days to wait for a warmer day · yellow = today · red = being resolved · blue = waiting on the stack · numbers below = answers");
  reset();
  api.explain("How to read this", `<p>For each day, how many days until it's warmer? <b>Run all</b> with <b>scan right</b>, then switch to <b>monotonic stack</b> and watch the stack on the right.</p>`);
});
