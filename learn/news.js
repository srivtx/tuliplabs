/* Product news cards: a bright block with a pixel glyph, a deep block with a few words, then the date and title.
   <div class="news" data-news="4"></div> shows the newest 4; data-news="all" shows every entry with its note. */
(() => {
  "use strict";
  const G = {
    tulip: [".#.#.#.", "###.###", "##...##", ".##.##.", "#..#..#", "##.#.##", ".#####."],
    stairs: [".....##", ".....##", "...####", "...####", ".######", ".######", "......."],
    bars: ["......#", "....#.#", "....#.#", "..#.#.#", "..#.#.#", "#.#.#.#", "#.#.#.#"],
    sun: ["..###..", ".##.##.", "##...##", "##...##", "##...##", ".##.##.", "..###.."],
    prompt: ["#......", ".#.....", "..#....", ".#.....", "#......", "...####", "......."],
    grid: ["#.#.#.#", ".#.#.#.", "#.#.#.#", ".#.#.#.", "#.#.#.#", ".#.#.#.", "#.#.#.#"],
  };
  const glyph = (k, f = "#fff") => `<svg viewBox="0 0 7 7" shape-rendering="crispEdges" fill="${f}" aria-hidden="true">${(G[k] || G.grid).map((r, y) =>
    [...r].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "")).join("")).join("")}</svg>`;
  const day = (d) => new Date(d + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  document.querySelectorAll("[data-news]").forEach((box) => {
    const all = box.dataset.news === "all", base = box.dataset.base || "";
    fetch(base + "content/news.json").then((r) => r.json()).then((list) => {
      box.innerHTML = list.slice(0, all ? list.length : +box.dataset.news || 4).map((n) =>
        `<a class="nw" href="${base}${esc(n.href)}"><span class="nw-art" style="--a:${n.a};--b:${n.b}${n.c ? ";--c:" + n.c : ""}"><span>${glyph(n.glyph, n.g)}</span><b>${esc(n.card)}</b></span>` +
        `<span class="nw-meta"><em>${esc(n.kind)}</em> · ${day(n.date)}</span><span class="nw-t">${esc(n.title)}</span>` +
        (all ? `<span class="nw-body">${esc(n.body)}</span>` : "") + "</a>").join("");
    }).catch(() => { box.hidden = true; });
  });
})();
