/* The design studio: pick a level, write CSS, and watch your board close in on the target.
   Your board and the target are both drawn to pixels (an SVG foreignObject on a canvas), and the meter is the share
   of inked pixels that match. Progress lives in the same store as the code tracks (vnl-code-v1). */
(() => {
  "use strict";
  const { base: BASE, courses: COURSES } = window.DZ;
  const BY = Object.fromEntries(window.DZ.levels.map((l) => [l.id, l]));
  // Levels in course order. A level written as one css with "+" lines gets its start (without them) and answer (with them);
  // a "-" line is in the start only, the thing the answer replaces.
  const LV = COURSES.flatMap((c, ci) => c.ids.map((id, k) => {
    const lv = BY[id];
    if (lv.css) {
      const lines = lv.css.split("\n");
      lv.start = lines.filter((l) => !l.startsWith("+")).map((l) => (l.startsWith("-") ? l.slice(1) : l)).join("\n").replace(/\{\n\}/g, "{\n\n}").replace(/\n{3,}/g, "\n\n");
      lv.answer = lines.filter((l) => !l.startsWith("-")).map((l) => (l.startsWith("+") ? l.slice(1) : l)).join("\n");
    }
    const [w, h] = lv.devices ? lv.devices.desktop : [lv.w || 360, lv.h || 240];
    return Object.assign(lv, { w, h, course: c, ci, k });
  }));
  const PASS = 96;
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ storage --
  const KEY = "vnl-code-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  let S = Object.assign({ done: {}, code: {} }, load());
  S.dz = S.dz || {};
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      // another tab (a code track) may have saved since we loaded, so merge into what's there now
      const now = Object.assign({ done: {}, code: {} }, load());
      now.done = Object.assign(now.done, S.done);
      now.code = Object.assign(now.code, S.code);
      now.dz = Object.assign(now.dz || {}, S.dz);
      now.xp = Math.max(now.xp || 0, S.xp || 0);
      now.days = [...new Set([...(now.days || []), ...(S.days || [])])];
      S = now;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
    }, 200);
  }
  function finish(lv) {
    if (S.done[lv.id]) return false;
    S.done[lv.id] = 1;
    S.xp = (S.xp || 0) + 20;
    const today = new Date().toISOString().slice(0, 10);
    S.days = S.days || [];
    if (!S.days.includes(today)) S.days.push(today);
    save();
    return true;
  }

  // ------------------------------------------------------------- pixels --
  const page = (lv, css) => `<!doctype html><html><head><style>${BASE(lv.w, lv.h)}${css}</style></head><body>${lv.html}</body></html>`;
  let tainted = false;
  // Draws the HTML and CSS to an ImageData the size of the board. null when the browser won't let us read pixels.
  async function raster(lv, css) {
    const W = lv.w, H = lv.h;
    const doc = new DOMParser().parseFromString(page(lv, css), "text/html");
    const xml = new XMLSerializer().serializeToString(doc.documentElement);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xml}</foreignObject></svg>`;
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const x = cv.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    try { return { data: x.getImageData(0, 0, W, H), canvas: cv }; } catch (e) { tainted = true; return null; }
  }
  // Share of "inked" pixels (anything that isn't the target's background) where yours and the target agree.
  // Both boards come from the same renderer, so the same CSS gives the same pixels; tol only forgives near-identical colours.
  function compare(lv, mine, target, out) {
    const W = lv.w, H = lv.h, tol = lv.tol || 30;
    const a = mine.data.data, b = target.data.data, n = W * H;
    const bg = [b[0], b[1], b[2]];
    const far = (d, i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);
    let ink = 0, off = 0;
    const o = out && out.getContext("2d");
    const img = o && o.createImageData(W, H);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const inT = far(b, i, bg) > 24, inM = far(a, i, bg) > 24;
      const bad = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > tol;
      if (inT || inM || bad) ink++;
      if (bad) off++;
      if (img) {
        // the heat map: your board in grey, every pixel that's off in pink
        const g = (a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11) * .45 + 30;
        if (bad) { img.data[i] = 255; img.data[i + 1] = 70; img.data[i + 2] = 160; }
        else { img.data[i] = img.data[i + 1] = img.data[i + 2] = g; }
        img.data[i + 3] = 255;
      }
    }
    if (img) o.putImageData(img, 0, 0);
    return ink ? Math.max(0, Math.round(100 * (1 - off / ink))) : 100;
  }

  // ------------------------------------------------------------- editor --
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const TOK = /(\/\*[\s\S]*?(?:\*\/|$))|("[^"\n]*"?|'[^'\n]*'?)|(#[0-9a-fA-F]{3,8}\b)|([{}])|(-?\d*\.?\d+(?:px|%|fr|deg|em|rem|vh|vw|ms|s)?\b%?)|(--[\w-]+|[a-zA-Z][\w-]*)(?=(\s*:)?)/g;
  function highlight(code) {
    let out = "", last = 0, depth = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(code))) {
      out += esc(code.slice(last, m.index));
      const t = esc(m[0]);
      if (m[1]) out += `<span class="tk-c">${t}</span>`;
      else if (m[2]) out += `<span class="tk-s">${t}</span>`;
      else if (m[3]) out += depth ? `<span class="tk-hex" style="--hx:${m[3]}">${t}</span>` : `<span class="tk-sel">${t}</span>`;
      else if (m[4]) { depth += m[4] === "{" ? 1 : -1; if (depth < 0) depth = 0; out += `<span class="tk-p">${t}</span>`; }
      else if (m[5]) out += `<span class="tk-n">${t}</span>`;
      else if (!depth) out += `<span class="tk-sel">${t}</span>`;
      else if (/^\s*:/.test(code.slice(TOK.lastIndex))) out += `<span class="tk-k">${t}</span>`;
      else out += `<span class="tk-v">${t}</span>`;
      last = TOK.lastIndex;
    }
    return out + esc(code.slice(last)) + "\n";
  }
  // A textarea over a highlighted <pre>. The current line gets a band, the gutter marks it, and a status line says where you are.
  const PAIRS = { "(": ")", "[": "]", '"': '"', "'": "'" };
  function Editor(code, onChange) {
    const pre = h("pre", { "aria-hidden": "true" });
    const band = h("i", { class: "band", "aria-hidden": "true" });
    const layer = h("div", { class: "layer", "aria-hidden": "true" }, band, pre);
    const gut = h("div", { class: "gut", "aria-hidden": "true" });
    const ta = h("textarea", { spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": "Your CSS", wrap: "off" });
    const pos = h("span", {}, "Ln 1, Col 1"), saved = h("span", { class: "saved" }, "saved");
    const bar = h("div", { class: "edstat" }, pos, h("span", { class: "keys" }, h("kbd", {}, "Tab"), " indent ", h("kbd", {}, "⌘/"), " comment"), saved);
    const el = h("div", { class: "edwrap" }, h("div", { class: "cssed" }, gut, layer, ta), bar);
    ta.value = code;
    let lines = 0, curLn = -1;
    const lineOf = (i) => ta.value.slice(0, i).split("\n").length - 1;
    const caret = () => {
      const s = ta.selectionStart, ln = lineOf(s), col = s - ta.value.lastIndexOf("\n", s - 1);
      pos.textContent = `Ln ${ln + 1}, Col ${col}` + (ta.selectionEnd > s ? ` · ${ta.selectionEnd - s} picked` : "");
      if (ln === curLn) return;
      gut.children[curLn]?.classList.remove("on");
      gut.children[ln]?.classList.add("on");
      band.style.setProperty("--ln", ln);
      curLn = ln;
    };
    const paint = () => {
      pre.innerHTML = highlight(ta.value);
      const n = ta.value.split("\n").length;
      if (n !== lines) { gut.replaceChildren(...Array.from({ length: n }, (_, i) => h("b", {}, String(i + 1)))); lines = n; curLn = -1; }
      caret();
    };
    let st = 0;
    const flash = () => { saved.classList.add("now"); clearTimeout(st); st = setTimeout(() => saved.classList.remove("now"), 900); };
    const insert = (text) => {
      if (!document.execCommand || !document.execCommand("insertText", false, text)) {
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
        ta.dispatchEvent(new Event("input"));
      }
    };
    // swap whole lines [a, b) for what fn makes of them, keeping them picked
    const eachLine = (fn) => {
      const v = ta.value, a = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      let b = v.indexOf("\n", Math.max(ta.selectionStart, ta.selectionEnd - (ta.selectionEnd > ta.selectionStart ? 1 : 0)));
      if (b < 0) b = v.length;
      const out = fn(v.slice(a, b).split("\n")).join("\n");
      ta.setSelectionRange(a, b);
      insert(out);
      ta.setSelectionRange(a, a + out.length);
    };
    let escaped = false;
    ta.addEventListener("input", () => { paint(); onChange(ta.value); flash(); });
    for (const ev of ["keyup", "click", "select", "focus"]) ta.addEventListener(ev, caret);
    document.addEventListener("selectionchange", () => { if (document.activeElement === ta) caret(); });
    ta.addEventListener("scroll", () => { layer.style.transform = `translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`; gut.style.transform = `translateY(${-ta.scrollTop}px)`; });
    ta.addEventListener("keydown", (e) => {
      const v = ta.value, s = ta.selectionStart, end = ta.selectionEnd;
      const ls = v.lastIndexOf("\n", s - 1) + 1, line = v.slice(ls, s);
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") { escaped = true; return; }
      if (mod && e.key === "s") { e.preventDefault(); flash(); return; }
      if (mod && e.key === "/") {
        e.preventDefault();
        eachLine((ls) => ls.every((l) => /^\s*\/\*.*\*\/\s*$/.test(l) || !l.trim())
          ? ls.map((l) => l.replace(/\/\* ?(.*?) ?\*\//, "$1"))
          : ls.map((l) => (l.trim() ? l.replace(/^(\s*)(.*)$/, "$1/* $2 */") : l)));
        return;
      }
      if (e.key === "Tab" && !escaped) {
        e.preventDefault();
        if (e.shiftKey) eachLine((ls) => ls.map((l) => l.replace(/^ {1,2}/, "")));
        else if (end > s && v.slice(s, end).includes("\n")) eachLine((ls) => ls.map((l) => "  " + l));
        else insert("  ");
        return;
      }
      escaped = false;
      if (e.key === "Enter") {
        e.preventDefault();
        let ind = (line.match(/^ */) || [""])[0];
        // between { and }: open a new indented line and push the } below it
        if (/\{\s*$/.test(line) && v[end] === "}") { insert("\n" + ind + "  \n" + ind); ta.setSelectionRange(s + ind.length + 3, s + ind.length + 3); return; }
        if (/\{\s*$/.test(line)) ind += "  ";
        insert("\n" + ind);
      } else if (e.key === "}" && /^ +$/.test(line)) {
        e.preventDefault();
        ta.setSelectionRange(Math.max(ls, s - 2), s);
        insert("}");
      } else if (e.key === "{" && end === s && /^\s*$/.test(v.slice(s, v.indexOf("\n", s) < 0 ? v.length : v.indexOf("\n", s)))) {
        e.preventDefault(); insert("{}"); ta.setSelectionRange(s + 1, s + 1);
      } else if (PAIRS[e.key] && end === s && !/\w/.test(v[s] || "")) {
        e.preventDefault(); insert(e.key + PAIRS[e.key]); ta.setSelectionRange(s + 1, s + 1);
      } else if (Object.values(PAIRS).includes(e.key) && v[s] === e.key && end === s && e.key !== "}") {
        e.preventDefault(); ta.setSelectionRange(s + 1, s + 1);
      } else if (e.key === "Backspace" && end === s && PAIRS[v[s - 1]] && PAIRS[v[s - 1]] === v[s]) {
        e.preventDefault(); ta.setSelectionRange(s - 1, s + 1); insert("");
      }
    });
    paint();
    return { el, ta, get: () => ta.value, set(v) { ta.value = v; paint(); onChange(v); } };
  }

  // -------------------------------------------------------------- board --
  const board = (lv, cls) => h("iframe", { class: "bd", sandbox: "", title: cls === "ghost" ? "Target" : "Your board", tabindex: "-1", width: lv.w, height: lv.h });
  const show = (frame, lv, css) => { frame.srcdoc = page(lv, css); };

  // ------------------------------------------------------------- studio --
  const TARGETS = {};
  const target = (v) => { const key = `${v.id}:${v.w}x${v.h}`; return (TARGETS[key] = TARGETS[key] || raster(v, v.answer)); };

  // ------------------------------------------------------------ screens --
  // Every board can be looked at on three screens. A responsive level (lv.devices) is scored on all three;
  // any other level is scored on desktop, and tablet and phone show how the same CSS reflows when it gets narrow.
  const DEVICES = [["desktop", "Desktop"], ["tablet", "Tablet"], ["phone", "Phone"]];
  const NAME = Object.fromEntries(DEVICES);
  const dims = (lv, d) => (lv.devices ? lv.devices[d]
    : d === "tablet" ? [Math.round(lv.w * .72), Math.round(lv.h * 1.15)]
    : d === "phone" ? [Math.max(200, Math.round(lv.w * .56)), Math.round(lv.h * 1.4)] : [lv.w, lv.h]);
  // a level as seen on one screen: the same level, another board size
  const view = (lv, d) => { const [w, h] = dims(lv, d); return Object.assign(Object.create(lv), { w, h, dev: d }); };
  const scoredOn = (lv) => (lv.devices ? DEVICES.map(([d]) => d) : ["desktop"]);
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleOk = ([, test, not], css) => (typeof test === "function" ? test(css) : test.test(css) !== !!not);

  let VIEW = "ghost", GHOST = 40, DEV = "desktop";
  try { VIEW = localStorage.getItem("dz-view") || VIEW; GHOST = +(localStorage.getItem("dz-ghost") || GHOST); DEV = localStorage.getItem("dz-dev") || DEV; } catch (e) { /* ignore */ }
  if (!NAME[DEV]) DEV = "desktop";

  const map = $("#map"), desk = $("#desk"), table = $("#table");

  function drawMap(cur) {
    // one heading per course, then its levels
    map.replaceChildren(...LV.flatMap((lv, i) => {
      const best = S.dz[lv.id] || 0;
      const item = h("li", {}, h("a", { href: "#" + (i + 1), class: (S.done[lv.id] ? "done " : "") + (lv === cur ? "cur" : ""), "aria-current": lv === cur ? "step" : null },
        h("span", { class: "th", "data-th": lv.id }),
        h("span", { class: "nm" }, h("small", {}, `${lv.ci + 1}.${lv.k + 1}`), lv.title),
        h("span", { class: "st" }, S.done[lv.id] ? "✓" : best ? best + "%" : "")));
      if (lv.k) return [item];
      const got = lv.course.ids.filter((id) => S.done[id]).length;
      return [h("li", { class: "course" + (lv.course === cur.course ? " here" : "") }, h("b", {}, lv.course.title), h("span", {}, `${got} / ${lv.course.ids.length}`)), item];
    }));
    const n = LV.filter((l) => S.done[l.id]).length;
    $("#map-n").textContent = `${n} / ${LV.length}`;
    $("#dz-count").textContent = `${n} of ${LV.length} matched`;
    // little pictures of each target, drawn once
    for (const lv of LV) target(lv).then((t) => {
      const slot = map.querySelector(`[data-th="${lv.id}"]`);
      if (!t || !slot || slot.firstChild) return;
      try { slot.append(h("img", { src: t.canvas.toDataURL(), alt: "" })); } catch (e) { /* tainted */ }
    }).catch(() => {});
    map.querySelector(".cur")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function open(i) {
    const lv = LV[i];
    if (!lv) return open(0);
    document.title = `${lv.title} · Design studio · Tulip Labs`;
    drawMap(lv);
    let css = S.code[lv.id] ?? lv.start;

    // the desk: brief, editor, rules and help
    const rules = h("ul", { class: "rules" }, lv.rules.map(([label]) => h("li", {}, h("i", { "aria-hidden": "true" }), label)));
    const hintBox = h("div", { class: "hints" });
    let hintN = 0;
    const hintBtn = h("button", { class: "btn", onclick: () => {
      if (hintN >= lv.hints.length) return;
      hintBox.append(h("p", { html: `<b>Hint ${hintN + 1}.</b> ` + lv.hints[hintN] }));
      hintN++;
      hintBtn.textContent = hintN < lv.hints.length ? `Another hint (${lv.hints.length - hintN})` : "No more hints";
      hintBtn.disabled = hintN >= lv.hints.length;
    } }, `Hint (${lv.hints.length})`);
    const peekBox = h("div", { class: "peek", hidden: true }, h("p", {}, "One way to draw the target. Read it, close it, then write yours."), h("pre", { html: highlight(lv.answer) }));
    const peekBtn = h("button", { class: "btn", onclick: () => { peekBox.hidden = !peekBox.hidden; peekBtn.textContent = peekBox.hidden ? "Peek at the answer" : "Hide the answer"; } }, "Peek at the answer");
    const ed = Editor(css, (v) => {
      css = v;
      // undefined (not delete) so the merge in save() carries the reset over what is stored
      S.code[lv.id] = v === lv.start ? undefined : v;
      save();
      queue();
    });
    desk.replaceChildren(
      h("header", { class: "brief" },
        h("p", { class: "lvl" }, h("span", {}, `Course ${lv.ci + 1} · ${lv.course.title}`), h("span", {}, `Level ${lv.k + 1} of ${lv.course.ids.length}`)),
        h("h1", {}, lv.title),
        h("p", { class: "ask", html: lv.brief }),
        h("p", { class: "idea", html: lv.idea })),
      h("div", { class: "edhead" }, h("span", { class: "tab" }, h("i", { "aria-hidden": "true" }), "style.css"), h("span", { class: "grow" }), h("button", { class: "edbtn", title: "Back to how this level started", onclick: () => { ed.set(lv.start); ed.ta.focus(); } }, "↺ Reset")),
      ed.el,
      h("div", { class: "help" }, h("p", { class: "rh" }, "House rules"), rules, h("div", { class: "btns" }, hintBtn, peekBtn), hintBox, peekBox),
      h("details", { class: "markup" }, h("summary", {}, "The HTML (fixed)"), h("pre", {}, lv.html.replace(/></g, ">\n<"))));

    // the table: screen and view switches, the boards on a cutting mat, and the meter
    const pass = lv.pass || PASS, V = Object.fromEntries(DEVICES.map(([d]) => [d, view(lv, d)]));
    const devBtns = DEVICES.map(([d, label]) => h("button", { role: "radio", "data-d": d, "aria-checked": String(DEV === d), title: `${label} · ${V[d].w} × ${V[d].h}`, onclick: () => setDev(d) },
      h("span", { class: "ico ico-" + d, "aria-hidden": "true" }), h("span", { class: "dl" }, label), h("b", { class: "ds" })));
    const devs = h("div", { class: "devs" + (lv.devices ? " scored" : ""), role: "radiogroup", "aria-label": "Screen" }, devBtns);
    const tabs = h("div", { class: "views", role: "tablist", "aria-label": "View" }, [["ghost", "Ghost"], ["side", "Side by side"], ["diff", "Where it's off"]].map(([k, label]) =>
      h("button", { role: "tab", "data-v": k, "aria-selected": String(VIEW === k), onclick: () => setView(k) }, label)));
    const slider = h("input", { type: "range", min: 0, max: 100, step: 1, value: GHOST, "aria-label": "How strongly the target shows through" });
    const ghostCtl = h("label", { class: "gctl" }, h("span", {}, "Target"), slider, h("b", {}, GHOST + "%"));
    const pct = h("b", { class: "pct" }, "–");
    const bar = h("span", { class: "mbar" }, h("i"), h("em", { style: `left:${pass}%`, title: `${pass}% passes` }));
    const status = h("span", { class: "mst" }, "Measuring…");
    const next = h("a", { class: "nextbtn", href: "#" + (i + 2), hidden: true }, i + 1 < LV.length ? "Next level" : "Back to level 1", h("i", { class: "arw", "aria-hidden": "true" }));
    if (i + 1 >= LV.length) next.href = "#1";
    const unit = h("span", {}, "match");
    const meter = h("div", { class: "meter" }, h("div", { class: "mtop" }, pct, unit, status), bar, next);
    const mat = h("div", { class: "mat" });
    const tbar = h("div", { class: "tbar" }, tabs, h("div", { class: "tright" }, ghostCtl, devs));
    table.replaceChildren(tbar, mat, meter);

    // the boards for the screen on show; switching screens draws them again at that size
    let B = null;
    function boards() {
      const v = V[DEV];
      const mine = board(v, "mine"), ghost = board(v, "ghost"), mine2 = board(v, "mine"), tgt2 = board(v, "ghost");
      show(ghost, v, lv.answer); show(tgt2, v, lv.answer);
      ghost.classList.add("ghost");
      ghost.style.opacity = GHOST / 100;
      const heat = h("canvas", { class: "bd heat", width: v.w, height: v.h, "aria-label": "Where your board is off: pink pixels" });
      // each screen gets its own body: a browser window, a tablet, a phone
      const body = (art) => h("div", { class: "frame dev-" + DEV }, DEV === "desktop" ? h("span", { class: "chrome", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("em", {}, `${v.w} × ${v.h}`)) : null, art);
      const views = {
        ghost: h("div", { class: "pane one" }, body(h("div", { class: "art" }, mine, ghost))),
        side: h("div", { class: "pane two" }, h("figure", {}, body(h("div", { class: "art" }, mine2)), h("figcaption", {}, "Yours")),
          h("figure", {}, body(h("div", { class: "art" }, tgt2)), h("figcaption", {}, "Target"))),
        diff: h("div", { class: "pane one" }, body(h("div", { class: "art" }, heat))),
      };
      mat.style.cssText = `--w:${v.w};--h:${v.h}`;
      mat.dataset.dev = DEV;
      mat.replaceChildren(views.ghost, views.side, views.diff);
      B = { v, mine, ghost, mine2, heat, views };
      devBtns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.d === DEV)));
      setView(VIEW);
    }
    function setDev(d) {
      if (d === DEV && B) return;
      DEV = d;
      try { localStorage.setItem("dz-dev", d); } catch (e) { /* ignore */ }
      boards();
      check();
    }
    function setView(k) {
      VIEW = k;
      try { localStorage.setItem("dz-view", k); } catch (e) { /* ignore */ }
      for (const [v, el] of Object.entries(B.views)) el.hidden = v !== k;
      tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === k)));
      ghostCtl.hidden = k !== "ghost";
      fit();
    }
    slider.oninput = () => {
      GHOST = +slider.value;
      B.ghost.style.opacity = GHOST / 100;
      ghostCtl.lastChild.textContent = GHOST + "%";
      try { localStorage.setItem("dz-ghost", GHOST); } catch (e) { /* ignore */ }
    };

    // scale the boards to fill the mat, as wide as it is and no taller than the window leaves room for
    function fit() {
      if (!B) return;
      const { v } = B, pane = B.views[VIEW];
      const cols = VIEW === "side" && innerWidth > 760 ? 2 : 1;
      const bezel = DEV === "desktop" ? 0 : DEV === "tablet" ? 28 : 24;
      const room = (mat.clientWidth - 40 - (cols - 1) * 20) / cols - bezel;
      const tall = innerHeight - 57 - tbar.offsetHeight - meter.offsetHeight - 120 - (VIEW === "side" ? 24 : 0) - (DEV === "desktop" ? 26 : bezel);
      const s = Math.max(.45, Math.min(VIEW === "side" ? 1.4 : 2.2, room / v.w, Math.max(240, tall) / v.h));
      pane.style.setProperty("--s", s.toFixed(3));
    }
    new ResizeObserver(fit).observe(mat);

    let t = 0, run = 0;
    function queue() { clearTimeout(t); t = setTimeout(check, 160); }
    async function check() {
      const me = ++run, b = B;
      show(b.mine, b.v, css); show(b.mine2, b.v, css);
      const c = strip(css);
      const okRules = lv.rules.map((r) => ruleOk(r, c));
      [...rules.children].forEach((li, k) => li.classList.toggle("ok", okRules[k]));
      // score the screen on show, and every screen the level is scored on
      const need = [...new Set([DEV, ...scoredOn(lv)])], got = {};
      await Promise.all(need.map(async (d) => {
        try {
          const [a, tg] = await Promise.all([raster(V[d], css), target(V[d])]);
          if (a && tg) got[d] = compare(V[d], a, tg, d === DEV ? b.heat : null);
        } catch (e) { got[d] = 0; } // bad markup in the svg: count it as no match
      }));
      if (me !== run) return;
      const score = got[DEV] ?? null;
      for (const btn of devBtns) {
        const d = btn.dataset.d, g = got[d];
        btn.lastChild.textContent = g == null ? "" : g + "%";
        btn.classList.toggle("ok", g != null && g >= pass);
      }
      const on = scoredOn(lv), low = on.filter((d) => !(got[d] >= pass));
      if (score == null) {
        pct.textContent = "?";
        status.textContent = tainted ? "This browser won't show us pixels, so the meter is off. The rules still count." : "";
      } else {
        pct.textContent = score + "%";
        bar.firstChild.style.width = score + "%";
        // a level's best is its weakest scored screen
        const lvl = Math.min(...on.map((d) => got[d] ?? 0));
        S.dz[lv.id] = Math.max(S.dz[lv.id] || 0, lvl);
      }
      unit.textContent = lv.devices || DEV === "desktop" ? "match" : "match · preview";
      const rulesOk = okRules.every(Boolean);
      const matched = (score == null ? tainted : !low.length) && rulesOk;
      meter.classList.toggle("won", matched);
      if (score != null) status.textContent = matched ? (lv.devices ? "Matched on all three screens." : "Matched. That's the target.")
        : !low.length ? "The pixels match. Now follow the house rules."
        : lv.devices && low.length < 3 && !low.includes(DEV) ? `${NAME[DEV]} is there. Now look at ${low.map((d) => NAME[d].toLowerCase()).join(" and ")}.`
        : !lv.devices && DEV !== "desktop" ? `How it reflows on a ${DEV}. This level is scored on desktop: ${got.desktop ?? 0}%.`
        : score >= 80 ? "Close. Switch to Where it's off to see the last bits." : "Keep going: the ghost shows where to aim.";
      next.hidden = !matched && !S.done[lv.id];
      if (matched && finish(lv)) {
        burst(pct);
        drawMap(lv);
      } else if (score != null) {
        save();
        const st = map.querySelector(".cur .st");
        if (st && !S.done[lv.id]) st.textContent = S.dz[lv.id] + "%";
      }
    }
    boards();
    queue();
    // lets tools/e2e.js type into the board
    table.dzSet = (v) => ed.set(v);
    table.dzScore = () => pct.textContent;
    table.dzStart = () => lv.start;
    table.dzAnswer = () => lv.answer;
  }

  function burst(anchor) {
    if (REDUCED || !anchor) return;
    const box = h("span", { class: "burst", "aria-hidden": "true" });
    const cs = ["#ff6fb5", "#ffd21f", "#2fb38f", "#22b5d8"];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, d = 36 + Math.random() * 40;
      box.append(h("i", { style: `background:${cs[k % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 16}px` }));
    }
    anchor.append(box);
    setTimeout(() => box.remove(), 1000);
  }

  const route = () => open(Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1));
  window.addEventListener("hashchange", () => { route(); window.scrollTo({ top: 0 }); });
  route();
})();
