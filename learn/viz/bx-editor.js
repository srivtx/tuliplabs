/* Build your own X, chapter 9: a vim-style editor.
   The row of cells is the gap buffer in memory (empty cells = the gap); behind it, the mode
   state machine. Keys drive both. The "why": flip to "plain string" and count the characters
   that move on every keystroke. */
VIZ.register("bx-editor", async (api) => {
  const W = await api.world3d();
  W.camera({ target: [0, 0.8, -1.2], dist: 17, theta: 0, phi: 1.2, instant: true });
  const CW = 0.75, ESC = "Esc", MAXLEN = 40;
  let nid = 0;
  const mk = (ch) => ({ id: nid++, ch });

  // ---- storage: a real gap buffer, or one plain string (an array we rebuild on every change)
  let store = "gap", buf, gs, ge, plain, lastCost = 0, totalCost = 0;
  function load(text) {
    const cs = [...text].map(mk);
    plain = cs.slice();
    const cap = Math.max(24, cs.length + 4);
    buf = cs.concat(Array(cap - cs.length).fill(null));
    gs = cs.length; ge = cap;
  }
  const chars = () => (store === "gap" ? buf.slice(0, gs).concat(buf.slice(ge)) : plain);
  const text = () => chars().map((c) => c.ch).join("");
  function moveGap(p) {
    let n = 0;
    while (gs > p) { gs--; ge--; buf[ge] = buf[gs]; buf[gs] = null; n++; }
    while (gs < p) { buf[gs] = buf[ge]; buf[ge] = null; gs++; ge++; n++; }
    return n;
  }
  function insertAt(p, ch) {
    if (store === "plain") { const n = plain.length; plain = plain.slice(0, p).concat([mk(ch)], plain.slice(p)); return n + 1; }
    let cost = moveGap(p);
    if (gs === ge) { const extra = buf.length; buf = buf.slice(0, gs).concat(Array(extra).fill(null), buf.slice(ge)); ge += extra; cost += buf.length - extra; }
    buf[gs++] = mk(ch);
    return cost + 1;
  }
  function deleteRange(a, b) {
    const s = text().slice(a, b);
    if (store === "plain") { const n = plain.length; plain = plain.slice(0, a).concat(plain.slice(b)); return { s, cost: n - (b - a) }; }
    const cost = moveGap(a);
    for (let i = ge; i < ge + (b - a); i++) buf[i] = null;
    ge += b - a;
    return { s, cost };
  }

  // ---- the vim engine: a state machine over keys
  let mode = "NORMAL", pos = 0, count = "", op = null, opN = 1, anchor = 0, start = 0, undo = [], redo = [], doneOnce = false;
  const len = () => text().length;
  const clamp = (p) => Math.max(0, Math.min(p, Math.max(0, len() - 1)));
  function wordF(t, p) { let i = p; while (i < t.length && t[i] !== " ") i++; while (i < t.length && t[i] === " ") i++; return i; }
  function wordB(t, p) { let i = Math.max(p - 1, 0); while (i > 0 && t[i] === " ") i--; while (i > 0 && t[i - 1] !== " ") i--; return i; }
  function motion(k, p, n) {
    const t = text();
    for (let r = 0; r < n; r++) {
      if (k === "h") p = Math.max(0, p - 1);
      else if (k === "l") p = Math.min(t.length, p + 1);
      else if (k === "w") p = wordF(t, p);
      else if (k === "b") p = wordB(t, p);
      else if (k === "0") p = 0;
      else if (k === "$") p = Math.max(0, t.length - 1);
      else return null;
    }
    return p;
  }
  function doDelete(a, b, fromOp, what) {
    if (b <= a) return;
    const r = deleteRange(a, b);
    lastCost += r.cost;
    undo.push({ kind: "delete", pos: a, s: r.s, fromOp, what }); redo = [];
    pos = clamp(a);
  }
  function apply(cmd, inverse) {
    const ins = (cmd.kind === "insert") !== inverse;
    if (ins) { [...cmd.s].forEach((c, i) => { lastCost += insertAt(cmd.pos + i, c); }); }
    else { lastCost += deleteRange(cmd.pos, cmd.pos + cmd.s.length).cost; }
    pos = clamp(cmd.pos);
  }
  let note = "";
  function key(k) {
    lastCost = 0; note = "";
    if (mode === "INSERT") {
      if (k === ESC) {
        if (pos > start) undo.push({ kind: "insert", pos: start, s: text().slice(start, pos) }), (redo = []);
        mode = "NORMAL"; pos = clamp(pos - 1); note = "Esc → NORMAL. The whole INSERT session is ONE undo step.";
      } else if (k === "Backspace") {
        if (pos > start) { lastCost += deleteRange(pos - 1, pos).cost; pos--; }
      } else if (k.length === 1) {
        if (len() >= MAXLEN) { note = "Keeping the demo short: delete something first."; }
        else { lastCost += insertAt(pos, k); pos++; }
      }
    } else if (/^[0-9]$/.test(k) && (count || k !== "0") && mode === "NORMAL") {
      count += k; note = `count = ${count}`;
    } else {
      const n = parseInt(count || "1", 10); count = "";
      if (mode === "VISUAL") {
        if (k === ESC || k === "v") { mode = "NORMAL"; note = "back to NORMAL"; }
        else if (k === "d" || k === "x") {
          const a = Math.min(anchor, pos), b = Math.max(anchor, pos) + 1;
          mode = "NORMAL"; doDelete(a, b, true, "v…d"); note = `deleted the selection “${undo[undo.length - 1].s}”`;
        } else { const p = motion(k, pos, n); if (p != null) pos = clamp(p); }
      } else if (op) {
        const total = opN * n; op = null;
        if (k === "d") { doDelete(0, len(), true, "dd"); note = "dd: the whole line"; }
        else {
          const p = motion(k, pos, total);
          if (p == null) note = "That's not a motion: operator cancelled.";
          else { const a = Math.min(pos, p), b = Math.max(pos, p) + (k === "$" ? 1 : 0); doDelete(a, b, true, "d" + (total > 1 ? total : "") + k); note = `d + ${k}: deleted “${undo[undo.length - 1]?.s ?? ""}” (from the cursor to where ${k} would land)`; }
        }
      } else if (k === "d") { op = "d"; opN = n; note = "operator d is waiting for a motion (w, b, $, 0, l, h) or another d"; }
      else if (k === "i" || k === "a") { if (k === "a" && len()) pos = Math.min(len(), pos + 1); mode = "INSERT"; start = pos; note = `${k} → INSERT: now letters are text, not commands`; }
      else if (k === "v") { mode = "VISUAL"; anchor = pos; note = "v → VISUAL: move to grow the selection, then d"; }
      else if (k === "x") { doDelete(pos, Math.min(len(), pos + n), false, "x"); note = "x: delete under the cursor"; }
      else if (k === "u") {
        const c = undo.pop();
        if (!c) note = "Nothing to undo.";
        else {
          apply(c, true); redo.push(c);
          note = `undo: reversed “${c.kind} '${c.s}' at ${c.pos}” (apply the opposite command)`;
          if (c.fromOp && !doneOnce) { doneOnce = true; api.done("Operator + motion, then undo: that's vim's grammar and its memory"); }
        }
      } else if (k === "r") { const c = redo.pop(); if (c) { apply(c, false); undo.push(c); note = "redo"; } else note = "Nothing to redo."; }
      else { const p = motion(k, pos, n); if (p != null) pos = clamp(p); }
    }
    totalCost += lastCost;
    draw();
  }

  // ---- drawing
  let drawn = new Set();
  const MODES = [["NORMAL", -3.2], ["INSERT", 0], ["VISUAL", 3.2]];
  const MODEWHY = {
    NORMAL: "<p><b>NORMAL</b>: every key is a <i>command</i>. <code>w</code> moves, <code>x</code> deletes, <code>d</code> waits for a motion.</p><p>Why have it? So plain letters can be commands without holding Ctrl. That's what makes <code>dw</code>, <code>3j</code>, <code>d$</code> one-handed and composable.</p>",
    INSERT: "<p><b>INSERT</b>: keys are just text. Only <code>Esc</code> is special.</p><p>Entering with <code>i</code> and leaving with <code>Esc</code> also marks one <b>undo step</b>: the whole word you typed comes back with one <code>u</code>.</p>",
    VISUAL: "<p><b>VISUAL</b>: motions grow a selection from where you pressed <code>v</code>; then an operator (<code>d</code>) acts on it.</p><p>It's the same operator idea, but you <i>see</i> the range first instead of naming it with a motion.</p>",
  };
  function draw() {
    const now = new Set();
    const B = (k, o) => { now.add(k); W.box(k, o); };
    const slots = store === "gap" ? buf : plain;
    const cap = slots.length, x0 = -((cap - 1) * CW) / 2;
    const sx = (i) => x0 + i * CW;
    const logical = (p) => (store === "gap" ? (p < gs ? p : p + (ge - gs)) : p);
    const selA = mode === "VISUAL" ? Math.min(anchor, pos) : -1, selB = mode === "VISUAL" ? Math.max(anchor, pos) : -2;
    let li = 0;
    slots.forEach((c, i) => {
      if (!c) {
        B("g" + i, { x: sx(i), y: 0, z: 0, s: 0.62, color: "c5", opacity: 0.22, label: "", info: { title: "An empty slot in the gap", html: `<p>This cell belongs to the <b>gap</b> (slots ${gs}–${ge - 1}). The next character you type is written into the gap's first slot: <b>one write, nothing else moves</b>.</p><p>Why keep empty space in the middle? Appending to the end of an array is cheap; the gap makes <i>the cursor</i> behave like the end. A plain string has no spare room, so every insert copies the whole text.</p>` } });
        return;
      }
      const L = li++;
      const atCur = mode !== "INSERT" && L === pos, sel = L >= selA && L <= selB;
      B("ch" + c.id, { x: sx(i), y: 0, z: 0, s: 0.66, color: atCur ? "c4" : sel ? "c1" : "c2", glow: atCur ? 0.45 : 0, label: c.ch === " " ? "␣" : c.ch, labelSize: 0.38,
        info: { title: `Character “${c.ch}” (text position ${L}, slot ${i})`, html: store === "gap" ? `<p>It lives in slot <b>${i}</b> of the array. Characters ${L < gs ? "left of the gap stay put while you type" : "right of the gap are pushed there by moving the gap"}.</p><p>Moving the cursor across this character would copy it to the other side of the gap: one copy per step, so short hops are cheap.</p>` : `<p>In <b>plain string</b> mode there's no spare room. Strings can't be changed in place, so every insert or delete builds a new string and copies every character, including this one.</p>` } });
    });
    for (const k of drawn) if (!now.has(k) && (k.startsWith("ch") || k.startsWith("g"))) W.remove(k);
    // cursor
    const curX = mode === "INSERT" ? (store === "gap" ? sx(gs) - CW / 2 : sx(pos) - CW / 2) : sx(logical(Math.min(pos, Math.max(0, len() - 1))));
    W.box("cur", mode === "INSERT" ? { x: curX, y: 0, z: 0.05, sx: 0.08, sy: 0.95, sz: 0.8, color: "c4", glow: 0.8, info: { title: "Cursor (INSERT)", html: "<p>A bar <i>between</i> characters: the next key goes here. In gap mode it always sits at the gap's left edge.</p>" } }
      : { x: curX, y: -0.48, z: 0, sx: 0.66, sy: 0.12, sz: 0.66, color: "c4", glow: 0.8, info: { title: "Cursor (NORMAL)", html: "<p>A block <i>on</i> a character: commands like <code>x</code> act on the character under it.</p><p>Moving it doesn't move the gap yet: a real gap buffer moves the gap only when you edit, so just looking around costs nothing.</p>" } });
    // mode machine
    MODES.forEach(([m, x]) => B("m" + m, { x, y: 2.3, z: -2.6, sx: 2, sy: 0.7, sz: 0.7, color: m === mode ? "c1" : "c5", glow: m === mode ? 0.6 : 0, label: m, labelSize: 0.36, info: { title: m + " mode", html: MODEWHY[m] } }));
    W.line("tI", "mNORMAL", "mINSERT", { color: "muted" }); W.line("tV", "mNORMAL", "mVISUAL", { color: "muted" });
    W.label("lI", "i a →   ← Esc", [-1.6, 3.15, -2.6], { color: "muted", size: 0.26 });
    W.label("lV", "← Esc   v →", [1.6, 3.15, -2.6], { color: "muted", size: 0.26 });
    W.label("pend", op ? `waiting: ${opN > 1 ? opN : ""}d + motion` : count ? `count: ${count}` : "", [-3.2, 1.55, -2.6], { color: "c4", size: 0.3 });
    W.label("store", store === "gap" ? `gap buffer: ${cap} slots, gap ${gs}–${ge - 1}` : `plain string: ${cap} characters`, [x0 - 0.4, -1.2, 0], { color: "muted", size: 0.3 });
    drawn = now;
    W.camera({ dist: Math.max(15, cap * CW * 0.85 + 4) });
    const stack = undo.slice(-4).map((c) => `${c.kind} '${c.s}'@${c.pos}`).join(" | ") || "(empty)";
    const cmdMem = undo.reduce((a, c) => a + c.s.length, 0);
    api.hud(`${store === "gap" ? "gap buffer" : "plain string"} · last key moved/copied <b>${lastCost}</b> chars · total <b>${totalCost}</b>`);
    api.status(`text:  ${text()}\nmode:  ${mode}   cursor: ${pos}\n${note ? note + "\n" : ""}undo stack: ${stack}\nmemory: commands hold ${cmdMem} chars · snapshots would hold ${undo.length * len()}`);
  }

  // ---- controls
  const input = api.text("Keys (click here, then type)", "", () => {}, { placeholder: "i, Esc, h l w b 0 $, x, d w, v, u…" });
  input.el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Tab" || e.metaKey) return;
    e.preventDefault();
    if (e.key === "Escape") key(ESC);
    else if (e.ctrlKey && e.key === "r") key("r");
    else if (e.key === "Backspace") key("Backspace");
    else if (e.key.length === 1 && !e.ctrlKey) key(e.key);
    input.set("");
  });
  const r1 = api.row();
  for (const k of ["i", "a", ESC, "h", "l", "w", "b", "0", "$"]) api.button(k, () => key(k), { row: r1 });
  const r2 = api.row();
  for (const k of ["x", "d", "v", "u"]) api.button(k, () => key(k), { row: r2, primary: k === "u" });
  api.button("redo", () => key("r"), { row: r2 });
  api.button("type “big ”", () => { if (mode !== "INSERT") key("i"); for (const c of "big ") key(c); key(ESC); }, { row: r2 });
  api.seg([{ label: "gap buffer", value: "gap" }, { label: "naive: plain string", value: "plain" }], "gap", (v) => {
    const t = text(); store = v; load(t); totalCost = 0; lastCost = 0; W.clear(); drawn = new Set();
    note = v === "plain" ? "Plain string: each insert builds a new string. Type in the MIDDLE and watch the count." : "Gap buffer: inserts at the cursor write one slot.";
    draw();
  });
  api.button("Reset", () => { load("the quick brown fox"); mode = "NORMAL"; pos = 4; count = ""; op = null; undo = []; redo = []; totalCost = 0; W.clear(); drawn = new Set(); note = "Cursor on 'quick'. Try d then w."; draw(); });
  api.explain("How to read this", "<p><b>Front row:</b> the text in memory. Blue = characters, faint = the empty <b>gap</b>, amber = cursor. <b>Behind:</b> the three modes; the red one is active.</p><p>The cursor starts on <i>quick</i>: press <code>d</code> then <code>w</code>, then <code>u</code>.</p>");
  load("the quick brown fox");
  pos = 4; note = "Cursor on 'quick'. Try d then w, then u.";
  draw();
});
