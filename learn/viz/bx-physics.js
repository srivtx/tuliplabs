/* Build your own X, chapter 12: a physics engine.
   Balls in a box and a spring-mass chain, stepped by a fixed-timestep game loop.
   The "why": explicit Euler pumps energy into springs until they explode; Verlet at the same dt doesn't. */
VIZ.register("bx-physics", async (api) => {
  const W = await api.world3d();
  const T = W.THREE;
  W.camera({ target: [0, 2.8, 0], dist: 15.5, theta: 0.32, phi: 1.32, instant: true });
  const BX = 4, BZ = 2, BY = 6, G = 9.8, R = 0.3;

  // ---- box wireframe
  const cx = [-BX, BX], cy = [0, BY], cz = [-BZ, BZ];
  let n = 0;
  for (const y of cy) for (const z of cz) W.line("bx" + n++, [-BX, y, z], [BX, y, z], { color: "line" });
  for (const x of cx) for (const z of cz) W.line("bx" + n++, [x, 0, z], [x, BY, z], { color: "line" });
  for (const x of cx) for (const y of cy) W.line("bx" + n++, [x, y, -BZ], [x, y, BZ], { color: "line" });
  W.box("floor", { x: 0, y: -0.05, z: 0, sx: BX * 2, sy: 0.1, sz: BZ * 2, color: "c5", opacity: 0.35,
    info: { title: "The ground", html: "<p>Collision with the ground has two halves. <b>Detection</b>: is the ball's bottom below 0 (<code>y − r &lt; 0</code>)? <b>Response</b>: push it back out to <code>y = r</code> and flip its vertical velocity, scaled by the <b>restitution</b> e.</p><p>Why push it out? If you only flip the velocity, a ball that sank in deep can stay stuck below the floor, flipping every step and jittering.</p>" } });

  // ---- the energy chart drawn on the back wall
  const HIST = 260;
  const chartGeo = new T.BufferGeometry();
  chartGeo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(HIST * 3), 3));
  const chart = new T.Line(chartGeo, new T.LineBasicMaterial({ color: new T.Color(api.color("c1")) }));
  W.scene.add(chart);
  W.line("base", [-BX + 0.2, 1, -BZ + 0.02], [BX - 0.2, 1, -BZ + 0.02], { color: "muted", opacity: 0.6 });
  W.label("chartL", "energy drift (flat = conserved)", [-BX + 1.9, 0.55, -BZ + 0.05], { color: "muted", size: 0.26 });
  const hist = [];

  // ---- state
  let scene = "chain", integ = "euler", dt = 0.006, e = 1, K = 40, paused = false;
  let P = [], springs = [], t = 0, E0 = 0, S = 1, sel = -1, blewDt = null, boom = false, maxDrift = 0;

  function init() {
    P = []; springs = []; t = 0; boom = false; maxDrift = 0; hist.length = 0;
    for (let i = 0; i < 8; i++) W.remove("b" + i);
    W.remove("anchor");
    for (let i = 0; i < 8; i++) W.unline("s" + i);
    if (scene === "chain") {
      W.box("anchor", { x: 0, y: BY - 0.1, z: 0, s: 0.35, color: "c5", instant: true,
        info: { title: "Anchor", html: "<p>A fixed point: the top spring is tied here. It never moves, so it has no velocity and isn't integrated.</p>" } });
      for (let i = 1; i <= 5; i++) P.push({ x: [0.7 * i, BY - 0.4, 0], v: [0, 0, 0], a: [0, 0, 0], m: 1 });
      for (let i = 0; i < 5; i++) springs.push({ a: i - 1, b: i, L: 0.7 });
    } else {
      const start = [[-3, 4.5, 0, 2, 0, 1], [-1.5, 5, 1, -1, 1, 0], [0, 3, -1, 3, 0, 2], [1.5, 5.2, 0.5, -2, -1, 1], [3, 2, 0, -3, 2, -1], [-2, 1.2, -1, 1, 3, 0], [0.5, 1.5, 1, 0, 4, -2], [2.5, 4, -1, 1, 0, 2]];
      for (const s of start) P.push({ x: s.slice(0, 3), v: s.slice(3), a: [0, 0, 0], m: 1 });
    }
    P.forEach((p) => (p.a = accel(P.indexOf(p))));
    S = P.length * G * BY;
    E0 = energy();
    draw();
  }
  const anchorPos = [0, BY - 0.1, 0];
  const posOf = (i) => (i < 0 ? anchorPos : P[i].x);
  function springForce(s) {
    const a = posOf(s.a), b = posOf(s.b);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d) || 1e-9;
    const f = -K * (len - s.L); // Hooke: pull back in proportion to the stretch
    return { onB: d.map((c) => (f * c) / len), stretch: len - s.L };
  }
  function forces(i) {
    const list = [{ name: "gravity", f: [0, -P[i].m * G, 0] }];
    for (const s of springs) {
      if (s.b === i) { const r = springForce(s); list.push({ name: s.a < 0 ? "spring to anchor" : `spring to ball ${s.a}`, f: r.onB, stretch: r.stretch }); }
      if (s.a === i) { const r = springForce(s); list.push({ name: `spring to ball ${s.b}`, f: r.onB.map((c) => -c), stretch: r.stretch }); }
    }
    return list;
  }
  function accel(i) {
    const tot = [0, 0, 0];
    for (const f of forces(i)) for (let k = 0; k < 3; k++) tot[k] += f.f[k];
    return tot.map((c) => c / P[i].m);
  }
  function energy() {
    let E = 0;
    for (const p of P) E += 0.5 * p.m * (p.v[0] ** 2 + p.v[1] ** 2 + p.v[2] ** 2) + p.m * G * p.x[1];
    for (const s of springs) { const r = springForce(s); E += 0.5 * K * r.stretch ** 2; }
    return E;
  }
  // ---- the three integrators, exactly as in the chapter
  function step(h) {
    if (integ === "euler") {
      const acc = P.map((_, i) => accel(i));
      P.forEach((p, i) => { for (let k = 0; k < 3; k++) { p.x[k] += p.v[k] * h; p.v[k] += acc[i][k] * h; } });
    } else if (integ === "semi") {
      const acc = P.map((_, i) => accel(i));
      P.forEach((p, i) => { for (let k = 0; k < 3; k++) { p.v[k] += acc[i][k] * h; p.x[k] += p.v[k] * h; } });
    } else {
      P.forEach((p) => { for (let k = 0; k < 3; k++) p.x[k] += p.v[k] * h + 0.5 * p.a[k] * h * h; });
      const acc = P.map((_, i) => accel(i));
      P.forEach((p, i) => { for (let k = 0; k < 3; k++) p.v[k] += 0.5 * (p.a[k] + acc[i][k]) * h; p.a = acc[i]; });
    }
    collide();
    t += h;
  }
  function collide() {
    const lim = [[-BX + R, BX - R], [R, BY - R], [-BZ + R, BZ - R]];
    for (const p of P) for (let k = 0; k < 3; k++) {
      if (p.x[k] < lim[k][0]) { p.x[k] = lim[k][0]; if (p.v[k] < 0) p.v[k] = -e * p.v[k]; }
      if (p.x[k] > lim[k][1]) { p.x[k] = lim[k][1]; if (p.v[k] > 0) p.v[k] = -e * p.v[k]; }
    }
    if (scene !== "balls") return;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      const d = [b.x[0] - a.x[0], b.x[1] - a.x[1], b.x[2] - a.x[2]], dist = Math.hypot(...d);
      if (dist >= 2 * R || dist < 1e-9) continue; // detection: centres closer than two radii
      const nrm = d.map((c) => c / dist), push = (2 * R - dist) / 2;
      for (let k = 0; k < 3; k++) { a.x[k] -= nrm[k] * push; b.x[k] += nrm[k] * push; }
      const vn = (b.v[0] - a.v[0]) * nrm[0] + (b.v[1] - a.v[1]) * nrm[1] + (b.v[2] - a.v[2]) * nrm[2];
      if (vn >= 0) continue; // already separating: don't pull them back together
      const jimp = (-(1 + e) * vn) / 2; // equal masses share the impulse
      for (let k = 0; k < 3; k++) { a.v[k] -= jimp * nrm[k]; b.v[k] += jimp * nrm[k]; }
    }
  }

  // ---- drawing
  const WHY = {
    euler: "<p><b>Explicit Euler</b>: move with the <i>old</i> velocity, then update the velocity with the <i>old</i> force. <code>x += v·dt; v += a·dt</code>.</p><p>It's the obvious thing to write, but on a spring it always overshoots a little outward, and each overshoot adds energy. With stiff springs or a big dt it grows exponentially: the chain explodes.</p>",
    semi: "<p><b>Semi-implicit (symplectic) Euler</b>: update velocity <i>first</i>, then move with the <i>new</i> velocity. <code>v += a·dt; x += v·dt</code>.</p><p>Swapping two lines makes energy wobble around the right value instead of growing. Most game engines (Box2D, Bullet) use this.</p>",
    verlet: "<p><b>Velocity Verlet</b>: move using velocity <i>and</i> half the acceleration, then average old and new forces for the velocity.</p><p>Same cost as Euler (one force evaluation per step) but the error stays bounded, so energy stays flat for as long as you run it. Molecular dynamics and cloth sims use it.</p>",
  };
  function ballInfo(i) {
    return { title: `Ball ${i}`, html: "<p>Each ball's whole state is just two vectors: <b>position x</b> and <b>velocity v</b> (6 numbers). Forces give the acceleration <code>a = F / m</code>; the integrator turns that into the next x and v.</p><p>The live state vector and every force acting on it are shown under the controls. The arrows on the ball are the forces (amber = gravity, red = springs).</p>" };
  }
  function draw() {
    P.forEach((p, i) => {
      W.box("b" + i, { x: p.x[0], y: p.x[1], z: p.x[2], s: 2 * R, color: i === sel ? "c4" : scene === "chain" ? "c2" : ["c2", "c3", "c1", "c4"][i % 4], glow: i === sel ? 0.4 : 0, instant: true, info: ballInfo(i) });
    });
    springs.forEach((s, i) => {
      const st = springForce(s).stretch;
      W.line("s" + i, s.a < 0 ? "anchor" : "b" + s.a, "b" + s.b, { color: Math.abs(st) < 0.05 ? "c3" : st > 0 ? "c1" : "c2" });
    });
    // force arrows of the selected ball
    for (let k = 0; k < 4; k++) W.unline("f" + k);
    if (sel >= 0 && sel < P.length) {
      forces(sel).forEach((f, k) => {
        const p = P[sel].x, sc = 0.08;
        W.line("f" + k, "b" + sel, [p[0] + f.f[0] * sc, p[1] + f.f[1] * sc, p[2] + f.f[2] * sc], { color: k === 0 ? "c4" : "c1" });
      });
    }
  }
  const v3 = (a) => "(" + a.map((c) => (c >= 0 ? " " : "") + c.toFixed(2)).join(", ") + ")";
  function readout() {
    const E = energy(), drift = (E - E0) / S;
    maxDrift = Math.max(maxDrift, Math.abs(drift));
    const name = { euler: "explicit Euler", semi: "semi-implicit Euler", verlet: "Verlet" }[integ];
    api.hud(`${name} · dt = ${dt.toFixed(3)} s · t = ${t.toFixed(1)} s<br>energy ${E.toFixed(1)} J (start ${E0.toFixed(1)}) · drift <b style="color:var(${Math.abs(drift) > 0.1 ? "--bad" : "--ok"})">${(drift * 100).toFixed(1)}%</b>` + (boom ? "<br><b style='color:var(--bad)'>BOOM: the simulation exploded</b>" : ""));
    if (sel >= 0 && sel < P.length) {
      const p = P[sel], a = accel(sel);
      api.status(`ball ${sel} state vector\n  x = ${v3(p.x)}\n  v = ${v3(p.v)}\n  a = F/m = ${v3(a)}\nforces:\n` + forces(sel).map((f) => `  ${f.name.padEnd(17)} ${v3(f.f)}` + (f.stretch != null ? `  stretch ${f.stretch.toFixed(2)}` : "")).join("\n"));
    } else api.status("Click a ball to see its state vector and forces.\n" + (scene === "chain" ? "Springs: red = stretched, blue = squashed, green = rest length." : "Restitution e = " + e.toFixed(2) + " (1 = perfectly bouncy)."));
    // chart
    hist.push(drift);
    if (hist.length > HIST) hist.shift();
    const pos = chartGeo.attributes.position;
    for (let i = 0; i < HIST; i++) {
      const v = hist[Math.min(hist.length - 1, Math.max(0, i - (HIST - hist.length)))] ?? 0;
      pos.setXYZ(i, -BX + 0.2 + ((BX * 2 - 0.4) * i) / (HIST - 1), Math.max(0.15, Math.min(BY - 0.15, 1 + v * 2.5)), -BZ + 0.03);
    }
    pos.needsUpdate = true;
    chartGeo.computeBoundingSphere();
    return drift;
  }
  function checkGoal(drift) {
    if (integ === "euler" && drift > 1 && !boom) {
      boom = true; paused = true; blewDt = dt;
      api.explain("It exploded", `<p>Explicit Euler added <b>${Math.round(drift * 100)}%</b> extra energy out of nowhere. Nothing in the physics does that: it's the integrator's error, compounding every step.</p><p>Now switch to <b>Verlet</b> (keep dt = ${dt.toFixed(3)}) and let it run for a few seconds.</p>`);
    }
    if (blewDt != null && integ !== "euler" && Math.abs(dt - blewDt) < 1e-9 && t > 4 && maxDrift < 0.1 && scene === "chain") {
      blewDt = null;
      api.explain("Same dt, no explosion", `<p>At exactly the dt that blew Euler up, ${integ === "verlet" ? "Verlet" : "semi-implicit Euler"} kept the energy within ${(maxDrift * 100).toFixed(1)}% for ${t.toFixed(0)} seconds.</p><p>The physics didn't change. Only the order of the updates did. That's why every serious engine uses a symplectic integrator.</p>`);
      api.done("You fixed the explosion with a better integrator");
    }
  }

  // ---- fixed timestep game loop: real time accumulates, the sim eats it in dt-sized bites
  let acc = 0;
  api.loop((frame) => {
    if (paused || boom) return;
    acc += frame;
    let steps = 0;
    while (acc >= dt && steps < 400) { step(dt); acc -= dt; steps++; }
    if (steps === 400) acc = 0;
    draw();
    checkGoal(readout());
  });

  // ---- controls
  api.seg([{ label: "Spring chain", value: "chain" }, { label: "Bouncing balls", value: "balls" }], scene, (v) => { scene = v; sel = -1; init(); });
  api.seg([{ label: "Explicit Euler", value: "euler" }, { label: "Semi-implicit", value: "semi" }, { label: "Verlet", value: "verlet" }], integ, (v) => { integ = v; paused = false; init(); api.explain(v === "euler" ? "Explicit Euler" : v === "semi" ? "Semi-implicit Euler" : "Velocity Verlet", WHY[v]); });
  api.slider("Time step dt", { min: 0.002, max: 0.06, step: 0.002, value: dt, format: (v) => v.toFixed(3) + " s" }, (v) => { dt = v; });
  api.slider("Spring stiffness k", { min: 5, max: 120, step: 5, value: K }, (v) => { K = v; init(); });
  api.slider("Restitution e", { min: 0, max: 1, step: 0.05, value: e, format: (v) => v.toFixed(2) }, (v) => { e = v; });
  api.button("Reset", () => { paused = false; init(); }, { primary: true });
  api.button("Pause / play", () => { if (!boom) paused = !paused; });
  api.button("Step dt", () => { paused = true; if (!boom) { step(dt); draw(); checkGoal(readout()); } });
  api.button("Kick", () => { P.forEach((p) => { p.v[1] += 4; p.v[0] += 2; }); E0 = energy(); });
  W.onPick((key) => {
    if (key[0] === "b" && key !== "base") { sel = +key.slice(1); draw(); readout(); }
    return true;
  });
  api.explain("How to read this", "<p>A chain of 5 masses on springs hangs from an anchor, simulated with <b>explicit Euler</b>. Watch the energy line on the back wall: in real physics (no friction) it would stay perfectly flat.</p><p>Raise <b>dt</b> or <b>k</b> until Euler blows up, then switch to <b>Verlet</b> at the same dt. Click a ball to see its state and forces.</p>");
  init();
  readout();
});
