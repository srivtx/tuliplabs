/* The design studio's course list: one card per course, like a news card. A small printed picture in the course's
   own style, then the course number and size, its name, one line on what it teaches, and a pip per level.
   The levels and the reader's progress come from levels.js and the shared store (vnl-code-v1). */
(() => {
  "use strict";
  const { courses: COURSES, levels } = window.DZ;
  const $ = (s) => document.querySelector(s);
  let S = {};
  try { S = JSON.parse(localStorage.getItem("vnl-code-v1") || "{}"); } catch (e) { S = {}; }
  const done = S.done || {};
  const title = Object.fromEntries(levels.map((l) => [l.id, l.title]));
  const all = COURSES.flatMap((c) => c.ids);
  const at = (id) => all.indexOf(id) + 1; // a level's number in the studio's address (studio.html#n)
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  // A mosaic worked out from each cell's distance to the centre, so it mirrors both ways. rule(dx, dy) names a colour.
  function mosaic(n, rule, inks) {
    const mid = (n - 1) / 2;
    let out = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const k = rule(Math.abs(c - mid), Math.abs(r - mid));
      out += k ? `<i style="--c:${inks[k]}"></i>` : "<i></i>";
    }
    return `<span class="mo" style="--n:${n}">${out}</span>`;
  }
  const INK = { g: "#0f9a4e", p: "#ff6fb5", y: "#ffd21f", b: "#173fd6", w: "#fff4dc" };
  const weave = (dx, dy) => {
    const m = Math.max(dx, dy), n = Math.min(dx, dy);
    if (!m) return "g";
    if (m === 1) return "w";
    if (m === 2) return n === 2 ? "p" : "g";
    if (m === 3) return n >= 2 ? "y" : "p";
    if (m >= 4 && m <= 6 && n >= 4) return m === 5 && n === 5 ? "w" : (m === 6 || n === 4) ? "b" : "g";
    if (m >= 4 && n <= 1) return m === 7 ? "y" : n === 0 && m === 5 ? "w" : "b";
    if (m === 7 && (n === 7 || n === 3)) return "y";
    return "";
  };

  // ---------------------------------------------------------- pictures --
  // Each course's picture, drawn in what that course teaches. Wordless except where the letters are the point.
  const ART = {
    // wayfinding stripes over a box, a circle and a pill
    stripes: () => {
      const G = "#2f7d57", C = "#f3ecd9", B = "#e7cbb5", U = "#6f97e0", Y = "#e3b23c", N = "#1d2fa3";
      const rows = [[[G, 70], [C, 30]], [[C, 18], [B, 82]], [[N, 4], [U, 74], [C, 22]], [[C, 26], [Y, 74]]];
      return `<span class="bars">${rows.map((r) => `<i>${r.map(([col, w]) => `<b style="background:${col};flex:${w}"></b>`).join("")}</i>`).join("")}</span>
        <span class="shapes"><i></i><i></i><i></i></span>`;
    },
    // a type specimen: a ladder of sizes on one ratio (a perfect fourth) and a big italic ampersand
    type: () => `<span class="lad">${[48, 36, 27, 20, 15].map((z) => `<i style="--z:${z}"><b>${z}</b>Aa</i>`).join("")}</span><span class="amp">&amp;</span>`,
    // light: blurred colour fields under a halftone screen, and two colour tokens
    aurora: () => `<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="dots"></i><span class="tok"><code>--glow</code><code>--ink</code></span>`,
    // a sheet of tiles with a route through the picked ones
    tiles: () => {
      const pick = new Set(["1,0", "0,1", "1,2", "2,3", "4,0", "5,1", "4,2", "6,1", "7,2"]);
      let cells = "";
      for (let r = 0; r < 4; r++) for (let q = 0; q < 8; q++) cells += `<i${pick.has(q + "," + r) ? ' class="on"' : ""}></i>`;
      const line = (pts) => `<polyline pathLength="1" points="${pts.map(([q, r]) => `${q + .5},${r + .5}`).join(" ")}"/>`;
      return `<span class="sheet">${cells}<svg viewBox="0 0 8 4" preserveAspectRatio="none">${line([[1, 0], [0, 1], [1, 2], [2, 3]])}${line([[4, 0], [5, 1], [4, 2]])}${line([[6, 1], [7, 2]])}</svg></span>`;
    },
    // a printed weave on orange
    mosaic: () => mosaic(17, weave, INK),
    // interface parts as stickers
    stickers: () => `<span class="st s-toast"><i>✓</i>Saved <b>Undo</b></span><span class="st s-price">$12<small>/mo</small></span>
      <span class="st s-cmd"><kbd>⌘</kbd><kbd>K</kbd></span><span class="st s-chat">ship it? 🌷</span><span class="st s-play"><i></i><u></u></span>`,
    // one layout on three screens
    devices: () => {
      const blocks = (n) => `<span class="lay" style="--n:${n}">${"<i></i>".repeat(n === 1 ? 3 : n * 2)}</span>`;
      return `<span class="dv desk">${blocks(3)}</span><span class="dv tab">${blocks(2)}</span><span class="dv phone">${blocks(1)}</span>`;
    },
    // how a level works: the target, your board, and the meter between them
    how: () => `<span class="pair"><span class="tg"><i></i></span><span class="bd"><i></i></span></span><span class="mt"><i></i><b></b></span>`,
  };

  // ------------------------------------------------------------- cards --
  const pips = (ids) => `<span class="pips">${ids.map((id) => `<i${done[id] ? ' class="on"' : ""}></i>`).join("")}</span>`;
  let total = 0, fin = 0, next = null;
  const cards = COURSES.map((c, i) => {
    const got = c.ids.filter((id) => done[id]).length;
    total += c.ids.length; fin += got;
    const first = c.ids.find((id) => !done[id]) || c.ids[0];
    if (!next && got && got < c.ids.length) next = { id: first, c };
    const state = got === c.ids.length ? "Done" : got ? `${got} of ${c.ids.length}` : "Start";
    return `<a class="cc a-${c.art}" href="studio.html#${at(first)}">
      <span class="cc-art" aria-hidden="true">${(ART[c.art] || ART.stripes)()}</span>
      <span class="cc-meta"><em>Course ${String(i + 1).padStart(2, "0")}</em> · ${c.ids.length} levels${c.isNew ? '<span class="new">new</span>' : ""}</span>
      <span class="cc-t">${c.title}</span>
      <span class="cc-b">${c.blurb}</span>
      <span class="cc-p">${pips(c.ids)}<span${got === c.ids.length ? ' class="all"' : ""}>${state}</span></span>
    </a>`;
  });
  // the eighth tile, so the grid comes out even: what every level asks of you
  cards.push(`<div class="cc a-how">
      <span class="cc-art" aria-hidden="true">${ART.how()}</span>
      <span class="cc-meta"><em>How it works</em> · every level</span>
      <span class="cc-t">One target, one board</span>
      <ol class="cc-how"><li>Read the brief and its house rules.</li><li>Write the CSS. The HTML is fixed.</li><li>Lay your board over the target on desktop, tablet and phone.</li><li>Match 96% of the pixels and it's yours.</li></ol>
    </div>`);
  $("#courses").innerHTML = cards.join("");

  // where to pick up: the first course you've started and not finished, else the first level not done
  if (!next) {
    const id = all.find((x) => !done[x]) || all[0];
    next = { id, c: COURSES.find((c) => c.ids.includes(id)) };
  }
  // the next level's own target, drawn live from its HTML and answer CSS, the same way the studio draws it
  const lv = levels.find((l) => l.id === next.id);
  const answer = lv.css ? lv.css.split("\n").filter((l) => !l.startsWith("-")).map((l) => (l.startsWith("+") ? l.slice(1) : l)).join("\n") : lv.answer;
  const [w, h] = lv.devices ? lv.devices.desktop : [lv.w || 360, lv.h || 240];
  const nx = $("#next");
  nx.href = "studio.html#" + at(next.id);
  nx.innerHTML = `<span class="nx-shot" style="aspect-ratio:${w}/${h}"><iframe sandbox="" tabindex="-1" aria-hidden="true" title="" width="${w}" height="${h}"></iframe></span>
    <span class="nx-k"><em>${fin ? "Carry on" : "Start here"}</em> · ${next.c.title}, level ${next.c.ids.indexOf(next.id) + 1}</span>
    <span class="nx-t">${title[next.id]}</span>
    <span class="nx-b">${lv.brief}</span>`;
  const shot = nx.querySelector(".nx-shot"), frame = shot.firstChild;
  frame.srcdoc = `<!doctype html><html><head><style>${window.DZ.base(w, h)}${answer}</style></head><body>${lv.html}</body></html>`;
  const fit = () => { frame.style.scale = shot.clientWidth / w; };
  fit();
  new ResizeObserver(fit).observe(shot);
  $("#cl-n").innerHTML = `${WORDS[COURSES.length] || COURSES.length} courses <span>·</span> ${total} levels <span>·</span> <b>${fin}</b> matched`;
  $("#dz-count").textContent = `${fin} of ${total} matched`;
})();
