/* Build your own X, chapter 11: a 3D graphics engine.
   An eye, an image plane made of pixel voxels, and an object made of triangles.
   Rays from the eye through each vertex land on the plane (divide by depth), the rasterizer fills
   the pixels inside each triangle, and a z-buffer decides who wins each pixel.
   The "why": sorting whole triangles (painter's algorithm) can't handle triangles that cross. */
VIZ.register("bx-raster", async (api) => {
  const W = await api.world3d();
  const T = W.THREE;
  const EYE = 7, F = 3.5, PZ = EYE - F, N = 20, PITCH = 0.14;
  W.camera({ target: [0, 0, 2.2], dist: 13.5, theta: 0.42, phi: 1.28, instant: true });

  // ---- scenes: lists of triangles [a, b, c] in model space, wound counter-clockwise from the front
  function cubeTris() {
    const q = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], "c2"],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], "c1"],
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], "c3"],
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], "c4"],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], "c5"],
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], "c1"],
    ];
    const out = [];
    for (const [a, b, c, d, col] of q) { out.push({ v: [a, b, c], color: col }, { v: [a, c, d], color: col }); }
    // make sure every normal points outwards (so culling is honest)
    for (const t of out) {
      const n = cross(sub(t.v[1], t.v[0]), sub(t.v[2], t.v[0]));
      const ctr = t.v.reduce((s, p) => add(s, p), [0, 0, 0]);
      if (dot(n, ctr) < 0) t.v = [t.v[0], t.v[2], t.v[1]];
    }
    return out;
  }
  const SCENES = {
    cube: { tris: cubeTris(), twoSided: false, name: "cube (12 triangles)" },
    cards: { tris: [
      { v: [[-1.3, -1.1, -0.9], [1.3, -1.1, -0.9], [0, 1.2, 0.9]], color: "c1" },
      { v: [[1.3, 1.1, -0.9], [-1.3, 1.1, -0.9], [0, -1.2, 0.9]], color: "c2" },
    ], twoSided: true, name: "two crossing cards" },
  };

  // ---- tiny vector maths (the same as the numpy you write in the chapter)
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function rot(p, yaw, pitch) {
    const [x, y, z] = p;
    const y1 = y * Math.cos(pitch) - z * Math.sin(pitch), z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
    return [x * Math.cos(yaw) + z1 * Math.sin(yaw), y1, -x * Math.sin(yaw) + z1 * Math.cos(yaw)];
  }
  const project = (p) => { const d = EYE - p[2]; return { u: (F * p[0]) / d, v: (F * p[1]) / d, d }; };

  // ---- state
  let scene = "cube", mode = "z", colorBy = "shade", cull = true;
  let yaw = 0.6, pitch = 0.45, light = 0.9;
  let tris = [], buf = null, ref = null, wrong = 0, culled = 0, runId = 0;

  function lightDir() { return norm([Math.sin(light), 0.55, Math.cos(light)]); }
  function prepare() {
    const L = lightDir();
    tris = SCENES[scene].tris.map((t, id) => {
      const w = t.v.map((p) => rot(p, yaw, pitch));
      const s = w.map(project);
      const area = (s[1].u - s[0].u) * (s[2].v - s[0].v) - (s[1].v - s[0].v) * (s[2].u - s[0].u);
      let n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0])));
      const facing = area > 0;
      if (!facing && SCENES[scene].twoSided) n = [-n[0], -n[1], -n[2]];
      const lambert = Math.max(0, dot(n, L));
      return { id, w, s, area, facing, color: t.color, light: 0.18 + 0.82 * lambert, lambert, avgD: (s[0].d + s[1].d + s[2].d) / 3 };
    });
  }
  function drawOrder(m) {
    let list = tris.filter((t) => Math.abs(t.area) > 1e-9 && (t.facing || SCENES[scene].twoSided || !cull));
    if (m === "painter") list = [...list].sort((a, b) => b.avgD - a.avgD); // far first, near last
    return list;
  }
  const pixU = (i) => (i - (N - 1) / 2) * PITCH;
  function emptyBuf() { return { owner: new Int16Array(N * N).fill(-1), depth: new Float64Array(N * N).fill(Infinity) }; }
  // Rasterize one triangle row by row; onRow(j) lets the animation pause between rows.
  function rasterTri(t, b, m, onRow) {
    const [A, B, C] = t.s;
    const E = (a, c, pu, pv) => (c.u - a.u) * (pv - a.v) - (c.v - a.v) * (pu - a.u);
    const area = E(A, B, C.u, C.v);
    const i0 = Math.max(0, Math.floor(Math.min(A.u, B.u, C.u) / PITCH + (N - 1) / 2)), i1 = Math.min(N - 1, Math.ceil(Math.max(A.u, B.u, C.u) / PITCH + (N - 1) / 2));
    const j0 = Math.max(0, Math.floor(Math.min(A.v, B.v, C.v) / PITCH + (N - 1) / 2)), j1 = Math.min(N - 1, Math.ceil(Math.max(A.v, B.v, C.v) / PITCH + (N - 1) / 2));
    const rows = [];
    for (let j = j0; j <= j1; j++) {
      const touched = [];
      for (let i = i0; i <= i1; i++) {
        const pu = pixU(i), pv = pixU(j);
        const w0 = E(B, C, pu, pv) / area, w1 = E(C, A, pu, pv) / area, w2 = E(A, B, pu, pv) / area;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = 1 / (w0 / A.d + w1 / B.d + w2 / C.d); // 1/depth is what's linear on screen
        const k = j * N + i;
        if (m === "z" && d >= b.depth[k]) continue; // something nearer is already here
        b.owner[k] = t.id; b.depth[k] = d;
        touched.push(k);
      }
      rows.push({ j, touched });
    }
    return rows;
  }
  function rasterAll(m) { const b = emptyBuf(); for (const t of drawOrder(m)) rasterTri(t, b, m); return b; }
  function countWrong() {
    let w = 0;
    for (let k = 0; k < N * N; k++) {
      if (buf.owner[k] === -1 && ref.owner[k] === -1) continue;
      if (Math.abs(buf.depth[k] - ref.depth[k]) > 1e-6) w++;
    }
    return w;
  }

  // ---- colours
  const cache = new Map();
  function shade(name, k) {
    const key = name + Math.round(k * 12);
    if (!cache.has(key)) { const c = new T.Color(api.color(name)); c.multiplyScalar(Math.round(k * 12) / 12); cache.set(key, "#" + c.getHexString()); }
    return cache.get(key);
  }
  function mix(a, b, t) {
    const q = Math.round(Math.max(0, Math.min(1, t)) * 10) / 10, key = a + b + q;
    if (!cache.has(key)) { const c = new T.Color(api.color(a)).lerp(new T.Color(api.color(b)), q); cache.set(key, "#" + c.getHexString()); }
    return cache.get(key);
  }
  function pixColor(k, b) {
    const o = b.owner[k];
    if (o < 0) return { color: "c5", opacity: 0.18 };
    if (colorBy === "depth") return { color: mix("c4", "c2", (b.depth[k] - (EYE - 1.8)) / 3.6) };
    if (colorBy === "errors") return Math.abs(b.depth[k] - ref.depth[k]) > 1e-6 ? { color: "bad", glow: 0.3 } : { color: "c5", opacity: 0.55 };
    return { color: shade(tris[o].color, tris[o].light) };
  }
  function paint(k, b) {
    const c = pixColor(k, b);
    W.box("p" + k, { color: c.color, opacity: c.opacity ?? 1, glow: c.glow || 0 });
  }

  // ---- static parts of the scene
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    W.box("p" + (j * N + i), { x: pixU(i), y: pixU(j), z: PZ, sx: PITCH * 0.86, sy: PITCH * 0.86, sz: 0.03, color: "c5", opacity: 0.18, instant: true });
  }
  W.box("eye", { x: 0, y: 0, z: EYE, s: 0.32, color: "ink", label: "eye", labelSize: 0.32,
    info: { title: "The eye (camera)", html: "<p>Every ray starts here. A point at depth <b>d</b> lands on the image plane at <code>(f·x/d, f·y/d)</code>.</p><p>That <b>divide by depth</b> is all perspective is: twice as far away means half as big on screen. Without it (just dropping z) you get an orthographic drawing where far rails never meet.</p>" } });
  const half = (N / 2) * PITCH;
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  corners.forEach(([u, v], i) => {
    const [u2, v2] = corners[(i + 1) % 4];
    W.line("frame" + i, [u, v, PZ], [u2, v2, PZ], { color: "muted" });
    const far = (EYE + 2.2) / F; // stretch the frustum edge out past the object
    W.line("fr" + i, [0, 0, EYE], [u * far, v * far, EYE - F * far], { color: "line", opacity: 0.6 });
  });
  W.label("planeL", "image plane (pixels)", [0, half + 0.35, PZ], { color: "muted", size: 0.3 });
  W.box("light", { s: 0.3, color: "c4", glow: 0.6, label: "light", labelSize: 0.3,
    info: { title: "The light", html: "<p>Lambert shading: brightness = <code>max(0, n · L)</code>, the dot product of the face's normal <b>n</b> with the direction to the light <b>L</b>.</p><p>Why the dot product? It's cos(angle): a face pointing straight at the light gets the full amount, a face edge-on gets none. That's how much light lands per square of surface. Move the light slider and watch faces brighten and darken.</p>" } });

  // the object itself as a translucent three.js mesh, plus vertex voxels you can click
  const geo = new T.BufferGeometry();
  const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }));
  W.scene.add(mesh);
  const wire = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: new T.Color(api.color("ink")), transparent: true, opacity: 0.5 }));
  W.scene.add(wire);
  function updateMesh() {
    const pos = [], col = [], wl = [];
    for (const t of tris) {
      const c = new T.Color(api.color(t.color));
      for (const p of t.w) { pos.push(...p); col.push(c.r, c.g, c.b); }
      for (let e = 0; e < 3; e++) wl.push(...t.w[e], ...t.w[(e + 1) % 3]);
    }
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    wire.geometry.setAttribute("position", new T.Float32BufferAttribute(wl, 3));
    wire.geometry.computeBoundingSphere();
    const verts = [];
    for (const t of tris) for (const p of t.w) if (!verts.some((q) => Math.hypot(...sub(p, q)) < 1e-6)) verts.push(p);
    for (let i = 0; i < 8; i++) {
      if (i < verts.length) {
        const p = verts[i], s = project(p);
        W.box("v" + i, { x: p[0], y: p[1], z: p[2], s: 0.14, color: "c2", visible: true, info: { title: `Vertex ${i}`, html: `<p>World position (${p.map((x) => x.toFixed(2)).join(", ")}), depth from the eye <b>d = ${s.d.toFixed(2)}</b>.</p><p>On screen: <code>u = f·x/d = ${s.u.toFixed(2)}</code>, <code>v = f·y/d = ${s.v.toFixed(2)}</code>.</p><p>Only the 3 corners are projected. Everything inside a triangle is filled in afterwards by the rasterizer, which is why GPUs love triangles: 3 points, always flat, always convex.</p>` } });
      } else W.box("v" + i, { visible: false });
    }
    const L = lightDir();
    W.box("light", { x: L[0] * 3.2, y: L[1] * 3.2, z: L[2] * 3.2 });
    W.line("lightray", "light", [0, 0, 0], { color: "c4", opacity: 0.5 });
  }
  function showRays(t) {
    for (let e = 0; e < 3; e++) {
      if (!t) { W.unline("ray" + e); W.box("hit" + e, { visible: false }); continue; }
      W.line("ray" + e, "eye", t.w[e], { color: "c4" });
      const s = t.s[e];
      W.box("hit" + e, { x: s.u, y: s.v, z: PZ + 0.05, s: 0.09, color: "c4", glow: 0.5, visible: true, instant: true,
        info: { title: "Where the ray hits the plane", html: `<p>The ray from the eye to this corner crosses the image plane here: <code>(${s.u.toFixed(2)}, ${s.v.toFixed(2)})</code>.</p><p>Similar triangles: the plane is f = ${F} from the eye, the corner is d = ${s.d.toFixed(2)} away, so everything shrinks by f/d = ${(F / s.d).toFixed(2)}.</p>` } });
    }
  }

  // ---- rendering
  function hud() {
    const label = { z: "z-buffer", painter: "painter's (sort far → near)", none: "no depth test (list order)" }[mode];
    api.hud(`${SCENES[scene].name} · ${label}<br>culled: ${culled} · wrong pixels: <b>${wrong}</b>`);
  }
  function finish() {
    wrong = countWrong();
    hud();
    const shown = drawOrder(mode).length;
    api.status(`${shown} triangles drawn, ${culled} culled (facing away).\n` +
      `Pixels covered: ${buf.owner.filter((o) => o >= 0).length} of ${N * N}.\n` +
      (mode === "z" ? "z-buffer: every pixel keeps the nearest surface." : `Wrong pixels compared with the z-buffer: ${wrong}`));
    if (mode !== "z" && wrong > 0) {
      api.explain("The wrong surface won", `<p><b>${wrong}</b> pixels show something that is actually <i>behind</i> something else. Switch colour to <b>errors</b> to see exactly which.</p>` +
        (scene === "cards" ? "<p>The two cards cross each other, so <b>neither</b> is in front everywhere. Sorting whole triangles can't fix that: whichever goes last covers the other completely. The z-buffer decides <i>per pixel</i>, so it gets the crossing line right.</p>"
          : "<p>With culling off, the back faces get drawn too, and without a per-pixel depth test whatever is drawn last wins.</p>"));
      api.done("You caught the painter drawing the wrong thing");
    }
  }
  function renderNow() {
    runId++;
    prepare();
    culled = SCENES[scene].twoSided || !cull ? 0 : tris.filter((t) => !t.facing).length;
    ref = rasterAll("z");
    buf = rasterAll(mode);
    for (let k = 0; k < N * N; k++) paint(k, buf);
    updateMesh();
    showRays(drawOrder(mode)[0]);
    finish();
  }
  async function scan(one) {
    const my = ++runId;
    prepare();
    ref = rasterAll("z");
    updateMesh();
    if (!one || !scanState || scanState.done) {
      buf = emptyBuf();
      for (let k = 0; k < N * N; k++) paint(k, buf);
      scanState = { list: drawOrder(mode), i: 0 };
    }
    while (scanState.i < scanState.list.length) {
      const t = scanState.list[scanState.i++];
      showRays(t);
      api.status(`Triangle ${scanState.i}/${scanState.list.length} (${t.color} face, depth ≈ ${t.avgD.toFixed(2)})\nEdge test: a pixel is inside if it's on the left of all 3 edges.` + (mode === "z" ? "\nz-test: keep it only if nearer than what's stored." : "\nNo depth test: it simply overwrites."));
      const rows = rasterTri(t, buf, mode);
      for (const r of rows) {
        for (const k of r.touched) paint(k, buf);
        if (r.touched.length) await api.sleep(one ? 30 : 14);
        if (my !== runId) return;
      }
      if (one) break;
      await api.sleep(120);
      if (my !== runId) return;
    }
    if (scanState.i >= scanState.list.length) { scanState.done = true; culled = SCENES[scene].twoSided || !cull ? 0 : tris.filter((x) => !x.facing).length; finish(); }
  }
  let scanState = null;

  // ---- controls
  api.seg([{ label: "Cube", value: "cube" }, { label: "Crossing cards", value: "cards" }], scene, (v) => { scene = v; scanState = null; renderNow(); });
  api.seg([{ label: "z-buffer", value: "z" }, { label: "Painter's", value: "painter" }, { label: "No depth", value: "none" }], mode, (v) => {
    mode = v; scanState = null; renderNow();
    if (v === "painter") api.explain("Painter's algorithm", "<p>Sort triangles by their <b>average</b> depth and draw the farthest first, like a painter doing the sky before the trees. No depth memory needed.</p><p>It works for lots of scenes. Try the crossing cards to see where it can't.</p>");
    if (v === "z") api.explain("The z-buffer", "<p>Next to the colour of each pixel, also store the <b>depth</b> of whatever is drawn there. A new pixel only wins if it's <i>nearer</i>.</p><p>It costs one number per pixel, but now draw order doesn't matter at all, and crossing triangles are right to the pixel. Every GPU does this in hardware.</p>");
  });
  api.seg([{ label: "Colour: shading", value: "shade" }, { label: "depth", value: "depth" }, { label: "errors", value: "errors" }], colorBy, (v) => { colorBy = v; if (buf) for (let k = 0; k < N * N; k++) paint(k, buf); });
  api.seg([{ label: "Back-face culling on", value: true }, { label: "off", value: false }], cull, (v) => { cull = v; scanState = null; renderNow(); });
  api.slider("Turn object", { min: -3.14, max: 3.14, step: 0.02, value: yaw, format: (v) => Math.round((v * 180) / Math.PI) + "°" }, (v) => { yaw = v; scanState = null; renderNow(); });
  api.slider("Tilt object", { min: -1.5, max: 1.5, step: 0.02, value: pitch, format: (v) => Math.round((v * 180) / Math.PI) + "°" }, (v) => { pitch = v; scanState = null; renderNow(); });
  api.slider("Light direction", { min: -3.14, max: 3.14, step: 0.02, value: light, format: (v) => Math.round((v * 180) / Math.PI) + "°" }, (v) => { light = v; scanState = null; renderNow(); });
  api.button("Step (one triangle)", () => scan(true), { primary: true });
  api.button("Scan all", () => { scanState = null; scan(false); });
  W.onPick((key) => {
    if (key[0] !== "p" || !buf) return true;
    const k = +key.slice(1), o = buf.owner[k];
    const i = k % N, j = Math.floor(k / N);
    if (o < 0) { api.explain(`Pixel (${i}, ${j})`, "<p>No triangle covers this pixel's centre, so it keeps the background.</p><p>We test the pixel's <b>centre</b> only. That's why edges look jagged (aliasing); anti-aliasing tests several points per pixel.</p>"); return false; }
    const t = tris[o], r = ref.owner[k];
    api.explain(`Pixel (${i}, ${j})`, `<p>Owned by triangle <b>${o}</b> (${t.color}), depth <b>${buf.depth[k].toFixed(3)}</b>, light ${(t.lambert).toFixed(2)} → brightness ${t.light.toFixed(2)}.</p>` +
      (Math.abs(buf.depth[k] - ref.depth[k]) > 1e-6 ? `<p style="color:var(--bad)"><b>Wrong!</b> Triangle ${r} is nearer here (depth ${ref.depth[k].toFixed(3)}), but it was drawn earlier and got painted over.</p>` : "<p>That's the nearest surface along this pixel's ray. ✓</p>"));
    return false;
  });
  api.explain("How to read this", "<p>The <b>eye</b> looks through the <b>image plane</b> (a 20×20 grid of pixels) at a cube. Amber rays go from the eye to the corners of the triangle being drawn.</p><p>Press <b>Step</b> to rasterize one triangle at a time. Then try <b>Painter's</b> or <b>No depth</b> and hunt for wrong pixels. Click any pixel or corner to ask why.</p>");
  renderNow();
});
