/* DSA, chapter 10: binary search on the answer.
   Koko eats bananas at k per hour from piles [30, 11, 23, 4, 20]; a pile of p takes ceil(p / k)
   hours. What's the slowest speed that finishes within 6 hours?
   The "why": we can't search the piles, but we can search the ANSWER. Checking one speed is easy
   (add up the hours), and the check is monotone: if speed k is fast enough, every faster speed is
   too. So the speeds 1..30 go "too slow, too slow, …, fine, fine", and binary search finds the
   first "fine" in log₂ 30 ≈ 5 checks instead of trying every speed. */
VIZ.register("ds-answer", async (api) => {
  const W = await api.world3d();
  const P = [30, 11, 23, 4, 20], H = 6, M = 30;
  const hours = (k) => P.reduce((s, p) => s + Math.ceil(p / k), 0);
  const X = (k) => -7.6 + (k - 1) * 0.52, Y = (h) => Math.min(h, 16) * 0.3 + 0.15;
  let mode = "linear", gen = null, checks = 0, tried = {}, lo = 1, hi = M, cur = 0, answer = 0, running = false, ran = {}, reached = false, line = "";
  function* linear() {
    for (let k = 1; k <= M; k++) {
      checks++; cur = k; tried[k] = hours(k);
      if (tried[k] <= H) { answer = k; yield `speed ${k}: ${tried[k]} hours ≤ ${H} ✓ the first one that works`; return; }
      yield `speed ${k}: ${tried[k]} hours, too slow`;
    }
  }
  function* bin() {
    lo = 1; hi = M;
    while (lo < hi) {
      const mid = (lo + hi) >> 1; checks++; cur = mid; tried[mid] = hours(mid);
      if (tried[mid] <= H) { yield `speed ${mid}: ${tried[mid]} hours ≤ ${H}, fast enough, so try slower: answer is ${lo}..${mid}`; hi = mid; }
      else { yield `speed ${mid}: ${tried[mid]} hours > ${H}, too slow, so everything slower is too: answer is ${mid + 1}..${hi}`; lo = mid + 1; }
    }
    answer = lo; cur = lo;
    yield `lo = hi = ${lo}: the slowest speed that works`;
  }
  function draw() {
    for (let k = 1; k <= M; k++) {
      const h = tried[k], seen = h !== undefined, ok = seen && h <= H, out = mode === "bin" && !answer && (k < lo || k > hi);
      W.box("k" + k, { x: X(k), y: seen ? Y(h) / 2 : 0.05, z: 0, sx: 0.42, sy: seen ? Y(h) : 0.1, sz: 0.5, color: k === answer ? "c3" : k === cur ? "c4" : seen ? (ok ? "ok" : "bad") : "c5", glow: k === cur || k === answer ? 0.4 : 0, opacity: out ? 0.15 : seen ? 0.95 : 0.4,
        label: k === cur || k === answer ? `${k}/h\n${h}h` : "", labelSize: 0.26, labelUp: 0.4,
        info: { title: `Speed ${k} bananas per hour`, html: seen ? `<p>${P.map((p) => `⌈${p}/${k}⌉`).join(" + ")} = <b>${h} hours</b>. ${h <= H ? "Fast enough." : "Too slow."}</p>` : "<p>Not checked yet. Binary search only checks a few speeds and deduces the rest.</p>" } });
    }
    W.box("limit", { x: X(15.5), y: Y(H), z: 0, sx: M * 0.52 + 0.3, sy: 0.04, sz: 0.9, color: "c4", opacity: 0.55,
      info: { title: `The limit: ${H} hours`, html: "<p>Speeds whose bar stays under this line finish in time. The bars only go down as the speed goes up: that's the monotone shape binary search needs.</p>" } });
  }
  function show() { api.status(`${mode === "linear" ? "try every speed" : "binary search on the speed"} · ${checks} check${checks === 1 ? "" : "s"}${mode === "bin" && !answer ? ` · answer is in ${lo}..${hi}` : ""}\n${line}`); }
  function reset() { checks = 0; tried = {}; lo = 1; hi = M; cur = 0; answer = 0; line = ""; gen = mode === "linear" ? linear() : bin(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show();
    if (mode === "linear" && answer) { finish(); return false; }
    return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = checks;
    if (mode === "linear") api.explain(`${checks} checks`, `<p>Every speed from 1 up got its hours added up. If the piles held 10⁹ bananas, that could be 10⁹ checks, each costing n.</p><p>Switch to <b>binary search</b> and run it.</p>`);
    else if (ran.linear && !reached) { reached = true; api.explain("Search the answer, not the data", `<p>${checks} checks instead of ${ran.linear}. Faster is never worse, so the speeds go ✗ ✗ ✗ … ✓ ✓ ✓, and binary search finds the first ✓. Cost: O(n · log(max answer)).</p><p>Spot it by the wording: "the <b>minimum</b> X such that it's possible", or "the <b>maximum</b> X".</p>`); api.done("You binary searched an answer"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "linear" ? 110 : 900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "try every speed", value: "linear" }, { label: "binary search", value: "bin" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 2.3, 0], dist: 23.5, theta: 0, phi: 1.38, instant: true });
  api.hud(`piles ${P.join(", ")} · finish in ${H} hours · bar = hours at that speed · amber line = ${H} hours`);
  reset();
  api.explain("How to read this", `<p>Each slot is a possible eating speed, 1 to ${M} bananas an hour. Checking a speed draws its bar: the hours it would take. Find the <b>slowest</b> speed that finishes within ${H} hours.</p><p><b>Run all</b> with <b>try every speed</b>, then switch.</p>`);
});
