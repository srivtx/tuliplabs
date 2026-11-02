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

/* Quiet footer on the course pages: the section colours as links, and the books we build on.
   The home page has its own; the 3D worlds fill the whole window, so they get none. */
(() => {
  if (document.querySelector(".foot") || !document.querySelector(".wrap")) return;
  const root = document.querySelector(".top .brand")?.getAttribute("href") || "../";
  const S = [["worlds", "worlds/", "3D worlds"], ["tc", "code/", "Think Complexity"], ["ms", "modsim/", "ModSim"], ["bx", "build/", "Build your own X"],
    ["ps", "stats/", "Probability & Stats"], ["ds", "dsa/", "DSA"], ["od", "ods/", "Open Data Structures"]];
  const f = document.createElement("footer");
  f.className = "foot";
  f.innerHTML = `<div class="foot-in"><div class="foot-key">${S.map(([k, h, n]) => `<a class="k-${k}" href="${root}${h}"><i></i>${n}</a>`).join("")}</div>`
    + `<span>Built on open books by Allen B. Downey and <a href="https://opendatastructures.org">Pat Morin</a>. Progress stays in this browser.</span></div>`;
  document.body.append(f);
})();
