/* DSA, chapter 37: the greatest common divisor, by Euclid's algorithm.
   A 336 × 210 floor must be covered with equal square tiles, as large as possible. The tile side is
   gcd(336, 210).
   The "why": trying every size downwards from 210 checks 169 sizes before 42 works. Euclid notices
   that any tile fitting both sides also fits their difference: cut the biggest squares you can off
   the rectangle, and the leftover strip has the same answer. gcd(a, b) = gcd(b, a mod b). The numbers
   shrink at least by half every two steps, so it takes O(log n) steps, even for 18-digit numbers. */
VIZ.register("ds-gcd", async (api) => {
  const W = await api.world3d();
  const A = 336, B = 210, SC = 0.024, X0 = -4.0, Y0 = -2.7;
  let mode = "brute", gen = null, steps = 0, squares = [], cand = 0, found = 0, tiles = false, running = false, ran = {}, reached = false, line = "";
  function* brute() {
    for (let d = Math.min(A, B); d >= 1; d--) {
      steps++; cand = d;
      if (A % d === 0 && B % d === 0) { found = d; yield `${d}: ${A} % ${d} = 0 and ${B} % ${d} = 0. The biggest tile is ${d}`; break; }
      yield `${d}: ${A % d ? `${A} % ${d} = ${A % d}` : `${B} % ${d} = ${B % d}`}, doesn't fit. Try ${d - 1}`;
    }
    tiles = true; cand = 0;
    yield `${(A / found) * (B / found)} tiles of ${found} × ${found}`;
  }
  function* euclid() {
    let x = 0, y = 0, w = A, h = B;
    while (w && h) {
      steps++;
      if (w >= h) {
        const k = Math.floor(w / h);
        for (let i = 0; i < k; i++) squares.push([x + i * h, y, h]);
        yield `gcd(${w}, ${h}): cut ${k} square${k > 1 ? "s" : ""} of ${h} off the ${w} side. ${w} mod ${h} = ${w % h} left`;
        x += k * h; w -= k * h;
      } else {
        const k = Math.floor(h / w);
        for (let i = 0; i < k; i++) squares.push([x, y + i * w, w]);
        yield `gcd(${h}, ${w}): cut ${k} square${k > 1 ? "s" : ""} of ${w} off the ${h} side. ${h} mod ${w} = ${h % w} left`;
        y += k * w; h -= k * w;
      }
    }
    found = squares.at(-1)[2]; tiles = true;
    yield `nothing left over: gcd = ${found}. Every square splits into ${found} × ${found} tiles`;
  }
  function draw() {
    W.box("floor", { x: X0 + (A * SC) / 2, y: Y0 + (B * SC) / 2, z: -0.1, sx: A * SC, sy: B * SC, sz: 0.1, color: "c5", opacity: 0.35, info: { title: `${A} × ${B} floor`, html: "<p>Cover it with equal squares, as big as possible.</p>" } });
    W.label("la", String(A), [X0 + (A * SC) / 2, Y0 - 0.4, 0.2], { color: "muted", size: 0.26 });
    W.label("lb", String(B), [X0 - 0.45, Y0 + (B * SC) / 2, 0.2], { color: "muted", size: 0.26 });
    const cols = ["c2", "c4", "c3", "c1", "c1"], sizes = [...new Set(squares.map((s) => s[2]))];
    for (let i = 0; i < 8; i++) {
      const s = squares[i];
      W.box("sq" + i, { x: s ? X0 + (s[0] + s[2] / 2) * SC : 0, y: s ? Y0 + (s[1] + s[2] / 2) * SC : 0, z: 0.1, sx: s ? s[2] * SC - 0.06 : 0.1, sy: s ? s[2] * SC - 0.06 : 0.1, sz: 0.2, visible: !!s && mode === "euclid", color: s ? cols[sizes.indexOf(s[2])] : "c2", opacity: 0.85,
        label: s ? String(s[2]) : "", labelSize: 0.26, labelUp: 0, info: { title: s ? `${s[2]} × ${s[2]} square` : "", html: "<p>The biggest square that fits the rectangle left over.</p>" } });
    }
    W.box("cand", { x: X0 + (cand * SC) / 2, y: Y0 + (cand * SC) / 2, z: 0.15, sx: cand * SC, sy: cand * SC, sz: 0.2, visible: mode === "brute" && cand > 0, color: "c1", opacity: 0.5, label: String(cand), labelSize: 0.26, labelUp: 0, info: { title: "Trying this tile", html: "<p>Does it divide both sides?</p>" } });
    for (let i = 0; i < 40; i++) {
      const r = Math.floor(i / 8), c = i % 8, g = 42;
      W.box("t" + i, { x: X0 + (c * g + g / 2) * SC, y: Y0 + (r * g + g / 2) * SC, z: 0.25, sx: g * SC - 0.08, sy: g * SC - 0.08, sz: 0.05, visible: tiles, color: "c3", opacity: 0.35, info: { title: "42 × 42 tile", html: "<p>gcd(336, 210) = 42: 8 × 5 tiles.</p>" } });
    }
  }
  function show() { api.status(`${mode === "brute" ? "try every size downwards" : "Euclid: cut the biggest squares"} · ${steps} step${steps === 1 ? "" : "s"}${found ? ` · gcd ${found}` : ""}\n${line}`); }
  function reset() { steps = 0; squares = []; cand = 0; found = 0; tiles = false; line = ""; gen = mode === "brute" ? brute() : euclid(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "brute") api.explain(`${steps} sizes tried`, `<p>Each size was checked against both sides. For numbers near 10¹⁸ this would take forever.</p><p>Switch to <b>Euclid</b> and run it.</p>`);
    else if (ran.brute && !reached) { reached = true; api.explain("gcd(a, b) = gcd(b, a mod b)", `<p>${steps} steps against ${ran.brute}. A tile that fits both sides also fits what's left after cutting squares off, so the problem keeps shrinking until nothing is left.</p><p>The numbers at least halve every two steps: O(log n). Python has it built in: <code>math.gcd</code>.</p>`); api.done("You found a gcd with Euclid's algorithm"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "brute" ? 45 : 1100); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "try every size", value: "brute" }, { label: "Euclid", value: "euclid" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0.1, -0.2, 0], dist: 13, theta: 0, phi: 1.5, instant: true });
  api.hud(`a ${A} × ${B} floor · red = the tile size being tried · coloured squares = cut off by Euclid · green grid = the final tiles`);
  reset();
  api.explain("How to read this", `<p>Cover a ${A} × ${B} floor with equal square tiles, as big as possible. <b>Run all</b> with <b>try every size</b>, then with <b>Euclid</b>.</p>`);
});
