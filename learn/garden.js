/* Tulip Labs: the garden.
   Every chapter is a pixel flower that grows as you finish its tasks: a seed in its cube pot,
   a sprout, a bud, half open, then full bloom. The kind of flower and its colour come from the
   chapter id, so a chapter always grows the same flower. Everything is drawn in code.

   GARDEN.draw(canvas, {id, stage, hues, ink})   stage 0..4, hues = colours the bloom may take
   GARDEN.stage(pct)                             0..100 % of tasks done -> stage
   GARDEN.grow(canvas, opts)                     draw stages 0..opts.stage one after another */
(function () {
  "use strict";
  const KINDS = ["tulip", "berry", "cubes", "cross", "beet"];
  const LEAF = "#3faa52", LEAF_DEEP = "#24803c", POT = "#c8327a", PINK = "#ff8fc4", WHITE = "#fff7f2";
  const COLS = 15, ROWS = 21, MID = 7;

  function hash(s) {
    let x = 2166136261;
    for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
    return x >>> 0;
  }
  function rng(seed) {
    let s = seed || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const stage = (pct) => (pct >= 100 ? 4 : pct >= 67 ? 3 : pct >= 34 ? 2 : pct > 0 ? 1 : 0);
  const rgb = (c) => {
    if (c[0] !== "#") return c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const n = parseInt(c.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const css = (c) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(",")})`;
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return css(A.map((v, i) => v + (B[i] - v) * t)); };
  // lighten (k > 0) or darken (k < 0) a colour
  const tone = (hex, k) => css(rgb(hex).map((v) => (k > 0 ? v + (255 - v) * k : v * (1 + k))));

  function draw(cv, o) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 120, H = cv.clientHeight || 160;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const seed = hash(o.id), r = rng(seed);
    const kind = o.kind || KINDS[seed % KINDS.length];
    const hues = o.hues && o.hues.length ? o.hues : ["#ff6fb5"];
    const hue = hues[(seed >>> 4) % hues.length];
    const st = Math.max(0, Math.min(4, o.stage | 0));
    const u = Math.max(1, Math.floor(Math.min(W / COLS, H / ROWS) * 2) / 2);
    const ox = Math.round((W - COLS * u) / 2), oy = Math.round(H - ROWS * u);
    const X = (c) => ox + c * u, Y = (row) => oy + row * u;

    // one pixel, with a little tone jitter so a flat colour reads like paint
    const px = (c, row, col, round) => {
      x.fillStyle = tone(col, (r() - 0.5) * 0.22);
      if (round) { x.beginPath(); x.arc(X(c) + u / 2, Y(row) + u / 2, u * 0.46, 0, 7); x.fill(); }
      else x.fillRect(X(c), Y(row), u + 0.4, u + 0.4);
    };
    // fill a polygon, then wash it with soft blots of lighter and darker paint
    const wash = (pts, base) => {
      x.save();
      x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
      x.fillStyle = base; x.fill(); x.clip();
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      for (let k = 0; k < 10; k++) {
        x.globalAlpha = 0.1 + r() * 0.14;
        x.fillStyle = tone(base, (r() - 0.45) * 0.7);
        x.beginPath(); x.arc(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), (0.2 + r() * 0.5) * Math.max(x1 - x0, y1 - y0), 0, 7); x.fill();
      }
      x.restore();
    };
    // an isometric cube; cy is the centre of its top face
    const cube = (cx, cy, s, base, dot) => {
      const w = s * 0.866, h2 = s / 2;
      wash([[cx - w, cy], [cx, cy + h2], [cx, cy + h2 + s], [cx - w, cy + s]], base);
      wash([[cx, cy + h2], [cx + w, cy], [cx + w, cy + s], [cx, cy + h2 + s]], tone(base, -0.32));
      wash([[cx, cy - h2], [cx + w, cy], [cx, cy + h2], [cx - w, cy]], tone(base, 0.38));
      x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = Math.max(0.6, s / 22);
      x.beginPath(); x.moveTo(cx - w, cy); x.lineTo(cx, cy + h2); x.lineTo(cx + w, cy); x.moveTo(cx, cy + h2); x.lineTo(cx, cy + h2 + s); x.stroke();
      if (dot) { x.fillStyle = dot; x.beginPath(); x.ellipse(cx, cy, w * 0.32, h2 * 0.32, 0, 0, 7); x.fill(); }
    };
    // a flat isometric tile, like the petals of the watercolour cross
    const tile = (cx, cy, s, base) => {
      const w = s * 0.866, h2 = s / 2, t = s * 0.14;
      wash([[cx - w, cy], [cx, cy + h2], [cx + w, cy], [cx + w, cy + t], [cx, cy + h2 + t], [cx - w, cy + t]], tone(base, -0.3));
      wash([[cx, cy - h2], [cx + w, cy], [cx, cy + h2], [cx - w, cy]], tone(base, 0.3));
    };
    const leaf = (bits, c0, row0, mirror, col, vein) => bits.forEach((line, i) => [...line].forEach((b, j) => {
      if (b === ".") return;
      const c = mirror ? c0 - j : c0 + j;
      px(c, row0 + i, b === "v" && vein ? vein : col);
    }));

    // ---- the pot: a watercolour cube on the ground, with a shadow and two pencil ticks beside it
    const ps = u * 2.4, pw = ps * 0.866, pcx = X(MID) + u / 2, pcy = Y(ROWS - 0.4) - ps * 1.5;
    x.fillStyle = "rgba(0,0,0,.18)";
    x.beginPath(); x.moveTo(pcx - pw, pcy + ps); x.lineTo(pcx + u * 0.8, pcy + ps * 1.5 + u * 0.4); x.lineTo(pcx + pw + u * 1.4, pcy + ps * 1.1); x.lineTo(pcx + pw, pcy + ps * 0.6); x.fill();
    x.strokeStyle = o.ink || "rgba(255,255,255,.7)"; x.lineWidth = Math.max(1, u * 0.18);
    x.beginPath(); x.moveTo(pcx - pw - u * 2.6, pcy + ps * 1.25); x.lineTo(pcx - pw - u * 1.3, pcy + ps * 1.25); x.moveTo(pcx - pw - u * 1, pcy + ps * 1.25); x.lineTo(pcx - pw - u * 0.6, pcy + ps * 1.25);
    x.moveTo(pcx - pw - u * 2.2, pcy + ps * 1.25 + u * 0.7); x.lineTo(pcx - pw - u * 1.6, pcy + ps * 1.25 + u * 0.7); x.stroke();
    cube(pcx, pcy, ps, POT);

    const base = Math.floor((pcy - oy) / u); // the first row above the pot's top face
    const L = [1, 4, 6, 7, 8][st] + (kind === "berry" ? -1 : 0);
    const top = base - L;
    const stemCol = kind === "beet" ? "#d63c8f" : LEAF_DEEP;

    // ---- stem(s)
    const stem = (c, from, to) => { for (let row = from; row < to; row++) px(c, row, stemCol); };
    if (kind === "beet" && st >= 2) { stem(MID - 2, top + 3, base - 1); stem(MID + 2, top + 3, base - 1); px(MID - 1, base - 1, stemCol); px(MID + 1, base - 1, stemCol); }
    stem(MID, top, base);

    // ---- leaves
    const SMALL = ["##", "#."], MIDL = [".##", "###", "##."], BIG = ["..###", ".####", "##v##", "#v##.", "v#..."];
    if (st === 1) { leaf(SMALL, MID + 1, top, false, LEAF); leaf(SMALL, MID - 1, top + 1, true, LEAF); }
    if (st >= 2 && kind !== "beet") {
      leaf(MIDL, MID + 1, base - 3, false, LEAF); leaf(MIDL, MID - 1, base - 2, true, "#58bb4a");
      if (st >= 3 && kind !== "berry") { leaf(SMALL, MID + 1, base - 6, false, "#7cc742"); leaf(SMALL, MID - 1, base - 6, true, LEAF); }
    }

    // ---- the head
    const ht = top; // the row just above the stem's top
    if (kind === "tulip" && st >= 2) {
      // a stepped bowl that glows pink to white at its heart
      const rows = [null, null, [3, 3, 1], [5, 5, 3, 1], [9, 9, 7, 5, 3]][st];
      rows.forEach((w, i) => {
        const row = ht - rows.length + i;
        for (let j = 0; j < w; j++) {
          const c = MID - (w - 1) / 2 + j;
          const d = Math.hypot((c - MID) / 4.5, (rows.length - 1 - i) / rows.length);
          const col = d < 0.35 ? mix(WHITE, PINK, d / 0.35) : d < 0.75 ? mix(PINK, hue, (d - 0.35) / 0.4) : hue;
          px(Math.round(c), row, col);
        }
      });
    } else if (kind === "berry" && st >= 2) {
      // a round head of mixed dots and squares in shifting tones
      const R = [0, 0, 1.6, 2.6, 3.6][st], cy = ht - R - 0.5;
      for (let row = Math.floor(cy - R); row <= Math.ceil(cy + R); row++) for (let c = MID - 4; c <= MID + 4; c++) {
        const d = Math.hypot(c - MID, (row - cy) * 1.1);
        if (d > R) continue;
        x.globalAlpha = 1;
        const col = r() < 0.18 ? tone(hue, 0.45) : r() < 0.2 ? tone(hue, -0.25) : hue;
        x.fillStyle = tone(col, (r() - 0.5) * 0.3);
        if (r() < 0.55) { x.beginPath(); x.arc(X(c) + u / 2, Y(row) + u / 2, u * 0.45, 0, 7); x.fill(); }
        else x.fillRect(X(c) + u * 0.06, Y(row) + u * 0.06, u * 0.88, u * 0.88);
      }
      if (st >= 3) for (let k = 0; k < 6; k++) px(MID - 2 + Math.floor(r() * 5), Math.floor(cy - R - 1 - r() * 2), [LEAF, "#7cc742", "#a3b85f", "#c2c46a"][k % 4], r() < 0.5);
    } else if (kind === "cubes" && st >= 2) {
      // blooms as little cubes, like flowers printed in 3D, each with a sunny middle
      const sz = u * [0, 0, 1.6, 2.1, 2.5][st];
      const spots = [[0, 0], [-2.6, 1.6], [2.6, 0.6]].slice(0, st - 1);
      spots.forEach(([dx, dy], i) => {
        if (i) for (let k = 0; k < 2; k++) px(MID + Math.sign(dx) * (k + 1), Math.round(ht + dy + 1), stemCol);
        cube(X(MID) + u / 2 + dx * u, Y(ht + dy) - sz * 1.2, sz, i ? tone(hue, 0.18) : hue, i === 0 && st === 4 ? "#ffd21f" : null);
      });
    } else if (kind === "cross" && st >= 2) {
      // the watercolour flower: a cube on a cross of flat petals
      const t = u * 2.1, w = t * 0.866, h2 = t / 2, cx = X(MID) + u / 2, cy = Y(ht) - u * 2.6;
      const petals = [[0, -1], [-1, 0], [1, 0], [0, 1]].slice(0, [0, 0, 0, 2, 4][st]);
      const pt = ([i, j]) => [cx + (i - j) * w, cy + (i + j) * h2];
      petals.filter(([i, j]) => i + j < 0).forEach((p) => tile(...pt(p), t, tone(hue, 0.25)));
      if (st >= 3) petals.filter(([i, j]) => i + j > 0).forEach((p) => tile(...pt(p), t, tone(hue, 0.2)));
      cube(cx, cy - t * 0.55, t * (st === 2 ? 0.7 : 1), hue);
    } else if (kind === "beet" && st >= 2) {
      // pink-veined leaf panels on pink stalks, like the beet in a pot
      leaf(st >= 3 ? BIG : MIDL, MID + 1, ht - 1, false, LEAF, "#d63c8f");
      leaf(st >= 3 ? BIG : MIDL, MID - 1, ht, true, "#7cc742", "#d63c8f");
      if (st >= 3) { leaf(MIDL, MID + 3, ht + 4, false, "#58bb4a"); leaf(MIDL, MID - 3, ht + 5, true, LEAF); }
      if (st === 4) for (let k = 0; k < 3; k++) px(MID, ht - 1 - k, k ? "#7cc742" : "#a3d65f");
    }
    if (st === 2 && kind !== "tulip" && kind !== "cubes" && kind !== "cross" && kind !== "berry" && kind !== "beet") px(MID, ht - 1, hue);

    // ---- full bloom: a few stray pixels drift off it
    if (st === 4) {
      for (let k = 0; k < 7; k++) {
        const c = Math.round(MID + (r() - 0.5) * 13), row = Math.round(ht - 6 + r() * 9);
        if (Math.abs(c - MID) < 4) continue;
        x.globalAlpha = 0.55 + r() * 0.4;
        px(c, row, [hue, PINK, "#ffd21f", LEAF][k % 4], r() < 0.4);
      }
      x.globalAlpha = 1;
    }
    // a seed: one green dot just breaking the soil
    if (st === 0) { x.globalAlpha = 0.9; px(MID, base - 1, "#7cc742"); x.globalAlpha = 1; }
    x.globalAlpha = 1;
  }

  // Grow a flower in front of you: seed, sprout, bud, half, bloom.
  function grow(cv, o, step = 420) {
    let s = 0;
    const tick = () => { draw(cv, Object.assign({}, o, { stage: s })); if (s++ < o.stage) setTimeout(tick, step); };
    tick();
  }

  window.GARDEN = { draw, grow, stage, hash, KINDS };
})();
