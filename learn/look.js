/* "A look inside" on the home page.
   Paints each row's panel (a textile poster, a striped sign, a tile puzzle, a paper-cut grove) as SVG,
   scales the little window to fit, and plays one real moment from the lab while the row is on screen. */
(() => {
  "use strict";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rects = (a) => a.map(([x, y, w, h, f, extra = ""]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${extra}/>`).join("");
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // a faint riso grain over every panel
  const GRAIN = `<filter id="lk-g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .22 0"/></filter><rect width="50" height="40" filter="url(#lk-g)"/>`;

  const ART = {
    // the green textile poster: a cross of squares, each with a small square inside
    tex() {
      const out = [[0, 0, 50, 40, "#079a4b"]];
      const motif = (cx, cy, c) => {
        const put = (dx, dy, f, dot) => {
          out.push([cx + dx * c, cy + dy * c, c, c, f]);
          if (dot) out.push([cx + dx * c + c * 0.4, cy + dy * c + c * 0.4, c * 0.2, c * 0.2, dot]);
        };
        put(0, 0, "#ff8f1f");
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(dx, dy, "#f6e7cf", "#ff8f1f");
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) put(dx, dy, "#12a6e8", "#e6eef0");
      };
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) motif(-1 + k * 22 + (m % 2) * 11, -4 + m * 19, 3.4);
      for (let i = 0; i < 14; i++) out.push([((rnd() * 25) | 0) * 2, ((rnd() * 20) | 0) * 2, 1.2, 1.2, "#ffd21f"]);
      return rects(out);
    },
    // the striped sign: bands that stop short, with cream ends
    sign() {
      const C = ["#2c7a4d", "#e9cdb4", "#6b95dd", "#e2b22b"], out = [[0, 0, 50, 40, "#2c7a4d"]];
      for (let i = 0, y = 0; y < 40; i++, y += 3.4) {
        const c = C[i % 4], left = i % 2 ? 7 : 0, right = i % 2 ? 0 : 8;
        out.push([0, y, 50, 3.4, "#f1ecd9"], [left, y, 50 - left - right, 3.4, c]);
        if (i % 4 === 2) out.push([0, y, 0.9, 3.4, "#1d3b9a"]);
      }
      return rects(out);
    },
    // the tile puzzle: green tiles on violet, two paths joining pink tiles
    tiles() {
      const out = [[0, 0, 50, 40, "#5b1cff"]], s = 7.6, o = 2.6, at = (c, r) => [o + c * s, o + r * s];
      const paths = [[[1, 0], [0, 1], [1, 2], [2, 3], [2, 4], [1, 5]], [[4, 1], [5, 2]], [[6, 3], [5, 4], [6, 5]]];
      const lit = new Set(paths.flat().map(([c, r]) => c + "," + r));
      let svg = "";
      for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
        const [x, y] = at(c, r);
        if (lit.has(c + "," + r)) svg += `<rect x="${x - 0.6}" y="${y - 0.6}" width="${s - 0.2}" height="${s - 0.2}" rx="1" fill="#ff9be0"/>`;
        svg += `<rect x="${x + 0.2}" y="${y + 0.2}" width="${s - 1.8}" height="${s - 1.8}" rx=".7" fill="#35c23a"/>`;
      }
      for (const p of paths) {
        const pts = p.map(([c, r]) => at(c, r).map((v) => v + s / 2 - 0.7).join(",")).join(" ");
        svg += `<polyline points="${pts}" fill="none" stroke="#5b1cff" stroke-width="1.3" stroke-linejoin="round"/>`;
        svg += p.map(([c, r]) => { const [x, y] = at(c, r); return `<rect x="${x + s / 2 - 1.8}" y="${y + s / 2 - 1.8}" width="2.2" height="2.2" rx=".3" fill="#5b1cff"/>`; }).join("");
      }
      return rects(out) + svg;
    },
    // the paper-cut grove: olive squares over brown trunks on cream
    grove() {
      let tr = "", cn = "";
      seed = 5;
      for (let i = 0; i < 26; i++) {
        const w = 6 + rnd() * 7, x = -3 + rnd() * 50, y = -3 + rnd() * 36;
        const tw = 1.4 + rnd(), th = 3 + rnd() * 5;
        tr += `<rect x="${x + w / 2 - tw / 2}" y="${y + w - 1}" width="${tw}" height="${th}" fill="${rnd() < 0.5 ? "#7a3a22" : "#5e2c1b"}"/>`;
        const f = rnd() < 0.18 ? "#f6f1e4" : ["#6f9a1f", "#7ea52a", "#648d19"][(rnd() * 3) | 0];
        cn += `<rect x="${x}" y="${y}" width="${w}" height="${w * (0.9 + rnd() * 0.25)}" fill="${f}"${f === "#f6f1e4" ? ' stroke="#e2dac6" stroke-width=".15"' : ""}/>`;
      }
      return rects([[0, 0, 50, 40, "#efe8d6"]]) + tr + cn;
    },
  };

  const shows = [...document.querySelectorAll(".show")];
  if (!shows.length) return;
  for (const s of shows) {
    const art = s.querySelector(".art");
    seed = 11;
    art.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 50 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ART[art.dataset.art]()}${GRAIN}</svg>`);
  }
  // the window is drawn at 600 × 410 and scaled to the panel
  const fit = (art) => {
    const narrow = art.clientWidth < 520;
    art.querySelector(".win").style.setProperty("--s", ((art.clientWidth * (narrow ? 0.92 : 0.86)) / 600).toFixed(4));
  };
  const ro = new ResizeObserver((es) => es.forEach((e) => fit(e.target)));
  shows.forEach((s) => ro.observe(s.querySelector(".art")));

  // each scene: setup() once, play() returns a stop function; final() draws the end state for reduced motion
  const wait = (ms, list) => new Promise((ok) => list.push(setTimeout(ok, ms)));
  const SCENES = {
    sim(root) {
      const cv = root.querySelector("canvas"), x = cv.getContext("2d"), gen = root.querySelector(".gen");
      const out = root.querySelector(".w-out"), btn = root.querySelector(".w-k");
      const N = 20;
      let g, n = 0;
      const reset = () => {
        g = new Uint8Array(N * N); n = 0;
        for (const [c, r] of [[2, 1], [3, 2], [1, 3], [2, 3], [3, 3], [14, 4], [15, 4], [16, 4], [14, 14], [15, 14], [14, 15], [15, 15]]) g[r * N + c] = 1;
      };
      const draw = () => {
        x.clearRect(0, 0, N, N);
        for (let i = 0; i < N * N; i++) if (g[i]) { x.fillStyle = i % N < 10 ? "#ff6fb5" : "#3faa52"; x.fillRect(i % N, (i / N) | 0, 1, 1); }
        gen.textContent = n;
      };
      const step = () => {
        const h = new Uint8Array(N * N);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          let k = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) k += g[((r + dr + N) % N) * N + ((c + dc + N) % N)];
          const v = g[r * N + c];
          h[r * N + c] = (!v && k === 3) || (v && (k === 2 || k === 3)) ? 1 : 0;
        }
        g = h; n++; draw();
      };
      const LINES = ['<span class="w-ok">✓</span> a blinker flips every step', '<span class="w-ok">✓</span> a glider moves one cell ↘ every 4 steps', '<span class="w-ok">✓</span> a block stays still', '<b>3 / 3 checks pass</b> · +25 XP'];
      const done = () => (out.innerHTML = LINES.map((l) => `<div class="w-line on">${l}</div>`).join(""));
      return {
        final() { reset(); for (let i = 0; i < 6; i++) step(); done(); },
        play() {
          let live = true, iv = 0;
          const t = [];
          (async () => {
            while (live) {
              reset(); draw(); out.innerHTML = "";
              clearInterval(iv); iv = setInterval(step, 230);
              await wait(1000, t); if (!live) return;
              btn.classList.add("press"); await wait(160, t); btn.classList.remove("press");
              out.innerHTML = '<div class="w-hop"><i></i><i></i><i></i>&nbsp;running</div>';
              await wait(1200, t); if (!live) return;
              out.innerHTML = LINES.map((l) => `<div class="w-line">${l}</div>`).join("");
              for (const el of out.children) { await wait(260, t); el.classList.add("on"); }
              await wait(4200, t);
            }
          })();
          return () => { live = false; clearInterval(iv); t.forEach(clearTimeout); };
        },
      };
    },

    bp(root) {
      const svg = root.querySelector("svg"), lis = [...root.querySelectorAll(".w-parts li")];
      const vn = root.querySelector(".w-ver"), stamp = root.closest(".win").querySelector(".w-stamp");
      const S = 46, W = S * 0.866, H = S * 0.5;
      const P = (gx, gy, gz) => [(gx - gy) * W, (gx + gy) * H - gz * S];
      const pos = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 1, 1]];
      const pts = (a) => a.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
      let floor = "";
      for (let i = 0; i <= 3; i++) {
        floor += `<line x1="${P(i - 0.5, -0.5, 0)[0]}" y1="${P(i - 0.5, -0.5, 0)[1] + S}" x2="${P(i - 0.5, 2.5, 0)[0]}" y2="${P(i - 0.5, 2.5, 0)[1] + S}"/>`;
        floor += `<line x1="${P(-0.5, i - 0.5, 0)[0]}" y1="${P(-0.5, i - 0.5, 0)[1] + S}" x2="${P(2.5, i - 0.5, 0)[0]}" y2="${P(2.5, i - 0.5, 0)[1] + S}"/>`;
      }
      const cube = ([gx, gy, gz], i) => {
        const [x, y] = P(gx, gy, gz), top = [[x, y - H], [x + W, y], [x, y + H], [x - W, y]];
        const l = [[x - W, y], [x, y + H], [x, y + H + S], [x - W, y + S]], r = [[x, y + H], [x + W, y], [x + W, y + S], [x, y + H + S]];
        return `<g class="cube" data-i="${i}"><polygon points="${pts(l)}" fill="#e6a21a"/><polygon points="${pts(r)}" fill="#b47708"/><polygon points="${pts(top)}" fill="#ffd36b"/>` +
          `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#5a3b00">${i + 1}</text></g>`;
      };
      svg.innerHTML = `<g stroke="currentColor" stroke-dasharray="3 4" opacity=".25" style="color:var(--muted)">${floor}</g>` + pos.map(cube).join("");
      const cubes = [...svg.querySelectorAll(".cube")];
      const set = (k) => {
        cubes.forEach((c, i) => c.classList.toggle("up", i < k));
        lis.forEach((l, i) => l.classList.toggle("on", i < k));
        vn.innerHTML = k >= 6 ? 'v1.0 <small>· shipped</small>' : `v0.${k} <small>· blueprint</small>`;
        stamp.classList.toggle("on", k >= 6);
      };
      return {
        final() { set(6); },
        play() {
          let live = true;
          const t = [];
          (async () => {
            while (live) {
              set(0); await wait(700, t);
              for (let k = 1; k <= 6 && live; k++) { set(k); await wait(k === 6 ? 3600 : 820, t); }
            }
          })();
          return () => { live = false; t.forEach(clearTimeout); };
        },
      };
    },

    test(root) {
      const tries = [...root.querySelectorAll(".w-try")], xp = root.querySelector(".w-xp");
      const bar = (el, on) => { const b = el.querySelector(".w-bar"); b.style.width = on ? b.dataset.w : "0"; };
      const set = (k) => { tries.forEach((el, i) => { el.classList.toggle("on", i < k); bar(el, i < k); }); xp.classList.toggle("on", k >= 3); root.querySelector(".w-next .w-line").classList.toggle("on", k >= 3); };
      return {
        final() { set(3); },
        play() {
          let live = true;
          const t = [];
          (async () => {
            while (live) { set(0); await wait(600, t); set(1); await wait(2000, t); set(2); await wait(1500, t); set(3); await wait(3800, t); }
          })();
          return () => { live = false; t.forEach(clearTimeout); };
        },
      };
    },

    garden(root) {
      const cvs = [...root.querySelectorAll("canvas")], xpEl = root.querySelector(".xp");
      const hues = ["#2fb38f", "#e6a21a", "#9a6be0", "#3caa4c"], goal = [4, 1, 2, 3];
      const draw = (k) => window.GARDEN && cvs.forEach((c, i) => GARDEN.draw(c, { id: "look:" + i, hues: [hues[i]], ink: "rgba(0,0,0,0)", stage: Math.min(goal[i], k) }));
      return {
        final() { draw(4); xpEl.textContent = "1,240"; },
        play() {
          let live = true;
          const t = [];
          (async () => {
            while (live) {
              draw(0); xpEl.textContent = "0"; await wait(500, t);
              for (let k = 1; k <= 4 && live; k++) {
                draw(k); xpEl.textContent = Math.round((1240 * k) / 4).toLocaleString("en");
                await wait(750, t);
              }
              await wait(3800, t);
            }
          })();
          return () => { live = false; t.forEach(clearTimeout); };
        },
      };
    },
  };

  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const s = e.target;
    if (e.isIntersecting && !s._stop) s._stop = s._scene.play();
    else if (!e.isIntersecting && s._stop) { s._stop(); s._stop = null; }
  }), { threshold: 0.3 });
  const start = () => shows.forEach((s) => {
    s._scene = SCENES[s.dataset.show](s.querySelector(".win-in"));
    if (REDUCED) s._scene.final(); else io.observe(s);
  });
  // the garden scene draws with GARDEN, which loads alongside this file
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start();
})();
