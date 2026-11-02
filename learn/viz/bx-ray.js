/* Build your own X, chapter 24: a ray tracer.
   A tiny picture (64 × 40 pixels, drawn big) of two balls on a checkered floor, rendered one row at a
   time. For every pixel, one ray leaves the camera; whatever it hits first decides the colour.
   Turn features on one by one: flat colour, then light (diffuse shading), then shadows (a second ray
   toward the light), then reflections (a ray that bounces). Click any pixel to see its ray's story.
   The "why": a rasterizer (chapter 11) draws triangles one at a time and has to fake shadows and
   reflections. A ray tracer asks "what does this pixel see?", so shadows and mirrors are just more
   rays, at the cost of many more rays. */
VIZ.register("bx-ray", async (api) => {
  const RW = 64, RH = 40;
  const v = (x, y, z) => [x, y, z], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => mul(a, 1 / Math.hypot(...a));
  const SPHERES = [
    { name: "the red ball", c: v(-0.9, 0.8, 0.2), r: 0.8, col: [0.85, 0.25, 0.2], refl: 0.1 },
    { name: "the mirror ball", c: v(1.0, 0.6, 0.9), r: 0.6, col: [0.55, 0.65, 0.85], refl: 0.65 },
  ];
  const EYE = v(0, 1.3, -4.5);
  const MODES = ["flat", "diffuse", "shadows", "reflect"];
  let mode = "flat", lightX = -4, row = 0, buf = new Float32Array(RW * RH * 3), rays = { primary: 0, shadow: 0, reflect: 0 }, pick = null, reached = false;
  const light = () => v(lightX, 2.8, -0.3);
  function hit(o, d) {
    let best = null;
    for (const s of SPHERES) {
      const oc = sub(o, s.c), b = dot(oc, d), c = dot(oc, oc) - s.r * s.r, disc = b * b - c;
      if (disc < 0) continue;
      let t = -b - Math.sqrt(disc);
      if (t < 1e-3) t = -b + Math.sqrt(disc);
      if (t > 1e-3 && (!best || t < best.t)) { const p = add(o, mul(d, t)); best = { t, p, n: norm(sub(p, s.c)), obj: s }; }
    }
    if (d[1] < -1e-6) {
      const t = -o[1] / d[1];
      if (t > 1e-3 && (!best || t < best.t)) {
        const p = add(o, mul(d, t)), check = (Math.floor(p[0] / 1.2) + Math.floor(p[2] / 1.2)) & 1;
        best = { t, p, n: v(0, 1, 0), obj: { name: "the floor", col: check ? [0.9, 0.9, 0.88] : [0.3, 0.32, 0.36], refl: 0.15 } };
      }
    }
    return best;
  }
  const sky = (d) => { const k = 0.5 + 0.5 * d[1]; return [0.75 - 0.3 * k, 0.85 - 0.2 * k, 1.0]; };
  // Trace one ray. `log`, when given, collects the story of the ray for the explain panel.
  function trace(o, d, depth, log) {
    const h = hit(o, d);
    if (!h) { log && log.push(`It hits nothing, so it shows the <b>sky</b>.`); return sky(d); }
    log && log.push(`It hits <b>${h.obj.name}</b> at distance ${h.t.toFixed(2)}.`);
    if (mode === "flat") return h.obj.col;
    const L = sub(light(), h.p), ldist = Math.hypot(...L), l = mul(L, 1 / ldist);
    let lam = Math.max(0, dot(h.n, l)), shadowed = false;
    if (mode !== "diffuse" && lam > 0) {
      rays.shadow++;
      const s = hit(add(h.p, mul(h.n, 1e-3)), l);
      if (s && s.t < ldist) { shadowed = true; lam = 0; log && log.push(`A <b>shadow ray</b> toward the light is blocked by <b>${s.obj.name}</b>, so this point is <b>in shadow</b>: only the dim ambient light reaches it.`); }
      else log && log.push("A <b>shadow ray</b> reaches the light unblocked.");
    }
    log && !shadowed && log.push(`The surface faces the light at cos θ = ${lam.toFixed(2)} (1 = straight on, 0 = edge on), so it gets that much of the light.`);
    let col = mul(h.obj.col, 0.15 + 0.85 * lam);
    if (h.obj.name === "the floor") col = add(mul(col, 1 - Math.min(1, Math.max(0, h.t - 8) / 30)), mul(sky(d), Math.min(1, Math.max(0, h.t - 8) / 30)));
    if (mode === "reflect" && depth < 3 && h.obj.refl) {
      rays.reflect++;
      const r = sub(d, mul(h.n, 2 * dot(d, h.n)));
      log && log.push(`It is ${Math.round(h.obj.refl * 100)}% mirror, so a <b>reflection ray</b> bounces off:`);
      const rc = trace(add(h.p, mul(h.n, 1e-3)), norm(r), depth + 1, log);
      col = add(mul(col, 1 - h.obj.refl), mul(rc, h.obj.refl));
    }
    if (log) log.shadowed = log.shadowed || (depth === 0 && shadowed);
    return col;
  }
  function primary(px, py) {
    const asp = RW / RH, x = ((px + 0.5) / RW * 2 - 1) * asp * 0.75, y = (1 - (py + 0.5) / RH * 2) * 0.75;
    return norm(v(x, y - 0.15, 1.5));
  }
  function renderRows(n) {
    for (let k = 0; k < n && row < RH; k++, row++)
      for (let px = 0; px < RW; px++) {
        rays.primary++;
        const c = trace(EYE, primary(px, row), 0), i = (row * RW + px) * 3;
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      }
  }
  const restart = () => { row = 0; rays = { primary: 0, shadow: 0, reflect: 0 }; pick = null; };
  let geo = { s: 1, ox: 0, oy: 0 };
  const cv = api.canvas2d((g, w, h) => {
    const s = Math.floor(Math.min(w / RW, (h - 8) / RH) * 100) / 100, ox = (w - s * RW) / 2, oy = (h - s * RH) / 2;
    geo = { s, ox, oy };
    g.fillStyle = api.color("line"); g.fillRect(ox, oy, s * RW, s * RH);
    for (let py = 0; py < row; py++)
      for (let px = 0; px < RW; px++) {
        const i = (py * RW + px) * 3, f = (x) => Math.round(255 * Math.min(1, Math.max(0, x)));
        g.fillStyle = `rgb(${f(buf[i])},${f(buf[i + 1])},${f(buf[i + 2])})`;
        g.fillRect(ox + px * s, oy + py * s, Math.ceil(s), Math.ceil(s));
      }
    if (row < RH) { g.fillStyle = api.color("c4"); g.fillRect(ox, oy + row * s, s * RW, Math.max(2, s / 3)); }
    if (pick) { g.strokeStyle = api.color("c4"); g.lineWidth = 3; g.strokeRect(ox + pick[0] * s - 2, oy + pick[1] * s - 2, s + 4, s + 4); }
  });
  function status() {
    api.status(`mode: ${mode}   ·   ${row < RH ? `rendering row ${row} of ${RH}` : "done"}\n` +
      `rays: ${rays.primary} from the camera + ${rays.shadow} shadow + ${rays.reflect} reflection = ${rays.primary + rays.shadow + rays.reflect}`);
  }
  api.loop(() => { if (row < RH) { renderRows(2); cv.redraw(); status(); } });
  cv.canvas.addEventListener("click", (e) => {
    const r = cv.canvas.getBoundingClientRect(), px = Math.floor((e.clientX - r.left - geo.ox) / geo.s), py = Math.floor((e.clientY - r.top - geo.oy) / geo.s);
    if (px < 0 || py < 0 || px >= RW || py >= RH) return;
    pick = [px, py]; cv.redraw();
    const log = [], saved = rays; rays = { primary: 0, shadow: 0, reflect: 0 };
    trace(EYE, primary(px, py), 0, log);
    rays = saved;
    api.explain(`Pixel (${px}, ${py})`, `<p>One ray leaves the camera through this pixel.</p><ol>${log.map((s) => `<li>${s}</li>`).join("")}</ol>` +
      (mode === "flat" ? "<p>In <b>flat</b> mode the colour is just the object's colour. Turn on <b>diffuse</b> to add light.</p>" : ""));
    if (log.shadowed && !reached) { reached = true; api.done("You found a pixel in shadow and saw why"); }
  });
  api.seg(MODES.map((m) => ({ label: { flat: "flat", diffuse: "+ light", shadows: "+ shadows", reflect: "+ reflections" }[m], value: m })), mode, (m) => { mode = m; restart(); });
  api.slider("Light position (left ↔ right)", { min: -5, max: 5, step: 0.5, value: lightX, format: (x) => x.toFixed(1) }, (x) => { lightX = x; restart(); });
  api.button("Render again", () => restart());
  api.hud("click a pixel to follow its ray");
  status();
  api.explain("How to read this", "<p>Every pixel is one ray from the camera. The yellow line shows the row being rendered.</p><p>Start with <b>flat</b>: each pixel just shows the colour of whatever its ray hits first. Then add <b>light</b>, <b>shadows</b> and <b>reflections</b>, and watch the ray count.</p>");
});
