/* The section switcher in the top bar is a plain <details>, so it works without this file.
   This only closes it on Escape, on a click outside it, or after picking a link. */
(() => {
  const sw = document.querySelector(".sw");
  if (!sw) return;
  const close = () => { sw.open = false; };
  document.addEventListener("click", (e) => { if (sw.open && !sw.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sw.open) { close(); sw.querySelector("summary").focus(); } });
  sw.querySelector(".sw-menu")?.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
  addEventListener("hashchange", close);
  sw.addEventListener("toggle",() => { if (sw.open) (sw.querySelector('.sw-menu a[aria-current="page"]') || sw.querySelector(".sw-menu a")).focus({ preventScroll: true }); });
})();

/* Switching sections is a full page load. Make it feel instant: while a pointer rests on (or keyboard
   focus lands on) a section link, fetch that page and its lessons file into the cache ahead of the click. */
(() => {
  const DATA = { "code/": "tc", "modsim/": "ms", "build/": "bx", "stats/": "ps", "dsa/": "ds", "ods/": "od" };
  const seen = new Set();
  const warm = (a) => {
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || seen.has(url.pathname)) return;
    seen.add(url.pathname);
    const get = (u) => fetch(u, { credentials: "same-origin" }).catch(() => seen.delete(url.pathname));
    get(url.pathname);
    const key = Object.keys(DATA).find((k) => url.pathname.endsWith("/" + k));
    if (key) get(url.pathname.slice(0, -key.length) + "content/" + DATA[key] + ".json");
  };
  const pick = (e) => { const a = e.target.closest && e.target.closest(".sw-menu a, .foot-key a, .cards a.card"); if (a) warm(a); };
  document.addEventListener("pointerover", pick, { passive: true });
  document.addEventListener("focusin", pick);
  // Chrome can go further and prerender the page itself on hover.
  if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) {
    const s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = JSON.stringify({ prefetch: [{ source: "document", where: { selector_matches: ".sw-menu a, .foot-key a, .cards a.card" }, eagerness: "moderate" }] });
    document.head.append(s);
  }
})();

/* Light, dark or follow the system. The choice is one key in localStorage, read by a one-line
   script in every page's <head> so the page never flashes the wrong colours; this adds the switch
   to the bottom of the section menu. */
(() => {
  const menu = document.querySelector(".sw-menu");
  if (!menu) return;
  const KEY = "vnl-theme";
  const get = () => { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  const row = document.createElement("div");
  row.className = "sw-theme";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Colours");
  row.innerHTML = '<span>Colours</span>' + [["auto", "◐", "Auto"], ["light", "☀", "Light"], ["dark", "☾", "Dark"]]
    .map(([v, g, n]) => `<button type="button" data-t="${v}"><i>${g}</i>${n}</button>`).join("");
  const sync = () => row.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === get()));
  row.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const t = b.dataset.t;
    try { if (t === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (err) { /* private mode: still switch for this page */ }
    apply();
    sync();
  });
  // Auto follows the system, live: the page always carries a resolved light or dark, so pages
  // that are dark by design (home) still turn light when the laptop is in light mode.
  const sys = matchMedia("(prefers-color-scheme: light)");
  const apply = () => { const t = get(); document.documentElement.dataset.theme = t === "auto" ? (sys.matches ? "light" : "dark") : t; dispatchEvent(new Event("vnl-theme")); };
  sys.addEventListener?.("change", () => { if (get() === "auto") apply(); });
  sync();
  menu.append(row);
})();

/* "by svx": the studio mark, three letters on a 3 × 5 pixel grid with a pink x.
   It sits after the name in the top bar (wide screens) and in the footer line. */
window.SVX = (() => {
  const L = { s: ["###", "#..", "###", "..#", "###"], v: ["#.#", "#.#", "#.#", "#.#", ".#."], x: ["#.#", "#.#", ".#.", "#.#", "#.#"] };
  const cells = [..."svx"].map((ch, i) => L[ch].map((row, y) => [...row].map((c, x) => c === "#" ?
    `<rect x="${i * 4 + x}" y="${y}" width="1" height="1"${ch === "x" ? ' fill="#ff6fb5"' : ""}/>` : "").join("")).join("")).join("");
  return `<svg class="svx" viewBox="0 0 11 5" shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="svx">${cells}</svg>`;
})();
/* The name in the top bar rests as two letters, TL. Point at it (or tab to it) and it blooms:
   the missing letters slide in one by one in pink and settle to ink, the tulip nods, and "by svx" follows. */
(() => {
  const brand = document.querySelector(".top .brand"), b = brand && brand.querySelector("b");
  if (!b) return;
  const word = (w) => `<span class="wm-c">${w[0]}</span>` + [...w.slice(1)].map((ch, i) => `<span class="wm-x" style="--i:${i}">${ch}</span>`).join("");
  brand.setAttribute("aria-label", "Tulip Labs, home");
  b.className = "wm";
  b.setAttribute("aria-hidden", "true");
  b.innerHTML = word("Tulip") + '<span class="wm-gap"></span>' + word("Labs");
  b.insertAdjacentHTML("afterend", `<span class="by" aria-hidden="true">by ${SVX}</span>`);
})();

/* The footer is your whole garden: one flower per track, grown as far as your progress in it,
   standing in a strip of voxel grass. It fills in only when it scrolls near, so it costs nothing
   up front. The 3D worlds fill the whole window, so they get none. */
(() => {
  if (document.querySelector(".foot") || !document.querySelector("main")) return;
  const root = document.querySelector(".top .brand")?.getAttribute("href") || "../";
  const T = [["worlds", "worlds/", "Worlds", "#ff5fa8"], ["tc", "code/", "Complexity", "#2fb38f"], ["ms", "modsim/", "ModSim", "#3d8fe0"],
    ["bx", "build/", "Build X", "#e6a21a"], ["ps", "stats/", "Stats", "#9a6be0"], ["ds", "dsa/", "DSA", "#3caa4c"], ["od", "ods/", "ODS", "#ee6a4c"]];
  const f = document.createElement("footer");
  const logo = `<span class="logo" aria-hidden="true">${"<i></i>".repeat(9)}</span>`;
  const base = `<div class="gf-base"><span class="gf-brand">${logo}<b>Tulip Labs</b><em>· a product by ${SVX}</em></span>
    <a class="gf-news" href="${root}news/">news</a><span class="gf-keep">your progress lives in this browser</span><a class="gf-top" href="#">↑ top</a></div>`;
  // Lesson pages keep it quiet: one line of grass and one line of text. The garden lives on the home page.
  if (document.querySelector("#side")) {
    f.className = "foot sfoot";
    f.innerHTML = `<canvas class="gf-grass" aria-hidden="true"></canvas>${base}`;
    document.body.append(f);
    requestAnimationFrame(() => grass());
    addEventListener("resize", () => grass());
    top();
    return;
  }
  f.className = "foot gfoot";
  // a pixel bee drifts over the beds, 9×7 cells: y yellow, k black, w wing
  const bee = ["..ww.ww..", "..ww.ww..", ".yykyykk.", "kyykyykyk", ".yykyykk.", "...k.k...", "........."];
  const beeSvg = `<svg class="gf-bee" viewBox="0 0 9 7" aria-hidden="true" shape-rendering="crispEdges">${bee.map((r, y) => [...r].map((c, x) => c === "." ? "" :
    `<rect x="${x}" y="${y}" width="1" height="1" fill="${{ y: "#ffd21f", k: "#1b1a12", w: "#e8f4ff" }[c]}"${c === "w" ? ' class="w"' : ""}/>`).join("")).join("")}</svg>`;
  f.innerHTML = `<div class="gf-in">
    <div class="gf-head"><p class="gf-title">Keep <i>growing.</i></p>
      <p class="gf-sub">One flower for every track. Finish chapters and it blooms.</p></div>
    <div class="gf-beds">${beeSvg}${T.map(([k, h, n]) => `<a class="gf-bed k-${k}" href="${root}${h}" data-k="${k}"><span class="gf-pot"><canvas class="gf-ghost" aria-hidden="true"></canvas><canvas aria-hidden="true"></canvas></span><b>${n}</b><small>&nbsp;</small></a>`).join("")}</div>
  </div>
  <canvas class="gf-grass" aria-hidden="true"></canvas>${base}`;
  document.body.append(f);
  top();

  function top() {
    f.querySelector(".gf-top").addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
  }
  function grass() {
    const cv = f.querySelector(".gf-grass"), x = cv.getContext("2d");
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    let s = 7;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const G = ["#24803c", "#3faa52", "#58bb4a", "#7cc742", "#a3d65f"], B = ["#ff6fb5", "#fff6fb", "#f7b6d7", "#8095ff"];
    for (let c = 0; c * 7 < w; c++) {
      const top = 4 + Math.floor(r() * 4) * 6, tone = Math.floor(r() * 3);
      for (let y = top; y < h; y += 6) { x.fillStyle = G[Math.min(4, tone + (y === top ? 2 : y < top + 7 ? 1 : 0))]; x.fillRect(c * 7, y, 6, 5); }
      if (top >= 10 && r() < 0.07) { x.fillStyle = B[(r() * B.length) | 0]; x.fillRect(c * 7 + 1, top - 5, 4, 4); x.fillStyle = "#ffd21f"; x.fillRect(c * 7 + 2, top - 4, 2, 2); }
    }
  }
  let S = {}, P = {}, SUM = null;
  try { S = JSON.parse(localStorage.getItem("vnl-code-v1") || "{}"); P = JSON.parse(localStorage.getItem("vnl-progress") || "{}"); } catch (e) { /* private mode */ }
  function pct(k) {
    if (k === "worlds") return [Math.round((100 * ((P.done || []).length)) / 12), (P.done || []).length, 12];
    const chs = SUM[k] || [];
    const per = {};
    for (const id in S.done || {}) { const c = id.split("-")[0]; per[c] = (per[c] || 0) + 1; }
    let d = 0, n = 0, full = 0;
    for (const [id, , b] of chs) { const m = Math.min(per[id] || 0, b); d += m; n += b; if (m >= b * 0.9) full++; }
    return [n ? Math.round((100 * d) / n) : 0, full, chs.length];
  }
  function draw() {
    if (!SUM) return;
    f.querySelectorAll(".gf-bed").forEach((a) => {
      const k = a.dataset.k, [p, full, all] = pct(k);
      a.querySelector("small").textContent = all ? `${full}/${all}` : "soon";
      a.title = all ? `${full} of ${all} chapters in bloom` : "Coming soon";
      if (!window.GARDEN) return;
      const o = { id: "foot:" + k, hues: [T.find((t) => t[0] === k)[3]], ink: "rgba(0,0,0,0)" };
      const [ghost, now] = a.querySelectorAll("canvas");
      GARDEN.draw(ghost, Object.assign({ stage: 4 }, o));
      GARDEN.draw(now, Object.assign({ stage: GARDEN.stage(p) }, o));
    });
  }
  const go = () => {
    grass();
    if (SUM) return draw();
    fetch(root + "content/summary.json").then((r) => r.json()).catch(() => ({})).then((j) => { SUM = j || {}; draw(); });
  };
  new IntersectionObserver((es, o) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: "400px" }).observe(f);
  let t = 0;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (SUM) { grass(); draw(); } }, 200); });
})();
