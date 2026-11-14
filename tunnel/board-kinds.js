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
