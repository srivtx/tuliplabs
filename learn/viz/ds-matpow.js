/* DSA, chapter 42: matrix exponentiation.
   F(60) mod 1000, the 60th Fibonacci number's last three digits.
   The "why": the loop a, b = b, a + b takes 60 steps, and n can be 10¹⁸. But one step of the loop is a
   multiplication by the matrix Q = [[1, 1], [1, 0]]: (F(n+1), F(n)) = Q · (F(n), F(n−1)). So n steps
   are Qⁿ, and powers can be squared (chapter 39): Q, Q², Q⁴, … Q³², then multiply the ones the binary
   digits of 60 = 111100 ask for. 8 matrix products instead of 60 steps; about 90 for 10¹⁸. Any
   linear recurrence works the same way with a bigger matrix. */
VIZ.register("ds-matpow", async (api) => {
  const W = await api.world3d();
  const N = 60, MOD = 1000, BITS = 6;
  let mode = "loop", gen = null, ops = 0, vals = [], pw = [], res = null, curBit = -1, used = [], running = false, ran = {}, reached = false, line = "";
  const mul = (a, b) => [[(a[0][0] * b[0][0] + a[0][1] * b[1][0]) % MOD, (a[0][0] * b[0][1] + a[0][1] * b[1][1]) % MOD], [(a[1][0] * b[0][0] + a[1][1] * b[1][0]) % MOD, (a[1][0] * b[0][1] + a[1][1] * b[1][1]) % MOD]];
  function* loop() {
    let a = 0, b = 1; vals = [0];
    yield "F(0) = 0, F(1) = 1";
    for (let i = 1; i <= N; i++) { ops++; [a, b] = [b, (a + b) % MOD]; vals.push(a); yield `step ${i}: F(${i}) = ${i > 1 ? `${vals[i - 2]} + ${vals[i - 1]} mod ${MOD} = ` : ""}${a}`; }
    yield `F(${N}) mod ${MOD} = ${vals[N]}, after ${ops} steps`;
  }
  function* fast() {
    pw = [[[1, 1], [1, 0]]]; curBit = 0;
    yield "Q = [[1, 1], [1, 0]]: multiplying by Q does one Fibonacci step";
    for (let k = 1; k < BITS; k++) { ops++; pw.push(mul(pw[k - 1], pw[k - 1])); curBit = k; yield `square: Q^${2 ** k} = (Q^${2 ** (k - 1)})². Top-right corner = F(${2 ** k}) mod ${MOD} = ${pw[k][0][1]}`; }
    curBit = -1;
    yield `${N} in binary is ${N.toString(2)} = 32 + 16 + 8 + 4. Multiply those powers`;
    for (let k = 0; k < BITS; k++) {
      if (!((N >> k) & 1)) continue;
      curBit = k; used.push(k);
      if (!res) { res = pw[k]; yield `start with Q^${2 ** k}`; continue; }
      ops++; res = mul(res, pw[k]);
      yield `× Q^${2 ** k}: now holding Q^${used.reduce((s, b) => s + 2 ** b, 0)}`;
    }
    curBit = -1;
    yield `Q^${N}: the top-right corner is F(${N}) mod ${MOD} = ${res[0][1]}, after ${ops} matrix products`;
  }
  function mat(key, m, cx, cy, s, vis, color, title) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const v = m ? m[i][j] : null;
      W.box(`${key}${i}${j}`, { x: cx + (j - 0.5) * s, y: cy - (i - 0.5) * s, z: 0, sx: s * 0.92, sy: s * 0.92, sz: 0.3, visible: vis, color: i === 0 && j === 1 && v !== null ? color : v !== null ? "c2" : "c5", opacity: v !== null ? 0.9 : 0.25,
        label: v !== null ? String(v) : "", labelSize: s * 0.36, labelUp: 0, info: { title, html: `<p>${i === 0 && j === 1 ? "Top-right corner: the Fibonacci number." : "Part of the matrix."}</p>` } });
    }
  }
  function draw() {
    const lp = mode === "loop";
    for (let i = 0; i <= N; i++) {
      const r = Math.floor(i / 11), c = i % 11, v = vals[i], hot = lp && i === vals.length - 1;
      W.box("v" + i, { x: -5 + c, y: 3.2 - r * 0.8, z: 0, sx: 0.88, sy: 0.68, sz: 0.3, visible: lp, color: hot ? "c1" : i === N && v !== undefined ? "c3" : v !== undefined ? "c2" : "c5", glow: hot ? 0.35 : 0, opacity: v !== undefined ? 0.92 : 0.25,
        label: v !== undefined ? String(v) : "", labelSize: 0.22, labelUp: 0, info: { title: `F(${i}) mod ${MOD}`, html: `<p>${v !== undefined ? v : "not computed yet"}</p>` } });
    }
    for (let k = 0; k < BITS; k++) {
      const x = 4.6 - k * 1.85, bit = (N >> k) & 1, hot = k === curBit, u = used.includes(k);
      mat("q" + k + "_", pw[k] || null, x, 2.3, 0.78, !lp, hot ? "c1" : u ? "c4" : "c3", `Q^${2 ** k}`);
      W.label("ql" + k, lp ? "" : `Q^${2 ** k}`, [x, 3.4, 0.3], { color: hot ? "c1" : "muted", size: 0.24 });
      W.box("b" + k, { x, y: 0.7, z: 0, sx: 0.6, sy: 0.6, sz: 0.3, visible: !lp, color: bit ? "c3" : "c5", opacity: bit ? 0.9 : 0.4, label: String(bit), labelSize: 0.28, labelUp: 0, info: { title: `Bit for ${2 ** k}`, html: `<p>${bit ? `${2 ** k} is part of ${N}: use Q^${2 ** k}.` : `${2 ** k} is not part of ${N}.`}</p>` } });
    }
    W.label("bl", lp ? "" : "bits", [-5.8, 0.7, 0.3], { color: "muted", size: 0.22 });
    mat("r_", lp ? null : res, 0, -1.3, 1.0, !lp && !!res, "c3", "The product so far");
  }
  function show() { api.status(`${mode === "loop" ? "loop a, b = b, a + b" : "square the matrix"} · ${ops} ${mode === "loop" ? "steps" : "matrix products"}\n${line}`); }
  function reset() { ops = 0; vals = []; pw = []; res = null; curBit = -1; used = []; line = ""; gen = mode === "loop" ? loop() : fast(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "loop") api.explain(`${ops} steps`, `<p>One step per Fibonacci number. For n = 10¹⁸, that's far too many.</p><p>Switch to <b>square the matrix</b> and run it.</p>`);
    else if (ran.loop && !reached) { reached = true; api.explain("A step is a matrix", `<p>${ops} matrix products against ${ran.loop} steps, same ${res[0][1]}. One loop step is "multiply by Q", so n steps are Qⁿ, and powers square (chapter 39).</p><p>A k-term linear recurrence uses a k × k matrix: O(k³ log n).</p>`); api.done("You jumped a recurrence with matrix powers"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "loop" ? 110 : 1200); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "loop 60 steps", value: "loop" }, { label: "square the matrix", value: "fast" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.8, 0], dist: 18.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`F(${N}) mod ${MOD} · loop: one box per Fibonacci number · matrices: Q, Q², Q⁴, … by squaring · green bits = ${N} in binary · amber = powers used · the top-right corner holds the answer`);
  reset();
  api.explain("How to read this", `<p>Find the 60th Fibonacci number mod ${MOD}. <b>Run all</b> with <b>loop 60 steps</b>, then with <b>square the matrix</b>.</p>`);
});
