/* DSA, chapter 39: fast exponentiation (square and multiply).
   Compute 3¹⁰⁰ mod 997.
   The "why": multiplying by 3 a hundred times is 100 multiplications, and exponents in contests are
   up to 10¹⁸. But squaring doubles the exponent: 3 → 3² → 3⁴ → … → 3⁶⁴ in 6 squarings. Write 100 in
   binary, 1100100 = 64 + 32 + 4, and multiply together only the powers whose bit is 1. That's
   O(log e) multiplications: about 120 for 10¹⁸. Reduce mod 997 after every step so the numbers stay
   small. */
VIZ.register("ds-fastpow", async (api) => {
  const W = await api.world3d();
  const A = 3, E = 100, M = 997, BITS = 7;
  let mode = "slow", gen = null, ops = 0, prods = [], pw = [], res = null, curBit = -1, used = [], running = false, ran = {}, reached = false, line = "";
  function* slow() {
    let r = 1;
    for (let i = 1; i <= E; i++) {
      ops++; const was = r; r = (r * A) % M; prods.push(r);
      yield `multiply ${i}: ${was} × ${A} = ${was * A}${was * A >= M ? `, mod ${M} = ${r}` : ""}`;
    }
    res = r;
    yield `3^${E} mod ${M} = ${r}, after ${ops} multiplications`;
  }
  function* fast() {
    pw = [A]; curBit = 0;
    yield `3^1 = 3. Now square to double the exponent`;
    for (let k = 1; k < BITS; k++) {
      ops++; const was = pw[k - 1]; pw.push((was * was) % M); curBit = k;
      yield `square: 3^${2 ** k} = ${was}² = ${was * was} mod ${M} = ${pw[k]}`;
    }
    curBit = -1; res = 1;
    yield `${E} in binary is ${E.toString(2)} = 64 + 32 + 4. Multiply only those powers`;
    for (let k = 0; k < BITS; k++) {
      if (!((E >> k) & 1)) continue;
      curBit = k; used.push(k);
      if (res === 1 && used.length === 1) { res = pw[k]; yield `start with 3^${2 ** k} = ${pw[k]}`; continue; }
      ops++; const was = res; res = (res * pw[k]) % M;
      yield `× 3^${2 ** k}: ${was} × ${pw[k]} = ${was * pw[k]} mod ${M} = ${res}`;
    }
    curBit = -1;
    yield `3^${E} mod ${M} = ${res}, after ${ops} multiplications`;
  }
  function draw() {
    const sl = mode === "slow", fa = !sl;
    for (let i = 0; i < E; i++) {
      const r = Math.floor(i / 10), c = i % 10, v = prods[i], hot = i === prods.length - 1;
      W.box("p" + i, { x: -4.5 + c, y: 3.4 - r * 0.78, z: 0, sx: 0.88, sy: 0.68, sz: 0.3, visible: sl, color: hot ? "c1" : v !== undefined ? "c2" : "c5", glow: hot ? 0.35 : 0, opacity: v !== undefined ? 0.92 : 0.25,
        label: v !== undefined ? String(v) : "", labelSize: 0.22, labelUp: 0, info: { title: `Multiplication ${i + 1}`, html: `<p>3^${i + 1} mod ${M}${v !== undefined ? ` = ${v}` : ""}.</p>` } });
    }
    for (let k = 0; k < BITS; k++) {
      const x = 4.2 - k * 1.4, bit = (E >> k) & 1, v = pw[k], hot = k === curBit, u = used.includes(k);
      W.box("w" + k, { x, y: 1.6, z: 0, sx: 1.2, sy: 0.9, sz: 0.4, visible: fa, color: hot ? "c1" : u ? "c4" : v !== undefined ? "c2" : "c5", glow: hot ? 0.35 : 0, opacity: v !== undefined ? 0.92 : 0.25,
        label: v !== undefined ? String(v) : "", labelSize: 0.28, labelUp: 0, info: { title: `3^${2 ** k} mod ${M}`, html: `<p>${v !== undefined ? `= ${v}, ` : ""}made by squaring the box to its right.</p>` } });
      W.label("we" + k, fa ? `3^${2 ** k}` : "", [x, 2.45, 0.3], { color: "muted", size: 0.24 });
      W.box("b" + k, { x, y: 0.2, z: 0, sx: 0.7, sy: 0.7, sz: 0.3, visible: fa, color: bit ? "c3" : "c5", opacity: bit ? 0.9 : 0.4, label: String(bit), labelSize: 0.3, labelUp: 0, info: { title: `Bit for ${2 ** k}`, html: `<p>${bit ? `${2 ** k} is part of ${E}: multiply this power in.` : `${2 ** k} is not part of ${E}: skip it.`}</p>` } });
    }
    W.label("bl", fa ? `${E} in binary` : "", [-5.9, 0.2, 0.3], { color: "muted", size: 0.24 });
    W.box("res", { x: 0, y: -1.5, z: 0, sx: 2.2, sy: 0.9, sz: 0.4, visible: res !== null && fa, color: "c3", opacity: 0.92, label: res !== null ? `= ${res}` : "", labelSize: 0.32, labelUp: 0, info: { title: "The answer so far", html: `<p>3^${E} mod ${M}.</p>` } });
  }
  function show() { api.status(`${mode === "slow" ? "multiply by 3, 100 times" : "square and multiply"} · ${ops} multiplication${ops === 1 ? "" : "s"}\n${line}`); }
  function reset() { ops = 0; prods = []; pw = []; res = null; curBit = -1; used = []; line = ""; gen = mode === "slow" ? slow() : fast(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "slow") api.explain(`${ops} multiplications`, `<p>One per unit of the exponent. With an exponent of 10¹⁸ that would take thousands of years.</p><p>Switch to <b>square and multiply</b> and run it.</p>`);
    else if (ran.slow && !reached) { reached = true; api.explain("Square, then pick by the bits", `<p>${ops} multiplications against ${ran.slow}, same answer ${res}. Squaring doubles the exponent, so 6 squarings reach 3⁶⁴; the binary digits of 100 say which powers to multiply together.</p><p>O(log e): about 120 multiplications for e = 10¹⁸. In Python it's built in: <code>pow(3, 100, 997)</code>.</p>`); api.done("You computed a power by squaring"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "slow" ? 90 : 1100); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "multiply 100 times", value: "slow" }, { label: "square and multiply", value: "fast" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.6, 0], dist: 15, theta: 0, phi: 1.5, instant: true });
  api.hud(`3^${E} mod ${M} · each box is one multiplication's result · red = the newest · top row: 3, 3², 3⁴, … by squaring · green bits = the binary digits of ${E} · amber = powers used`);
  reset();
  api.explain("How to read this", `<p>Work out 3^${E} mod ${M}. <b>Run all</b> with <b>multiply 100 times</b>, then with <b>square and multiply</b>.</p>`);
});
