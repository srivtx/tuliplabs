/* Product news cards: a bright block with a pixel glyph, a deep block with a few words, then the date and title.
   <div class="news" data-news="4"></div> shows the newest 4, each linking to its story on the news page.
   data-news="all" shows every entry; pressing one opens its full story in a reading sheet, and news/#id opens it on arrival. */
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
      // the page keeps its grid still; a story opens in a reading sheet over it, with the next and previous stories a key away
      box.innerHTML = list.map((n, i) => `<a class="nw" href="#${esc(n.id)}" data-i="${i}">${art(n)}${meta(n)}<span class="nw-body">${esc(n.body)}</span></a>`).join("");
      const sheet = document.createElement("dialog");
      sheet.className = "nw-sheet";
      sheet.setAttribute("aria-label", "News story");
      document.body.append(sheet);
      let cur = -1;
      const show = (i) => {
        cur = i;
        const n = list[i];
        sheet.innerHTML = `<div class="sh-in"><button class="sh-x" type="button" aria-label="Close">×</button>${art(n)}
          <div class="sh-text">${meta(n).replace('class="nw-t"', 'class="nw-t sh-t"')}
            ${(n.more || [n.body]).map((p) => `<p>${esc(p)}</p>`).join("")}
            ${n.list ? `<ul>${n.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}
            <a class="nw-go" href="${base}${esc(n.href)}">${esc(n.cta || "Go see it")} →</a></div>
          <nav class="sh-nav"><button type="button" data-go="-1"${i ? "" : " disabled"}>← newer</button><span>${i + 1} / ${list.length}</span><button type="button" data-go="1"${i < list.length - 1 ? "" : " disabled"}>older →</button></nav></div>`;
        sheet.scrollTop = 0;
        history.replaceState(null, "", "#" + n.id);
      };
      const open = (i) => {
        show(i);
        if (!sheet.open) { sheet.showModal(); document.documentElement.classList.add("sheet-open"); }
        sheet.querySelector(".sh-x").focus();
      };
      const close = () => {
        if (!sheet.open) return;
        sheet.classList.add("closing");
        setTimeout(() => { sheet.classList.remove("closing"); sheet.close(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
      };
      sheet.addEventListener("close", () => {
        document.documentElement.classList.remove("sheet-open");
        history.replaceState(null, "", location.pathname);
        box.querySelector(`[data-i="${cur}"]`)?.focus();
      });
      sheet.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet || e.target.closest(".sh-x")) return close();
        const go = e.target.closest("[data-go]");
        if (go) show(cur + +go.dataset.go);
      });
      sheet.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" && cur < list.length - 1) show(cur + 1);
        if (e.key === "ArrowLeft" && cur > 0) show(cur - 1);
      });
      box.addEventListener("click", (e) => {
        const a = e.target.closest(".nw");
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); open(+a.dataset.i);
      });
      const fromHash = () => { const i = list.findIndex((n) => "#" + n.id === location.hash); if (i > -1) open(i); };
      fromHash(); addEventListener("hashchange", fromHash);
    }).catch(() => { box.hidden = true; });
  });
})();
