/* Whiteboard kinds with a page of their own. Each is SD.UI[kind] = {init, draw, brief, tools, frame?}. The board
   (tunnel/board.js) hands them ctx: the question B, its state F, the SVG layer to draw in (960 × 540), helpers h and s,
   and solved(stars) / flash(text) / redraw() / rebrief(). The numbers come from tunnel/kv.js, the same code
   tools/board-check.js proves.
     scope    sort cards into what it does, how well, and not now
     evict    race four eviction policies on a full keyspace (twice: steady traffic, then a trend flip)
     persist  pick how the log reaches the disk, then pull the plug
     shard    deal 16,384 hash slots out to machines, then survive a hot key */
(function () {
  "use strict";
  const SD = (window.SD = window.SD || {});
  const UI = (SD.UI = SD.UI || {});
  const KV = window.KV;
  const pct = (x) => Math.round(x * 100) + "%";

  // ------------------------------------------------------------------------------------------------ scope --
  const BINS = [["does", "What it does"], ["how", "How well"], ["not", "Not now"]];
  const COLX = { pile: 16, does: 318, how: 532, not: 746 }, CW = 198, CH = 54;
  UI.scope = {
    init(c) {
      const n = c.B.cards.length;
      // a fixed shuffle, so the pile isn't in answer order
      c.F.order = c.B.cards.map((_, i) => i).sort((a, b) => ((a * 7 + 3) % n) - ((b * 7 + 3) % n));
      c.F.bin = {}; c.F.marks = {}; c.F.tries = 0;
      for (const i of c.F.order) c.F.bin[i] = "pile";
    },
    draw(c) {
      const { s, h, F, B } = c, kids = [];
      kids.push(s("text", { class: "sc-pileh", x: COLX.pile + 4, y: 46 }, F.order.some((i) => F.bin[i] === "pile") ? "the cards" : "all sorted"));
      for (const [id, name] of BINS) {
        const x = COLX[id];
        kids.push(s("text", { class: "sc-colh", x: x + CW / 2, y: 30, "text-anchor": "middle" }, name),
          s("path", { class: "sc-colu", d: `M${x + 30} 40 q${CW / 2 - 30} 4 ${CW - 60} -1`, filter: "url(#sd-sk)" }));
        if (id !== "not") kids.push(s("path", { class: "sc-sep", d: `M${x + CW + 8} 18 L${x + CW + 8} 524` }));
      }
      kids.push(s("path", { class: "sc-sep pile", d: `M${COLX.does - 9} 18 L${COLX.does - 9} 524` }));
      const placed = { pile: 0, does: 0, how: 0, not: 0 };
      for (const i of F.order) {
        const bin = F.bin[i], k = placed[bin]++, x = COLX[bin], y = bin === "pile" ? 54 + k * 53 : 58 + k * 62;
        const mark = F.marks[i];
        const card = h("div", { class: `sc-card${mark ? " " + mark : ""}${bin === "pile" ? "" : " in"}`, xmlns: "http://www.w3.org/1999/xhtml", tabindex: 0, role: "button",
          "aria-label": `${B.cards[i].t}: ${bin === "pile" ? "not sorted yet" : BINS.find((b) => b[0] === bin)[1]}. Tap to move it.`, title: c.done() ? B.cards[i].why : null },
          mark === "ok" ? h("i", {}, "✓") : mark === "no" ? h("i", {}, "✗") : null, B.cards[i].t);
        const fo = s("foreignObject", { x, y, width: CW, height: CH, class: "sc-fo", "data-card": i }, card);
        grab(c, fo, card, i);
        kids.push(fo);
      }
      c.layer.replaceChildren(...kids);
    },
    brief(c) {
      const left = c.F.order.filter((i) => c.F.bin[i] === "pile").length;
      return [c.h("div", { class: "sd-ask" }, c.h("p", { class: "sd-quiet" }, left ? `${left} card${left > 1 ? "s" : ""} still in the pile.` : "Every card is in a column. Check them."))];
    },
    tools(c) {
      const left = c.F.order.some((i) => c.F.bin[i] === "pile");
      const out = [c.h("div", { class: "sd-btns" }, c.h("button", { class: "btn primary", disabled: left, onclick: () => check(c) }, "Check the columns"), c.h("span", { class: "sd-runs" }, c.F.tries ? `${c.F.tries} check${c.F.tries > 1 ? "s" : ""}` : ""))];
      if (c.done()) out.push(c.h("ul", { class: "sd-rub" }, c.B.cards.map((k) => c.h("li", { class: "ok" }, c.h("i", {}, "✓"), c.h("b", {}, k.t + ". "), k.why))));
      return out;
    },
  };
  function move(c, i, bin) { c.F.bin[i] = bin; delete c.F.marks[i]; c.redraw(); c.rebrief(); }
  // drag a card to a column, or tap it to move it to the next one
  function grab(c, fo, card, i) {
    let st = null;
    card.addEventListener("pointerdown", (e) => { const p = c.pt(e); st = { x: e.clientX, y: e.clientY, ox: p.x - +fo.getAttribute("x"), oy: p.y - +fo.getAttribute("y"), moved: false }; card.setPointerCapture(e.pointerId); e.stopPropagation(); });
    card.addEventListener("pointermove", (e) => {
      if (!st) return;
      if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
      st.moved = true;
      const p = c.pt(e);
      fo.setAttribute("x", p.x - st.ox); fo.setAttribute("y", p.y - st.oy); fo.classList.add("drag");
      c.layer.append(fo);
    });
    card.addEventListener("pointerup", (e) => {
      if (!st) return;
      const was = st; st = null;
      if (!was.moved) { const order = ["pile", "does", "how", "not"], b = c.F.bin[i]; move(c, i, b === "not" ? "does" : order[order.indexOf(b) + 1]); return; }
      const x = c.pt(e).x, bin = x < COLX.does - 9 ? "pile" : x < COLX.how - 4 ? "does" : x < COLX.not - 4 ? "how" : "not";
      move(c, i, bin);
    });
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const order = ["pile", "does", "how", "not"], b = c.F.bin[i]; move(c, i, b === "not" ? "does" : order[order.indexOf(b) + 1]); } });
  }
  function check(c) {
    c.F.tries++;
    let wrong = 0;
    c.B.cards.forEach((k, i) => { const ok = c.F.bin[i] === k.bin; c.F.marks[i] = ok ? "ok" : "no"; if (!ok) wrong++; });
    c.redraw();
    if (!wrong) { c.solved(c.F.tries === 1 ? 3 : c.F.tries <= 2 ? 2 : 1); return; }
    c.flash(`${wrong} card${wrong > 1 ? "s are" : " is"} in the wrong column. Move ${wrong > 1 ? "them" : "it"} and check again.`);
    c.rebrief();
  }

  // ------------------------------------------------------------------------------------------------ evict --
  const POL = [["noeviction", "noeviction", "refuse new keys"], ["random", "random", "drop any key"], ["lru", "LRU", "drop the least recent"], ["lfu", "LFU", "drop the least used"]];
  const GX = 44, GY = 100, CELL = 15.5, CX0 = 470, CX1 = 882, CY0 = 80, CY1 = 400, TOP = 0.8;
  UI.evict = {
    init(c) { Object.assign(c.F, { round: 0, guess: null, res: null, t: 0, playing: false, rights: [], view: null }); },
    draw(c) {
      const { s, F, B } = c, kids = [], r = B.rounds[F.round];
      // the keyspace: the 400 hottest keys right now, lit when they're in memory
      const show = F.view || F.guess, R = F.res && show ? F.res[show] : null, at = R ? Math.min(R.snaps.length - 1, Math.floor(F.t * R.snaps.length)) : -1;
      kids.push(s("text", { class: "ev-h", x: GX, y: 60 }, "The keyspace"), s("text", { class: "ev-sub", x: GX, y: 80 }, R ? `the 400 hottest keys right now · lit = in memory (${POL.find((p) => p[0] === show)[1]})` : "the 400 hottest keys · lit = in memory"));
      const g = R ? R.snaps[at] : null;
      for (let k = 0; k < 400; k++) kids.push(s("rect", { class: "ev-cell" + (g && g[k] ? " on p-" + show : ""), x: GX + (k % 20) * CELL, y: GY + Math.floor(k / 20) * CELL, width: CELL - 3, height: CELL - 3, rx: 3 }));
      kids.push(s("text", { class: "ev-sub", x: GX, y: GY + 20 * CELL + 16 }, "← hottest", ), s("text", { class: "ev-sub", x: GX + 20 * CELL - 3, y: GY + 20 * CELL + 16, "text-anchor": "end" }, "400th →"));
      // the race: hit rate over time, one line per policy
      kids.push(s("text", { class: "ev-h", x: CX0, y: 60 }, "Hit rate"), s("path", { class: "ev-axis", d: `M${CX0} ${CY0} V${CY1} H${CX1}` }));
      for (const v of [0.2, 0.4, 0.6, 0.8]) { const y = CY1 - (v / TOP) * (CY1 - CY0); kids.push(s("path", { class: "ev-grid", d: `M${CX0} ${y} H${CX1}` }), s("text", { class: "ev-tick", x: CX0 - 6, y: y + 4, "text-anchor": "end" }, pct(v))); }
      kids.push(s("text", { class: "ev-tick", x: CX1, y: CY1 + 18, "text-anchor": "end" }, "200,000 requests →"));
      if (r.shift) { const x = (CX0 + CX1) / 2; kids.push(s("path", { class: "ev-flip", d: `M${x} ${CY0 - 6} V${CY1}` }), s("text", { class: "ev-tick", x: x + 6, y: CY0 + 4 }, "the trend flips")); }
      const labs = [];
      if (F.res) for (const [id] of POL) {
        const hs = F.res[id].hits, n = Math.max(1, Math.ceil(F.t * hs.length)), pts = [];
        for (let i = 0; i < n; i++) pts.push(`${(CX0 + ((i + 0.5) / hs.length) * (CX1 - CX0)).toFixed(1)} ${(CY1 - (Math.min(TOP, hs[i]) / TOP) * (CY1 - CY0)).toFixed(1)}`);
        kids.push(s("path", { class: `ev-line p-${id}${id === show ? " on" : ""}`, d: "M" + pts.join(" L") }));
        const last = pts[pts.length - 1].split(" ");
        labs.push({ id, x: +last[0] + 6, y: +last[1] + 4 });
      }
      // the line ends' names, pushed apart so two lines that meet don't print on top of each other
      labs.sort((p, q) => p.y - q.y);
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 13) labs[i].y = labs[i - 1].y + 13;
      for (const L of labs) kids.push(s("text", { class: `ev-lab p-${L.id}`, x: L.x, y: L.y }, POL.find((p) => p[0] === L.id)[1]));
      // the four policies: tap one to guess, later to look at its keyspace
      POL.forEach(([id, name, say], i) => {
        const x = 44 + i * 224, y = 452;
        const cls = `ev-pol p-${id}${F.guess === id ? " guess" : ""}${show === id ? " on" : ""}${F.res && F.t >= 1 && win(c) === id ? " win" : ""}`;
        const gp = s("g", { class: cls, transform: `translate(${x} ${y})`, role: "button", tabindex: 0, "aria-label": `${name}: ${say}`, "data-pol": id,
          onclick: () => pick(c, id), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(c, id); } } },
          s("rect", { class: "ev-pb", width: 204, height: 64, rx: 12 }), s("rect", { class: "ev-pi", x: 1, y: 1, width: 202, height: 62, rx: 12, filter: "url(#sd-sk)" }),
          s("text", { class: "ev-pn", x: 14, y: 27 }, name), s("text", { class: "ev-ps", x: 14, y: 47 }, say));
        if (F.res) gp.append(s("text", { class: "ev-pv", x: 190, y: 27, "text-anchor": "end" }, pct(hitAt(F.res[id], F.t))));
        kids.push(gp);
      });
      c.layer.replaceChildren(...kids);
    },
    brief(c) {
      const { h, F, B } = c, r = B.rounds[F.round], out = [];
      out.push(h("div", { class: "sd-ask" }, h("small", {}, `round ${F.round + 1} of ${B.rounds.length}`), h("p", {}, r.say),
        !F.guess ? h("p", { class: "sd-quiet" }, "Tap the policy you think keeps the most hits.") : !F.res ? h("p", { class: "sd-quiet" }, "Running all four…") :
          F.t < 1 ? h("p", { class: "sd-quiet" }, "Racing…") : verdictE(c)));
      return out;
    },
    tools(c) {
      const { h, F, B } = c;
      if (!F.res || F.t < 1) return [];
      const out = [h("p", { class: "sd-quiet" }, "Tap any policy on the board to see what it kept in memory.")];
      if (F.round < B.rounds.length - 1 && F.rights.length === F.round + 1) out.push(h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => { Object.assign(F, { round: F.round + 1, guess: null, res: null, t: 0, view: null }); c.redraw(); c.rebrief(); } }, "Next round: the trend flips →")));
      return out;
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.playing) return;
      F.t = Math.min(1, F.t + dt / (c.REDUCED ? 0.2 : 4.5));
      c.redraw();
      if (F.t >= 1) { F.playing = false; finishRound(c); }
    },
  };
  const hitAt = (R, t) => { const n = Math.max(1, Math.ceil(t * R.hits.length)); const xs = R.hits.slice(Math.max(0, n - 4), n); return xs.reduce((a, x) => a + x, 0) / xs.length; };
  const win = (c) => { const F = c.F; return POL.map((p) => p[0]).sort((a, b) => F.res[b].late - F.res[a].late)[0]; };
  function pick(c, id) {
    const F = c.F;
    if (F.res) { if (F.t >= 1) { F.view = id; c.redraw(); } return; }
    if (F.guess) return;
    F.guess = id; c.redraw(); c.rebrief();
    const r = c.B.rounds[F.round], res = {}, ids = POL.map((p) => p[0]);
    const next = () => {
      const k = ids.find((x) => !res[x]);
      if (!k) { F.res = res; F.t = 0; F.playing = true; c.rebrief(); return; }
      res[k] = KV.evict({ ...c.B.sim, policy: k, shift: r.shift });
      setTimeout(next, 0);
    };
    setTimeout(next, 30);
  }
  function verdictE(c) {
    const { h, F } = c, w = win(c), right = F.guess === w, R = F.res, name = (id) => POL.find((p) => p[0] === id)[1];
    const err = R.noeviction.errors / c.B.sim.n;
    return h("p", { class: "sd-verdict " + (right ? "ok" : "no") }, right ? "✓ Right: " : "✗ Not that one: ",
      `${name(w)} kept ${pct(R[w].late)} hits${F.round ? " after the flip" : ""}. ${POL.filter((p) => p[0] !== w).map((p) => `${p[1]} ${pct(R[p[0]].late)}`).join(", ")}.`,
      err > 0.01 ? h("small", { class: "ev-err" }, ` noeviction refused ${pct(err)} of all requests with an out-of-memory error.`) : null);
  }
  function finishRound(c) {
    const F = c.F;
    F.rights[F.round] = F.guess === win(c);
    if (F.round === c.B.rounds.length - 1) { const n = F.rights.filter(Boolean).length; c.solved(n === 2 ? 3 : n === 1 ? 2 : 1); }
    else c.rebrief();
  }

  // ---------------------------------------------------------------------------------------------- persist --
  const AOF = { off: "off: snapshot only", always: "always", everysec: "everysec", no: "no: the OS decides" };
  const AOF_SAY = { off: "no log; RAM is saved by the snapshot", always: "fsync before every answer", everysec: "fsync once a second, in the background", no: "the OS writes the file out ~30 s" };
  const TX0 = 70, TX1 = 760, TY0 = 262, TY1 = 440;
  UI.persist = {
    init(c) { Object.assign(c.F, { aof: "off", rdb: true, pulls: 0, res: null, anim: 0, live: 0 }); },
    draw(c) {
      const { s, F } = c, kids = [];
      // the path a write takes to safety, as boxes; the log's word is the setting
      const boxes = [["clients", "5,000 writes a second", 60], ["event loop", "one thread", 240], ["RAM", "the keyspace", 420], ["append-only log", null, 600], ["disk", F.rdb ? "+ a snapshot every 5 min" : "no snapshot", 790]];
      boxes.forEach(([name, say, x], i) => {
        const g = s("g", { class: "ps-box" + (i === 3 ? " log" : "") + (i === 4 ? " disk" : ""), transform: `translate(${x} 100)` },
          s("rect", { class: "ps-bf", width: 150, height: 74, rx: 13 }), s("rect", { class: "ps-bi", x: 1, y: 1, width: 148, height: 72, rx: 13, filter: "url(#sd-sk)" }),
          s("text", { class: "ps-bn", x: 14, y: 30 }, name));
        if (i === 3) g.append(wordS(c, 14, 54, F.aof === "off" ? "log off" : "fsync " + F.aof, () => { const L = ["off", "always", "everysec", "no"]; F.aof = L[(L.indexOf(F.aof) + 1) % L.length]; F.res = null; c.redraw(); c.rebrief(); }));
        else if (i === 4) g.append(wordS(c, 14, 54, F.rdb ? "snapshot on" : "snapshot off", () => { F.rdb = !F.rdb; F.res = null; c.redraw(); c.rebrief(); }));
        else g.append(s("text", { class: "ps-bs", x: 14, y: 54 }, say));
        kids.push(g);
        if (i < 4) kids.push(s("path", { class: "sd-wire", d: `M${x + 152} 137 H${boxes[i + 1][2] - 4}`, "marker-end": "url(#sd-ar)" }));
      });
      kids.push(s("text", { class: "ps-say", x: 600, y: 196 }, AOF_SAY[F.aof]));
      // the last 10 seconds before the plug: each column's writes, safe on disk (ink) or not yet (amber, red once lost)
      kids.push(s("text", { class: "ev-h", x: TX0, y: TY0 - 22 }, F.res ? "The last 10 seconds before the plug" : "Pull the plug to see what reached the disk"),
        s("path", { class: "ev-axis", d: `M${TX0} ${TY1} H${TX1}` }));
      if (F.res) {
        const cols = F.res.cols, w = (TX1 - TX0) / cols.length, max = Math.max(...cols.map((x) => x.n)), shown = Math.ceil(Math.min(1, F.anim * 1.6) * cols.length), fall = Math.max(0, F.anim * 1.6 - 1) / 0.6;
        cols.slice(0, shown).forEach((col, i) => {
          const x = TX0 + i * w, hAll = (col.n / max) * (TY1 - TY0 - 20), hSafe = (col.safe / max) * (TY1 - TY0 - 20);
          kids.push(s("rect", { class: "ps-safe", x: x + 0.6, y: TY1 - hSafe, width: w - 1.2, height: hSafe }));
          if (hAll > hSafe) kids.push(s("rect", { class: fall > 0 ? "ps-lost" : "ps-ram", x: x + 0.6, y: TY1 - hAll, width: w - 1.2, height: hAll - hSafe, opacity: 1 - Math.min(1, fall) * 0.45 }));
        });
        if (fall > 0) kids.push(s("path", { class: "ps-plugline", d: `M${TX1} ${TY0 - 10} V${TY1 + 6}` }), s("text", { class: "ps-zap", x: TX1 - 6, y: TY0 - 14, "text-anchor": "end" }, "⚡ plug pulled"));
        kids.push(s("text", { class: "ev-tick", x: TX0, y: TY1 + 18 }, "10 s before"), s("text", { class: "ev-tick", x: TX1, y: TY1 + 18, "text-anchor": "end" }, "the crash"));
        if (fall >= 1) kids.push(s("text", { class: "ps-out", x: TX0, y: TY1 + 48 }, F.res.lost ? `${c.num(F.res.lost)} acknowledged writes lost: the last ${F.res.lostFor >= 10 ? c.num(F.res.lostFor) : F.res.lostFor.toFixed(1)} s` : "nothing acknowledged was lost"));
      }
      // the plug
      const plug = s("g", { class: "ps-plug" + (F.anim > 0 && F.anim < 1 ? " pulling" : ""), transform: "translate(800 330)", role: "button", tabindex: 0, "aria-label": "Pull the plug", "data-plug": 1,
        onclick: () => pull(c), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pull(c); } } },
        s("rect", { class: "ps-pb", width: 130, height: 74, rx: 14 }), s("path", { class: "ps-pi", d: "M24 22h22v26H24zM30 22v-10M40 22v-10M35 48v12q0 8 12 8h20" }), s("text", { class: "ps-pt", x: 62, y: 34 }, "pull the"), s("text", { class: "ps-pt", x: 62, y: 52 }, "plug"));
      kids.push(plug);
      c.layer.replaceChildren(...kids);
    },
    brief(c) { return [c.h("div", { class: "sd-ask" }, c.h("p", { class: "sd-quiet" }, "Click the words on the log and the disk to change the settings, then pull the plug."))]; },
    tools(c) {
      const { h, F } = c;
      if (!F.res || F.anim < 1) return [];
      const ok = meets(c, F.res);
      return [h("p", { class: "sd-verdict " + (ok ? "ok" : "no") }, ok ? "✓ Both goals met." : `✗ ${F.res.p99 >= c.B.goals.p99 ? "Every write waits for the disk." : `A crash can lose up to ${F.res.worst === Infinity ? "everything" : c.num(F.res.worst) + " s"} of writes.`}`)];
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.res || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 2.6));
      c.redraw();
      if (F.anim >= 1) { if (meets(c, F.res)) c.solved(F.pulls <= 2 ? 3 : F.pulls <= 4 ? 2 : 1); else c.rebrief(); }
    },
    score(c) {
      const F = c.F, R = F.res && F.anim >= 1 ? F.res : null, G = c.B.goals;
      return [["p99 write under 1 ms", R ? R.p99 < G.p99 : null, R ? (R.p99 * 1000).toFixed(R.p99 < 0.001 ? 2 : 1) + " ms" : "pull it"],
        ["a crash loses ≤ 2 s", R ? R.worst <= G.lose : null, R ? (R.worst === 0 ? "nothing" : R.worst === Infinity ? "everything" : `up to ${R.worst >= 10 ? c.num(R.worst) : R.worst.toFixed(0)} s`) : "pull it"]];
    },
  };
  const meets = (c, R) => R.p99 < c.B.goals.p99 && R.worst <= c.B.goals.lose;
  function wordS(c, x, y, text, fn) {
    return c.s("text", { class: "ps-word", x, y, role: "button", tabindex: 0, onclick: (e) => { e.stopPropagation(); fn(); }, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } }, text);
  }
  function pull(c) {
    const F = c.F;
    if (F.res && F.anim < 1) return;
    F.pulls++;
    const plug = 20 + 10 * KV.rng(F.pulls * 7919)();
    F.res = KV.persist({ ...c.B.sim, aof: F.aof, rdb: F.rdb, plug, seed: F.pulls });
    F.anim = 0;
    c.redraw(); c.rebrief();
  }

  // ------------------------------------------------------------------------------------------------ shard --
  const RX = 250, RY = 278, RR = 196, NX = 500, BW = 130;
  const hue = (i) => `hsl(${(i * 137.5) % 360} 62% 55%)`;
  UI.shard = {
    init(c) {
      const o = c.B.sim;
      c.F.keys = [];
      for (let i = 0; i < o.keys; i++) { const name = "user:" + i; c.F.keys.push({ slot: KV.slot(name), h: KV.crc16(name), ops: o.ops, bytes: o.bytes }); }
      Object.assign(c.F, { cl: new KV.Cluster(4), moved: null, movedAt: 0, say: null, round: 0, fix: null, r1: 0 });
    },
    draw(c) {
      const { s, F, B } = c, kids = [], o = B.sim, ld = load(c), n = F.cl.n;
      // the ring: 256 arcs of 64 slots, coloured by the machine that owns them
      const mv = F.moved && performance.now() - F.movedAt < 1800 ? new Set(F.moved.map((x) => x >> 6)) : null;
      const hotSlot = F.round ? KV.slot(B.hot.key) >> 6 : -1;
      for (let a = 0; a < 256; a++) {
        const t0 = (a / 256) * 2 * Math.PI - Math.PI / 2, t1 = ((a + 1) / 256) * 2 * Math.PI - Math.PI / 2, r0 = RR - 34, r1 = RR;
        const P = (r, t) => `${(RX + r * Math.cos(t)).toFixed(1)} ${(RY + r * Math.sin(t)).toFixed(1)}`;
        kids.push(s("path", { class: "sh-arc" + (mv && mv.has(a) ? " moved" : "") + (a === hotSlot ? " hot" : ""), d: `M${P(r0, t0)} L${P(r1, t0)} A${r1} ${r1} 0 0 1 ${P(r1, t1)} L${P(r0, t1)} A${r0} ${r0} 0 0 0 ${P(r0, t0)}Z`, fill: hue(F.cl.own[a * 64]) }));
      }
      if (hotSlot >= 0) { const t = ((hotSlot + 0.5) / 256) * 2 * Math.PI - Math.PI / 2; kids.push(s("text", { class: "sh-flame", x: RX + (RR + 18) * Math.cos(t), y: RY + (RR + 18) * Math.sin(t) + 6, "text-anchor": "middle" }, "🔥")); }
      kids.push(s("text", { class: "sh-big", x: RX, y: RY - 6, "text-anchor": "middle" }, n), s("text", { class: "sh-mid", x: RX, y: RY + 18, "text-anchor": "middle" }, `machine${n > 1 ? "s" : ""}`),
        s("text", { class: "ev-tick", x: RX, y: RY + 40, "text-anchor": "middle" }, "16,384 slots"));
      // each machine: how busy, how full, with the 80% line
      const rows = Math.max(n, 1), rh = Math.min(30, 410 / rows), bw = BW, X1 = NX + 92, X2 = X1 + bw + 48;
      kids.push(s("text", { class: "ev-h", x: NX, y: 112 }, "Machines"), s("text", { class: "ev-tick", x: X1, y: 112 }, "busy"), s("text", { class: "ev-tick", x: X2, y: 112 }, "full"));
      for (let i = 0; i < n; i++) {
        const y = 122 + i * rh, busy = ld.ops[i] / o.capOps, full = ld.bytes[i] / o.capBytes;
        kids.push(s("rect", { x: NX, y: y + 2, width: 12, height: Math.max(6, rh - 8), rx: 3, fill: hue(i) }), s("text", { class: "sh-nm", x: NX + 20, y: y + rh / 2 + 2 }, `machine ${i + 1}`));
        for (const [v, x0] of [[busy, X1], [full, X2]]) {
          kids.push(s("rect", { class: "sh-mb", x: x0, y: y + 3, width: bw, height: Math.max(5, rh - 10), rx: 3 }),
            s("rect", { class: "sh-m " + (v > 1 ? "h3" : v > o.under ? "h2" : "h0"), x: x0, y: y + 3, width: Math.min(bw, bw * v), height: Math.max(5, rh - 10), rx: 3 }),
            s("path", { class: "sh-80", d: `M${x0 + bw * o.under} ${y + 1} v${Math.max(9, rh - 6)}` }));
          if (rh >= 18) kids.push(s("text", { class: "sh-v" + (v > o.under ? " over" : ""), x: x0 + bw + 4, y: y + rh / 2 + 2 }, pct(v)));
        }
      }
      c.layer.replaceChildren(...kids);
    },
    brief(c) {
      const { h, F, B } = c, out = [];
      if (F.say) out.push(h("p", { class: "sh-say" }, F.say));
      if (F.round === 1) {
        out.push(h("div", { class: "sd-ask" }, h("small", {}, "round 2 of 2"), h("p", {}, "A post goes viral. One key, ", h("b", {}, B.hot.key), `, now gets ${c.num(B.hot.ops)} reads a second, and its machine is drowning. Which change fixes it?`),
          h("ul", { class: "sh-fixes" }, B.fixes.map((f) => h("li", {}, h("button", { class: "sd-word" + (F.fix === f.id ? " on" : ""), disabled: !!F.fix, onclick: () => fix(c, f.id) }, f.say)))),
          F.fix ? h("p", { class: "sd-verdict " + (F.fix === B.answer ? "ok" : "no") }, F.fix === B.answer ? "✓ Right: the hot key's reads never reach Redis." : `✗ Not that one: the busiest machine is still ${pct(peak(c))} busy.`) : null));
      } else out.push(h("div", { class: "sd-ask" }, h("small", {}, "round 1 of 2"), h("p", { class: "sd-quiet" }, `Add or remove machines. Each change reshards: the slots that move flash.`)));
      return out;
    },
    tools(c) {
      const { h, F } = c;
      if (F.round) return [];
      const step = (d) => { const moved = d > 0 ? F.cl.add() : F.cl.remove(); if (!moved.length) return; const n = F.cl.n, frac = keysIn(c, moved);
        F.moved = moved; F.movedAt = performance.now();
        F.say = d > 0 ? `Machine ${n} took ${c.num(moved.length)} slots from the others: ${pct(frac)} of the keys moved. With hash % N, ${pct(KV.modMoved(F.keys, n - 1))} would have.` : `Machine ${n + 1} handed its ${c.num(moved.length)} slots back.`;
        c.redraw(); c.rebrief(); setTimeout(() => c.isNow() && c.redraw(), 1850); checkR1(c); };
      return [h("div", { class: "sd-insp" }, h("p", {}, h("button", { class: "sd-step", "aria-label": "One fewer machine", onclick: () => step(-1) }, "−"), h("b", {}, F.cl.n), ` machine${F.cl.n > 1 ? "s" : ""}`,
        h("button", { class: "sd-step", "aria-label": "One more machine", onclick: () => step(1) }, "+")), h("p", { class: "sd-quiet" }, "The goal: every machine under 80% busy and under 80% full."))];
    },
    score(c) {
      const F = c.F, ld = load(c), o = c.B.sim, b = Math.max(...ld.ops) / o.capOps, f = Math.max(...ld.bytes) / o.capBytes;
      return [["busiest machine", b <= (F.round ? 1 : o.under), pct(b)], ["fullest machine", f <= o.under, pct(f)], ["machines", null, String(F.cl.n)]];
    },
    frame(c) { const F = c.F; if (F.moved && performance.now() - F.movedAt > 1800 && F.movedAt) { F.movedAt = 0; c.redraw(); } },
  };
  function keysIn(c, slots) { const set = new Set(slots); return c.F.keys.filter((k) => set.has(k.slot)).length / c.F.keys.length; }
  function load(c) {
    const F = c.F, B = c.B, ks = F.keys.slice();
    if (F.round) ks.push({ slot: KV.slot(B.hot.key), ops: F.fix === "local" ? B.hot.apps : B.hot.ops, bytes: 1e6 });
    return F.cl.load(ks);
  }
  const peak = (c) => Math.max(...load(c).ops) / c.B.sim.capOps;
  function checkR1(c) {
    const F = c.F, o = c.B.sim, ld = load(c);
    if (Math.max(...ld.ops) / o.capOps <= o.under && Math.max(...ld.bytes) / o.capBytes <= o.under) {
      F.r1 = F.cl.n <= c.B.best ? 3 : F.cl.n <= c.B.best + 2 ? 2 : 1;
      F.round = 1; F.say = `✓ Every machine is under 80%, with ${F.cl.n}.`;
      c.redraw(); c.rebrief();
    }
  }
  function fix(c, id) {
    const F = c.F;
    if (F.fix) return;
    F.fix = id;
    if (id === "more") for (let k = 0; k < 6; k++) F.cl.add();
    if (id === "big") F.say = "Twice the cores, but Redis runs commands on one thread: the hot key still has one thread to itself.";
    c.redraw(); c.rebrief();
    c.solved(id === c.B.answer ? F.r1 : 1);
  }
})();

/* The WhatsApp labs (tunnel/chat.js):
     conns    hold 500 million phones: how a gateway holds a connection, how often phones heartbeat, how many machines
     offline  Bob's patchy day: an inbox, acks, message ids, until nothing is lost or shown twice
     order    a group chat on three phones: arrival order, the sender's clock, or a server sequence */
(function () {
  "use strict";
  const UI = window.SD.UI, CH = window.CHAT;
  const pct = (x) => Math.round(x * 100) + "%";
  const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : Math.round(n).toLocaleString("en-US"));
  const MODEL_WORD = { threads: "a thread per connection", loop: "an event loop" };
  const HB_WORD = { 10: "every 10 s", 30: "every 30 s", 60: "every 60 s", 300: "every 5 min" };
  function chip(c, x, y, w, cls, title, sub, on) {
    const { s } = c;
    return s("g", { class: "wa-chip " + cls, transform: `translate(${x} ${y})`, role: "button", tabindex: 0, onclick: on, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); on(); } } },
      s("rect", { class: "wa-cb", width: w, height: sub ? 56 : 40, rx: 11 }), s("rect", { class: "wa-ci", x: 1, y: 1, width: w - 2, height: (sub ? 56 : 40) - 2, rx: 11, filter: "url(#sd-sk)" }),
      s("text", { class: "wa-ct", x: 14, y: sub ? 24 : 26 }, title), sub ? s("text", { class: "wa-cs", x: 14, y: 43 }, sub) : null);
  }

  // ------------------------------------------------------------------------------------------------ conns --
  UI.conns = {
    init(c) { Object.assign(c.F, { model: "threads", hb: 10, boxes: 300, tries: 0, seeds: (() => { const r = CH.rng(5); return Array.from({ length: 140 }, () => [r(), r(), r()]); })() }); },
    draw(c) {
      const { s, F } = c, G = CH.gateways({ model: F.model, hb: F.hb, boxes: F.boxes }), kids = [], now = performance.now() / 1000;
      // the phones, each pulsing at its heartbeat
      kids.push(s("text", { class: "ev-h", x: 40, y: 92 }, "500,000,000 phones"), s("text", { class: "ev-sub", x: 40, y: 110 }, `a heartbeat ${HB_WORD[F.hb]}`));
      for (const [u, v, ph] of F.seeds) {
        const x = 50 + u * 200, y = 135 + v * 330, beat = ((now / Math.min(F.hb, 30)) * 6 + ph * 6) % 1;
        kids.push(s("circle", { class: "wa-ph", cx: x, cy: y, r: 2.6 }));
        if (!c.REDUCED && beat < 0.25) kids.push(s("circle", { class: "wa-beat", cx: x, cy: y, r: 3 + beat * 26, opacity: 1 - beat * 4 }));
      }
      // the fleet: one square a machine, warm when it's over 80%, red past 100%
      const load = Math.max(G.ram, G.cpu), heat = load > 1 ? "h3" : load > 0.8 ? "h2" : "h0", shown = Math.min(F.boxes, 600), cols = 30, sz = 10.5;
      kids.push(s("text", { class: "ev-h", x: 290, y: 92 }, `${F.boxes} gateway machines`), s("text", { class: "ev-sub", x: 290, y: 110 }, `${big(G.perBox)} phones on each · $${c.num(G.cost)} a month`));
      for (let i = 0; i < shown; i++) kids.push(s("rect", { class: "wa-box " + heat, x: 290 + (i % cols) * sz, y: 126 + Math.floor(i / cols) * sz, width: sz - 2.5, height: sz - 2.5, rx: 1.5 }));
      // one machine, up close
      const X = 650, bw = 250;
      kids.push(s("text", { class: "ev-h", x: X, y: 92 }, "One machine"), s("text", { class: "ev-sub", x: X, y: 110 }, `64 GB · 32 cores · ${MODEL_WORD[F.model]}`));
      [["memory", G.ram, `${F.model === "threads" ? "1 MB" : "25 KB"} a connection`], ["CPU", G.cpu, "200 µs a heartbeat"]].forEach(([name, v, why], i) => {
        const y = 150 + i * 92;
        kids.push(s("text", { class: "wa-mn", x: X, y }, name), s("text", { class: "wa-mv" + (v > 0.8 ? " over" : ""), x: X + bw, y, "text-anchor": "end" }, v > 9.99 ? `${c.num(v * 100)}%` : pct(v)),
          s("rect", { class: "sh-mb", x: X, y: y + 10, width: bw, height: 16, rx: 4 }), s("rect", { class: "sh-m " + (v > 1 ? "h3" : v > 0.8 ? "h2" : "h0"), x: X, y: y + 10, width: Math.min(bw, bw * v), height: 16, rx: 4 }),
          s("path", { class: "sh-80", d: `M${X + bw * 0.8} ${y + 6} v24` }), s("text", { class: "ev-tick", x: X, y: y + 44 }, why));
      });
      kids.push(s("text", { class: "wa-mn", x: X, y: 322 }, "a dropped phone is noticed in"), s("text", { class: "wa-big" + (G.detect > 60 ? " over" : ""), x: X, y: 368 }, G.detect >= 120 ? `${G.detect / 60} min` : `${G.detect} s`),
        s("text", { class: "ev-tick", x: X, y: 388 }, "two missed heartbeats"));
      c.layer.replaceChildren(...kids);
    },
    frame(c) { if (!c.REDUCED) c.redraw(); },
    brief(c) { return [c.h("div", { class: "sd-ask" }, c.h("p", { class: "sd-quiet" }, "Change the words and the machines, then roll it out."))]; },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; c.redraw(); c.rebrief(); };
      const slider = h("input", { type: "range", min: 50, max: 600, step: 1, value: F.boxes, "aria-label": "Gateway machines", oninput: (e) => { F.boxes = +e.target.value; e.target.nextSibling.textContent = `${F.boxes} machines`; c.redraw(); } });
      return [h("div", { class: "sd-insp" },
        h("p", {}, "hold connections with ", h("button", { class: "sd-word", onclick: () => set("model", F.model === "threads" ? "loop" : "threads") }, MODEL_WORD[F.model])),
        h("p", {}, "phones send a heartbeat ", h("button", { class: "sd-word", onclick: () => { const L = CH.HEARTBEATS; set("hb", L[(L.indexOf(F.hb) + 1) % L.length]); } }, HB_WORD[F.hb])),
        h("label", { class: "sd-ramp" }, h("span", {}, "fleet"), slider, h("output", {}, `${F.boxes} machines`)),
        h("p", {}, h("button", { class: "sd-step", "aria-label": "One fewer machine", onclick: () => set("boxes", Math.max(50, F.boxes - 1)) }, "−"), h("button", { class: "sd-step", "aria-label": "One more machine", onclick: () => set("boxes", Math.min(600, F.boxes + 1)) }, "+"), h("small", {}, " one at a time"))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => roll(c) }, "Roll it out"), h("span", { class: "sd-runs" }, F.tries ? `${F.tries} rollout${F.tries > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const F = c.F, G = CH.gateways({ model: F.model, hb: F.hb, boxes: F.boxes }), g = c.B.goals;
      return [["dropped phone noticed ≤ 60 s", G.detect <= g.detect, G.detect >= 120 ? `${G.detect / 60} min` : `${G.detect} s`], ["memory ≤ 80%", G.ram <= g.under, G.ram > 9.99 ? `${c.num(G.ram * 100)}%` : pct(G.ram)],
        ["CPU ≤ 80%", G.cpu <= g.under, pct(G.cpu)], ["at most 260 machines", F.boxes <= g.boxes, String(F.boxes)]];
    },
  };
  function roll(c) {
    const F = c.F, G = CH.gateways({ model: F.model, hb: F.hb, boxes: F.boxes }), g = c.B.goals;
    F.tries++;
    const miss = [G.detect > g.detect && "a dropped phone takes too long to notice", G.ram > g.under && "the machines run out of memory", G.cpu > g.under && "the heartbeats eat the CPU", F.boxes > g.boxes && "the fleet is over 260 machines"].filter(Boolean);
    if (!miss.length) c.solved(F.tries === 1 ? 3 : F.tries <= 3 ? 2 : 1);
    else { c.flash(`Not yet: ${miss.join(", and ")}.`); c.rebrief(); }
  }

  // ---------------------------------------------------------------------------------------------- offline --
  const TX0 = 60, TX1 = 920, LANE = 300, MIN = 1440;
  const tx = (m) => TX0 + (m / MIN) * (TX1 - TX0);
  const SW = [["inbox", "keep an inbox", "hold messages while Bob's away"], ["acks", "wait for acks", "resend what Bob didn't confirm"], ["ids", "ids on messages", "Bob's phone drops copies"]];
  UI.offline = {
    init(c) { Object.assign(c.F, { inbox: false, acks: false, ids: false, res: null, runs: 0, anim: 0 }); },
    draw(c) {
      const { s, F } = c, kids = [], R = F.res, upto = R ? Math.min(1, F.anim) * MIN : 0;
      kids.push(s("text", { class: "ev-h", x: TX0, y: 96 }, "Bob's day"), s("text", { class: "ev-sub", x: TX0, y: 114 }, R ? `Alice sent ${c.num(R.sent)} messages; Bob's phone dropped off ${R.drops} times` : "run it to see every message Alice sends"));
      // Bob's connection: online, offline, and the dead minute when the server still thinks he's there
      kids.push(s("text", { class: "ev-tick", x: TX0, y: LANE - 8 }, "Bob's phone"));
      if (R) for (const p of R.periods) {
        if (p.a > upto) break;
        const b = Math.min(p.b, upto);
        kids.push(s("rect", { class: p.on ? "wa-on" : "wa-off", x: tx(p.a), y: LANE, width: Math.max(0.6, tx(b) - tx(p.a)), height: 14 }));
        if (!p.on) kids.push(s("rect", { class: "wa-dead", x: tx(p.a), y: LANE - 3, width: Math.max(1.5, tx(Math.min(b, p.a + 1)) - tx(p.a)), height: 20 }));
      } else kids.push(s("rect", { class: "wa-off", x: TX0, y: LANE, width: TX1 - TX0, height: 14, opacity: 0.4 }));
      for (let hh = 0; hh <= 24; hh += 6) kids.push(s("text", { class: "ev-tick", x: tx(hh * 60), y: LANE + 34, "text-anchor": hh === 0 ? "start" : hh === 24 ? "end" : "middle" }, `${hh}:00`));
      // every message: a dot when it was sent; an arc to when it arrived; a cross if it never did; a double if Bob saw it twice
      if (R) for (const m of R.msgs) {
        if (m.t > upto) break;
        const x = tx(m.t), j = ((m.t * 7.31) % 1) * 46;
        if (m.st === "lost") kids.push(s("path", { class: "wa-lost", d: `M${x - 3.5} ${LANE + 56 + j / 3 - 3.5}l7 7m0-7l-7 7` }));
        else if (m.st === "later" || m.st === "waiting") kids.push(s("path", { class: "wa-arc", d: m.at == null ? `M${x} ${LANE - 6}v-${20 + j / 2}` : `M${x} ${LANE - 6} Q${(x + tx(m.at)) / 2} ${LANE - 40 - Math.min(150, (tx(m.at) - x) * 0.9)} ${tx(m.at)} ${LANE - 6}` }));
        else kids.push(s("circle", { class: "wa-dot" + (m.st === "twice" ? " twice" : m.st === "dedup" ? " dedup" : ""), cx: x, cy: LANE - 14 - j, r: m.st === "twice" ? 3.6 : 1.8 }));
        if (m.st === "twice") kids.push(s("circle", { class: "wa-dot twice", cx: x + 5, cy: LANE - 14 - j, r: 3.6 }));
      }
      // the server's three switches
      SW.forEach(([k, name, say], i) => kids.push(chip(c, 60 + i * 290, 420, 270, (F[k] ? "on" : "") + " sw", `${name}: ${F[k] ? "on" : "off"}`, say, () => { F[k] = !F[k]; F.res = null; c.redraw(); c.rebrief(); })));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.res || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 2.4));
      c.redraw();
      if (F.anim >= 1) { if (!F.res.lost && !F.res.twice) c.solved(F.runs <= 2 ? 3 : F.runs <= 4 ? 2 : 1); else c.rebrief(); }
    },
    brief(c) { return [c.h("div", { class: "sd-ask" }, c.h("p", { class: "sd-quiet" }, "Tap the switches under the timeline, then run Bob's day. Dots are messages that arrived at once; arcs waited for Bob; red crosses were lost; amber pairs were shown twice."))]; },
    tools(c) {
      const { h, F } = c, out = [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => runDay(c) }, "Run Bob's day"), h("span", { class: "sd-runs" }, F.runs ? `${F.runs} day${F.runs > 1 ? "s" : ""}` : ""))];
      if (F.res && F.anim >= 1 && (F.res.lost || F.res.twice)) out.push(h("p", { class: "sd-verdict no" }, F.res.lost ? `✗ ${F.res.lost} message${F.res.lost > 1 ? "s" : ""} never reached Bob.` : `✗ Bob saw ${F.res.twice} message${F.res.twice > 1 ? "s" : ""} twice.`));
      return out;
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null;
      return [["no message lost", R ? !R.lost : null, R ? String(R.lost) : "run it"], ["none shown twice", R ? !R.twice : null, R ? String(R.twice) : "run it"], ["longest wait for Bob", null, R ? `${Math.round(R.waitMax)} min` : "·"]];
    },
  };
  function runDay(c) { const F = c.F; F.runs++; F.res = CH.day({ inbox: F.inbox, acks: F.acks, ids: F.ids, seed: c.B.sim.seed }); F.anim = 0; c.redraw(); c.rebrief(); }

  // ------------------------------------------------------------------------------------------------ order --
  const RULE_WORD = { arrival: ["arrival order", "as each phone got them"], clock: ["sender's clock", "the time stamped by the sender"], seq: ["server sequence", "a number the group's server stamps"] };
  const PW = 270, PY = 76, BH = 41;
  UI.order = {
    init(c) { Object.assign(c.F, { rule: "arrival", tries: 0, g: CH.group({ seed: c.B.sim.seed }) }); },
    draw(c) {
      const { s, F } = c, kids = [], R = F.g.rules[F.rule], seq = F.g.rules.seq.orders[0];
      CH.RULES.forEach((r, i) => kids.push(chip(c, 330 + i * 205, 10, 195, (F.rule === r ? "on" : "") + " rule", RULE_WORD[r][0], null, () => pick(c, r))));
      CH.PEOPLE.forEach((name, m) => {
        const x = 30 + m * 305, o = R.orders[m], early = new Set(R.early[m]);
        kids.push(s("rect", { class: "wa-phone", x, y: PY, width: PW, height: 452, rx: 26 }), s("text", { class: "wa-pn", x: x + PW / 2, y: PY + 28, "text-anchor": "middle" }, `${name}'s phone`));
        o.forEach((i, k) => {
          const msg = CH.SCRIPT[i], mine = msg.from === m, y = PY + 44 + k * BH, w = Math.min(PW - 70, 26 + msg.text.length * 7.2), bx = mine ? x + PW - 14 - w : x + 14;
          const off = seq[k] !== i; // not where the one true order has it
          kids.push(s("rect", { class: `wa-bub p${msg.from}${early.has(i) ? " early" : ""}`, x: bx, y, width: w, height: 32, rx: 12 }));
          if (!mine) kids.push(s("text", { class: "wa-who", x: bx + 10, y: y + 12 }, CH.PEOPLE[msg.from]));
          kids.push(s("text", { class: "wa-bt", x: bx + 10, y: y + (mine ? 21 : 26) }, msg.text));
          if (early.has(i)) kids.push(s("text", { class: "wa-flag", x: mine ? bx - 6 : bx + w + 6, y: y + 21, "text-anchor": mine ? "end" : "start" }, "↯"));
          else if (off) kids.push(s("circle", { class: "wa-offc", cx: mine ? bx - 7 : bx + w + 7, cy: y + 16, r: 3.2 }));
        });
      });
      c.layer.replaceChildren(...kids);
    },
    brief(c) {
      const { h, F } = c, R = F.g.rules[F.rule];
      const say = F.tries ? h("p", { class: "sd-verdict " + (R.agree && !R.flips ? "ok" : "no") }, R.agree && !R.flips ? "✓ One chat, in the order it happened, on every phone." : !R.agree ? "✗ The phones disagree: compare them line by line." : `✗ Same order everywhere, but ${R.flips / 3} repl${R.flips / 3 > 1 ? "ies sit" : "y sits"} above the message ${R.flips / 3 > 1 ? "they answer" : "it answers"} (↯).`) : null;
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each phone shows the chat by the rule at the top of the board. Tap a rule. ↯ marks a reply shown above its question; a dot marks a message out of place."), say)];
    },
    tools() { return []; },
  };
  function pick(c, r) {
    const F = c.F;
    if (c.done() && F.solvedHere) { F.rule = r; c.redraw(); c.rebrief(); return; }
    F.rule = r; F.tries++;
    c.redraw(); c.rebrief();
    if (r === c.B.answer) { F.solvedHere = true; c.solved(F.tries === 1 ? 3 : F.tries === 2 ? 2 : 1); }
  }
})();

/* The Uber labs (tunnel/geo.js):
     nearby    a city of 3,000 drivers: pick the geo index's cell size and how far a search looks
     batch     a busy evening downtown: match each rider at once, or collect a few seconds of riders and pair the batch
     dispatch  two matchers, phones that drop mid-offer: how a driver is claimed, and how long an offer stays open */
(function () {
  "use strict";
  const UI = window.SD.UI, GEO = window.GEO;
  const K = 30, MX = 40, MY = 130, mx = (x) => MX + x * K, my = (y) => MY + y * K;
  const dots = (pts) => pts.map((p) => `M${mx(p.x).toFixed(1)} ${my(p.y).toFixed(1)}h0`).join("");
  function city(c, C, sub) {
    const { s } = c;
    return [s("text", { class: "ev-h", x: MX, y: 96 }, "The city"), s("text", { class: "ev-sub", x: MX, y: 114 }, sub),
      s("rect", { class: "ub-map", x: MX, y: MY, width: C.W * K, height: C.H * K, rx: 6 }),
      s("text", { class: "ub-place", x: mx(7.5), y: my(5.5) + 84, "text-anchor": "middle" }, "downtown"), s("text", { class: "ub-place", x: mx(16.2), y: my(2.6) - 40, "text-anchor": "middle" }, "airport")];
  }
  const stars = (runs) => (runs <= 2 ? 3 : runs <= 4 ? 2 : 1);

  // ----------------------------------------------------------------------------------------------- nearby --
  const CELL_WORD = { 4: "4 km cells", 2: "2 km cells", 1: "1 km cells", 0.5: "500 m cells", 0.25: "250 m cells", 0.1: "100 m cells", 0: "none: measure every driver" };
  const LOOK_WORD = { cell: "her own cell", ring: "her cell and the 8 around it", widen: "ring after ring, until nothing closer can hide" };
  const shown = (F) => {
    const R = F.res;
    if (!R) return -1;
    if (F.anim < R.n) return Math.floor(F.anim);
    if (F.pick != null) return F.pick;
    const bad = R.list.findIndex((r) => !r.ok);
    return bad >= 0 ? bad : R.list.reduce((b, r, i) => (r.work > R.list[b].work ? i : b), 0);
  };
  // a magnifier on one rider's search: 240 × 130, centred on her
  function zoom(c, cur, X, Y) {
    const { s, F } = c, C = F.C, q = cur.q, at = (k) => C.drivers[k];
    const far = Math.max(...[...cur.found, ...cur.truth].map((k) => GEO.dist(at(k), q)), 0.2), hw = Math.min(4, Math.max(0.35, far * 1.3)), z = 120 / hw, vh = 65 / z;
    F.zw = hw;
    const zx = (x) => X + 120 + (x - q.x) * z, zy = (y) => Y + 65 + (y - q.y) * z, inside = (p) => Math.abs(p.x - q.x) <= hw + 0.1 && Math.abs(p.y - q.y) <= vh + 0.1;
    const pts = (L) => L.filter(inside).map((p) => `M${zx(p.x).toFixed(1)} ${zy(p.y).toFixed(1)}h0`).join("");
    const kids = [s("rect", { class: "ub-map", x: X, y: Y, width: 240, height: 130, rx: 6 })];
    const cell = F.res.cell;
    if (cell) {
      for (const [x, y] of cur.cells) if (Math.abs((x + 0.5) * cell - q.x) < hw + cell && Math.abs((y + 0.5) * cell - q.y) < vh + cell) kids.push(s("rect", { class: "ub-open", x: zx(x * cell), y: zy(y * cell), width: cell * z, height: cell * z }));
      if ((2 * hw) / cell < 60) {
        let d = "";
        for (let x = Math.ceil((q.x - hw) / cell) * cell; x <= q.x + hw; x += cell) d += `M${zx(x).toFixed(1)} ${Y}v130`;
        for (let y = Math.ceil((q.y - vh) / cell) * cell; y <= q.y + vh; y += cell) d += `M${X} ${zy(y).toFixed(1)}h240`;
        kids.push(s("path", { class: "ub-grid", d }));
      }
    }
    kids.push(s("path", { class: "ub-drv z", d: pts(C.drivers) }), s("path", { class: "ub-seen z", d: pts(cur.seen ? cur.seen.map(at) : C.drivers) }));
    for (const k of cur.truth) if (!cur.found.includes(k)) kids.push(s("path", { class: "ub-miss", d: `M${zx(q.x)} ${zy(q.y)}L${zx(at(k).x)} ${zy(at(k).y)}` }));
    for (const k of cur.found) kids.push(s("path", { class: "ub-found" + (cur.truth.includes(k) ? "" : " wrong"), d: `M${zx(q.x)} ${zy(q.y)}L${zx(at(k).x)} ${zy(at(k).y)}` }));
    kids.push(s("circle", { class: "ub-r cur" + (cur.ok ? " ok" : " no"), cx: zx(q.x), cy: zy(q.y), r: 5 }), s("text", { class: "ev-tick", x: X + 234, y: Y + 124, "text-anchor": "end" }, `${(2 * hw).toFixed(1)} km across`));
    return [s("clipPath", { id: "ub-zc" }, s("rect", { x: X, y: Y, width: 240, height: 130, rx: 6 })), s("g", { "clip-path": "url(#ub-zc)" }, ...kids), s("rect", { class: "ub-zb", x: X, y: Y, width: 240, height: 130, rx: 6 })];
  }
  UI.nearby = {
    init(c) { const C = GEO.city({ seed: c.B.sim.seed }); Object.assign(c.F, { C, cell: 1, search: "cell", res: null, anim: 0, runs: 0, pick: null, all: dots(C.drivers) }); },
    draw(c) {
      const { s, F } = c, C = F.C, R = F.res, i = shown(F), cur = i >= 0 ? R.list[i] : null, upto = R ? Math.min(R.n, Math.floor(F.anim)) : 0;
      const kids = city(c, C, `${c.num(C.drivers.length)} drivers · ${C.riders.length} riders · 20 km × 11 km`);
      // the cells it opened for the rider on show, then the grid over everything
      if (cur && F.cell) for (const [x, y] of cur.cells) kids.push(s("rect", { class: "ub-open", x: mx(x * F.cell), y: my(y * F.cell), width: Math.min(F.cell, C.W - x * F.cell) * K, height: Math.min(F.cell, C.H - y * F.cell) * K }));
      if (F.cell) {
        let d = "";
        for (let x = F.cell; x < C.W - 1e-9; x += F.cell) d += `M${mx(x).toFixed(1)} ${MY}v${C.H * K}`;
        for (let y = F.cell; y < C.H - 1e-9; y += F.cell) d += `M${MX} ${my(y).toFixed(1)}h${C.W * K}`;
        kids.push(s("path", { class: "ub-grid" + (F.cell < 0.5 ? " fine" : ""), d }));
      }
      kids.push(s("path", { class: "ub-drv", d: F.all }));
      if (cur) {
        kids.push(s("path", { class: "ub-seen", d: cur.seen ? dots(cur.seen.map((k) => C.drivers[k])) : F.all }));
        const at = (k) => C.drivers[k], q = cur.q;
        for (const k of cur.truth) if (!cur.found.includes(k)) kids.push(s("path", { class: "ub-miss", d: `M${mx(q.x)} ${my(q.y)}L${mx(at(k).x)} ${my(at(k).y)}` }));
        for (const k of cur.found) kids.push(s("path", { class: "ub-found" + (cur.truth.includes(k) ? "" : " wrong"), d: `M${mx(q.x)} ${my(q.y)}L${mx(at(k).x)} ${my(at(k).y)}` }));
      }
      // the riders: tap one to see her search
      C.riders.forEach((q, k) => {
        const r = R && k < upto ? R.list[k] : null;
        kids.push(s("circle", { class: "ub-r" + (r ? (r.ok ? " ok" : " no") : "") + (k === i ? " cur" : ""), cx: mx(q.x), cy: my(q.y), r: k === i ? 6.5 : 4.6,
          onclick: () => { if (R && F.anim >= R.n) { F.pick = k; c.redraw(); } } }));
      });
      // the rider on show, up close, and every request's work so far
      const X = 680;
      if (cur) {
        const what = cur.ok ? "her true 5 nearest ✓" : cur.near < 5 ? `only ${cur.near} driver${cur.near === 1 ? "" : "s"} found ✗` : "a nearer driver missed ✗";
        kids.push(s("text", { class: "ev-h", x: X, y: 158 }, `Rider ${i + 1}`), s("text", { class: "ub-sum b", x: X + 240, y: 158, "text-anchor": "end" }, `${c.num(cur.work)} work`),
          s("text", { class: "ub-what" + (cur.ok ? "" : " no"), x: X, y: 177 }, what), ...zoom(c, cur, X, 186),
          s("text", { class: "ub-sum", x: X, y: 336 }, `${c.num(cur.opened)} cell${cur.opened === 1 ? "" : "s"} opened + ${c.num(cur.checked)} measured`));
      } else kids.push(s("text", { class: "ev-sub", x: X, y: 172 }, "pick the cells and the search,"), s("text", { class: "ev-sub", x: X, y: 188 }, "then find drivers for all 40 riders"));
      const BY = 446, BH = 84, lg = (v) => (Math.log10(Math.max(1, v)) / Math.log10(3000)) * BH, goal = c.B.goals.work;
      kids.push(s("path", { class: "ub-axis", d: `M${X} ${BY}h240` }), s("text", { class: "ev-tick", x: X, y: BY + 16 }, "work, request by request (log scale)"));
      if (R) for (let k = 0; k < upto; k++) { const r = R.list[k]; kids.push(s("rect", { class: "ub-bar" + (r.ok ? (r.work > goal ? " over" : "") : " no") + (k === i ? " cur" : ""), x: X + k * 6, y: BY - lg(r.work), width: 4.5, height: Math.max(1, lg(r.work)) })); }
      kids.push(s("path", { class: "ub-goal", d: `M${X - 4} ${BY - lg(goal)}h248` }), s("text", { class: "ev-tick", x: X + 244, y: BY - lg(goal) - 5, "text-anchor": "end" }, `${goal} a request`));
      kids.push(s("text", { class: "ev-tick", x: MX, y: 486 }, "lit dots: drivers measured · shaded: cells opened · green lines: the 5 found · red dashes: a nearer driver it missed"));
      if (cur) { const q = cur.q, hw = F.zw; kids.push(s("rect", { class: "ub-zf", x: mx(q.x - hw), y: my(q.y - hw * 0.54), width: 2 * hw * K, height: 1.08 * hw * K })); }
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= R.n) return;
      F.anim = Math.min(R.n, F.anim + dt * (c.REDUCED ? 400 : 6));
      c.redraw();
      if (F.anim >= R.n) { if (R.right === R.n && R.work <= c.B.goals.work) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= F.res.n ? F.res : null, goal = c.B.goals.work;
      const say = R && !(R.right === R.n && R.work <= goal) ? h("p", { class: "sd-verdict no" }, R.right < R.n ? `✗ ${R.n - R.right} of ${R.n} riders didn't get their true 5 nearest.` : `✗ Every rider is right, but a request costs ${c.num(Math.round(R.work))} on average.`) : null;
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Tap a rider on the map to see her search. Shaded cells were opened, lit drivers were measured, and green lines join her to the 5 it found."), say)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; F.pick = null; F.anim = 0; c.redraw(); c.rebrief(); };
      const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
      return [h("div", { class: "sd-insp" },
        h("p", {}, "the geo index: ", h("button", { class: "sd-word", onclick: () => set("cell", cyc(GEO.CELLS, F.cell)) }, CELL_WORD[F.cell])),
        F.cell ? h("p", {}, "a search looks in ", h("button", { class: "sd-word", onclick: () => set("search", cyc(GEO.SEARCH, F.search)) }, LOOK_WORD[F.search])) : null),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < F.res.n, onclick: () => { F.runs++; F.res = GEO.nearby({ cell: F.cell, search: F.search, C: F.C }); F.anim = 0; F.pick = null; c.redraw(); c.rebrief(); } }, "Find drivers"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const F = c.F, R = F.res && F.anim >= F.res.n ? F.res : null, g = c.B.goals;
      return [["the true 5 nearest, every rider", R ? R.right === R.n : null, R ? `${R.right}/${R.n}` : "run it"], [`work ≤ ${g.work} a request`, R ? R.work <= g.work : null, R ? c.num(Math.round(R.work)) : "·"],
        ["the costliest request", null, R ? c.num(R.worst) : "·"]];
    },
  };

  // ------------------------------------------------------------------------------------------------ batch --
  const WIN_WORD = { 0: "the moment she asks", 5: "every 5 s", 15: "every 15 s", 30: "every 30 s", 60: "every minute", 120: "every 2 minutes" };
  const WIN_TICK = { 0: "at once", 5: "5 s", 15: "15 s", 30: "30 s", 60: "1 min", 120: "2 min" };
  const clock = (t) => `8:${String(Math.floor(t / 60)).padStart(2, "0")} pm`;
  UI.batch = {
    init(c) { Object.assign(c.F, { win: 0, res: null, anim: 0, runs: 0, tried: {}, C: GEO.city({ seed: 1, drivers: 0, riders: 0 }) }); },
    draw(c) {
      const { s, F } = c, R = F.res, T = 1800, now = R ? Math.min(1, F.anim) * T : 0;
      const kids = city(c, F.C, R ? `${R.n} rides from 8 pm to 8:30 · 240 drivers · ${clock(now)}` : "20 riders a minute downtown · 240 drivers");
      if (R) for (const r of R.rides) {
        if (r.t > now) continue;
        if (r.matched > now) { kids.push(s("circle", { class: "ub-ask", cx: mx(r.x), cy: my(r.y), r: 4 + (c.REDUCED ? 0 : ((now - r.t) % 8) / 2) })); continue; }
        // a pickup: the driver's drive to her, bright when it's new and fading to a trace
        const age = now - r.matched, far = r.pick > 600 ? " far" : r.pick > 300 ? " mid" : "";
        kids.push(s("path", { class: "ub-pick" + far + (age < 90 ? " new" : ""), d: `M${mx(r.from.x).toFixed(1)} ${my(r.from.y).toFixed(1)}L${mx(r.x).toFixed(1)} ${my(r.y).toFixed(1)}` }));
        if (age < 90) kids.push(s("circle", { class: "ub-car", cx: mx(r.x), cy: my(r.y), r: 2.6 }));
      }
      // every window tried: the drive, plus the wait to be matched, against the goal
      const X = 680, BY = 446, PX = 26, top = (m) => BY - m * PX, goal = c.B.goals.wait;
      kids.push(s("text", { class: "ev-h", x: X, y: 172 }, "Until the car arrives"), s("text", { class: "ev-sub", x: X, y: 190 }, "average minutes, for each window"));
      kids.push(s("path", { class: "ub-axis", d: `M${X} ${BY}h244` }));
      GEO.WINDOWS.forEach((w, k) => {
        const x = X + k * 41, m = F.tried[w];
        if (m) {
          const p = m.pick / 60, q = m.toMatch / 60;
          kids.push(s("rect", { class: "ub-drive", x, y: top(p), width: 28, height: p * PX }), s("rect", { class: "ub-mwait", x, y: top(p + q), width: 28, height: Math.max(0.5, q * PX) }),
            s("text", { class: "ub-val" + (m.wait / 60 <= goal ? " ok" : ""), x: x + 14, y: top(p + q) - 6, "text-anchor": "middle" }, (m.wait / 60).toFixed(1)));
        }
        kids.push(s("text", { class: "ev-tick" + (w === F.win ? " on" : ""), x: x + 14, y: BY + 16, "text-anchor": "middle" }, WIN_TICK[w]));
      });
      kids.push(s("path", { class: "ub-goal", d: `M${X - 4} ${top(goal)}h252` }), s("text", { class: "ev-tick", x: X + 248, y: top(goal) - 5, "text-anchor": "end" }, `${goal} min`));
      kids.push(s("rect", { class: "ub-drive", x: X, y: 474, width: 10, height: 10 }), s("text", { class: "ev-tick", x: X + 15, y: 483 }, "the drive"), s("rect", { class: "ub-mwait", x: X + 92, y: 474, width: 10, height: 10 }), s("text", { class: "ev-tick", x: X + 107, y: 483 }, "waiting to be matched"));
      kids.push(s("text", { class: "ev-tick", x: MX, y: 486 }, "rings: riders waiting · lines: a driver's drive to a rider, teal when short, red when long"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 6));
      if (F.anim >= 1) F.tried[F.win] = R;
      c.redraw();
      if (F.anim >= 1) { if (R.wait / 60 <= c.B.goals.wait) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null;
      const say = R && R.wait / 60 > c.B.goals.wait ? h("p", { class: "sd-verdict no" }, `✗ The car takes ${(R.wait / 60).toFixed(1)} minutes on average: ${(R.pick / 60).toFixed(1)} driving, ${Math.round(R.toMatch)} s waiting to be matched.`) : null;
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Pick how often the matcher runs, then play the half hour. Every window you try lands in the chart, so you can compare."), say)];
    },
    tools(c) {
      const { h, F } = c, L = GEO.WINDOWS;
      return [h("div", { class: "sd-insp" }, h("p", {}, "match riders ", h("button", { class: "sd-word", onclick: () => { F.win = L[(L.indexOf(F.win) + 1) % L.length]; F.res = null; c.redraw(); c.rebrief(); } }, WIN_WORD[F.win]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => { F.runs++; F.res = GEO.match({ window: F.win, seed: c.B.sim.seed }); F.anim = 0; c.redraw(); c.rebrief(); } }, "Play the evening"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} evening${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals.wait;
      return [[`the car arrives in ≤ ${g} min`, R ? R.wait / 60 <= g : null, R ? `${(R.wait / 60).toFixed(1)} min` : "run it"], ["the drive", null, R ? `${(R.pick / 60).toFixed(1)} min` : "·"], ["waiting to be matched", null, R ? `${Math.round(R.toMatch)} s` : "·"]];
    },
  };

  // --------------------------------------------------------------------------------------------- dispatch --
  const CLAIM_WORD = { check: "marks a driver busy only on accept", cas: "claims a driver before offering" };
  const EXP_WORD = { 0: "until the driver answers", 5: "for 5 s", 15: "for 15 s", 60: "for 60 s" };
  const NAMES = ["Dev", "Ines", "Kofi", "Mara", "Tomás", "Yuki", "Lena", "Omar", "Priya", "Sam"];
  const LX0 = 120, LX1 = 920, LANE = [176, 236];
  const CX0 = 200, CX1 = 920, SPAN = 45, cx = (t) => CX0 + (Math.min(t, SPAN) / SPAN) * (CX1 - CX0);
  UI.dispatch = {
    init(c) { Object.assign(c.F, { claim: "check", expiry: 0, res: null, anim: 0, runs: 0 }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], T = 4 * 3600, tx = (t) => LX0 + (t / T) * (LX1 - LX0), upto = R ? Math.min(1, F.anim) * T : 0;
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "One evening, two matchers"), s("text", { class: "ev-sub", x: 40, y: 114 }, R ? `${R.n} rides from 8 pm to midnight · ${R.drops} offers reached a phone that dropped` : "run it to see every ride request"));
      ["matcher A", "matcher B"].forEach((name, m) => kids.push(s("path", { class: "ub-lane", d: `M${LX0} ${LANE[m]}H${LX1}` }), s("text", { class: "ub-ln", x: LX0 - 12, y: LANE[m] + 4, "text-anchor": "end" }, name)));
      ["8 pm", "9 pm", "10 pm", "11 pm", "midnight"].forEach((w, k) => kids.push(s("text", { class: "ev-tick", x: tx(k * 3600), y: 266, "text-anchor": k === 0 ? "start" : k === 4 ? "end" : "middle" }, w)));
      if (R) {
        const pos = new Map();
        for (const o of R.rides) { if (o.t > upto) break; pos.set(o.i, [tx(o.t), LANE[o.m]]); }
        for (const o of R.rides) {
          if (!pos.has(o.i)) break;
          const [x, y] = pos.get(o.i);
          if (o.st === "double" && o.with != null && pos.has(o.with)) { const [x2, y2] = pos.get(o.with); kids.push(s("path", { class: "ub-dline", d: `M${x} ${y}L${x2} ${y2}` })); }
          if (o.st === "stuck") kids.push(s("path", { class: "wa-lost", d: `M${x - 3.5} ${y - 3.5}l7 7m0-7l-7 7` }));
          else kids.push(s("circle", { class: "ub-ride" + (o.st === "double" ? " dbl" : ""), cx: x, cy: y, r: o.st === "double" ? 3.8 : 2.2 }));
          if (o.tries.length > 1) kids.push(s("circle", { class: "ub-retry", cx: x, cy: y, r: 6 }));
          if (o.tries.some((t) => t.late)) kids.push(s("path", { class: "ub-late", d: `M${x} ${y - 9}v-7` }));
        }
      }
      kids.push(s("text", { class: "ev-tick", x: LX0, y: 290 }, "dots: matched · rings: took a second offer · amber pairs: one driver, two riders · ticks: an accept thrown away · ×: stuck"));
      // up close: the first two requests from the same corner
      const tw = R ? R.rides.find((o) => o.twin != null && o.t <= upto) : null;
      kids.push(s("text", { class: "ub-ln", x: 40, y: 330 }, "Up close"));
      if (!tw) kids.push(s("text", { class: "ev-sub", x: 40, y: 350 }, "two riders on the same corner, a moment apart: run the evening to watch them"));
      else {
        const a = R.rides.find((o) => o.i === tw.twin), pair = [a, tw], t0 = a.t;
        kids.push(s("text", { class: "ev-sub", x: 40, y: 348 }, `Rina and Raj ask on the same corner, ${(tw.t - a.t).toFixed(1)} s apart; seconds after Rina asks →`));
        for (let k = 0; k <= SPAN; k += 5) kids.push(s("path", { class: "ub-tick", d: `M${cx(k)} 364v150` }), s("text", { class: "ev-tick", x: cx(k), y: 528, "text-anchor": "middle" }, `${k}`));
        pair.forEach((o, j) => {
          const y = 396 + j * 62, who = j ? "Raj" : "Rina";
          kids.push(s("text", { class: "ub-ln", x: CX0 - 14, y: y + 4, "text-anchor": "end" }, `${who} · matcher ${"AB"[o.m]}`));
          if (!o.tries.length) return;
          o.tries.forEach((t) => {
            const end = t.ok ? o.at : t.expired ? t.t + F.expiry : SPAN + t0, x1 = cx(t.t - t0), x2 = cx(end - t0);
            kids.push(s("path", { class: "ub-offer" + (t.ok ? " ok" : t.dead ? " dead" : " late"), d: `M${x1} ${y}H${x2}` }), s("circle", { class: "ub-od", cx: x1, cy: y, r: 3 }),
              s("text", { class: "ub-ot", x: x1 + 4, y: y - 9 }, `offer → ${NAMES[t.d % 10]}`));
            const note = t.ok ? (o.st === "double" ? "✓ accepted, but so did the other" : "✓ accepted") : t.dead ? (t.expired ? "phone dropped · offer closed" : "phone dropped… still waiting") : "accepted too late";
            kids.push(s("text", { class: "ub-on" + (t.ok && o.st !== "double" ? " ok" : " no"), x: Math.min(x2 + 4, 912), y: y + 18, "text-anchor": x2 > 760 ? "end" : "start" }, note));
          });
        });
      }
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 2.6));
      c.redraw();
      if (F.anim >= 1) { if (good(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null;
      const miss = R ? [R.doubled && `${R.doubled} driver${R.doubled > 1 ? "s were" : " was"} sent to two riders`, R.stuck && `${R.stuck} rider${R.stuck > 1 ? "s are" : " is"} stuck on a dead phone`, R.late && `${R.late} accept${R.late > 1 ? "s were" : " was"} thrown away`,
        R.worst > c.B.goals.worst && `someone waited ${Math.round(R.worst)} s for a driver`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Pick how a matcher claims a driver and how long an offer stays open, then run the evening. The close-up below the timeline replays two riders who asked on the same corner."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "a matcher ", h("button", { class: "sd-word", onclick: () => set("claim", F.claim === "check" ? "cas" : "check") }, CLAIM_WORD[F.claim])),
        h("p", {}, "an offer stays open ", h("button", { class: "sd-word", onclick: () => { const L = GEO.EXPIRY; set("expiry", L[(L.indexOf(F.expiry) + 1) % L.length]); } }, EXP_WORD[F.expiry]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => { F.runs++; F.res = GEO.evening({ claim: F.claim, expiry: F.expiry, seed: c.B.sim.seed }); F.anim = 0; c.redraw(); c.rebrief(); } }, "Run the evening"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} evening${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals.worst, v = (x) => (R ? String(x) : "run it");
      return [["no driver sent to two riders", R ? !R.doubled : null, v(R && R.doubled)], ["no rider stuck", R ? !R.stuck : null, v(R && R.stuck)], ["no accept thrown away", R ? !R.late : null, v(R && R.late)],
        [`a driver within ${g === 60 ? "a minute" : g + " s"}`, R ? R.worst <= g : null, R ? `${Math.round(R.worst)} s` : "·"]];
    },
  };
  const good = (c, R) => !R.doubled && !R.stuck && !R.late && R.worst <= c.B.goals.worst;
})();

/* The Twitter / X labs (tunnel/feed.js):
     fanout   the celebrity problem: where to draw the line between fan-out on write and merging on read
     likes    a viral tweet's like count: one hot row, split over more rows, or batched in memory
     tlcache  timelines in memory: who gets one cached, and how many tweet ids it keeps */
(function () {
  "use strict";
  const UI = window.SD.UI, FD = window.FEED;
  const stars = (n) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);
  const big = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(Math.round(n)));
  const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
  const lg = Math.log10;

  // ----------------------------------------------------------------------------------------------- fanout --
  const T_WORD = (T) => (T === Infinity ? "nobody: everyone fans out on write" : T === 0 ? "everyone: every timeline is merged on read" : `${big(T)} followers`);
  const HX0 = 60, HX1 = 560, hx = (f) => HX0 + ((lg(Math.max(10, f)) - 1) / (lg(2e8) - 1)) * (HX1 - HX0);
  // accounts in each half-decade of followers, out of 500 million
  const BINS = (() => { const out = []; for (let e = 1; e < 8.3; e += 0.5) { const lo = Math.pow(10, e), hi = Math.pow(10, e + 0.5); out.push({ lo, hi, n: 500e6 * (Math.pow(Math.max(lo, FD.XMIN) / FD.XMIN, -FD.ALPHA) - Math.pow(hi / FD.XMIN, -FD.ALPHA)) }); } return out; })();
  UI.fanout = {
    init(c) { Object.assign(c.F, { T: Infinity, res: null, anim: 0, runs: 0 }); },
    draw(c) {
      const { s, F } = c, R = F.res, upto = R ? Math.min(1, F.anim) : 0, kids = [], g = c.B.goals;
      // who has how many followers, and the line
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "Accounts by followers"), s("text", { class: "ev-sub", x: 40, y: 114 }, "500 million accounts · tap the chart to move the line"));
      const HB = 236, HH = 100, hy = (n) => (n < 1 ? 0 : (lg(n) / lg(5e8)) * HH);
      kids.push(s("rect", { class: "tw-hit", x: HX0 - 20, y: HB - HH - 10, width: HX1 - HX0 + 40, height: HH + 40, onclick: (e) => setT(c, e) }));
      for (const b of BINS) { const read = b.lo >= F.T; kids.push(s("rect", { class: "tw-hb" + (read ? " read" : ""), x: hx(b.lo) + 1, y: HB - hy(b.n), width: Math.max(1, hx(b.hi) - hx(b.lo) - 2), height: hy(b.n), "pointer-events": "none" })); }
      kids.push(s("path", { class: "ub-axis", d: `M${HX0} ${HB}H${HX1}` }));
      for (let e = 1; e <= 8; e++) kids.push(s("text", { class: "ev-tick", x: hx(Math.pow(10, e)), y: HB + 15, "text-anchor": "middle" }, big(Math.pow(10, e))));
      for (const [f, name] of [[120e6, "120M"], [30e6, "30M"]]) kids.push(s("text", { class: "tw-star" + (f >= F.T ? " read" : ""), x: hx(f), y: HB - 6, "text-anchor": "middle" }, "★"), s("text", { class: "ev-tick", x: hx(f), y: HB - 22, "text-anchor": "middle" }, name));
      if (F.T !== Infinity) {
        const x = F.T === 0 ? HX0 - 6 : hx(F.T);
        kids.push(s("path", { class: "tw-line", d: `M${x} ${HB - HH - 8}V${HB + 4}` }), s("text", { class: "tw-lt", x: x + 6, y: HB - HH }, "merged on read →"));
        if (F.T > 10) kids.push(s("text", { class: "tw-lt w", x: x - 6, y: HB - HH, "text-anchor": "end" }, "← fanned out on write"));
      } else kids.push(s("text", { class: "tw-lt w", x: HX1, y: HB - HH, "text-anchor": "end" }, "everyone fans out on write"));
      // the fan-out queue over the minute
      const QX0 = 60, QX1 = 560, QB = 470, QH = 128, qx = (t) => QX0 + (t / 60) * (QX1 - QX0), qy = (n) => QB - (Math.max(0, lg(Math.max(1, n)) - 3) / (lg(2e8) - 3)) * QH;
      kids.push(s("text", { class: "ev-h", x: 40, y: 290 }, "The fan-out queue"), s("text", { class: "ev-sub", x: 40, y: 308 }, R && upto >= 1 ? `the slowest 1% of tweets reached their followers after ${R.lagP99 < 10 ? R.lagP99.toFixed(1) : Math.round(R.lagP99)} s` : "timeline entries waiting to be written (log scale)"));
      kids.push(s("path", { class: "ub-axis", d: `M${QX0} ${QB}H${QX1}` }));
      for (const t of [0, 15, 30, 45, 60]) kids.push(s("text", { class: "ev-tick", x: qx(t), y: QB + 15, "text-anchor": "middle" }, `${t} s`));
      for (const n of [1e4, 1e6, 1e8]) kids.push(s("path", { class: "ub-tick", d: `M${QX0} ${qy(n)}H${QX1}` }), s("text", { class: "ev-tick", x: QX0 - 6, y: qy(n) + 3, "text-anchor": "end" }, big(n)));
      if (R) {
        const last = Math.floor(upto * (R.backlog.length - 1));
        let d = `M${qx(0)} ${QB}`;
        for (let i = 0; i <= last; i++) d += `L${qx(i / 4).toFixed(1)} ${qy(R.backlog[i]).toFixed(1)}`;
        d += `L${qx(last / 4)} ${QB}Z`;
        kids.push(s("path", { class: "tw-q", d }));
        for (const x of R.big) if (x.t <= upto * 60) kids.push(s("text", { class: "tw-star" + (x.read ? " read" : ""), x: qx(x.t), y: QB - QH + 2, "text-anchor": "middle" }, "★"));
      }
      // opening a timeline
      const LX0 = 620, LX1 = 920, LB = 470, LH = 120, MAX = 1300, lx = (ms) => LX0 + (Math.min(ms, MAX) / MAX) * (LX1 - LX0);
      kids.push(s("text", { class: "ev-h", x: LX0, y: 290 }, "Opening a timeline"), s("text", { class: "ev-sub", x: LX0, y: 308 }, R && upto >= 1 ? `99% open within ${Math.round(R.readP99)} ms` : "2,000 people open theirs, in ms"));
      kids.push(s("path", { class: "ub-axis", d: `M${LX0} ${LB}H${LX1}` }));
      for (const ms of [0, 250, 500, 750, 1000, 1250]) kids.push(s("text", { class: "ev-tick", x: lx(ms), y: LB + 15, "text-anchor": "middle" }, String(ms)));
      if (R) {
        const n = Math.floor(upto * R.lat.length), bins = new Array(52).fill(0);
        for (let i = 0; i < n; i++) bins[Math.min(51, Math.floor((Math.min(R.lat[i], MAX - 1) / MAX) * 52))]++;
        const top = Math.max(1, ...bins), bw = (LX1 - LX0) / 52;
        bins.forEach((v, i) => { if (v) kids.push(s("rect", { class: "tw-lb" + ((i + 1) * (MAX / 52) > g.read ? " slow" : ""), x: LX0 + i * bw + 0.5, y: LB - (Math.sqrt(v / top)) * LH, width: bw - 1, height: Math.sqrt(v / top) * LH })); });
        if (upto >= 1) kids.push(s("path", { class: "tw-p99", d: `M${lx(R.readP99)} ${LB - LH + 8}V${LB}` }), s("text", { class: "ev-tick", x: lx(R.readP99) + 4, y: LB - LH + 16 }, "99%"));
      }
      kids.push(s("path", { class: "ub-goal", d: `M${lx(g.read)} ${LB - LH - 10}V${LB}` }), s("text", { class: "ev-tick", x: lx(g.read) + 4, y: LB - LH - 2 }, `${g.read} ms`));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 4));
      c.redraw();
      if (F.anim >= 1) { if (good(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.lagP99 > g.lag && `the slowest tweets took ${Math.round(R.lagP99)} s to reach their followers`, R.readP99 > g.read && `the slowest timelines took ${Math.round(R.readP99)} ms to open`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Accounts right of the line (pink) are merged on read; the rest are fanned out on write. ★ marks the two celebrities who post this minute."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c;
      return [h("div", { class: "sd-insp" }, h("p", {}, "merge on read: accounts with ", h("button", { class: "sd-word", onclick: () => { F.T = cyc(FD.THRESHOLDS, F.T); F.res = null; c.redraw(); c.rebrief(); } }, T_WORD(F.T)), F.T !== Infinity && F.T !== 0 ? " or more" : "")),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => { F.runs++; F.res = FD.fanout({ T: F.T, seed: c.B.sim.seed }); F.anim = 0; c.redraw(); c.rebrief(); } }, "Play the minute"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} minute${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [[`99% of tweets arrive in ≤ ${g.lag} s`, R ? R.lagP99 <= g.lag : null, R ? `${R.lagP99 < 10 ? R.lagP99.toFixed(1) : Math.round(R.lagP99)} s` : "run it"],
        [`99% of timelines open in ≤ ${g.read} ms`, R ? R.readP99 <= g.read : null, R ? `${Math.round(R.readP99)} ms` : "·"]];
    },
  };
  const good = (c, R) => R.lagP99 <= c.B.goals.lag && R.readP99 <= c.B.goals.read;
  function setT(c, e) {
    const F = c.F, pt = c.pt(e), f = Math.pow(10, 1 + ((pt.x - HX0) / (HX1 - HX0)) * (lg(2e8) - 1));
    // the nearest threshold on the list, by orders of magnitude
    const L = FD.THRESHOLDS.filter((t) => t > 0 && t < Infinity);
    F.T = pt.x > HX1 + 5 ? Infinity : pt.x < HX0 ? 0 : L.reduce((b, t) => (Math.abs(lg(t) - lg(f)) < Math.abs(lg(b) - lg(f)) ? t : b), L[0]);
    F.res = null; c.redraw(); c.rebrief();
  }

  // ------------------------------------------------------------------------------------------------ likes --
  const SH_WORD = (n) => (n === 1 ? "one row" : `${n} rows`), B_WORD = { 0: "every like as it comes", 1: "a batch every second", 5: "a batch every 5 seconds" };
  const dur = (ms) => (ms >= 3600e3 ? `${(ms / 3600e3).toFixed(1)} hours` : ms >= 60e3 ? `${Math.round(ms / 60e3)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`);
  UI.likes = {
    init(c) { Object.assign(c.F, { shards: 1, batch: 0, res: null, anim: 0, runs: 0 }); },
    draw(c) {
      const { s, F } = c, R = F.res, upto = R ? Math.min(1, F.anim) : 0, kids = [], now = performance.now() / 1000;
      const X0 = 60, X1 = 580, B = 280, H = 140, x = (t) => X0 + (t / 600) * (X1 - X0), y = (r) => B - (Math.min(r, 70000) / 70000) * H;
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "Likes a second"), s("text", { class: "ev-sub", x: 40, y: 114 }, "ten minutes after the tweet goes viral"));
      kids.push(s("path", { class: "ub-axis", d: `M${X0} ${B}H${X1}` }));
      for (const r of [20000, 40000, 60000]) kids.push(s("path", { class: "ub-tick", d: `M${X0} ${y(r)}H${X1}` }), s("text", { class: "ev-tick", x: X0 - 6, y: y(r) + 3, "text-anchor": "end" }, big(r)));
      for (let m = 0; m <= 10; m += 2) kids.push(s("text", { class: "ev-tick", x: x(m * 60), y: B + 15, "text-anchor": "middle" }, `${m} min`));
      const cap = F.batch ? null : 1000 * F.shards, pts = [];
      for (let t = 0; t <= 600; t += 5) pts.push([t, FD.curve(t)]);
      kids.push(s("path", { class: "tw-rate" + (R ? "" : " ghost"), d: `M${x(0)} ${B}` + pts.map(([t, r]) => `L${x(t).toFixed(1)} ${y(r).toFixed(1)}`).join("") + `L${x(600)} ${B}Z` }));
      if (cap) {
        kids.push(s("path", { class: "tw-cap", d: `M${X0} ${y(cap)}H${X1}` }), s("text", { class: "ev-tick", x: X1 + 4, y: y(cap) + 3 }, cap > 70000 ? "" : `${big(cap)}/s`));
        if (cap < 40000) kids.push(s("path", { class: "tw-over", d: `M${x(0)} ${y(cap)}` + pts.map(([t, r]) => `L${x(t).toFixed(1)} ${y(Math.max(r, cap)).toFixed(1)}`).join("") + `L${x(600)} ${y(cap)}Z` }));
      } else kids.push(s("path", { class: "tw-cap", d: `M${X0} ${y(200 / F.batch)}H${X1}` }), s("text", { class: "ev-tick", x: X1 + 4, y: y(200 / F.batch) - 4 }, `${200 / F.batch} writes/s`));
      if (R) kids.push(s("path", { class: "tw-now", d: `M${x(upto * 600)} ${B - H - 6}V${B}` }));
      // likes waiting for a row
      const QB = 470, QH = 96, qmax = 1.2e7, qy = (q) => QB - (Math.min(q, qmax) / qmax) * QH;
      kids.push(s("text", { class: "ev-h", x: 40, y: 334 }, "Likes waiting"), s("text", { class: "ev-sub", x: 40, y: 352 }, R && upto >= 1 ? (R.backlog > 0 ? `up to ${big(R.backlog)} likes stuck in line` : "never more than a moment's wait") : "for a locked row"));
      kids.push(s("path", { class: "ub-axis", d: `M${X0} ${QB}H${X1}` }));
      if (R) { const n = Math.floor(upto * (R.series.length - 1)); kids.push(s("path", { class: "tw-wait", d: `M${x(0)} ${QB}` + R.series.slice(0, n + 1).map((p) => `L${x(p.t).toFixed(1)} ${qy(p.q).toFixed(1)}`).join("") + `L${x(n)} ${QB}Z` })); }
      // the counter's rows (and the app servers' batches)
      const RX = 640, RW = 270, cols = Math.ceil(Math.sqrt(F.shards)), cell = Math.min(80, RW / cols), live = R ? R.series[Math.floor(upto * (R.series.length - 1))] : null;
      kids.push(s("text", { class: "ev-h", x: RX, y: 160 }, F.shards === 1 ? "The count: one row" : `The count: ${F.shards} rows`), s("text", { class: "ev-sub", x: RX, y: 178 }, F.batch ? `200 app servers write a batch every ${F.batch === 1 ? "second" : F.batch + " s"}` : "a like locks one row for 1 ms"));
      const heat = live ? (live.util > 1 ? " h3" : live.util > 0.8 ? " h2" : " h0") : "";
      for (let i = 0; i < F.shards; i++) {
        const cx = RX + (i % cols) * cell, cy = 192 + Math.floor(i / cols) * cell, beat = live && !c.REDUCED && ((now * 3 + i * 0.37) % 1) < Math.min(0.9, live.util);
        kids.push(s("rect", { class: "tw-row" + heat + (beat ? " beat" : ""), x: cx, y: cy, width: cell - 3, height: Math.min(cell - 3, 70), rx: 3 }));
      }
      if (F.shards === 1 && live) kids.push(s("text", { class: "tw-heart", x: RX + 38, y: 236, "text-anchor": "middle" }, live.util > 1 ? "♥♥♥" : "♥"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R) return;
      const moving = F.anim < 1;
      if (moving) { F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 4.5)); if (F.anim >= 1) { if (goodL(c, R)) c.solved(stars(F.runs)); else c.rebrief(); } }
      if (moving || !c.REDUCED) c.redraw();
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.likeMs > g.like && `a like waited ${dur(R.likeMs)}`, R.readMs > g.read && `reading the count took ${R.readMs} ms`, R.lostOnCrash && `a crashed app server loses about ${R.lostOnCrash} likes`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The dashed line is how many likes a second the rows can take. Above it (red), likes queue up for a locked row."), miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "keep the count in ", h("button", { class: "sd-word", onclick: () => set("shards", cyc(FD.SHARDS, F.shards)) }, SH_WORD(F.shards))),
        h("p", {}, "write ", h("button", { class: "sd-word", onclick: () => set("batch", cyc(FD.BATCH, F.batch)) }, B_WORD[F.batch]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => { F.runs++; F.res = FD.likes({ shards: F.shards, batch: F.batch }); F.anim = 0; c.redraw(); c.rebrief(); } }, "Go viral"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} tr${F.runs > 1 ? "ies" : "y"}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [[`a like is saved in ≤ ${g.like} ms`, R ? R.likeMs <= g.like : null, R ? dur(R.likeMs) : "run it"], [`the count reads in ≤ ${g.read} ms`, R ? R.readMs <= g.read : null, R ? `${R.readMs} ms` : "·"],
        ["a crash loses no likes", R ? !R.lostOnCrash : null, R ? String(R.lostOnCrash) : "·"]];
    },
  };
  const goodL = (c, R) => R.likeMs <= c.B.goals.like && R.readMs <= c.B.goals.read && !R.lostOnCrash;

  // ---------------------------------------------------------------------------------------------- tlcache --
  const WHO_WORD = { day: "people active today", week: "people active this week", month: "people active this month", dormant: "every account" };
  const GCLS = { day: "g0", week: "g1", month: "g2", dormant: "g3" };
  UI.tlcache = {
    init(c) { Object.assign(c.F, { who: "dormant", keep: 400, tries: 0, tried: false }); },
    draw(c) {
      const { s, F } = c, r = FD.cache({ who: F.who, keep: F.keep }), g = c.B.goals, kids = [], inn = FD.WHO.slice(0, FD.WHO.indexOf(F.who) + 1);
      // 500 squares, a million accounts each
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "500 million accounts"), s("text", { class: "ev-sub", x: 40, y: 114 }, "one square is a million; filled ones get a cached timeline"));
      let k = 0;
      FD.GROUPS.forEach((G) => { for (let i = 0; i < G.users / 1e6; i++, k++) kids.push(s("rect", { class: `tw-acct ${GCLS[G.id]}${inn.includes(G.id) ? " in" : ""}`, x: 40 + (k % 25) * 14, y: 130 + Math.floor(k / 25) * 14, width: 11, height: 11, rx: 2 })); });
      FD.GROUPS.forEach((G, i) => kids.push(s("rect", { class: `tw-acct ${GCLS[G.id]} in`, x: 40, y: 426 + i * 18, width: 10, height: 10, rx: 2 }), s("text", { class: "ev-tick", x: 56, y: 435 + i * 18 }, `${G.say}: ${big(G.users)} accounts, ${+(G.opens * 100).toFixed(1)}% of opens`)));
      // the memory
      const MX = 450, MB = 470, MH = 340, my = (tb) => MB - (Math.min(tb, 24) / 24) * MH;
      kids.push(s("text", { class: "ev-h", x: MX - 20, y: 96 }, "Memory"), s("text", { class: "ev-sub", x: MX - 20, y: 114 }, `${r.tb.toFixed(1)} TB of 12`));
      kids.push(s("rect", { class: "sh-mb", x: MX, y: my(24), width: 56, height: MH, rx: 6 }), s("rect", { class: "sh-m " + (r.tb > g.tb ? "h3" : "h0"), x: MX, y: my(r.tb), width: 56, height: MB - my(r.tb), rx: 6 }),
        s("path", { class: "ub-goal", d: `M${MX - 8} ${my(g.tb)}h72` }), s("text", { class: "ev-tick", x: MX + 64, y: my(g.tb) + 3 }, "12 TB"));
      if (r.tb > 24) kids.push(s("text", { class: "wa-mv over", x: MX + 28, y: my(24) - 8, "text-anchor": "middle" }, `${Math.round(r.tb)} TB ↑`));
      // how deep people scroll
      const SX = 640, SB = 470, SH = 270, sy = (n) => SB - (lg(n) / 4) * SH;
      kids.push(s("text", { class: "ev-h", x: SX, y: 96 }, "How far people scroll"), s("text", { class: "ev-sub", x: SX, y: 114 }, `the cache keeps ${c.num(F.keep)} tweet ids`));
      kids.push(s("rect", { class: "tw-kept", x: SX, y: sy(F.keep), width: 40, height: SB - sy(F.keep), rx: 4 }), s("rect", { class: "tw-deep", x: SX, y: sy(1e4), width: 40, height: sy(F.keep) - sy(1e4), rx: 4 }));
      for (const n of FD.KEEP) kids.push(s("path", { class: "ub-tick", d: `M${SX} ${sy(n)}h52` }), s("text", { class: "ev-tick" + (n === F.keep ? " on" : ""), x: SX + 58, y: sy(n) + 3 }, `${c.num(n)} tweets · ${+(FD.DEEP[n] * 100).toFixed(2)}% scroll past`));
      kids.push(s("text", { class: "ev-tick", x: SX + 58, y: SB }, "the newest tweet"));
      kids.push(s("text", { class: "wa-mn", x: SX, y: 160 }, "slow opens"), s("text", { class: "wa-big" + (r.slow > g.slow ? " over" : ""), x: SX + 104, y: 172 }, `${(r.slow * 100).toFixed(1)}%`));
      c.layer.replaceChildren(...kids);
    },
    brief(c) {
      const { h, F } = c, r = FD.cache({ who: F.who, keep: F.keep }), g = c.B.goals;
      const miss = F.tried ? [r.tb > g.tb && `${r.tb.toFixed(1)} TB doesn't fit in 12`, r.slow > g.slow && `${(r.slow * 100).toFixed(1)}% of opens are slow`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Change who gets a cached timeline and how many ids it keeps, then build the cache. Slow opens are people without a cached timeline, plus people who scroll past its end."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.tried = false; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "cache a timeline for ", h("button", { class: "sd-word", onclick: () => set("who", cyc(FD.WHO, F.who)) }, WHO_WORD[F.who])),
        h("p", {}, "keep ", h("button", { class: "sd-word", onclick: () => set("keep", cyc(FD.KEEP, F.keep)) }, `${c.num(F.keep)} tweet ids`), " in each")),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => build(c) }, "Build the cache"), h("span", { class: "sd-runs" }, F.tries ? `${F.tries} build${F.tries > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const F = c.F, r = FD.cache({ who: F.who, keep: F.keep }), g = c.B.goals;
      return [[`fits in ${g.tb} TB`, F.tried ? r.tb <= g.tb : null, `${r.tb.toFixed(1)} TB`], [`slow opens ≤ ${g.slow * 100}%`, F.tried ? r.slow <= g.slow : null, `${(r.slow * 100).toFixed(1)}%`]];
    },
  };
  function build(c) {
    const F = c.F, r = FD.cache({ who: F.who, keep: F.keep }), g = c.B.goals;
    F.tries++; F.tried = true;
    c.redraw();
    if (r.tb <= g.tb && r.slow <= g.slow) c.solved(F.tries === 1 ? 3 : F.tries <= 3 ? 2 : 1);
    else c.rebrief();
  }
})();
