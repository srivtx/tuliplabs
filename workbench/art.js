/* Workbench art: each backend project as a small voxel diorama on a plinth, drawn as SVG from code, so the shelf's
   cards and the bench's project cover show the same scene at any size. Every scene is the idea of its project as an
   object you could hold: Greenhouse's plants each have an address, Taskflow's tasks survive a lightning strike,
   Shortlink folds a long ribbon of a URL into four blocks.

   World units: x runs right-down, y left-down, z up (the same isometric axes as the Wind Tunnel's stage). Things are
   drawn in the order a scene adds them, so each scene builds back to front.
     WBArt.svg(num, {a, b})   markup for project num, in its colour pair (a bright, b deep), or "" if none */
(() => {
  "use strict";
  const C = Math.cos(Math.PI / 6), U = 10;
  const hex = (n) => "#" + ((1 << 24) | n).toString(16).slice(1);
  const rgb = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, f) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => Math.round(v * (1 - f) + B[i] * f)).reduce((n, v) => (n << 8) | v, 0)); };
  const shade = (c, f) => hex(rgb(c).map((v) => Math.min(255, Math.round(v * f))).reduce((n, v) => (n << 8) | v, 0));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const r1 = (v) => Math.round(v * 10) / 10;

  function Scene() {
    const out = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const iso = (x, y, z) => {
      const p = [(x - y) * C * U, ((x + y) / 2 - z) * U];
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      return p;
    };
    const pts = (P) => P.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
    const poly = (P, fill, extra = "") => `<polygon points="${pts(P)}" fill="${fill}" stroke="${fill}" stroke-width=".5" stroke-linejoin="round"${extra}/>`;
    let group = null;
    const emit = (s) => (group ? group.push(s) : out.push(s));
    const S = {
      iso, mix, shade,
      // a box from (x,y,z), w along x, d along y, h up. o.alpha for glass, o.edge for an outline, o.top for a lid colour
      box(x, y, z, w, d, h, col, o = {}) {
        const a = o.alpha != null ? ` fill-opacity="${o.alpha}" stroke-opacity="${o.alpha}"` : "";
        const L = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)];
        const R = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)];
        const T = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
        let s = poly(L, shade(col, 0.78), a) + poly(R, shade(col, 0.6), a) + poly(T, o.top || col, a);
        if (o.edge) s += `<polyline points="${pts([L[3], L[0], T[0], T[1], R[0], R[3], L[2]])} " fill="none" stroke="${o.edge}" stroke-width=".7" stroke-linejoin="round"/><polyline points="${pts([L[0], L[1], L[2]])} ${pts([L[1], R[1]])}" fill="none" stroke="${o.edge}" stroke-width=".7"/>`;
        emit(o.cls ? `<g class="${o.cls}">${s}</g>` : s);
      },
      // a gable roof over (x,y,z) w×d, its ridge running along x at height h
      roof(x, y, z, w, d, h, col, o = {}) {
        const a = o.alpha != null ? ` fill-opacity="${o.alpha}" stroke-opacity="${o.alpha}"` : "";
        const m = y + d / 2;
        let s = poly([iso(x, y, z), iso(x + w, y, z), iso(x + w, m, z + h), iso(x, m, z + h)], shade(col, 1.05), a);
        s += poly([iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, m, z + h), iso(x, m, z + h)], shade(col, 0.85), a);
        s += poly([iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, m, z + h)], shade(col, 0.62), a);
        if (o.edge) s += `<polyline points="${pts([iso(x, y + d, z), iso(x, m, z + h), iso(x + w, m, z + h), iso(x + w, y + d, z), iso(x, y + d, z)])}" fill="none" stroke="${o.edge}" stroke-width=".7"/><polyline points="${pts([iso(x + w, m, z + h), iso(x + w, y, z), iso(x + w, y + d, z)])}" fill="none" stroke="${o.edge}" stroke-width=".7"/>`;
        emit(s);
      },
      // a flat shape lying on the plane z: an ellipse (ring, cookie, coin) given its centre and radius
      disc(x, y, z, r, fill, o = {}) {
        const [cx, cy] = iso(x, y, z);
        iso(x + r, y + r, z); iso(x - r, y - r, z);
        const st = o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : "";
        emit(`<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(r * U * C * Math.SQRT2)}" ry="${r1((r * U * Math.SQRT2) / 2)}" fill="${fill}"${st}${o.cls ? ` class="${o.cls}"` : ""}/>`);
      },
      // text painted onto a plane: "top" (z), "left" (the +y face, reads along x), "right" (the +x face, reads along -y)
      decal(plane, x, y, z, text, o = {}) {
        const [X, Y] = iso(x, y, z);
        const m = plane === "top" ? `${r1(C)},.5,${r1(-C)},.5` : plane === "left" ? `${r1(C)},.5,0,1` : `${r1(C)},-.5,0,1`;
        const fs = o.size || 7;
        emit(`<text transform="matrix(${m},${r1(X)},${r1(Y)})" font-size="${fs}" fill="${o.fill || "#fff"}" font-family="IBM Plex Mono,ui-monospace,monospace" font-weight="${o.weight || 600}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.cls ? ` class="${o.cls}"` : ""}>${esc(text)}</text>`);
      },
      // a rectangle painted on a plane, for lines of text on paper, stripes, LEDs
      patch(plane, x, y, z, w, h, fill, o = {}) {
        const [X, Y] = iso(x, y, z);
        const m = plane === "top" ? `${r1(C)},.5,${r1(-C)},.5` : plane === "left" ? `${r1(C)},.5,0,1` : `${r1(C)},-.5,0,1`;
        emit(`<rect transform="matrix(${m},${r1(X)},${r1(Y)})" width="${r1(w * U)}" height="${r1(h * U)}" rx="${o.rx || 0}" fill="${fill}"${o.cls ? ` class="${o.cls}"` : ""}/>`);
      },
      // a screen-space chip with a leader line from a point in the world: the request (or answer) that proves the idea
      chip(x, y, z, text, o = {}) {
        const [X, Y] = iso(x, y, z);
        const fs = o.size || 7.4, w = text.length * fs * 0.6 + 10, h = fs + 7;
        const cx = X + (o.dx || 0), cy = Y + (o.dy || -24);
        const left = o.align === "right" ? cx - w : o.align === "left" ? cx : cx - w / 2;
        x0 = Math.min(x0, left); x1 = Math.max(x1, left + w); y0 = Math.min(y0, cy - h / 2); y1 = Math.max(y1, cy + h / 2);
        emit(`<g class="wa-chip${o.cls ? " " + o.cls : ""}"><path d="M${r1(X)} ${r1(Y)}L${r1(cx)} ${r1(cy + (cy > Y ? -h / 2 : h / 2))}" stroke="${o.line || o.fill}" stroke-width=".8" stroke-dasharray="2 1.6" fill="none"/><circle cx="${r1(X)}" cy="${r1(Y)}" r="1.6" fill="${o.line || o.fill}"/>` +
          `<rect x="${r1(left)}" y="${r1(cy - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="3" fill="${o.bg || "#0b0b10"}" fill-opacity=".86" stroke="${o.fill}" stroke-opacity=".55" stroke-width=".7"/>` +
          `<text x="${r1(left + 5)}" y="${r1(cy + fs * 0.36)}" font-size="${fs}" fill="${o.fill}" font-family="IBM Plex Mono,ui-monospace,monospace" font-weight="600">${esc(text)}</text></g>`);
      },
      // a dashed arc between two points in the world, lifted by `lift` screen units, with an arrowhead at the end
      arc(p, q, lift, col, o = {}) {
        const [ax, ay] = iso(...p), [bx, by] = iso(...q);
        const cx = (ax + bx) / 2, cy = Math.min(ay, by) - lift;
        y0 = Math.min(y0, cy * 0.5 + (ay + by) / 4);
        const tx = bx - cx, ty = by - cy, l = Math.hypot(tx, ty) || 1, ux = tx / l, uy = ty / l, s = 4;
        emit(`<path d="M${r1(ax)} ${r1(ay)}Q${r1(cx)} ${r1(cy)} ${r1(bx)} ${r1(by)}" fill="none" stroke="${col}" stroke-width="${o.sw || 1.3}" stroke-dasharray="${o.dash || "3 2.4"}" stroke-linecap="round"${o.cls ? ` class="${o.cls}"` : ""}/>` +
          (o.head === false ? "" : `<polygon points="${r1(bx)},${r1(by)} ${r1(bx - ux * s - uy * s * 0.6)},${r1(by - uy * s + ux * s * 0.6)} ${r1(bx - ux * s + uy * s * 0.6)},${r1(by - uy * s - ux * s * 0.6)}" fill="${col}"/>`));
      },
      // a screen-space shape at a world point: points given in screen units around it
      shape(x, y, z, P, fill, o = {}) {
        const [X, Y] = iso(x, y, z);
        const Q = P.map(([a, b]) => [X + a, Y + b]);
        Q.forEach(([a, b]) => { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); });
        emit(`<polygon points="${pts(Q)}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}" stroke-linejoin="round"` : ""}${o.cls ? ` class="${o.cls}"` : ""}/>`);
      },
      raw(s) { emit(s); },
      // group what follows under a class (a glow, a hover motion)
      begin(cls) { group = [`<g class="${cls}">`]; },
      end() { const g = group; group = null; out.push(g.join("") + "</g>"); },
      // the plinth every diorama stands on: a slab of the project's deep colour with a bright rim
      plinth(w, d, a, b) {
        S.box(-0.4, -0.4, -0.9, w + 0.8, d + 0.8, 0.5, mix(b, "#000000", 0.25));
        S.box(-0.4, -0.4, -0.4, w + 0.8, d + 0.8, 0.4, mix(b, a, 0.32), { top: mix(b, a, 0.22) });
      },
      toSVG(label) {
        const pad = 8, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
        return `<svg class="wa" viewBox="${r1(x0 - pad)} ${r1(y0 - pad)} ${r1(w)} ${r1(h)}" role="img" aria-label="${esc(label)}">${out.join("")}</svg>`;
      },
    };
    return S;
  }

  const INK = "#0d0b12", PAPER = "#f4efe6", WOOD = "#a8693b", CLAY = "#c8643c", LEAF = "#57c26a", LEAF2 = "#2f9a4c", TULIP = "#ff6fb5", RED = "#ff5a5f", GOLD = "#ffd84a", STEEL = "#8d93a8";

  // a little plant: a stem of leaf cubes and, if asked, a flower on top
  function plant(S, x, y, z, hgt, flower) {
    for (let i = 0; i < hgt; i++) S.box(x + 0.3, y + 0.3, z + i * 0.38, 0.3, 0.3, 0.38, i % 2 ? LEAF2 : LEAF);
    S.box(x, y + 0.35, z + hgt * 0.38 * 0.55, 0.35, 0.3, 0.22, LEAF);
    S.box(x + 0.55, y + 0.25, z + hgt * 0.38 * 0.35, 0.35, 0.3, 0.22, LEAF2);
    if (flower) S.box(x + 0.15, y + 0.15, z + hgt * 0.38, 0.6, 0.6, 0.5, flower, { top: mix(flower, "#ffffff", 0.25) });
    else S.box(x + 0.1, y + 0.1, z + hgt * 0.38, 0.7, 0.7, 0.45, LEAF, { top: mix(LEAF, "#ffffff", 0.2) });
  }

  const SCENES = {
    // Greenhouse: a glass house of potted plants, and one of them answering to its own address
    101(S, a, b) {
      S.plinth(10, 7, a, b);
      for (let i = 0; i < 4; i++) S.box(7.2 + i * 0.7, 3.1, 0, 0.5, 0.9, 0.06, mix(b, "#ffffff", 0.35));
      S.box(0.8, 0.8, 0, 6.2, 5, 0.25, mix(b, a, 0.15));
      [[1.5, "#e0a94a"], [3.3, TULIP], [5.1, GOLD]].forEach(([x, f], i) => {
        S.box(x, 2.8, 0.25, 1, 1, 0.75, CLAY, { top: shade(CLAY, 0.6) });
        if (i === 1) S.begin("wa-glow");
        plant(S, x + 0.05, 2.85, 1, 4 + (i % 2) * 2, f);
        if (i === 1) S.end();
      });
      S.box(0.8, 0.8, 0.25, 6.2, 5, 3, "#bfe6ff", { alpha: 0.14, edge: "rgba(220,245,255,.55)" });
      S.roof(0.8, 0.8, 3.25, 6.2, 5, 1.7, "#bfe6ff", { alpha: 0.2, edge: "rgba(220,245,255,.6)" });
      S.box(7, 2.9, 0.25, 0.06, 1.3, 2, mix(b, a, 0.5), { alpha: 0.7 });
    },
    // Taskflow: a stack of tasks, the file they live in, and a lightning strike that loses none of them
    102(S, a, b) {
      S.plinth(10, 7, a, b);
      for (let i = 0; i < 4; i++) {
        const z = i * 0.32, x = 0.8 + i * 0.12, y = 1 + i * 0.1;
        S.box(x, y, z, 5, 3.4, 0.22, PAPER, { top: i === 3 ? "#ffffff" : PAPER });
      }
      const tz = 4 * 0.32 - 0.1 + 0.03;
      [[0, true, 2.6], [1, true, 2], [2, false, 2.9]].forEach(([k, done, w]) => {
        S.patch("top", 1.45, 1.55 + k * 1, tz, 0.55, 0.55, done ? LEAF2 : "#d8d1c4", { rx: 1.5 });
        S.patch("top", 2.3, 1.72 + k * 1, tz, w, 0.2, "#cfc6bd", { rx: 1 });
      });
      S.box(7, 1.8, 0, 2.4, 2.4, 2, "#2a2733", { top: "#3a3644" });
      S.patch("left", 7.3, 4.2, 1.4, 1.8, 0.12, a, { cls: "wa-glow" });
      S.shape(8.6, 1.4, 4.4, [[0, -16], [-6, 0], [-1, 0], [-5, 14], [5, -3], [0, -3], [4, -16]], GOLD, { cls: "wa-glow" });
    },
    // Shortlink: a long ribbon of a URL goes into a press and comes out as four blocks, then a jump to anywhere
    103(S, a, b) {
      S.plinth(13, 5, a, b);
      for (let i = 0; i < 9; i++) S.box(0.2 + i * 0.52, 2, 0, 0.44, 1, 0.3 + (i % 3) * 0.05, mix("#5a6a80", a, (i % 4) * 0.12));
      S.box(4.9, 1.4, 0, 2, 2.2, 2.2, mix(b, "#ffffff", 0.18), { top: mix(b, a, 0.5) });
      S.patch("left", 5.15, 3.6, 0.6, 1.5, 0.12, a, { cls: "wa-glow" });
      S.begin("wa-glow");
      "k3x9".split("").forEach((c, i) => {
        S.box(7.4 + i * 1.05, 1.95, 0, 0.9, 1.1, 0.9, a, { top: mix(a, "#ffffff", 0.3) });
      });
      S.end();
      S.box(12, 1.5, 0, 0.35, 0.35, 2.8, mix(a, "#ffffff", 0.5));
      S.box(12, 3.15, 0, 0.35, 0.35, 2.8, mix(a, "#ffffff", 0.5));
      S.box(12, 1.5, 2.8, 0.35, 2, 0.35, mix(a, "#ffffff", 0.5));
      S.box(12.1, 1.85, 0, 0.1, 1.3, 2.8, a, { alpha: 0.25 });
      S.arc([9.3, 2.5, 1.2], [12.2, 2.5, 1.8], 14, "#ffffff", { sw: 1.2 });
    },
    // Inkwell: a page, an ink bottle, a cookie and a lock: posts that only their author can change
    104(S, a, b) {
      S.plinth(10.5, 7, a, b);
      S.box(0.6, 1.2, 0, 4.2, 5.2, 0.12, PAPER, { top: "#ffffff" });
      S.patch("top", 1.1, 1.7, 0.12, 2.2, 0.3, "#3a2f48");
      for (let i = 0; i < 6; i++) S.patch("top", 1.1, 2.4 + i * 0.55, 0.12, i === 5 ? 1.8 : 3.2, 0.14, "#cfc6d8");
      S.box(6, 1.2, 0, 1.8, 1.8, 1.6, "#241c3a", { top: "#2f2550" });
      S.box(6.5, 1.7, 1.6, 0.8, 0.8, 0.5, "#241c3a");
      S.box(6.45, 1.65, 2.1, 0.9, 0.9, 0.3, a, { top: mix(a, "#ffffff", 0.3) });
      S.patch("left", 6.3, 3, 1.1, 1.2, 0.45, PAPER);
      S.begin("wa-glow");
      S.box(8, 4.6, 0, 1.6, 1.1, 1.3, a, { top: mix(a, "#ffffff", 0.3) });
      S.raw(`<path d="${(() => { const [l1, l2] = [S.iso(8.3, 5.7, 1.3), S.iso(9.3, 5.7, 1.3)]; return `M${r1(l1[0])} ${r1(l1[1])}C${r1(l1[0])} ${r1(l1[1] - 13)} ${r1(l2[0])} ${r1(l2[1] - 13)} ${r1(l2[0])} ${r1(l2[1])}`; })()}" fill="none" stroke="${STEEL}" stroke-width="2.4" stroke-linecap="round"/>`);
      S.patch("left", 8.65, 5.7, 0.35, 0.3, 0.5, INK, { rx: 1 });
      S.end();
    },
    // Keyring: a ring of keys, the main one's bow in three parts: header, payload, signature
    105(S, a, b) {
      S.plinth(10, 7, a, b);
      S.disc(3.2, 3.2, 0.12, 1.7, "none", { stroke: STEEL, sw: 2.6 });
      const key = (x, y, col, parts) => {
        if (parts) parts.forEach((c, i) => S.box(x + i * 0.5, y, 0, 0.5, 1.5, 0.35, c));
        else S.box(x, y, 0, 1.5, 1.5, 0.35, col);
        S.box(x + 1.5, y + 0.55, 0, 3.6, 0.4, 0.3, mix(col, "#ffffff", 0.15));
        [0, 0.8, 1.4].forEach((o, i) => S.box(x + 3.3 + o, y + 0.95, 0, 0.4, 0.35 + (i % 2) * 0.25, 0.3, mix(col, "#ffffff", 0.15)));
      };
      S.begin("wa-glow");
      key(3.4, 3.4, a, ["#ff5a7a", "#b07bff", "#3cc7e6"]);
      S.end();
      key(0.6, 5, STEEL);
    },
    // Bookshelf: a shelf of books, one pulled out by its cursor, and a bookmark that says nothing changed
    106(S, a, b) {
      S.plinth(10, 4.5, a, b);
      const wood = mix("#6b4a34", b, 0.2);
      S.box(0.6, 0.6, 0, 8.8, 0.4, 5, shade(wood, 0.8));
      [0, 2.5].forEach((z) => S.box(0.6, 0.6, z, 8.8, 2.4, 0.25, wood));
      const cols = [a, "#e0a94a", "#d85a7a", "#5fcf72", "#c09cf5", mix(a, "#ffffff", 0.4), "#ff7a4d", "#3fd1a8", "#f4efe6", "#62acf5"];
      for (let row = 0; row < 2; row++) {
        let x = 0.9;
        for (let i = 0; i < 10 && x < 9; i++) {
          const w = 0.45 + ((i * 7 + row * 3) % 4) * 0.12, h = 1.5 + ((i * 5 + row) % 3) * 0.25, out = row === 1 && i === 5;
          if (out) S.begin("wa-glow");
          S.box(x, out ? 1.9 : 1, row * 2.5 + 0.25, w, 1.6, h, cols[(i + row * 4) % cols.length]);
          if (out) S.end();
          x += w + 0.06;
        }
      }
      S.box(0.6, 0.6, 5, 8.8, 2.4, 0.25, wood);
    },
    // Market: a stall of crates under an awning, a till, and one receipt for a checkout pressed twice
    107(S, a, b) {
      S.plinth(10, 7, a, b);
      [0.8, 6.1].forEach((x) => S.box(x, 0.8, 0, 0.3, 0.3, 4.4, shade(WOOD, 0.8)));
      for (let i = 0; i < 6; i++) S.box(0.6 + i * 0.95, 0.4, 4.4, 0.95, 1.4, 0.3, i % 2 ? "#f4efe6" : a);
      S.box(0.8, 1.8, 0, 5.6, 2, 1.9, WOOD, { top: shade(WOOD, 1.15) });
      [[1.1, RED], [2.9, GOLD], [4.7, LEAF]].forEach(([x, f]) => {
        S.box(x, 2, 1.9, 1.4, 1.4, 0.55, shade(WOOD, 1.3));
        for (let i = 0; i < 4; i++) S.box(x + 0.2 + (i % 2) * 0.55, 2.2 + Math.floor(i / 2) * 0.55, 2.45, 0.45, 0.45, 0.4, f, { top: mix(f, "#ffffff", 0.25) });
      });
      S.box(7, 3.4, 0, 2.2, 2, 1.3, "#2a2733", { top: "#3a3644" });
      S.box(7.3, 3.6, 1.3, 1.6, 1, 0.7, "#3a3644", { top: mix(a, "#000000", 0.35) });
      S.begin("wa-float");
      S.box(7.5, 4.95, 0.35, 1.3, 0.06, 2.4, PAPER);
      S.patch("left", 7.65, 5.01, 2.55, 0.9, 0.1, "#9a90a0");
      S.patch("left", 7.65, 5.01, 2.3, 0.6, 0.1, "#9a90a0");
      S.patch("left", 7.65, 5.01, 2.05, 0.8, 0.1, "#9a90a0");
      S.end();
    },
    // Chatroom: speech bubbles rising from a room, carried by one stream of events
    108(S, a, b) {
      S.plinth(10, 7, a, b);
      S.box(3.6, 2.6, 0, 2.6, 2.6, 1.2, mix(b, "#ffffff", 0.2), { top: mix(b, a, 0.45) });
      S.patch("left", 3.9, 5.2, 0.8, 2, 0.12, a, { cls: "wa-glow" });
      const bubble = (x, y, z, w, col, dots) => {
        S.box(x, y, z, w, 0.3, 1.1, col, { top: mix(col, "#ffffff", 0.3) });
        S.box(x + 0.3, y, z - 0.3, 0.35, 0.3, 0.3, col);
        if (dots) [0, 1, 2].forEach((i) => S.patch("left", x + 0.45 + i * 0.5, y + 0.3, z + 0.7, 0.28, 0.28, INK, { rx: 2 }));
        else S.patch("left", x + 0.35, y + 0.3, z + 0.75, w - 0.7, 0.14, INK), S.patch("left", x + 0.35, y + 0.3, z + 0.45, w - 1.3, 0.14, INK);
      };
      for (let i = 0; i < 6; i++) S.box(4.75, 3.75, 1.4 + i * 0.55, 0.3, 0.3, 0.3, a, { cls: i % 2 ? "" : "wa-glow" });
      bubble(0.6, 1.2, 3.2, 2.6, "#ffffff", false);
      bubble(6.8, 1.6, 4.4, 2.2, a, true);
      bubble(1.4, 5.4, 4.9, 2.4, "#c09cf5", false);
      S.arc([4.9, 3.9, 4.2], [7.6, 1.9, 4.3], 10, a, { sw: 1, head: false });
      S.arc([4.9, 3.9, 4.2], [2.4, 5.7, 4.8], 10, a, { sw: 1, head: false });
    },
    // Trellis: a lattice with a vine climbing through it, the way a request climbs through middleware
    150(S, a, b) {
      S.plinth(9, 5, a, b);
      const pole = mix("#c9b28a", b, 0.15);
      S.box(1, 1.4, 0, 7, 1.4, 0.45, shade(pole, 0.7));
      [1, 3.3, 5.6, 7.7].forEach((x) => S.box(x, 2, 0.45, 0.3, 0.3, 5, pole));
      [1.6, 3.2, 4.8].forEach((z) => S.box(1, 2.05, z, 7, 0.2, 0.2, pole));
      const path = [[1.4, 0.7], [2.1, 1.1], [2.8, 1.6], [3.6, 1.7], [4.4, 2], [5.1, 2.6], [5.8, 3.2], [6.4, 3.3], [7, 3.8], [6.6, 4.4], [6, 4.9]];
      path.forEach(([x, z], i) => {
        if (i === path.length - 1) return;
        S.box(x, 2.3, z, 0.35, 0.3, 0.35, i % 2 ? LEAF2 : LEAF, { cls: i % 3 ? "" : "wa-glow" });
        if (i % 2) S.box(x + 0.2, 2.3, z + 0.35, 0.3, 0.25, 0.2, LEAF);
      });
      S.begin("wa-glow");
      S.box(5.75, 2.25, 4.9, 0.6, 0.6, 0.5, TULIP, { top: mix(TULIP, "#ffffff", 0.25) });
      S.end();
    },
    // Tollbooth: a queue at the barrier, a bucket of tokens, and the request that came one too soon
    151(S, a, b) {
      S.plinth(11, 6, a, b);
      S.box(4.2, 0.4, 0, 1.8, 1.6, 2.6, mix(b, "#ffffff", 0.25), { top: mix(b, a, 0.55) });
      S.patch("left", 4.45, 2, 1.4, 1.3, 0.8, "#bfe6ff");
      S.box(4.1, 0.3, 2.6, 2, 1.8, 0.25, a);
      S.box(6.1, 1.5, 0, 0.35, 0.35, 1.3, STEEL);
      for (let i = 0; i < 5; i++) S.box(6.2 + i * 0.9, 1.55, 1.3, 0.9, 0.25, 0.25, i % 2 ? RED : "#f4efe6");
      for (let i = 0; i < 3; i++) S.box(0.5 + i * 1.15, 2.4, 0, 0.75, 0.75, 0.75, mix("#bfc6d8", a, 0.18 * i));
      S.box(3.9, 3.2, 0, 0.75, 0.75, 0.75, RED, { cls: "wa-glow" });
      S.arc([4.2, 3.6, 0.9], [2.2, 4.6, 0.2], 14, RED, { sw: 1 });
      S.box(7.4, 3.6, 0, 2.2, 1.8, 1.2, STEEL, { top: shade(STEEL, 0.55) });
      S.begin("wa-glow");
      for (let i = 0; i < 5; i++) S.box(7.6 + (i % 3) * 0.62, 3.85 + Math.floor(i / 3) * 0.7, 1.2, 0.5, 0.5, 0.25, GOLD, { top: mix(GOLD, "#ffffff", 0.3) });
      S.end();
    },
    // Courier: parcels on a belt, a loop back for another try, and a bin for the ones that never make it
    152(S, a, b) {
      S.plinth(12, 5, a, b);
      S.box(0.6, 1.6, 0, 9, 1.8, 0.8, "#34303f", { top: "#46404f" });
      for (let i = 0; i < 9; i++) S.patch("top", 0.9 + i, 1.6, 0.8, 0.12, 1.8, "#5a5466");
      [[1.2, "#d8a85a"], [3.6, "#d8a85a"], [6, a]].forEach(([x, c], i) => {
        if (i === 2) S.begin("wa-glow");
        S.box(x, 1.9, 0.8, 1.3, 1.2, 1, c, { top: mix(c, "#ffffff", 0.2) });
        S.patch("top", x + 0.55, 1.9, 1.8, 0.2, 1.2, mix(c, "#000000", 0.25));
        if (i === 2) S.end();
      });
      S.arc([6.6, 2.5, 2.1], [2, 2.5, 2.2], 22, a, { sw: 1.2 });
      S.box(10, 1.2, 0, 1.6, 2.4, 1.6, "#7a2a33", { top: "#3a1418" });
      S.box(10.2, 1.6, 1.0, 1.1, 1.0, 0.7, "#d8a85a");
    },
    // Relay: two masts and a sealed envelope crossing between them
    153(S, a, b) {
      S.plinth(12, 5, a, b);
      const mast = (x, y, col) => {
        S.box(x, y, 0, 1.4, 1.4, 0.5, shade(col, 0.8));
        S.box(x + 0.5, y + 0.5, 0.5, 0.4, 0.4, 3.4, col);
        S.box(x + 0.1, y + 0.1, 3.9, 1.2, 1.2, 0.3, mix(col, "#ffffff", 0.2));
      };
      mast(0.6, 1.4, STEEL);
      mast(10, 1.4, mix(a, "#ffffff", 0.3));
      S.arc([1.3, 2.1, 4.3], [10.7, 2.1, 4.3], 30, a, { sw: 1.1 });
      S.begin("wa-float");
      S.box(5, 1.4, 5.6, 2.4, 1.6, 0.15, PAPER, { top: "#ffffff" });
      S.patch("top", 5.15, 1.55, 5.75, 2.1, 0.08, "#d9cfc0");
      S.disc(6.2, 2.2, 5.76, 0.32, RED);
      S.end();
    },
  };
  const TITLES = { 101: "Greenhouse", 102: "Taskflow", 103: "Shortlink", 104: "Inkwell", 105: "Keyring", 106: "Bookshelf", 107: "Market", 108: "Chatroom", 150: "Trellis", 151: "Tollbooth", 152: "Courier", 153: "Relay" };

  // the motion, shared by every page that shows a scene: glows breathe, floats bob; still for reduced motion
  if (!document.getElementById("wa-style")) {
    const st = document.createElement("style");
    st.id = "wa-style";
    st.textContent = `.wa{display:block;overflow:visible}.wa .wa-glow{animation:wa-glow 2.8s ease-in-out infinite}.wa .wa-float{animation:wa-float 3.4s ease-in-out infinite}
@keyframes wa-glow{0%,100%{filter:none}50%{filter:drop-shadow(0 0 3px rgba(255,255,255,.55)) brightness(1.12)}}
@keyframes wa-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@media (prefers-reduced-motion:reduce){.wa .wa-glow,.wa .wa-float{animation:none}}`;
    document.head.append(st);
  }

  window.WBArt = {
    has: (num) => !!SCENES[num],
    svg(num, { a, b }) {
      const f = SCENES[num];
      if (!f) return "";
      const S = Scene();
      f(S, a, b);
      return S.toSVG(`${TITLES[num] || "Project"}, as a small voxel model`);
    },
  };
})();
