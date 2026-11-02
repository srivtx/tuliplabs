/* Product news cards: a bright block with a pixel glyph, a deep block with a few words, then the date and title.
   Every card links to its story's own page, news/<id>/ (written by tools/news.py).
   <div class="news" data-news="4"></div> shows the newest 4; data-skip="id" leaves one out; data-news="all" shows
   every entry with its summary. */
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
  const art = (n) => `<span class="nw-art" style="--a:${n.a};--b:${n.b}${n.c ? ";--c:" + n.c : ""}"><span>${glyph(n.glyph, n.g)}</span><b>${esc(n.card)}</b></span>`;
  const meta = (n) => `<span class="nw-meta"><em>${esc(n.kind)}</em> · ${day(n.date)}</span><span class="nw-t">${esc(n.title)}</span>`;

  document.querySelectorAll("[data-news]").forEach((box) => {
    const all = box.dataset.news === "all", base = box.dataset.base || "";
    fetch(base + "content/news.json").then((r) => r.json()).then((list) => {
      // an old news/#id link goes on to that story's own page
      const old = all && list.find((n) => "#" + n.id === location.hash);
      if (old) return location.replace(old.id + "/");
      const skip = box.dataset.skip, shown = list.filter((n) => n.id !== skip).slice(0, all ? list.length : +box.dataset.news || 4);
      box.innerHTML = shown.map((n) => `<a class="nw" href="${base}news/${esc(n.id)}/">${art(n)}${meta(n)}${all ? `<span class="nw-body">${esc(n.body)}</span>` : ""}</a>`).join("");
    }).catch(() => { box.hidden = true; });
  });
})();
