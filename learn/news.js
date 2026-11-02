/* Product news cards: a bright block with a pixel glyph, a deep block with a few words, then the date and title.
   <div class="news" data-news="4"></div> shows the newest 4, each linking to its story on the news page.
   data-news="all" shows every entry; pressing one opens its full story across the row, and news/#id opens it on arrival. */
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
      if (!all) {
        box.innerHTML = list.slice(0, +box.dataset.news || 4).map((n) => `<a class="nw" href="${base}news/#${esc(n.id)}">${art(n)}${meta(n)}</a>`).join("");
        return;
      }
      box.innerHTML = list.map((n) => `<article class="nw" id="${esc(n.id)}">
        <button class="nw-head" type="button" aria-expanded="false" aria-controls="${esc(n.id)}-more">${art(n)}${meta(n)}<span class="nw-body">${esc(n.body)}</span></button>
        <div class="nw-more" id="${esc(n.id)}-more" hidden>${(n.more || []).map((p) => `<p>${esc(p)}</p>`).join("")}
          ${n.list ? `<ul>${n.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}
          <div class="nw-acts"><a class="nw-go" href="${base}${esc(n.href)}">${esc(n.cta || "Go see it")} →</a><button class="nw-x" type="button">close</button></div></div></article>`).join("");
      const open = (el, scroll) => {
        box.querySelectorAll(".nw.open").forEach((o) => o !== el && shut(o));
        el.classList.add("open");
        el.querySelector(".nw-head").setAttribute("aria-expanded", "true");
        el.querySelector(".nw-more").hidden = false;
        history.replaceState(null, "", "#" + el.id);
        if (scroll) requestAnimationFrame(() => el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
      };
      const shut = (el) => {
        el.classList.remove("open");
        el.querySelector(".nw-head").setAttribute("aria-expanded", "false");
        el.querySelector(".nw-more").hidden = true;
      };
      box.addEventListener("click", (e) => {
        const el = e.target.closest(".nw");
        if (!el) return;
        if (e.target.closest(".nw-x")) { shut(el); history.replaceState(null, "", location.pathname); el.querySelector(".nw-head").focus(); return; }
        if (e.target.closest(".nw-head")) el.classList.contains("open") ? shut(el) : open(el, true);
      });
      const want = location.hash && box.querySelector(`.nw[id="${CSS.escape(location.hash.slice(1))}"]`);
      if (want) open(want, true);
    }).catch(() => { box.hidden = true; });
  });
})();
