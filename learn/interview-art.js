/* Tulip Labs: interview mode's pictures, all drawn in code so they follow Light/Dark and move.
   IVART.room(canvas)              the start page: a voxel interview room, alive (a clock, a typing laptop, a whiteboard)
   IVART.icon(canvas, stage)       a small pixel icon per stage: clarify, plan, code, test, twist
   IVART.steps(canvas, i)          the stage path: five steps, you standing on step i
   IVART.problem(canvas, id, how)  the problem's own example, drawn. how=false: just the input (no spoilers while you
                                   work); how=true: the technique playing out on it, on a loop (the scorecard)
   IVART.radar(canvas, rows)       the scorecard's six scores as a pixel radar
   Every animated canvas stops itself when it leaves the page. */
(function () {
  "use strict";
  const PINK = "#ff6fb5", PINK_D = "#d23f87", YEL = "#ffd21f", LEAF = "#3faa52", LEAF_D = "#24803c", BLUE = "#4f74d8", TEAL = "#1fa8c9", RED = "#e8453c", SKIN = "#f3d6c0", WOOD = "#b07a4c";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LETTER = { a: PINK, b: TEAL, c: YEL, d: LEAF, e: BLUE };

  // ------------------------------------------------------------- canvas --
  function setup(cv) {
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 300, H = cv.clientHeight || 150;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const st = getComputedStyle(cv);
    const v = (n, d) => (st.getPropertyValue(n) || "").trim() || d;
    const bgHex = v("--bg", "#efebe2"), dark = bgHex.startsWith("#") && parseInt(bgHex.slice(1, 3), 16) < 90;
    const T = { idle: dark ? "#4a5046" : "#e2dac8", dark, ink: v("--ink", "#1d1b17"), muted: v("--muted", "#6a655a"), line: v("--line", "#dcd5c6"), card: v("--card", "#fffdf8"), bg: v("--bg", "#efebe2"), soft: v("--soft", "#ece7dc"), ok: v("--ok", LEAF), bad: v("--bad", RED), mono: v("--f-mono", "monospace") };
    return { x, W, H, T };
  }
  // run draw(t) every frame while the canvas is on the page; with reduced motion, draw once at a telling moment
  function loop(cv, draw, still = 0) {
    if (cv._ivStop) cv._ivStop();
    if (reduce) { draw(still); return; }
    let on = true, t0 = performance.now();
    const f = (now) => {
      if (!on) return;
      if (!cv.isConnected) { on = false; return; }
      if (!document.hidden) draw((now - t0) / 1000);
      requestAnimationFrame(f);
    };
    cv._ivStop = () => { on = false; };
    requestAnimationFrame(f);
  }
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  };
  // a flat pixel tile with a darker lip underneath, so it reads as a block
  function tile(x, X, Y, w, h, col, lip = 3) {
    x.fillStyle = shade(col, 0.68); x.fillRect(X, Y + lip, w, h);
    x.fillStyle = col; x.fillRect(X, Y, w, h);
  }
  function text(x, s, X, Y, col, size = 12, align = "center", weight = 600, font) {
    x.fillStyle = col; x.font = `${weight} ${size}px ${font || "IBM Plex Mono, monospace"}`; x.textAlign = align; x.textBaseline = "middle";
    x.fillText(s, X, Y);
  }
  function arrow(x, x0, y0, x1, y1, col, w = 2) {
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = w;
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), s = 5 + w;
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x1 - s * Math.cos(a - 0.45), y1 - s * Math.sin(a - 0.45)); x.lineTo(x1 - s * Math.cos(a + 0.45), y1 - s * Math.sin(a + 0.45)); x.fill();
  }
  function arc(x, x0, x1, y, hgt, col, w = 2) {
    x.strokeStyle = col; x.lineWidth = w;
    x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0, y - hgt, x1, y - hgt, x1, y); x.stroke();
  }
  // isometric cube for the room: x right-down, y left-down, z up
  function isoCube(x, iso, X, Y, Z, w, d, h, col, alpha = 1) {
    const P = (a, b, c) => iso(a, b, c);
    const poly = (pts, f) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fillStyle = f; x.fill(); };
    x.globalAlpha = alpha;
    poly([P(X, Y + d, Z + h), P(X + w, Y + d, Z + h), P(X + w, Y + d, Z), P(X, Y + d, Z)], shade(col, 0.8));
    poly([P(X + w, Y, Z + h), P(X + w, Y + d, Z + h), P(X + w, Y + d, Z), P(X + w, Y, Z)], shade(col, 0.62));
    poly([P(X, Y, Z + h), P(X + w, Y, Z + h), P(X + w, Y + d, Z + h), P(X, Y + d, Z + h)], col);
    x.globalAlpha = 1;
  }
  const ease = (f) => (f < 0 ? 0 : f > 1 ? 1 : f * f * (3 - 2 * f));

  // --------------------------------------------------------------- room --
  // You on the left, the interviewer across the desk, a laptop typing your code, a whiteboard with a tree on it,
  // a clock on the wall, and a speech bubble that cycles through what an interview sounds like.
  function room(cv) {
    const SAY = ["?", "O(n)", "edge case?", "✓", "and if…"];
    loop(cv, (t) => {
      const { x, W, H, T } = setup(cv);
      const u = Math.min(W / 15, H / 14.2), c30 = Math.cos(Math.PI / 6), ox = W * 0.5, oy = H / 2 - 1.2 * u;
      const iso = (a, b, c) => [ox + (a - b) * u * c30, oy + (a + b) * u * 0.5 - c * u];
      const C = (...a) => isoCube(x, iso, ...a);
      // the floor: a checker of tiles
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        const pts = [iso(i, j, 0), iso(i + 1, j, 0), iso(i + 1, j + 1, 0), iso(i, j + 1, 0)];
        x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
        x.fillStyle = (i + j) % 2 ? T.soft : T.card; x.fill(); x.strokeStyle = T.line; x.lineWidth = 0.6; x.stroke();
      }
      // two back walls
      const wall = (pts, col) => { x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fillStyle = col; x.fill(); };
      wall([iso(0, 0, 0), iso(8, 0, 0), iso(8, 0, 5.6), iso(0, 0, 5.6)], shade(T.soft.startsWith("#") ? T.soft : "#ece7dc", 0.97));
      wall([iso(0, 0, 0), iso(0, 8, 0), iso(0, 8, 5.6), iso(0, 0, 5.6)], shade(T.soft.startsWith("#") ? T.soft : "#ece7dc", 0.9));
      wall([iso(0, 0, 0), iso(8, 0, 0), iso(8, 0, 0.3), iso(0, 0, 0.3)], T.line);
      wall([iso(0, 0, 0), iso(0, 8, 0), iso(0, 8, 0.3), iso(0, 0, 0.3)], T.line);
      // a window on the left wall, a square of sky
      wall([iso(0, 4.6, 2.4), iso(0, 6.8, 2.4), iso(0, 6.8, 4.6), iso(0, 4.6, 4.6)], "#9fd3ea");
      x.strokeStyle = T.card; x.lineWidth = 3; x.beginPath(); { const [a1, b1] = iso(0, 5.7, 2.4), [a2, b2] = iso(0, 5.7, 4.6); x.moveTo(a1, b1); x.lineTo(a2, b2); } x.stroke();
      // the back wall's whiteboard: a binary tree in marker, and a pixel tulip in the corner
      const wb = (a, b, c) => iso(a, b, c);
      const board = [wb(1.2, 0, 4.9), wb(6.6, 0, 4.9), wb(6.6, 0, 2.2), wb(1.2, 0, 2.2)];
      x.beginPath(); board.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
      x.fillStyle = "#fbfbf6"; x.fill(); x.strokeStyle = shade("#9aa0a6", 1); x.lineWidth = 3; x.stroke();
      const node = (a, c, col) => { const [p, q] = wb(a, 0, c); x.fillStyle = col; x.beginPath(); x.arc(p, q, u * 0.17, 0, 7); x.fill(); };
      const edge = (a1, c1, a2, c2) => { const [p1, q1] = wb(a1, 0, c1), [p2, q2] = wb(a2, 0, c2); x.strokeStyle = BLUE; x.lineWidth = 2; x.beginPath(); x.moveTo(p1, q1); x.lineTo(p2, q2); x.stroke(); };
      const drawn = reduce ? 9 : Math.floor((t * 1.5) % 12);
      const tree = [[3.9, 4.4], [2.8, 3.5], [5, 3.5], [2.2, 2.7], [3.4, 2.7], [4.5, 2.7], [5.6, 2.7]];
      [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].forEach(([a, b], k) => { if (k < drawn) edge(tree[a][0], tree[a][1], tree[b][0], tree[b][1]); });
      tree.forEach(([a, c], k) => { if (k <= drawn) node(a, c, k === Math.min(drawn, 6) ? PINK : BLUE); });
      // the clock, its hand going round
      const [cx, cy] = iso(0, 2.6, 4.2), r = u * 0.55;
      x.fillStyle = T.card; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.strokeStyle = T.ink; x.lineWidth = 2; x.stroke();
      const a = t * 0.9 - Math.PI / 2;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); x.strokeStyle = PINK_D; x.stroke();
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy - r * 0.55); x.strokeStyle = T.ink; x.stroke();
      // the interviewer, behind the desk
      const bob = reduce ? 0 : Math.sin(t * 2) * 0.04;
      C(4.6, 2.2, 0, 0.9, 0.8, 1.5, TEAL);
      C(4.75, 2.32, 1.5 + bob, 0.6, 0.55, 0.6, SKIN);
      C(4.72, 2.3, 2.05 + bob, 0.66, 0.6, 0.12, "#3b2a20");
      // the desk and the laptop
      C(2.2, 3.4, 0, 4.6, 1.6, 1.05, WOOD);
      C(3.3, 3.75, 1.05, 1.4, 0.95, 0.08, "#4a4f57");
      const sc = [iso(3.3, 3.75, 1.13), iso(4.7, 3.75, 1.13), iso(4.7, 3.75, 2.05), iso(3.3, 3.75, 2.05)];
      x.beginPath(); sc.forEach(([p, q], k) => (k ? x.lineTo(p, q) : x.moveTo(p, q))); x.closePath(); x.fillStyle = "#16181d"; x.fill();
      // code typing on the screen, line by line
      const lines = reduce ? 5 : Math.floor((t * 2.2) % 9);
      for (let k = 0; k < Math.min(lines, 5); k++) {
        const len = [0.9, 0.6, 0.75, 0.45, 0.8][k], [p, q] = iso(3.45 + (k % 2 ? 0.15 : 0), 3.75, 1.9 - k * 0.15), [p2, q2] = iso(3.45 + (k % 2 ? 0.15 : 0) + len, 3.75, 1.9 - k * 0.15);
        x.strokeStyle = [PINK, YEL, LEAF, TEAL, PINK][k]; x.lineWidth = Math.max(1.5, u * 0.07); x.beginPath(); x.moveTo(p, q); x.lineTo(p2, q2); x.stroke();
      }
      // you, in front of the desk, facing it
      C(3.6, 5.4, 0, 0.9, 0.8, 1.45, PINK);
      C(3.75, 5.5, 1.45 - bob, 0.6, 0.55, 0.6, SKIN);
      C(3.72, 5.48, 2.0 - bob, 0.66, 0.6, 0.14, "#2b1d14");
      // a plant in a cube pot, the brand's tulip, by the desk
      C(7.0, 4.2, 0, 0.7, 0.7, 0.55, PINK_D);
      C(7.28, 4.48, 0.55, 0.14, 0.14, 0.9, LEAF_D);
      C(7.12, 4.32, 1.45, 0.46, 0.46, 0.42, PINK);
      C(7.25, 4.45, 1.6, 0.2, 0.2, 0.3, YEL);
      // the speech bubble over the interviewer, changing every couple of seconds
      const k = reduce ? 1 : Math.floor(t / 2.2) % SAY.length, f = reduce ? 1 : ease(((t / 2.2) % 1) * 5);
      const [bx, by] = iso(5.6, 2.2, 3.2);
      x.globalAlpha = f;
      x.font = `700 ${Math.round(u * 0.5)}px IBM Plex Mono, monospace`;
      const bw = x.measureText(SAY[k]).width + u * 0.7, bh = u * 0.85;
      x.fillStyle = T.card; x.strokeStyle = T.ink; x.lineWidth = 2;
      x.beginPath(); x.roundRect(bx, by - bh, bw, bh, 6); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(bx + 8, by); x.lineTo(bx + 2, by + 9); x.lineTo(bx + 18, by); x.fill();
      text(x, SAY[k], bx + bw / 2, by - bh / 2, k === 3 ? LEAF_D : PINK_D, Math.round(u * 0.5), "center", 700);
      x.globalAlpha = 1;
    }, 2);
  }

  // ---------------------------------------------------------------- icons --
  // 8×8 pixel icons, one per stage
  const ICONS = {
    clarify: ["..####..", ".#....#.", "......#.", "....##..", "...#....", "...#....", "........", "...#...."],
    plan: ["#......#", "##....##", "#.#..#.#", "#..##..#", "#......#", "#..##..#", "#.#..#.#", "##....##"],
    code: ["........", "..#..#..", ".#....#.", "#......#", "#......#", ".#....#.", "..#..#..", "........"],
    test: ["..####..", ".#....#.", "#..##..#", "#.####.#", "#..##..#", ".#....#.", "..####..", "...##..."],
    twist: [".####...", "#....#..", "#.....#.", "#...###.", ".#...#..", "..#.....", "...####.", "........"],
  };
  const ICON_COL = { clarify: PINK, plan: TEAL, code: YEL, test: LEAF, twist: BLUE };
  function icon(cv, stage) {
    const { x, W, H } = setup(cv), g = ICONS[stage], p = Math.floor(Math.min(W, H) / 9), o = (W - p * 8) / 2;
    g.forEach((row, j) => [...row].forEach((c, i) => { if (c === "#") tile(x, o + i * p, (H - p * 8) / 2 + j * p, p, p, ICON_COL[stage], 1); }));
  }

  // ---------------------------------------------------------------- steps --
  // five steps climbing to the right; the ones you've reached glow, and you stand on the current one
  function steps(cv, cur) {
    loop(cv, (t) => {
      const { x, W, H, T } = setup(cv), n = 5, sw = W / n;
      for (let i = 0; i < n; i++) {
        const hh = 5 + i * ((H - 22) / n), X = i * sw + 1, Y = H - hh - 3;
        tile(x, X, Y, sw - 3, hh, i < cur ? PINK : i === cur ? YEL : T.line, 3);
      }
      const hop = reduce ? 0 : Math.abs(Math.sin(t * 3.2)) * 3, hh = 5 + cur * ((H - 22) / n), px = cur * sw + sw / 2 - 4, py = H - hh - 3 - 14 - hop;
      tile(x, px, py + 5, 8, 9, PINK_D, 1);
      tile(x, px + 1, py, 6, 5, SKIN, 1);
    }, 0);
  }

  // -------------------------------------------------------------- problems --
  // each draws its example. A how-animation loops over `len` seconds; s is 0..1 through it
  const P = {};
  const row = (W, n, gap = 8, max = 52) => { const w = Math.min(max, (W - 20 - gap * (n - 1)) / n); return { w, x0: (W - (w * n + gap * (n - 1))) / 2, gap }; };
  const cap = (x, s, X, Y, T, col) => {
    const W = x.canvas.clientWidth || x.canvas.width;
    let size = 11;
    x.font = `500 ${size}px IBM Plex Mono, monospace`;
    while (size > 7 && x.measureText(s).width > W - 12) { size -= 0.5; x.font = `500 ${size}px IBM Plex Mono, monospace`; }
    text(x, s, X, Y, col || T.muted, size, "center", 500);
  };

  P.pairs = { len: 6, draw(x, W, H, T, how, s) {
    const a = [1, 5, 3, 3, 4], t = 6, R = row(W, a.length), y = H * 0.55;
    const step = how ? Math.min(a.length, Math.floor(s * (a.length + 1.5))) : -1, seen = {};
    for (let i = 0; i < Math.max(0, step); i++) seen[a[i]] = (seen[a[i]] || 0) + 1;
    a.forEach((v, i) => {
      const X = R.x0 + i * (R.w + R.gap), on = how && i === step;
      tile(x, X, y - R.w * 0.7, R.w, R.w * 1.3, on ? YEL : i < step || !how ? PINK : T.idle);
      text(x, String(v), X + R.w / 2, y, on || i < step || !how ? "#1d1b17" : T.ink, 18, "center", 700);
      // a pair found: an arc back to each earlier partner
      if (how && i < step) for (let j = 0; j < i; j++) if (a[j] + v === t) arc(x, R.x0 + j * (R.w + R.gap) + R.w / 2, X + R.w / 2, y - R.w * 0.75, 34 + (i - j) * 8, LEAF_D, 2.5);
    });
    cap(x, `t = ${t}: two different cards that add up to it`, W / 2, H - 12, T);
    if (how) cap(x, `seen so far: { ${Object.entries(seen).map(([k, v]) => `${k}: ${v}`).join(", ")} }`, W / 2, 14, T, PINK_D);
  } };
  P.closest = { len: 7, draw(x, W, H, T, how, s) {
    const a = [1, 3, 4, 7, 10], t = 15, R = row(W, a.length), base = H - 34;
    const path = [[0, 4], [1, 4], [2, 4], [2, 3]], k = how ? Math.min(path.length - 1, Math.floor(s * (path.length + 0.6))) : -1;
    a.forEach((v, i) => {
      const X = R.x0 + i * (R.w + R.gap), h = 12 + v * ((H - 84) / 10), at = k >= 0 && path[k].includes(i);
      tile(x, X, base - h, R.w, h, at ? YEL : BLUE);
      text(x, String(v), X + R.w / 2, base - h - 10, T.ink, 13, "center", 700);
    });
    if (k >= 0) {
      const [i, j] = path[k], sum = a[i] + a[j];
      [i, j].forEach((q, n) => { const X = R.x0 + q * (R.w + R.gap) + R.w / 2; arrow(x, X, H - 6, X, base + 6, n ? PINK_D : PINK_D, 2.5); });
      cap(x, `${a[i]} + ${a[j]} = ${sum}: ${sum < t ? "too small, move left →" : sum > t ? "too big, ← move right" : "exact"} · off by ${Math.abs(sum - t)}`, W / 2, 14, T, PINK_D);
    } else cap(x, `sorted weights, target ${t}`, W / 2, 14, T);
  } };
  P.distinct = { len: 8, draw(x, W, H, T, how, s) {
    const str = "aabcbbd", k = 2, R = row(W, str.length, 5, 44), y = H * 0.48;
    // the window as it is at each step of the right edge: [left, right]
    const wins = [[0, 0], [0, 1], [0, 2], [2, 3], [2, 4], [2, 5], [3, 6]], best = [2, 5];
    const w = how ? wins[Math.min(wins.length - 1, Math.floor(s * (wins.length + 1)))] : null;
    [...str].forEach((ch, i) => { const X = R.x0 + i * (R.w + R.gap); tile(x, X, y - R.w / 2, R.w, R.w, LETTER[ch]); text(x, ch, X + R.w / 2, y, "#1d1b17", 16, "center", 700); });
    const bracket = (l, r, col, dy) => { const X0 = R.x0 + l * (R.w + R.gap) - 4, X1 = R.x0 + r * (R.w + R.gap) + R.w + 4; x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(X0, y - R.w / 2 - 6 + dy, X1 - X0, R.w + 12); };
    if (w) { bracket(w[0], w[1], PINK_D, 0); cap(x, `window "${str.slice(w[0], w[1] + 1)}": ${new Set(str.slice(w[0], w[1] + 1)).size} kinds`, W / 2, 16, T, PINK_D); }
    else cap(x, `one letter per bird · at most ${k} kinds in a stretch`, W / 2, 16, T);
    if (how && s > 0.85) bracket(best[0], best[1], LEAF_D, 0);
  } };
  P.range = { len: 7, draw(x, W, H, T, how, s) {
    const a = [1, 2, 2, 2, 5], q = 2, R = row(W, a.length), base = H - 30;
    a.forEach((v, i) => {
      const X = R.x0 + i * (R.w + R.gap), h = 14 + v * ((H - 92) / 5), hit = how && s > 0.6 && v === q;
      tile(x, X, base - h, R.w, h, hit ? YEL : v === q ? PINK : TEAL);
      text(x, String(v), X + R.w / 2, base - h - 10, T.ink, 13, "center", 700);
      text(x, String(i), X + R.w / 2, base + 14, T.muted, 10, "center", 500);
    });
    if (how) {
      // binary search narrowing on the first 2: lo and hi markers
      const steps = [[0, 5], [0, 2], [1, 2], [1, 1]], k = Math.min(steps.length - 1, Math.floor(s * 5));
      const [lo, hi] = steps[k], X = (i) => R.x0 + Math.min(i, a.length) * (R.w + R.gap) - R.gap / 2;
      x.fillStyle = PINK_D; x.globalAlpha = 0.18; x.fillRect(X(lo), 26, X(hi) - X(lo) + (lo === hi ? 4 : 0), base - 26); x.globalAlpha = 1;
      cap(x, s > 0.6 ? "first 2 at index 1, last at 3: two searches, log n each" : `searching [${lo}, ${hi})`, W / 2, 14, T, PINK_D);
    } else cap(x, `sorted ledger · where does ${q} start and end?`, W / 2, 14, T);
  } };
  P.higher = { len: 8, draw(x, W, H, T, how, s) {
    const a = [3, 1, 4, 2, 5], ans = [2, 1, 2, 1, 0], R = row(W, a.length), base = H - 26;
    const k = how ? Math.min(a.length, Math.floor(s * (a.length + 2))) : -1;
    a.forEach((v, i) => {
      const X = R.x0 + i * (R.w + R.gap), h = 14 + v * ((H - 84) / 5);
      tile(x, X, base - h, R.w, h, i === k ? YEL : BLUE);
      text(x, String(v), X + R.w / 2, base - h - 10, T.ink, 13, "center", 700);
    });
    if (how) for (let i = 0; i < a.length; i++) if (ans[i] && i + ans[i] < k + 1) {
      const X0 = R.x0 + i * (R.w + R.gap) + R.w / 2, X1 = R.x0 + (i + ans[i]) * (R.w + R.gap) + R.w / 2;
      arc(x, X0, X1, base - 14 - a[i] * ((H - 84) / 5) - 18, 20, PINK_D, 2.5);
    }
    cap(x, how ? "each new price answers every waiting day it beats" : "daily prices · days until a higher one?", W / 2, 12, T, how ? PINK_D : T.muted);
  } };
  P.median = { len: 8, draw(x, W, H, T, how, s) {
    const a = [5, 2, 8, 1], n = how ? Math.min(a.length, 1 + Math.floor(s * (a.length + 0.5))) : a.length;
    const seen = a.slice(0, n).sort((p, q) => p - q), lowN = Math.ceil(n / 2), size = Math.min(36, H / 6);
    if (!how) {
      const R = row(W, a.length);
      a.forEach((v, i) => { const X = R.x0 + i * (R.w + R.gap); tile(x, X, H / 2 - R.w / 2, R.w, R.w, TEAL); text(x, String(v), X + R.w / 2, H / 2, "#1d1b17", 16, "center", 700); arrow(x, X + R.w / 2, 22, X + R.w / 2, H / 2 - R.w / 2 - 6, T.muted, 1.5); });
      cap(x, "readings arrive one at a time · the middle after each?", W / 2, H - 12, T);
      return;
    }
    // two stacks: the lower half (its top is the median) and the upper half
    const lx = W / 2 - size - 30, rx = W / 2 + 30;
    seen.slice(0, lowN).forEach((v, i) => { tile(x, lx, H - 30 - (i + 1) * (size + 4), size, size, i === lowN - 1 ? YEL : PINK); text(x, String(v), lx + size / 2, H - 30 - (i + 1) * (size + 4) + size / 2, "#1d1b17", 14, "center", 700); });
    seen.slice(lowN).forEach((v, i) => { tile(x, rx, H - 30 - (i + 1) * (size + 4), size, size, TEAL); text(x, String(v), rx + size / 2, H - 30 - (i + 1) * (size + 4) + size / 2, "#1d1b17", 14, "center", 700); });
    cap(x, "lower half", lx + size / 2, H - 12, T); cap(x, "upper half", rx + size / 2, H - 12, T);
    cap(x, `after ${a.slice(0, n).join(", ")}: middle ${seen[lowN - 1]}`, W / 2, 14, T, PINK_D);
  } };
  P.bookings = { len: 7, draw(x, W, H, T, how, s) {
    const bs = [[5, 8], [1, 3], [2, 4]], merged = [[1, 4], [5, 8]], X = (v) => 20 + (v / 9) * (W - 40);
    for (let v = 0; v <= 9; v++) { x.fillStyle = T.line; x.fillRect(X(v), H - 24, 1, 6); text(x, String(v), X(v), H - 10, T.muted, 10, "center", 500); }
    const order = how && s > 0.25 ? [...bs].sort((p, q) => p[0] - q[0]) : bs;
    order.forEach(([a, b], i) => tile(x, X(a), 26 + i * 22, X(b) - X(a), 14, [BLUE, PINK, TEAL][bs.indexOf(bs.find((z) => z[0] === a))]));
    if (how && s > 0.55) merged.forEach(([a, b]) => tile(x, X(a), H - 52, X(b) - X(a), 16, YEL));
    cap(x, how ? (s > 0.55 ? "busy: [1, 4] and [5, 8]" : s > 0.25 ? "sorted by start" : "as they were booked") : "bookings, in the order they were made", W / 2, 12, T, how ? PINK_D : T.muted);
  } };
  P.maze = { len: 6, draw(x, W, H, T, how, s) {
    const g = [".#.", "...", "#.."], n = 3, c = Math.min((H - 30) / n, (W - 40) / n), ox = (W - c * n) / 2, oy = 22;
    const dist = [[0, -1, 4], [1, 2, 3], [-1, 3, 4]], front = how ? Math.floor(s * 6) : -1;
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const wall = g[r][q] === "#", d = dist[r][q], lit = how && d >= 0 && d <= front;
      tile(x, ox + q * c + 2, oy + r * c + 2, c - 4, c - 4, wall ? WOOD : lit ? (d === front ? YEL : PINK) : T.idle);
      if (lit) text(x, String(d), ox + q * c + c / 2, oy + r * c + c / 2, "#1d1b17", 14, "center", 700);
    }
    tile(x, ox + c * 0.3, oy + c * 0.3, c * 0.4, c * 0.4, LEAF, 2);
    text(x, "★", ox + (n - 0.5) * c, oy + (n - 0.5) * c, PINK_D, 16);
    cap(x, how ? `the wave reaches step ${Math.min(front, 4)}` : "robot · shelves · the far corner", W / 2, 10, T, how ? PINK_D : T.muted);
  } };
  P.groups = { len: 7, draw(x, W, H, T, how, s) {
    const pos = [[0.18, 0.35], [0.36, 0.7], [0.5, 0.3], [0.72, 0.55], [0.88, 0.3]], links = [[0, 1], [1, 2], [3, 4]];
    const k = how ? Math.min(links.length, Math.floor(s * (links.length + 1.5))) : links.length;
    const root = [0, 1, 2, 3, 4], find = (v) => (root[v] === v ? v : (root[v] = find(root[v])));
    for (let i = 0; i < k; i++) root[find(links[i][0])] = find(links[i][1]);
    const col = (v) => [PINK, TEAL, YEL, BLUE, LEAF][find(v)];
    links.forEach(([a, b], i) => { if (!how || i < k) { x.strokeStyle = T.muted; x.lineWidth = 2.5; x.beginPath(); x.moveTo(pos[a][0] * W, pos[a][1] * H); x.lineTo(pos[b][0] * W, pos[b][1] * H); x.stroke(); } });
    pos.forEach(([p, q], v) => { tile(x, p * W - 14, q * H - 14, 28, 28, how ? col(v) : T.idle); text(x, String(v), p * W, q * H, "#1d1b17", 13, "center", 700); });
    const groups = new Set([0, 1, 2, 3, 4].map(find)).size;
    cap(x, how ? `${groups} group${groups === 1 ? "" : "s"}: each colour is one root` : "5 people · 3 friendships", W / 2, H - 10, T, how ? PINK_D : T.muted);
  } };
  P.stalls = { len: 7, draw(x, W, H, T, how, s) {
    const a = [2, 7, 9, 3, 1], pick = [0, 2, 4], R = row(W, a.length), y = H * 0.5, k = how ? Math.floor(s * (a.length + 1.5)) : -1;
    let take = 0, skip = 0;
    a.forEach((v, i) => {
      const X = R.x0 + i * (R.w + R.gap), on = how && s > 0.82 && pick.includes(i);
      tile(x, X, y - R.w * 0.4, R.w, R.w * 0.9, on ? LEAF : i === k ? YEL : T.idle);
      // an awning on top, like a market stall
      for (let j = 0; j < 4; j++) { x.fillStyle = j % 2 ? T.card : PINK; x.fillRect(X + (j * R.w) / 4, y - R.w * 0.62, R.w / 4, R.w * 0.2); }
      text(x, String(v), X + R.w / 2, y + 4, on || i === k ? "#1d1b17" : T.ink, 16, "center", 700);
      if (i < k) [take, skip] = [skip + v, Math.max(take, skip)];
    });
    cap(x, how ? (s > 0.82 ? "2 + 9 + 1 = 12: no two neighbours" : `best if the last is taken ${take}, skipped ${skip}`) : "a row of stalls · no two neighbours", W / 2, 14, T, how ? PINK_D : T.muted);
  } };
  P.toll = { len: 8, draw(x, W, H, T, how, s) {
    const g = [[1, 3, 1], [1, 5, 1], [4, 2, 1]], best = [[1, 4, 5], [2, 7, 6], [6, 8, 7]], path = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]];
    const n = 3, c = Math.min((H - 34) / n, (W - 40) / n), ox = (W - c * n) / 2, oy = 24, k = how ? Math.floor(s * 11) : -1;
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const idx = r * n + q, filled = how && idx <= k, onPath = how && k >= 9 && path.some(([pr, pq]) => pr === r && pq === q);
      tile(x, ox + q * c + 2, oy + r * c + 2, c - 4, c - 4, onPath ? LEAF : filled ? PINK : T.idle);
      text(x, String(g[r][q]), ox + q * c + c / 2, oy + r * c + c / 2 - (filled ? 6 : 0), filled || onPath ? "#1d1b17" : T.ink, 15, "center", 700);
      if (filled) text(x, String(best[r][q]), ox + q * c + c / 2, oy + r * c + c / 2 + 10, "#1d1b17", 10, "center", 600);
    }
    cap(x, how ? (k >= 9 ? "cheapest: 7, right, right, down, down" : "each block: its toll + the cheaper of above and left") : "tolls · only right or down", W / 2, 10, T, how ? PINK_D : T.muted);
  } };
  P.combos = { len: 7, draw(x, W, H, T, how, s) {
    const a = [2, 5, 2, 1, 2], R = row(W, a.length, 10, 44), y = how ? 36 : H / 2;
    a.forEach((v, i) => {
      const X = R.x0 + i * (R.w + R.gap) + R.w / 2;
      x.fillStyle = shade(YEL, 0.7); x.beginPath(); x.arc(X, y + 3, R.w / 2.2, 0, 7); x.fill();
      x.fillStyle = YEL; x.beginPath(); x.arc(X, y, R.w / 2.2, 0, 7); x.fill();
      text(x, String(v), X, y, "#1d1b17", 15, "center", 700);
    });
    if (how) {
      const found = [[1, 2, 2], [5]], k = Math.min(found.length, Math.floor(s * 3));
      found.slice(0, k).forEach((set, j) => text(x, `[${set.join(", ")}] = 5`, W / 2, 80 + j * 24, LEAF_D, 15, "center", 700));
      cap(x, "sorted, a value tried once per depth, stop when a coin is too big", W / 2, H - 12, T, PINK_D);
    } else cap(x, "a pocket of coins · pay exactly 5", W / 2, H - 14, T);
  } };

  function problem(cv, id, how) {
    const d = P[id];
    if (!d) return false;
    loop(cv, (t) => { const { x, W, H, T } = setup(cv); d.draw(x, W, H, T, how, how ? (t % d.len) / d.len : 0); }, d.len * 0.9);
    return true;
  }

  // ---------------------------------------------------------------- radar --
  function radar(cv, rows) {
    loop(cv, (t) => {
      const { x, W, H, T } = setup(cv), n = rows.length, cx = W / 2, cy = H / 2 + 4, R = Math.min(W, H) / 2 - 34;
      const pt = (i, f) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
      for (let ring = 1; ring <= 4; ring++) {
        x.beginPath(); for (let i = 0; i <= n; i++) { const [p, q] = pt(i % n, ring / 4); i ? x.lineTo(p, q) : x.moveTo(p, q); }
        x.strokeStyle = T.line; x.lineWidth = 1; x.stroke();
      }
      const g = reduce ? 1 : ease(Math.min(1, t / 1.1));
      x.beginPath(); rows.forEach((r, i) => { const [p, q] = pt(i, (Math.max(0.25, r.dots) / 4) * g); i ? x.lineTo(p, q) : x.moveTo(p, q); }); x.closePath();
      x.fillStyle = PINK; x.globalAlpha = 0.25; x.fill(); x.globalAlpha = 1; x.strokeStyle = PINK_D; x.lineWidth = 2.5; x.stroke();
      rows.forEach((r, i) => {
        const [p, q] = pt(i, (Math.max(0.25, r.dots) / 4) * g);
        tile(x, p - 4, q - 4, 8, 8, r.dots >= 3 ? LEAF : r.dots >= 2 ? YEL : RED, 2);
        const [lx, ly] = pt(i, 1.22);
        text(x, r.name.replace("Problem solving", "Solving"), lx, ly, T.ink, 11, "center", 600);
      });
    }, 2);
  }

  window.IVART = { room, icon, steps, problem, radar };
})();
