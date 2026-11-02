/* The design studio's front room: a hero poster you can push into register, and one printed poster per course.
   Each course's poster is drawn in that course's own style; the levels and the reader's progress come from
   levels.js and the shared store (vnl-code-v1). */
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
  function mosaic(n, rule, inks, cls) {
    const mid = (n - 1) / 2;
    let out = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const k = rule(Math.abs(c - mid), Math.abs(r - mid));
      out += k ? `<i style="--c:${inks[k]}"></i>` : "<i></i>";
    }
    return `<div class="${cls}" style="--n:${n}">${out}</div>`;
  }
  const INK = { g: "#0f9a4e", p: "#ff6fb5", y: "#ffd21f", o: "#ff7a12", b: "#139fe8", c: "#f6efe0", d: "#173fd6", w: "#e3e8ec" };
  // the hero's motif: a flower of four blue petals round a pink ring, yellow arms on the diagonals
  const heroRule = (dx, dy) => {
    const m = Math.max(dx, dy), n = Math.min(dx, dy);
    if (!m) return "g";
    if (m === 1) return n === 1 ? "w" : "g";
    if (m === 2) return "p";
    if (m >= 4 && m <= 6 && n <= 1) return m === 5 && !n ? "w" : n === 1 && m === 5 ? "g" : "b";
    if (dx === dy && m <= 5) return m === 3 ? "y" : m === 4 ? "o" : "y";
    if (m === 3 && n === 1) return "y";
    if (m === 7 && (n === 7 || n === 5)) return "y";
    if (m === 6 && n === 3) return "o";
    return "";
  };
  // the posters course: a wider, busier weave on orange
  const weaveRule = (dx, dy) => {
    const m = Math.max(dx, dy), n = Math.min(dx, dy);
    if (!m) return "g";
    if (m === 1) return "w";
    if (m === 2) return n === 2 ? "p" : "g";
    if (m === 3) return n >= 2 ? "y" : "p";
    if (m >= 4 && m <= 6 && n >= 4) return m === 5 && n === 5 ? "w" : (m === 6 || n === 4) ? "b" : "g";
    if (m >= 4 && n <= 1) return m === 7 ? "y" : n === 0 && m === 5 ? "w" : "b";
    if (m === 7 && n === 7) return "y";
    if (m === 7 && n === 3) return "y";
    return "";
  };

  // ------------------------------------------------------------ posters --
  const ART = {
    // signage stripes over a green panel
    stripes: (c) => {
      const G = "#2f7d57", C = "#f3ecd9", B = "#e7cbb5", U = "#6f97e0", Y = "#e3b23c", N = "#1d2fa3";
      const rows = [[[G, 82], [C, 18]], [[C, 20], [B, 80]], [[N, 2], [U, 76], [C, 22]], [[C, 22], [Y, 78]]];
      const bars = [...rows, ...rows].map((r) => `<i>${r.map(([col, w]) => `<b style="background:${col};flex:${w}"></b>`).join("")}</i>`).join("");
      return `<div class="a-stripes"><div class="bars">${bars}</div><p class="ttl">${c.title}.</p><p class="sm">Boxes, space<br>and shape</p></div>`;
    },
    // a type specimen: a ladder of sizes on one ratio, a giant Aa, a hanging quote
    type: (c) => `<div class="a-type"><ol class="lad">${["Display", "Headline", "Title", "Lead", "Body"].map((w, i) => `<li style="--z:${(4 / Math.pow(1.333, i)).toFixed(3)}"><span>${Math.round(48 / Math.pow(1.333, i))}</span>${w}</li>`).join("")}</ol>
      <span class="aa">Aa</span><span class="q">“</span><p class="ttl">${c.title}</p><p class="sm">1.333<br>a perfect fourth</p></div>`,
    // light: blurred colour fields under a halftone screen
    aurora: (c) => `<div class="a-aurora"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="dots"></i>
      <p class="ttl">${c.title.replace(" and ", "<br>and ")}</p><p class="tok"><code>--glow: #ff6fb5</code><code>--ink: #14121f</code></p></div>`,
    // a sheet of tiles with a route drawn through the picked ones
    tiles: (c) => {
      const pick = new Set(["1,0", "0,1", "1,2", "2,3", "1,4", "3,1", "4,2", "5,3", "4,4"]);
      let cells = "";
      for (let r = 0; r < 5; r++) for (let q = 0; q < 6; q++) cells += `<i${pick.has(q + "," + r) ? ' class="on"' : ""}></i>`;
      const line = (pts) => `<polyline points="${pts.map(([q, r]) => `${q + .5},${r + .5}`).join(" ")}"/>` + pts.map(([q, r]) => `<rect x="${q + .32}" y="${r + .32}" width=".36" height=".36" rx=".06"/>`).join("");
      return `<div class="a-tiles"><div class="sheet"><p class="hd">Grids that hold<br>a whole page</p><div class="grid">${cells}
        <svg viewBox="0 0 6 5" preserveAspectRatio="none" aria-hidden="true">${line([[1, 0], [0, 1], [1, 2], [2, 3], [1, 4]])}${line([[3, 1], [4, 2]])}${line([[5, 3], [4, 4]])}</svg></div></div>
        <p class="ttl">${c.title}</p></div>`;
    },
    // a printed textile poster: serif in the corners, a weave in the middle
    mosaic: (c) => `<div class="a-mosaic"><p class="tl">Posters<br>and patterns</p><p class="tr">Swiss, Bauhaus<br>and op art</p>
      ${mosaic(17, weaveRule, INK, "mo")}<p class="fine"><span>Six posters drawn with nothing but CSS: grids, stripes, circles, rings and pixels.</span><span>Every shape is a box, a gradient or a shadow.</span></p><p class="br">Tulip Labs<br>Design studio</p></div>`,
    // a sticker sheet of interface parts
    stickers: (c) => `<div class="a-stickers">
      <span class="st s-toast"><i>✓</i>Saved to your board <b>Undo</b></span>
      <span class="st s-price"><small>Pro</small>$12<small>/mo</small></span>
      <span class="st s-player"><i></i><span><b>Night garden</b><em><u></u></em></span></span>
      <span class="st s-cmd"><kbd>⌘</kbd><kbd>K</kbd></span>
      <span class="st s-chat">ship it? 🌷</span>
      <span class="st s-stat"><small>Visitors</small>12.4k <b>+18%</b></span>
      <p class="ttl">${c.title.replace(" ", "<br>")}</p></div>`,
    // one layout on three screens, framed with pink crop marks
    devices: (c) => {
      const blocks = (n) => `<span class="lay" style="--n:${n}">${"<i></i>".repeat(n === 1 ? 3 : n * 2)}</span>`;
      return `<div class="a-devices"><span class="cm c1"></span><span class="cm c2"></span><span class="cm c3"></span><span class="cm c4"></span>
        <span class="dv desk"><b></b>${blocks(3)}</span><span class="dv tab">${blocks(2)}</span><span class="dv phone">${blocks(1)}</span>
        <p class="ttl">${c.title}</p><p class="sm">one CSS file,<br>three screens</p></div>`;
    },
  };

  // ------------------------------------------------------------- cards --
  const box = $("#courses");
  let total = 0, fin = 0, next = null;
  box.innerHTML = COURSES.map((c, i) => {
    const got = c.ids.filter((id) => done[id]).length;
    total += c.ids.length; fin += got;
    const first = c.ids.find((id) => !done[id]) || c.ids[0];
    if (!next && got < c.ids.length && (got || i === 0)) next = first;
    const state = got === c.ids.length ? "Again" : got ? "Carry on" : "Start the course";
    return `<article class="cc k-${c.art}${c.isNew ? " fresh" : ""}">
      <a class="hit" href="studio.html#${at(first)}" aria-label="${state}: ${c.title}"></a>
      <div class="cc-poster" aria-hidden="true">${(ART[c.art] || ART.stripes)(c)}</div>
      <div class="cc-cap">
        <p class="cc-k"><span>Course ${String(i + 1).padStart(2, "0")}${c.isNew ? ' <em>new</em>' : ""}</span><span>${got} / ${c.ids.length}</span></p>
        <h3>${c.title}</h3>
        <p class="cc-b">${c.blurb}</p>
        <ul class="cc-learn">${(c.learn || []).map((t) => `<li>${t}</li>`).join("")}</ul>
        <ol class="cc-lv">${c.ids.map((id) => `<li class="${done[id] ? "ok" : ""}"><a href="studio.html#${at(id)}">${title[id]}</a></li>`).join("")}</ol>
        <span class="go">${state} <i class="arw" aria-hidden="true"></i></span>
      </div></article>`;
  }).join("");
  if (!next) next = all.find((id) => !done[id]) || all[0];
  const cta = $("#cta");
  cta.href = "studio.html#" + at(next);
  cta.firstChild.textContent = fin ? `Carry on: ${title[next]} ` : "Start with one square ";
  $("#n-courses").textContent = WORDS[COURSES.length] || COURSES.length;
  $("#stats").innerHTML = `<b>${total}</b> levels <span>·</span> <b>${COURSES.length}</b> courses <span>·</span> <b>${fin}</b> matched`;
  $("#dz-count").textContent = `${fin} of ${total} matched`;

  // ------------------------------------------------------- hero poster --
  // The proof (pink outlines) sits off register; it follows your pointer, and the match climbs as it lines up.
  const hp = $("#hp");
  hp.innerHTML = `<p class="tl">Design<br>Studio</p><p class="tr">${WORDS[COURSES.length][0].toUpperCase() + WORDS[COURSES.length].slice(1)} courses,<br>one square to an app</p>
    <div class="hp-art">${mosaic(15, heroRule, INK, "mo")}${mosaic(15, heroRule, { g: 1, p: 1, y: 1, o: 1, b: 1, c: 1, d: 1, w: 1 }, "mo proof")}</div>
    <p class="fine"><span>Match the target in plain CSS. The meter counts the pixels that agree.</span><span>Ghost, side by side, or a heat map of what's off.</span><span>Phone, tablet and desktop, one stylesheet.</span></p>
    <p class="br">Tulip Labs<br>${total} levels</p><span class="meter"><i></i><b>71%</b></span>`;
  const proof = hp.querySelector(".proof"), meter = hp.querySelector(".meter");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tx = 14, ty = -10, rot = 3, x = tx, y = ty, r = rot, raf = 0;
  const paint = () => {
    x += (tx - x) * .14; y += (ty - y) * .14; r += (rot - r) * .14;
    proof.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    const off = Math.hypot(x, y) + Math.abs(r) * 4;
    const pct = Math.max(0, Math.min(100, Math.round(100 - off * 1.6)));
    meter.style.setProperty("--m", pct);
    meter.lastChild.textContent = pct + "%";
    meter.classList.toggle("won", pct >= 99);
    raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(rot - r) > .05 ? requestAnimationFrame(paint) : 0;
  };
  const aim = (nx, ny, nr) => { tx = nx; ty = ny; rot = nr; if (REDUCED) { x = tx; y = ty; r = rot; } if (!raf) raf = requestAnimationFrame(paint); };
  const art = $("#hero-art");
  art.addEventListener("pointermove", (e) => {
    const b = art.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - .5, py = (e.clientY - b.top) / b.height - .5;
    // the nearer the middle, the closer to register; dead centre snaps it home
    const d = Math.hypot(px, py);
    aim(d < .08 ? 0 : px * 46, d < .08 ? 0 : py * 46, d < .08 ? 0 : px * 6);
  });
  art.addEventListener("pointerleave", () => aim(14, -10, 3));
  art.addEventListener("click", () => aim(0, 0, 0));
  paint();
})();
