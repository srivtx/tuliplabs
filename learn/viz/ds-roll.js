/* DSA, chapter 49: rolling hashes.
   A 24-letter text, a 5-letter pattern, and a hash that turns each 5-letter window into a number.
   The "why": comparing a number is one step, but working out each window's hash from scratch costs
   m steps per window, so nothing is saved. A polynomial hash rolls: drop the left letter's share,
   shift everything up by the base, add the new letter. One O(1) update per window, O(n + m) in all.
   The modulus here is tiny (61) so a collision shows up: equal hashes, different text. That's why
   a match is double-checked, or a huge modulus (or two) is used. */
VIZ.register("ds-roll", async (api) => {
  const W = await api.world3d();
  const T = "ABRACADABRACABRADABRACAD", P = "ABRAC", n = T.length, m = P.length, B = 31, M = 61, SP = 0.5;
  const code = (c) => c.charCodeAt(0) - 64;
  let PW = 1; for (let i = 1; i < m; i++) PW = (PW * B) % M;
  const hashOf = (s) => [...s].reduce((h, c) => (h * B + code(c)) % M, 0);
  const HP = hashOf(P);
  let mode = "naive", gen = null, ops = 0, s = -1, h = 0, hits = [], fake = [], state = "", running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (s = 0; s + m <= n; s++) {
      h = 0; for (let j = 0; j < m; j++) { h = (h * B + code(T[s + j])) % M; ops++; }
      yield* check(`window ${s}: hash all ${m} letters from scratch = ${h}`);
    }
    s = -1; state = ""; yield `done: ${ops} letter steps, matches at ${hits.join(", ")}${fake.length ? `, ${fake.length} false alarm${fake.length > 1 ? "s" : ""}` : ""}`;
  }
  function* roll() {
    s = 0; h = 0; for (let j = 0; j < m; j++) { h = (h * B + code(T[j])) % M; ops++; }
    yield* check(`window 0: hash the first ${m} letters once = ${h}`);
    for (s = 1; s + m <= n; s++) {
      const out = T[s - 1], inn = T[s + m - 1];
      h = ((h - code(out) * PW % M + M) * B + code(inn)) % M; ops += 2;
      yield* check(`window ${s}: drop ${out}, shift by ${B}, add ${inn} = ${h}`);
    }
    s = -1; state = ""; yield `done: ${ops} letter steps, matches at ${hits.join(", ")}${fake.length ? `, ${fake.length} false alarm${fake.length > 1 ? "s" : ""}` : ""}`;
  }
  function* check(msg) {
    if (h !== HP) { state = "miss"; yield `${msg} ≠ ${HP}, skip`; return; }
    const real = T.slice(s, s + m) === P; ops += m;
    if (real) { hits.push(s); state = "hit"; yield `${msg} = pattern's hash ${HP}. Compare letters to be sure: a real match`; }
    else { fake.push(s); state = "fake"; yield `${msg} = pattern's hash ${HP}, but the letters say ${T.slice(s, s + m)}: a collision, a false alarm`; }
  }
  function draw() {
    const x0 = (-n / 2 + 0.5) * SP;
    for (let i = 0; i < n; i++) {
      const inW = s >= 0 && i >= s && i < s + m, hit = hits.some((q) => i >= q && i < q + m), bad = fake.some((q) => i >= q && i < q + m);
      const col = inW ? (state === "hit" ? "c3" : state === "fake" ? "c1" : "c4") : hit ? "c3" : bad ? "c1" : "c5";
      W.box("t" + i, { x: x0 + i * SP, y: 0.6, z: 0, sx: SP - 0.06, sy: 0.55, sz: 0.3, color: col, glow: inW ? 0.35 : 0, opacity: inW || hit || bad ? 0.95 : 0.75,
        label: T[i], labelSize: 0.22, labelUp: 0, info: { title: `Letter ${i}: ${T[i]}`, html: `<p>Worth ${code(T[i])} in the hash (A = 1, B = 2…).</p><p>A window's hash is its letters read as a number in base ${B}, kept small with mod ${M}.</p>` } });
    }
    const wx = s >= 0 ? x0 + (s + (m - 1) / 2) * SP : 0;
    W.box("win", { x: wx, y: -0.45, z: 0, sx: m * SP - 0.06, sy: 0.6, sz: 0.3, visible: s >= 0, color: state === "hit" ? "c3" : state === "fake" ? "c1" : "c2", opacity: 0.9,
      label: s >= 0 ? `hash ${h}` : "", labelSize: 0.22, labelUp: 0, info: { title: "This window's hash", html: `<p>Equal hashes don't prove equal text: with only ${M} possible values, different windows must sometimes share one. Real code uses a modulus near 2⁶¹ (or two hashes), so a collision is a one-in-billions event.</p>` } });
    W.box("pat", { x: 0, y: -1.5, z: 0, sx: 2.4, sy: 0.6, sz: 0.3, color: "c2", opacity: 0.6, label: `${P}: ${HP}`, labelSize: 0.22, labelUp: 0, info: { title: "The pattern's hash", html: `<p>Worked out once. Every window is compared against this one number.</p>` } });
  }
  function show() { api.status(`${mode === "naive" ? "hash every window from scratch" : "rolling hash"} · ${ops} letter steps${hits.length ? ` · matches at ${hits.join(", ")}` : ""}${fake.length ? ` · false alarms at ${fake.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; s = -1; h = 0; hits = []; fake = []; state = ""; line = ""; gen = mode === "naive" ? naive() : roll(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} letter steps`, `<p>A hash is one number to compare, but every window was hashed from scratch: m letters each, so (n − m + 1) × m in all. No better than comparing letters.</p><p>Switch to <b>rolling hash</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Roll, don't recompute", `<p>${ops} letter steps against ${ran.naive}. Each new window's hash comes from the last one: take away the leaving letter × ${B}^${m - 1}, multiply by ${B}, add the new letter.</p><p>Red windows are collisions: same hash, different letters. Check the letters on a hash match, or use a huge modulus.</p>`); api.done("You rolled a hash"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "from scratch", value: "naive" }, { label: "rolling hash", value: "roll" }], mode, (md) => { if (running) return; mode = md; reset(); });
  W.camera({ target: [0, -0.3, 0], dist: 13, theta: 0, phi: 1.5, instant: true });
  api.hud(`top: the text · amber = the current window · below: its hash (mod ${M}) · green = a real match · red = a collision`);
  reset();
  api.explain("How to read this", `<p>Find "${P}" by comparing hashes. <b>Run all</b> with <b>from scratch</b>, then with <b>rolling hash</b>.</p>`);
});
