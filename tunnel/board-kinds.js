/* Whiteboard kinds with a page of their own. Each is SD.UI[kind] = {init, draw, brief, tools, frame?}. The board
   (tunnel/board.js) hands them ctx: the question B, its state F, the SVG layer to draw in (960 × 540), helpers h and s,
   and solved(stars) / flash(text) / redraw() / rebrief(). The numbers come from tunnel/kv.js, the same code
   tools/board-check.js proves.
     scope    sort cards into what it does, how well, and not now
     evict    race four eviction policies on a full keyspace (twice: steady traffic, then a trend flip)
     persist  pick how the log reaches the disk, then pull the plug
     shard    deal 16,384 hash slots out to machines, then survive a hot key
   Later units add their own blocks below (WhatsApp, Uber, Twitter, YouTube, Ticketmaster, Latency numbers). */
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

/* The YouTube labs (tunnel/video.js):
     transcode  the upload: how small to cut an hour of video, and which quality to encode first
     abr        the train ride: how the player picks each piece's quality, and how far ahead it fetches
     premiere   the premiere: what an edge does on a miss, and whom it asks */
(function () {
  "use strict";
  const UI = window.SD.UI, V = window.VIDEO;
  const stars = (n) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);
  const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
  const lg = Math.log10;
  const secs = (t) => (t >= 3600 ? `${(t / 3600).toFixed(1)} h` : t >= 100 ? `${(t / 60).toFixed(1)} min` : `${t.toFixed(t < 10 ? 1 : 0)} s`);
  const big = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(Math.round(n)));

  // ------------------------------------------------------------------------------------------- transcode --
  const SEG_WORD = { 3600: "one piece: the whole hour", 600: "10-minute pieces", 60: "1-minute pieces", 10: "10-second pieces", 2: "2-second pieces" };
  const ORDER_WORD = { piece: "each piece's four qualities together", low: "every piece's 360p first" };
  const TMAX = 36000, TX0 = 70, TX1 = 560, tx = (t) => TX0 + (lg(Math.max(1, t)) / lg(TMAX)) * (TX1 - TX0);
  // the clock while it plays: log time, from 1 s to the moment the last task finishes
  const clockT = (R, a) => (a >= 1 ? R.all : Math.pow(10, a * lg(Math.max(2, R.all))));
  const pc = (x) => (x * 100).toFixed(x < 0.01 ? 2 : 1) + "%";
  function busy(R) {
    // workers busy on each quality, at 90 moments spread on a log scale
    const out = [];
    for (let i = 0; i <= 90; i++) {
      const t = Math.pow(10, (i / 90) * lg(TMAX)), n = [0, 0, 0, 0];
      for (const x of R.tasks) if (x.start <= t && t < x.end) n[x.k]++;
      out.push({ t, n });
    }
    return out;
  }
  UI.transcode = {
    init(c) { Object.assign(c.F, { seg: 3600, order: "piece", res: null, anim: 0, runs: 0 }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], g = c.B.goals, now = R ? clockT(R, Math.min(1, F.anim)) : 0;
      // the video: four strips, one per quality, filling in as its pieces are encoded
      const SX0 = 110, SX1 = 920, COLS = 120, cw = (SX1 - SX0) / COLS, pieces = Math.ceil(3600 / F.seg);
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "The video"), s("text", { class: "ev-sub", x: 40, y: 114 }, `an hour, cut into ${pieces === 1 ? "one piece" : c.num(pieces) + " pieces"} · a cell fills when that half-minute is encoded`));
      V.RENDS.forEach((q, k) => {
        const y = 130 + k * 26, fill = new Array(COLS).fill(0);
        if (R) for (const x of R.tasks) if (x.k === k && x.end <= now) { const a = x.p * F.seg, b = a + x.len; for (let i = Math.floor(a / 30); i < Math.min(COLS, Math.ceil(b / 30)); i++) fill[i] += (Math.min(b, (i + 1) * 30) - Math.max(a, i * 30)) / 30; }
        kids.push(s("text", { class: "ev-tick" + (R && R.ready[k] <= now ? " on" : ""), x: SX0 - 10, y: y + 14, "text-anchor": "end" }, q.id));
        for (let i = 0; i < COLS; i++) kids.push(s("rect", { class: `yt-cell q${k}`, x: SX0 + i * cw, y, width: cw - 1, height: 20, "fill-opacity": 0.1 + 0.9 * Math.min(1, fill[i]) }));
      });
      if (pieces > 1 && pieces <= 60) for (let p = 1; p < pieces; p++) kids.push(s("path", { class: "yt-cut", d: `M${SX0 + (p * F.seg / 30) * cw - 0.5} 126V${130 + 4 * 26}` }));
      // the workers: how many are busy on each quality, over time
      const WB = 470, WH = 150, wy = (n) => WB - Math.sqrt(n / 200) * WH;
      kids.push(s("text", { class: "ev-h", x: 40, y: 270 }, "200 workers"), s("text", { class: "ev-sub", x: 40, y: 288 }, R ? `busy on each quality · ${secs(now)} after the upload` : "busy on each quality, over time (log scales)"));
      kids.push(s("path", { class: "ub-axis", d: `M${TX0} ${WB}H${TX1}` }));
      for (const [t, l] of [[1, "1 s"], [10, "10 s"], [60, "1 min"], [600, "10 min"], [3600, "1 h"], [36000, "10 h"]]) kids.push(s("text", { class: "ev-tick", x: tx(t), y: WB + 15, "text-anchor": "middle" }, l));
      for (const n of [4, 50, 200]) kids.push(s("path", { class: "ub-tick", d: `M${TX0} ${wy(n)}H${TX1}` }), s("text", { class: "ev-tick", x: TX0 - 6, y: wy(n) + 3, "text-anchor": "end" }, String(n)));
      if (R) {
        const S = F.series.filter((p) => p.t <= now);
        for (let k = 3; k >= 0; k--) {
          // stacked: 360p at the bottom
          const top = (p) => p.n.slice(0, k + 1).reduce((a, x) => a + x, 0), bot = (p) => p.n.slice(0, k).reduce((a, x) => a + x, 0);
          if (S.length < 2) break;
          const d = "M" + S.map((p) => `${tx(p.t).toFixed(1)} ${wy(top(p)).toFixed(1)}`).join("L") + "L" + S.slice().reverse().map((p) => `${tx(p.t).toFixed(1)} ${wy(bot(p)).toFixed(1)}`).join("L") + "Z";
          kids.push(s("path", { class: `yt-busy q${k}`, d }));
        }
        kids.push(s("path", { class: "tw-now", d: `M${tx(now)} ${WB - WH - 6}V${WB}` }));
        if (R.watchable <= now) kids.push(s("path", { class: "yt-mark", d: `M${tx(R.watchable)} ${WB - WH - 14}V${WB}` }), s("text", { class: "yt-lt", x: tx(R.watchable) + 4, y: WB - WH - 8 }, "▶ watchable"));
      }
      kids.push(s("path", { class: "ub-goal", d: `M${tx(g.watch)} ${WB - WH - 22}V${WB + 20}` }), s("text", { class: "ev-tick", x: tx(g.watch), y: WB + 31, "text-anchor": "middle" }, `goal: ${g.watch} s`));
      // the numbers, and what the player can offer
      const NX = 620, done = R && F.anim >= 1;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 300 }, "watchable after"), s("text", { class: "wa-big" + (done && R.watchable > g.watch ? " over" : ""), x: NX, y: 346 }, R && R.watchable <= now ? secs(R.watchable) : R ? "…" : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 392 }, "start-up wastes"), s("text", { class: "wa-big" + (R && R.overhead > g.waste ? " over" : ""), x: NX, y: 438 }, R ? pc(R.overhead) : "–"),
        s("text", { class: "ev-tick", x: NX, y: 458 }, R ? `${c.num(R.tasks.length)} tasks × 4 s of start-up` : "of the work"));
      V.RENDS.forEach((q, k) => {
        const on = R && R.ready[k] <= now, x = NX + k * 74;
        kids.push(s("rect", { class: "yt-chip" + (on ? ` on q${k}` : ""), x, y: 486, width: 66, height: 24, rx: 12 }), s("text", { class: "yt-ct" + (on ? " on" : ""), x: x + 33, y: 502, "text-anchor": "middle" }, q.id));
      });
      if (R) kids.push(s("text", { class: "ev-tick", x: NX, y: 476 }, R.all <= now ? `every quality done after ${secs(R.all)}` : "qualities ready to play"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 4.5));
      c.redraw();
      if (F.anim >= 1) { if (goodT(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.watchable > g.watch && `the video wasn't watchable until ${secs(R.watchable)}`, R.overhead > g.waste && `start-up took ${pc(R.overhead)} of the work`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each strip is the hour of video in one quality. The chart below is what the 200 workers are busy with; time runs on a log scale, so it speeds up as it goes."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "cut it into ", h("button", { class: "sd-word", onclick: () => set("seg", cyc(V.SEGS, F.seg)) }, SEG_WORD[F.seg])),
        h("p", {}, "encode ", h("button", { class: "sd-word", onclick: () => set("order", cyc(V.ORDERS, F.order)) }, ORDER_WORD[F.order]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => { F.runs++; F.res = V.transcode({ seg: F.seg, order: F.order, seed: c.B.sim.seed }); F.series = busy(F.res); F.anim = 0; c.redraw(); c.rebrief(); } }, "Upload it"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} upload${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [[`watchable in 360p within ${g.watch} s`, R ? R.watchable <= g.watch : null, R ? secs(R.watchable) : "run it"], [`start-up wastes ≤ ${g.waste * 100}% of the work`, R ? R.overhead <= g.waste : null, R ? pc(R.overhead) : "·"]];
    },
  };
  const goodT = (c, R) => R.watchable <= c.B.goals.watch && R.overhead <= c.B.goals.waste;

  // ------------------------------------------------------------------------------------------------- abr --
  const RULE_WORD = { top: "always 1080p", low: "always 360p", rate: "to match the last download's speed", buffer: "by how full the buffer is" };
  const AHEAD_WORD = { 10: "10 s", 30: "30 s", 120: "2 minutes" };
  const AX0 = 60, AX1 = 620, AEND = 560, ax = (t) => AX0 + (Math.min(t, AEND) / AEND) * (AX1 - AX0);
  const BB = 250, BH = 100, by = (m) => BB - ((lg(Math.max(0.1, m)) + 1) / 2.3) * BH; // 0.1 to 20 megabits, log scale
  // where the playhead is, and what's buffered, at time t
  function at(R, t) {
    const T = R.trace;
    let i = 0;
    while (i < T.length - 1 && T[i + 1][0] <= t) i++;
    const [t0, b0, p0] = T[i], [t1, b1, p1] = T[Math.min(T.length - 1, i + 1)], f = t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 0;
    return { buf: b0 + (b1 - b0) * f, play: p0 + (p1 - p0) * f, stall: R.stalls.some((x) => t >= x.at && t < x.at + x.len) };
  }
  // Leo's screen: a tulip in a field, drawn in blocks as big as the quality is poor
  const BLOCK = [22, 15, 10, 6, 4];
  function pixel(u, v) {
    const dx = (u - 0.5) / 0.13, dy = (v - 0.38) / 0.16;
    if (dx * dx + dy * dy < 1 && !(v < 0.3 && Math.abs(u - 0.5) < 0.03)) return u < 0.5 ? "pk" : "pk2";
    if (Math.abs(u - 0.5) < 0.018 && v > 0.5 && v < 0.82) return "st";
    if ((u - 0.43) ** 2 / 0.004 + (v - 0.66) ** 2 / 0.0012 < 1) return "st";
    if (v > 0.8) return (u * 7 + v * 3) % 1 < 0.5 ? "gr" : "gr2";
    if ((u - 0.82) ** 2 + (v - 0.18) ** 2 < 0.006) return "sun";
    return v < 0.4 ? "sky" : "sky2";
  }
  UI.abr = {
    init(c) { Object.assign(c.F, { rule: "top", ahead: 30, res: null, anim: 0, runs: 0 }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], g = c.B.goals, now = R ? Math.min(1, F.anim) * Math.min(AEND, R.end) : 0;
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "The signal, and what the player picked"), s("text", { class: "ev-sub", x: 40, y: 114 }, "megabits a second along the ride (log scale)"));
      // the line's sections
      let from = 0;
      for (const sec of V.RIDE) { const a = ax(from), b = ax(Math.min(sec.to, AEND)); if (a < b) { kids.push(s("rect", { class: "yt-sec" + (sec.mbps < 1 ? " dark" : ""), x: a, y: BB - BH - 8, width: b - a, height: BH + 8 })); if (b - a > 40) kids.push(s("text", { class: "ev-tick", x: (a + b) / 2, y: BB + 28, "text-anchor": "middle" }, sec.say)); } from = sec.to; }
      for (const q of V.LADDER) kids.push(s("path", { class: "ub-tick", d: `M${AX0} ${by(q.mbps)}H${AX1}` }), s("text", { class: "ev-tick", x: AX1 + 6, y: by(q.mbps) + 3 }, q.id));
      kids.push(s("path", { class: "ub-axis", d: `M${AX0} ${BB}H${AX1}` }));
      for (const t of [0, 120, 240, 360, 480]) kids.push(s("text", { class: "ev-tick", x: ax(t), y: BB + 14, "text-anchor": "middle" }, `${t / 60} min`));
      const bw = R ? R.bw : V.ride(c.B.sim.seed), upto = R ? now : AEND;
      kids.push(s("path", { class: "yt-bw" + (R ? "" : " ghost"), d: `M${ax(0)} ${BB}` + bw.slice(0, Math.ceil(upto) + 1).map((m, t) => `L${ax(t).toFixed(1)} ${by(m).toFixed(1)}`).join("") + `L${ax(upto)} ${BB}Z` }));
      if (R) {
        // the quality of each piece, drawn when it was fetched
        let d = "";
        for (const p of R.pieces) { if (p.start > now) break; d += `${d ? "L" : "M"}${ax(p.start).toFixed(1)} ${by(V.LADDER[p.k].mbps).toFixed(1)}H${ax(Math.min(p.t, now)).toFixed(1)}`; }
        if (d) kids.push(s("path", { class: "yt-pick", d }));
      }
      // the buffer
      const QB = 480, QH = 110, qmax = F.ahead * 1.25, qy = (b) => QB - (Math.min(b, qmax) / qmax) * QH;
      const st = R ? R.stalls.filter((x) => x.at < now) : [];
      kids.push(s("text", { class: "ev-h", x: 40, y: 320 }, "The buffer"), s("text", { class: "ev-sub", x: 40, y: 338 }, R ? (st.length ? `stalled ${st.length} time${st.length > 1 ? "s" : ""}, ${st.reduce((a, x) => a + Math.min(x.len, now - x.at), 0).toFixed(1)} s in all` : "seconds of video fetched ahead · no stalls yet") : "seconds of video fetched ahead of the playhead"));
      kids.push(s("path", { class: "ub-axis", d: `M${AX0} ${QB}H${AX1}` }), s("path", { class: "ub-goal", d: `M${AX0} ${qy(F.ahead)}H${AX1}` }), s("text", { class: "ev-tick yt-halo", x: AX1 - 4, y: qy(F.ahead) - 5, "text-anchor": "end" }, `fetch up to ${AHEAD_WORD[F.ahead]} ahead`));
      if (R) {
        const pts = R.trace.filter((p) => p[0] <= now);
        if (pts.length) kids.push(s("path", { class: "yt-buf", d: `M${ax(0)} ${QB}` + pts.map((p) => `L${ax(p[0]).toFixed(1)} ${qy(p[1]).toFixed(1)}`).join("") + `L${ax(now)} ${qy(at(R, now).buf).toFixed(1)}L${ax(now)} ${QB}Z` }));
        for (const x of st) kids.push(s("rect", { class: "yt-stall", x: ax(x.at), y: QB - 10, width: Math.max(2, ax(Math.min(now, x.at + x.len)) - ax(x.at)), height: 10 }));
        kids.push(s("path", { class: "tw-now", d: `M${ax(now)} ${BB - BH - 8}V${QB}` }));
      }
      // Leo's screen
      const SX = 680, SY = 128, SW = 240, SHh = 135, cur = R ? at(R, now) : null;
      const k = R ? (R.pieces[Math.min(R.pieces.length - 1, Math.floor(cur.play / 2))] || { k: 0 }).k : 4, B = BLOCK[k];
      kids.push(s("text", { class: "ev-sub", x: SX, y: SY - 4 }, R ? `Leo's screen · ${V.LADDER[k].id}` : "Leo's screen"));
      // (each quality's picture is built once and reused, since 1080p is two thousand blocks)
      const scr = (F.scr = F.scr || {});
      if (!scr[k]) { const px = []; for (let y = 0; y < SHh; y += B) for (let x = 0; x < SW; x += B) px.push(s("rect", { class: "yt-px " + pixel((x + B / 2) / SW, (y + B / 2) / SHh), x: SX + x, y: SY + y, width: Math.min(B, SW - x), height: Math.min(B, SHh - y) })); scr[k] = s("g", {}, ...px); }
      kids.push(scr[k]);
      kids.push(s("rect", { class: "yt-frame", x: SX, y: SY, width: SW, height: SHh, rx: 4 }));
      if (cur && cur.stall) kids.push(s("rect", { class: "yt-dim", x: SX, y: SY, width: SW, height: SHh, rx: 4 }), s("circle", { class: "yt-spin", cx: SX + SW / 2, cy: SY + SHh / 2, r: 14, transform: `rotate(${(performance.now() / 3) % 360} ${SX + SW / 2} ${SY + SHh / 2})` }));
      // the numbers
      const done = R && F.anim >= 1, NX = 680;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 300 }, "stalled"), s("text", { class: "wa-big" + (done && R.stallShare > g.stall ? " over" : ""), x: NX, y: 340 }, done ? `${(R.stallShare * 100).toFixed(1)}%` : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 376 }, "on average"), s("text", { class: "wa-big" + (done && R.avg < g.avg ? " over" : ""), x: NX, y: 416 }, done ? R.avg.toFixed(2) : "–"), s("text", { class: "ev-tick", x: NX + 104, y: 416 }, "megabits a second"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 452 }, "thrown away"), s("text", { class: "wa-big" + (done && R.wasted > g.waste ? " over" : ""), x: NX, y: 492 }, done ? `${Math.round(R.wasted)} MB` : "–"), s("text", { class: "ev-tick", x: NX, y: 510 }, "fetched, never watched: he got off"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R) return;
      const moving = F.anim < 1;
      if (moving) { F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 6)); if (F.anim >= 1) { if (goodA(c, R)) c.solved(stars(F.runs)); else c.rebrief(); } }
      if (moving) c.redraw();
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.stallShare > g.stall && `it stalled ${(R.stallShare * 100).toFixed(1)}% of the time`, R.avg < g.avg && `the picture averaged ${R.avg.toFixed(2)} megabits a second`, R.wasted > g.waste && `${Math.round(R.wasted)} MB was fetched and never watched`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The pink steps are the quality of each piece the player fetched, against the signal under it. Below, the buffer: when it hits zero, the picture stops."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "pick each piece's quality ", h("button", { class: "sd-word", onclick: () => set("rule", cyc(V.RULES, F.rule)) }, RULE_WORD[F.rule])),
        h("p", {}, "fetch up to ", h("button", { class: "sd-word", onclick: () => set("ahead", cyc(V.AHEAD, F.ahead)) }, AHEAD_WORD[F.ahead]), " ahead")),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: () => { F.runs++; F.res = V.abr({ rule: F.rule, ahead: F.ahead, seed: c.B.sim.seed }); F.anim = 0; c.redraw(); c.rebrief(); } }, "Ride the train"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} ride${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [[`stalled under ${g.stall * 100}% of the time`, R ? R.stallShare <= g.stall : null, R ? `${(R.stallShare * 100).toFixed(1)}%` : "run it"],
        [`at least ${g.avg} megabits a second`, R ? R.avg >= g.avg : null, R ? R.avg.toFixed(2) : "·"], [`at most ${g.waste} MB thrown away`, R ? R.wasted <= g.waste : null, R ? `${Math.round(R.wasted)} MB` : "·"]];
    },
  };
  const goodA = (c, R) => R.stallShare <= c.B.goals.stall && R.avg >= c.B.goals.avg && R.wasted <= c.B.goals.waste;

  // -------------------------------------------------------------------------------------------- premiere --
  const COL_WORD = { false: "passes every request on", true: "sends one request and holds the rest" };
  const SHD_WORD = { false: "the origin directly", true: "a shield in their region first" };
  const CX = 270, CY = 320, RE = 186, RS = 104;
  const edgeAt = (e) => { const r = e % V.REGIONS, j = Math.floor(e / V.REGIONS), a = (r / V.REGIONS) * 2 * Math.PI + ((j - (V.EDGES / V.REGIONS - 1) / 2) / (V.EDGES / V.REGIONS)) * (2 * Math.PI / V.REGIONS) * 0.85 - Math.PI / 2; return [CX + RE * Math.cos(a), CY + RE * Math.sin(a)]; };
  const shieldAt = (r) => { const a = (r / V.REGIONS) * 2 * Math.PI - Math.PI / 2; return [CX + RS * Math.cos(a), CY + RS * Math.sin(a)]; };
  UI.premiere = {
    init(c) { Object.assign(c.F, { collapse: false, shield: false, res: null, anim: 0, runs: 0, memo: {} }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], g = c.B.goals, ts = R ? Math.min(1, F.anim) * 120 : 0, sec = Math.min(119, Math.floor(ts));
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "3 million viewers, 200 edges"), s("text", { class: "ev-sub", x: 40, y: 114 }, R ? `${Math.floor(ts)} s into the premiere · piece ${Math.min(30, Math.floor(ts / 4) + 1)} of 30` : "a dot is an edge, sized by its viewers"));
      // a pulse each time a piece goes live
      const phase = (ts % 4) / 4, lit = R && F.anim < 1 && phase < 0.35, w = (n) => Math.max(0.6, Math.min(7, 0.8 + 1.1 * lg(1 + n)));
      const per = R ? R.pieces : 30;
      for (let e = 0; e < V.EDGES; e++) {
        const [x, y] = edgeAt(e), [tx2, ty2] = F.shield ? shieldAt(e % V.REGIONS) : [CX, CY];
        kids.push(s("path", { class: "yt-wire" + (lit ? " lit" : ""), d: `M${x.toFixed(1)} ${y.toFixed(1)}L${tx2.toFixed(1)} ${ty2.toFixed(1)}`, "stroke-width": R ? w(R.edgeUp[e] / per) : 0.6 }));
      }
      if (F.shield) for (let r = 0; r < V.REGIONS; r++) { const [x, y] = shieldAt(r); kids.push(s("path", { class: "yt-wire up" + (lit ? " lit" : ""), d: `M${x.toFixed(1)} ${y.toFixed(1)}L${CX} ${CY}`, "stroke-width": R ? w(R.regionOrigin[r] / per) : 1 })); }
      const vmax = R ? Math.max(...R.per) : 1;
      for (let e = 0; e < V.EDGES; e++) { const [x, y] = edgeAt(e); kids.push(s("circle", { class: "yt-edge", cx: x, cy: y, r: R ? 2 + 4 * Math.sqrt(R.per[e] / vmax) : 3 })); }
      if (F.shield) for (let r = 0; r < V.REGIONS; r++) { const [x, y] = shieldAt(r); kids.push(s("rect", { class: "yt-shield", x: x - 8, y: y - 8, width: 16, height: 16, rx: 3 })); }
      const load = R ? R.asked[sec] / R.cap : 0, hot = load > 1;
      kids.push(s("circle", { class: "yt-origin" + (hot && F.anim < 1 ? " hot" : ""), cx: CX, cy: CY, r: 26 + (R ? Math.min(18, 4 * lg(1 + load)) : 0) }), s("text", { class: "yt-ot", x: CX, y: CY + 4, "text-anchor": "middle" }, "origin"));
      // what reaches the origin, second by second
      const OX0 = 600, OX1 = 920, OB = 290, OH = 150, ox = (t) => OX0 + (t / 120) * (OX1 - OX0), oy = (n) => OB - (lg(Math.max(1, n)) / 7) * OH;
      kids.push(s("text", { class: "ev-h", x: 580, y: 96 }, "Asking the origin"), s("text", { class: "ev-sub", x: 580, y: 114 }, R && F.anim >= 1 ? `at most ${c.num(Math.round(R.originPeak))} requests in a second` : "requests a second (log scale)"));
      kids.push(s("path", { class: "ub-axis", d: `M${OX0} ${OB}H${OX1}` }));
      for (const n of [10, 1e3, 1e5]) kids.push(s("path", { class: "ub-tick", d: `M${OX0} ${oy(n)}H${OX1}` }), s("text", { class: "ev-tick", x: OX0 - 6, y: oy(n) + 3, "text-anchor": "end" }, big(n)));
      for (const t of [0, 30, 60, 90, 120]) kids.push(s("text", { class: "ev-tick", x: ox(t), y: OB + 15, "text-anchor": "middle" }, `${t} s`));
      if (R) for (let t = 0; t <= sec; t++) if (R.asked[t] > 0) kids.push(s("rect", { class: "yt-ob" + (R.asked[t] > R.cap ? " over" : ""), x: ox(t), y: oy(R.asked[t]), width: Math.max(1.5, (OX1 - OX0) / 120 - 0.5), height: OB - oy(R.asked[t]) }));
      kids.push(s("path", { class: "tw-cap", d: `M${OX0} ${oy(g.peak)}H${OX1}` }), s("text", { class: "ev-tick yt-halo", x: OX1, y: oy(g.peak) - 5, "text-anchor": "end" }, `it can answer ${g.peak}/s`));
      // how long viewers wait for each piece
      const HX0 = 600, HX1 = 920, HB = 480, HH = 110, bw = (HX1 - HX0) / 21;
      kids.push(s("text", { class: "ev-h", x: 580, y: 338 }, "Waiting for a piece"), s("text", { class: "ev-sub", x: 580, y: 356 }, R && F.anim >= 1 ? (R.failed > 0.005 ? `${(R.failed * 100).toFixed(1)}% gave up · 99% within ${R.waitP99 > 2 ? "never" : R.waitP99.toFixed(2) + " s"}` : `99% got it within ${R.waitP99.toFixed(2)} s`) : "share of viewers, by seconds waited"));
      kids.push(s("path", { class: "ub-axis", d: `M${HX0} ${HB}H${HX1}` }));
      for (const [i, l] of [[0, "0"], [5, "0.5"], [10, "1 s"], [15, "1.5"], [20, "gave up"]]) kids.push(s("text", { class: "ev-tick", x: HX0 + i * bw + (i === 20 ? bw / 2 : 0), y: HB + 15, "text-anchor": "middle" }, l));
      if (R && F.anim >= 1) R.hist.forEach((v, i) => { if (v > 0) { const hgt = Math.max(1.5, Math.sqrt(v) * HH); kids.push(s("rect", { class: "yt-wb" + (i >= g.wait * 10 ? " slow" : ""), x: HX0 + i * bw + 0.5, y: HB - hgt, width: bw - 1, height: hgt })); } });
      kids.push(s("path", { class: "ub-goal", d: `M${HX0 + g.wait * 10 * bw} ${HB - HH - 6}V${HB}` }));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 6));
      c.redraw();
      if (F.anim >= 1) { c.redraw(); if (goodP(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.originPeak > g.peak && `the origin was asked ${c.num(Math.round(R.originPeak))} times in one second`, R.waitP99 > g.wait && (R.failed > 0.01 ? `${(R.failed * 100).toFixed(1)}% of requests gave up` : `the slowest 1% waited ${R.waitP99.toFixed(2)} s for a piece`)].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Lines are requests going up when an edge misses; thicker is more. Squares, when you add them, are regional shields: caches between the edges and the origin."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.collapse}:${F.shield}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = V.premiere({ collapse: F.collapse, shield: F.shield, seed: c.B.sim.seed })); F.anim = 0; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "on a miss, an edge ", h("button", { class: "sd-word", onclick: () => set("collapse", !F.collapse) }, COL_WORD[F.collapse])),
        h("p", {}, "edges ask ", h("button", { class: "sd-word", onclick: () => set("shield", !F.shield) }, SHD_WORD[F.shield]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: run }, "Start the premiere"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} premiere${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [[`the origin is asked ≤ ${g.peak} times a second`, R ? R.originPeak <= g.peak : null, R ? c.num(Math.round(R.originPeak)) : "run it"],
        [`99% get each piece within ${g.wait} s`, R ? R.waitP99 <= g.wait : null, R ? (R.waitP99 > 2 ? "gave up" : `${R.waitP99.toFixed(2)} s`) : "·"]];
    },
  };
  const goodP = (c, R) => R.originPeak <= c.B.goals.peak && R.waitP99 <= c.B.goals.wait;
})();

/* The Ticketmaster labs (tunnel/tix.js):
     onsale   10:00: how the waiting room lets fans through, and in what order
     hold     while you pay: how a shopper's seats are kept, and for how long
     seatmap  those seats were just taken: where the seat map comes from, and how a shopper picks */
(function () {
  "use strict";
  const UI = window.SD.UI, TX = window.TIX;
  const stars = (n) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);
  const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
  const lg = Math.log10;
  const clock = (t) => { const m = Math.floor(t / 60); return `${10 + Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
  const pc = (x, d = 1) => `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : d)}%`;
  // the house: 1,000 blocks of 20 seats, best first; a block fills pink as its seats sell (built once, then recoloured)
  function house(c, F, x0, y0, step) {
    if (!F.blocks) {
      const want = TX.venue(1), rank = want.map((_, b) => b).sort((a, b) => want[b] - want[a]);
      F.rankOf = new Array(rank.length); rank.forEach((b, i) => (F.rankOf[b] = i));
      F.blocks = want.map((_, b) => c.s("rect", { class: "tm-seat", x: x0 + (b % TX.COLS) * step, y: y0 + Math.floor(b / TX.COLS) * step, width: step - 1, height: step - 1, rx: 1 }));
      F.stage = c.s("rect", { class: "tm-stage", x: x0 + step * 8, y: y0 - 12, width: step * 24 - 1, height: 6, rx: 3 });
    }
    return F.blocks;
  }
  // a time axis for the onsale charts: 10:00 to 11:30
  const MM = 5400, TX0 = 70, TX1 = 560, tx = (t) => TX0 + (Math.min(t, MM) / MM) * (TX1 - TX0);
  const timeAxis = (s, kids, y) => { for (const t of [0, 900, 1800, 2700, 3600, 4500, 5400]) kids.push(s("text", { class: "ev-tick", x: tx(t), y: y + 14, "text-anchor": "middle" }, clock(t))); };
  const at19k = (R) => (R.series.find((p) => p[1] >= 19000) || [null])[0];

  // ------------------------------------------------------------------------------------------------ onsale --
  const DOOR_WORD = { all: "everyone at once", 50: "50 a second", 3: "3 a second", swap: "one in each time a shopper leaves" };
  const LINE_WORD = { came: "in the order they came", shuffle: "shuffled" };
  UI.onsale = {
    init(c) { Object.assign(c.F, { door: "all", line: "came", res: null, anim: 0, runs: 0, memo: {}, lines: {} }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], g = c.B.goals;
      const last = R ? R.series[R.series.length - 1][0] : 0, span = Math.min(MM, last), now = R ? Math.min(1, F.anim) * span : 0;
      const upto = R ? R.series.filter((p) => p[0] <= now) : [], cur = upto[upto.length - 1];
      // the front of the line at 10:00: 400 places, bots in violet
      const order = R ? R.order : (F.lines[F.line] = F.lines[F.line] || TX.onsale({ door: "swap", line: F.line, seed: c.B.sim.seed, end: 0 }).order);
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "The front of the line at 10:00"), s("text", { class: "ev-sub", x: 40, y: 114 }, `the first 400 places · ${order.filter(Boolean).length} of them bots, in violet`));
      order.forEach((b, i) => kids.push(s("rect", { class: "tm-dot" + (b ? " bot" : ""), x: 40 + (i % 50) * 10.4, y: 128 + Math.floor(i / 50) * 10.4, width: 8, height: 8, rx: 4 })));
      // shoppers inside, against what the servers hold; error pages as red ticks under the axis
      const IB = 338, IH = 70, iy = (n) => IB - (Math.min(n, 2500) / 2500) * IH;
      kids.push(s("text", { class: "ev-h", x: 40, y: 242 }, "Shoppers inside"), s("text", { class: "ev-sub", x: 40, y: 260 }, R ? (cur && cur[4] ? `${c.num(cur[4])} error pages so far` : "no error pages yet") : "the booking servers hold 2,000; one more is an error page"));
      kids.push(s("path", { class: "ub-axis", d: `M${TX0} ${IB}H${TX1}` }), s("path", { class: "tw-cap", d: `M${TX0} ${iy(2000)}H${TX1}` }), s("text", { class: "ev-tick yt-halo", x: TX1, y: iy(2000) - 5, "text-anchor": "end" }, "the servers hold 2,000"));
      if (upto.length > 1) {
        kids.push(s("path", { class: "tm-in", d: `M${tx(0)} ${IB}` + upto.map((p) => `L${tx(p[0]).toFixed(1)} ${iy(p[1]).toFixed(1)}`).join("") + `L${tx(upto[upto.length - 1][0])} ${IB}Z` }));
        for (let i = 1; i < upto.length; i++) { const de = upto[i][4] - upto[i - 1][4]; if (de > 0) kids.push(s("rect", { class: "tm-err", x: tx(upto[i][0]) - 1, y: IB + 2, width: 2.2, height: Math.min(14, 3 + 3 * lg(de)) })); }
      }
      // seats sold
      const SB = 490, SH = 72, sy = (n) => SB - (n / 20000) * SH;
      kids.push(s("text", { class: "ev-h", x: 40, y: 392 }, "Seats sold"), s("text", { class: "ev-sub", x: 40, y: 410 }, R && cur ? `${c.num(cur[3])} of 20,000 by ${clock(now)}` : "of 20,000, from 10:00"));
      kids.push(s("path", { class: "ub-axis", d: `M${TX0} ${SB}H${TX1}` }), s("path", { class: "ub-goal", d: `M${tx(g.sold)} ${SB - SH - 8}V${SB}` }), s("text", { class: "ev-tick yt-halo", x: tx(g.sold) + 4, y: SB - SH - 2 }, "goal: sold out by 11:00"));
      if (upto.length > 1) kids.push(s("path", { class: "tm-sold", d: `M${tx(0)} ${SB}` + upto.map((p) => `L${tx(p[0]).toFixed(1)} ${sy(p[3]).toFixed(1)}`).join("") + `L${tx(upto[upto.length - 1][0])} ${SB}Z` }));
      timeAxis(s, kids, SB);
      if (R) kids.push(s("path", { class: "tw-now", d: `M${tx(now)} ${IB - IH - 8}V${SB}` }));
      // the house, filling as it sells
      const blocks = house(c, F, 640, 132, 7);
      const n = cur ? Math.floor(cur[3] / TX.PER) : 0;
      blocks.forEach((el, b) => el.setAttribute("class", "tm-seat" + (F.rankOf[b] < n ? " sold" : "")));
      kids.push(s("text", { class: "ev-sub", x: 640, y: 108 }, "the house · 20,000 seats, the best go first"), F.stage, ...blocks);
      // the numbers
      const done = R && F.anim >= 1, NX = 640;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 342 }, "error pages"), s("text", { class: "wa-big" + (done && R.errors > g.errors ? " over" : ""), x: NX, y: 380 }, done ? c.num(R.errors) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 412 }, "sold out at"), s("text", { class: "wa-big" + (done && (R.soldOut == null || R.soldOut > g.sold) ? " over" : ""), x: NX, y: 450 }, done ? (R.soldOut == null ? "not by noon" : clock(R.soldOut)) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 482 }, "bots got"), s("text", { class: "wa-big" + (done && R.botShare > g.bots ? " over" : ""), x: NX, y: 520 }, done ? pc(R.botShare) : "–"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 6));
      c.redraw();
      if (F.anim >= 1) { if (goodO(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.errors > g.errors && `${c.num(R.errors)} error pages went out`, (R.soldOut == null || R.soldOut > g.sold) && (R.soldOut == null ? "it hadn't sold out by noon" : `it took until ${clock(R.soldOut)} to sell out`), R.botShare > g.bots && `bots got ${pc(R.botShare)} of the seats`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The dots are the front of the line when the sale opens. The charts run from 10:00: who's inside the booking servers, with red ticks for error pages, and the seats as they sell."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.door}:${F.line}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = TX.onsale({ door: F.door, line: F.line, seed: c.B.sim.seed })); F.anim = 0; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "let fans through ", h("button", { class: "sd-word", onclick: () => set("door", cyc(TX.DOORS, F.door)) }, DOOR_WORD[F.door])),
        h("p", {}, "put everyone waiting at 10:00 ", h("button", { class: "sd-word", onclick: () => set("line", cyc(TX.LINES, F.line)) }, LINE_WORD[F.line]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: run }, "Open the sale"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} sale${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [["no error pages", R ? R.errors <= g.errors : null, R ? c.num(R.errors) : "run it"], ["sold out by 11:00", R ? R.soldOut != null && R.soldOut <= g.sold : null, R ? (R.soldOut == null ? "no" : clock(R.soldOut)) : "·"],
        [`bots get ≤ ${g.bots * 100}% of seats`, R ? R.botShare <= g.bots : null, R ? pc(R.botShare) : "·"]];
    },
  };
  const goodO = (c, R) => R.errors <= c.B.goals.errors && R.soldOut != null && R.soldOut <= c.B.goals.sold && R.botShare <= c.B.goals.bots;

  // -------------------------------------------------------------------------------------------------- hold --
  const KEEP_WORD = { lock: "with a database lock, until they pay", hold: "with a hold that runs out" };
  const MIN_WORD = { 2: "2 minutes", 5: "5 minutes", 10: "10 minutes", 30: "30 minutes" };
  const PX0 = 70, PX1 = 560, PMAX = 900, px = (t) => PX0 + (Math.min(t, PMAX) / PMAX) * (PX1 - PX0);
  UI.hold = {
    init(c) { Object.assign(c.F, { keep: "lock", mins: 2, res: null, anim: 0, runs: 0, memo: {} }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], g = c.B.goals, lim = F.mins * 60;
      // how long buyers take to pay: the same people whatever you choose, so it's drawn before the sale
      if (!F.payBins) {
        const pays = TX.crowd(c.B.sim.seed).filter((f) => f.buy && !f.bot).map((f) => f.pay), bins = new Array(30).fill(0);
        for (const p of pays) bins[Math.min(29, Math.floor(p / 30))]++;
        F.payBins = bins.map((n) => n / pays.length);
      }
      const HB = 230, HH = 90, mx = Math.max(...F.payBins), late = F.payBins.reduce((a, v, i) => a + (i * 30 >= lim ? v : 0), 0);
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "How long buyers take to pay"), s("text", { class: "ev-sub", x: 40, y: 114 }, `the seats are kept for ${MIN_WORD[F.mins]} · ${pc(late)} of buyers take longer`));
      F.payBins.forEach((v, i) => { const hh = Math.max(v > 0 ? 1 : 0, (v / mx) * HH); kids.push(s("rect", { class: "tm-pay" + (i * 30 >= lim ? " late" : ""), x: px(i * 30) + 0.5, y: HB - hh, width: (PX1 - PX0) / 30 - 1, height: hh })); });
      kids.push(s("path", { class: "ub-axis", d: `M${PX0} ${HB}H${PX1}` }), s("path", { class: "tw-now", d: `M${px(lim)} ${HB - HH - 10}V${HB}` }), s("text", { class: "ev-tick yt-halo", x: px(lim) + 5, y: HB - HH - 2 }, "time's up"));
      for (const t of [0, 120, 300, 600, 900]) kids.push(s("text", { class: "ev-tick", x: px(t), y: HB + 14, "text-anchor": "middle" }, t === 900 ? "15 min+" : `${t / 60} min`));
      // the seats over the sale: sold, held for someone paying, held for someone who walked away
      const span = R ? Math.min(MM, R.series[R.series.length - 1][0]) : 0, now = R ? Math.min(1, F.anim) * span : 0, upto = R ? R.series.filter((p) => p[0] <= now) : [], cur = upto[upto.length - 1];
      const SB = 490, SH = 150, sy = (n) => SB - (n / 20000) * SH;
      kids.push(s("text", { class: "ev-h", x: 40, y: 294 }, "The 20,000 seats"), s("text", { class: "ev-sub", x: 40, y: 312 }, R && cur ? `${c.num(cur[1])} sold · ${c.num(cur[2])} held for people paying · ${c.num(cur[3])} for people who left` : "pink sold · amber held for someone paying · grey held for someone who left"));
      kids.push(s("path", { class: "ub-axis", d: `M${TX0} ${SB}H${TX1}` }), s("path", { class: "ub-goal", d: `M${tx(g.by)} ${SB - SH - 6}V${SB}` }), s("path", { class: "ub-tick", d: `M${TX0} ${sy(19000)}H${TX1}` }), s("text", { class: "ev-tick", x: tx(g.by), y: SB + 28, "text-anchor": "middle" }, "goal: 19,000 by 11:00"));
      if (upto.length > 1) {
        const band = (lo, hi, cls) => kids.push(s("path", { class: cls, d: "M" + upto.map((p) => `${tx(p[0]).toFixed(1)} ${sy(hi(p)).toFixed(1)}`).join("L") + "L" + upto.slice().reverse().map((p) => `${tx(p[0]).toFixed(1)} ${sy(lo(p)).toFixed(1)}`).join("L") + "Z" }));
        band(() => 0, (p) => p[1], "tm-sold");
        band((p) => p[1], (p) => p[1] + p[2], "tm-held");
        band((p) => p[1] + p[2], (p) => p[1] + p[2] + p[3], "tm-idle");
        kids.push(s("path", { class: "tw-now", d: `M${tx(now)} ${SB - SH - 8}V${SB}` }));
      }
      timeAxis(s, kids, SB);
      // the database's connections, and the numbers
      const NX = 640, done = R && F.anim >= 1, open = cur ? cur[4] : 0;
      kids.push(s("text", { class: "ev-sub", x: NX, y: 108 }, "the database's 400 connections"));
      for (let i = 0; i < 40; i++) kids.push(s("rect", { class: "tm-conn" + (i < Math.round((open / 400) * 40) ? " on" : ""), x: NX + (i % 20) * 13.5, y: 120 + Math.floor(i / 20) * 16, width: 11, height: 12, rx: 2 }));
      kids.push(s("text", { class: "ev-tick", x: NX, y: 172 }, F.keep === "lock" ? `${c.num(open)} held open by shoppers paying` : "a hold doesn't keep one open"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 236 }, "error pages"), s("text", { class: "wa-big" + (done && R.errors > g.errors ? " over" : ""), x: NX, y: 274 }, done ? c.num(R.errors) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 318 }, "lost their seats paying"), s("text", { class: "wa-big" + (done && R.kickShare > g.kick ? " over" : ""), x: NX, y: 356 }, done ? pc(R.kickShare, 2) : "–"), s("text", { class: "ev-tick", x: NX, y: 374 }, done ? `${c.num(R.kicked)} of ${c.num(R.payers)} buyers` : "of buyers"));
      const at19 = R ? at19k(R) : null;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 418 }, "19,000 sold at"), s("text", { class: "wa-big" + (done && (at19 == null || at19 > g.by) ? " over" : ""), x: NX, y: 456 }, done ? (at19 == null ? "never" : clock(at19)) : "–"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 6));
      c.redraw();
      if (F.anim >= 1) { if (goodH(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals, at19 = R ? at19k(R) : null;
      const miss = R ? [R.errors > g.errors && `${c.num(R.errors)} error pages went out`, R.kickShare > g.kick && `${pc(R.kickShare, 2)} of buyers lost their seats while paying`, (at19 == null || at19 > g.by) && (at19 == null ? "19,000 seats were never sold" : `19,000 seats weren't sold until ${clock(at19)}`)].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Top: how long buyers take to pay; the red bars are the ones still paying when time's up. Below: the seats through the sale: pink sold, amber held for someone paying, grey held for someone who walked away."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.keep}:${F.mins}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = TX.hold({ keep: F.keep, mins: F.mins, seed: c.B.sim.seed })); F.anim = 0; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "keep a shopper's seats ", h("button", { class: "sd-word", onclick: () => set("keep", cyc(TX.KEEPS, F.keep)) }, KEEP_WORD[F.keep])),
        h("p", {}, "for ", h("button", { class: "sd-word", onclick: () => set("mins", cyc(TX.MINS, F.mins)) }, MIN_WORD[F.mins]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: run }, "Open the sale"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} sale${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals, at19 = R ? at19k(R) : null;
      return [["no error pages", R ? R.errors <= g.errors : null, R ? c.num(R.errors) : "run it"], [`≤ ${g.kick * 100}% lose seats paying`, R ? R.kickShare <= g.kick : null, R ? pc(R.kickShare, 2) : "·"],
        ["19,000 sold by 11:00", R ? at19 != null && at19 <= g.by : null, R ? (at19 == null ? "never" : clock(at19)) : "·"]];
    },
  };
  const goodH = (c, R) => { const at19 = at19k(R); return R.errors <= c.B.goals.errors && R.kickShare <= c.B.goals.kick && at19 != null && at19 <= c.B.goals.by; };

  // ----------------------------------------------------------------------------------------------- seatmap --
  const MAP_WORD = { live: "the database, on every refresh", 1: "a copy made every second", 30: "a copy made every 30 s" };
  const PICK_WORD = { click: "clicks two seats", best: "picks a section; the server finds the best two" };
  const MX0 = 60, MY0 = 156, MS = 13;
  UI.seatmap = {
    init(c) { Object.assign(c.F, { map: "live", pick: "click", res: null, anim: 0, runs: 0, memo: {} }); },
    draw(c) {
      const { s, F } = c, R = F.res, kids = [], g = c.B.goals, now = R ? Math.min(1, F.anim) * R.secs : 0;
      kids.push(s("text", { class: "ev-h", x: 40, y: 96 }, "The seat map"), s("text", { class: "ev-sub", x: 40, y: 114 }, R ? `minute ${Math.floor(now / 60)} of 10 · red is a clash: someone else got there first` : "a square is 20 seats; the pinker, the fewer left"));
      // the house as it is now: start from the beginning and replay the seats taken so far
      const start = R ? R.start : (F.start0 = F.start0 || TX.seatmap({ seed: c.B.sim.seed, secs: 0 }).start), free = start.slice();
      if (R) for (const [t, b] of R.takes) { if (t > now) break; free[b] -= 2; }
      kids.push(s("rect", { class: "tm-stage", x: MX0 + MS * 8, y: MY0 - 18, width: MS * 24 - 2, height: 8, rx: 4 }), s("text", { class: "ev-tick", x: MX0 + MS * 20, y: MY0 - 23, "text-anchor": "middle" }, "stage"));
      for (let b = 0; b < free.length; b++) kids.push(s("rect", { class: "tm-blk", x: MX0 + (b % TX.COLS) * MS, y: MY0 + Math.floor(b / TX.COLS) * MS, width: MS - 2, height: MS - 2, rx: 2, "fill-opacity": (0.12 + 0.88 * (1 - free[b] / TX.PER)).toFixed(2) }));
      if (F.pick === "best") for (let r = 0; r < TX.ROWS / TX.SEC_H; r++) for (let q = 0; q < TX.COLS / TX.SEC_W; q++) kids.push(s("rect", { class: "tm-sec", x: MX0 + q * TX.SEC_W * MS - 1.5, y: MY0 + r * TX.SEC_H * MS - 1.5, width: TX.SEC_W * MS + 1, height: TX.SEC_H * MS + 1, rx: 3 }));
      if (R) for (const [t, b] of R.misses) { if (t > now) break; if (now - t < 2.5 && b >= 0) kids.push(s("rect", { class: "tm-miss", x: MX0 + (b % TX.COLS) * MS - 1.5, y: MY0 + Math.floor(b / TX.COLS) * MS - 1.5, width: MS + 1, height: MS + 1, rx: 3, "stroke-opacity": (1 - (now - t) / 2.5).toFixed(2) })); }
      // the numbers
      const NX = 640, done = R && F.anim >= 1, k = R ? R.perSec.filter((p) => p[0] <= now) : [], cur = k[k.length - 1];
      const tries = done ? R.tries : cur ? cur[1] : 0, clashes = done ? R.clashes : cur ? cur[2] : 0, share = tries ? clashes / tries : 0;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 150 }, "tries that clashed"), s("text", { class: "wa-big" + (done && share > g.clash ? " over" : ""), x: NX, y: 190 }, R ? pc(share) : "–"), s("text", { class: "ev-tick", x: NX, y: 208 }, R ? `${c.num(clashes)} of ${c.num(tries)} tries` : "\"sorry, those seats were just taken\""));
      const rate = done ? R.readsPerSec : cur ? cur[3] : 0;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 262 }, "seat-map reads a second"), s("text", { class: "wa-big" + (done && rate > g.reads ? " over" : ""), x: NX, y: 302 }, R ? (rate >= 10 ? String(Math.round(rate)) : rate.toFixed(rate > 0 && rate < 1 ? 2 : 1)) : "–"));
      // a gauge: what the database can afford, on a scale to 100
      const GW = 260, gx = (r) => NX + (Math.min(r, 100) / 100) * GW;
      kids.push(s("rect", { class: "tm-gauge", x: NX, y: 318, width: GW, height: 10, rx: 5 }), s("rect", { class: "tm-gfill" + (rate > g.reads ? " over" : ""), x: NX, y: 318, width: Math.max(0, gx(rate) - NX), height: 10, rx: 5 }), s("path", { class: "tw-cap", d: `M${gx(g.reads)} 312V334` }), s("text", { class: "ev-tick", x: gx(g.reads) + 4, y: 346 }, `it can afford ${g.reads}`));
      const got = done ? R.got : R ? R.takes.filter((x) => x[0] <= now).length : 0;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 400 }, "seats taken"), s("text", { class: "wa-big", x: NX, y: 440 }, R ? c.num(got * 2) : "–"), s("text", { class: "ev-tick", x: NX, y: 458 }, "in these ten minutes"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 7));
      c.redraw();
      if (F.anim >= 1) { if (goodS(c, R)) c.solved(stars(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R ? [R.readsPerSec > g.reads && `the database was asked for the map ${Math.round(R.readsPerSec)} times a second`, R.clashShare > g.clash && `${pc(R.clashShare)} of tries clashed`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The stage is at the top; the best seats are near it and in the middle. Each square goes pinker as its 20 seats are taken, and flashes red when someone tries for seats that have just gone."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.map}:${F.pick}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = TX.seatmap({ map: F.map, pick: F.pick, seed: c.B.sim.seed })); F.anim = 0; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "the seat map comes from ", h("button", { class: "sd-word", onclick: () => set("map", cyc(TX.MAPS, F.map)) }, MAP_WORD[F.map])),
        h("p", {}, "a shopper ", h("button", { class: "sd-word", onclick: () => set("pick", cyc(TX.PICKS, F.pick)) }, PICK_WORD[F.pick]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && F.anim < 1, onclick: run }, "Run ten minutes"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.anim >= 1 ? c.F.res : null, g = c.B.goals;
      return [[`≤ ${g.reads} map reads a second`, R ? R.readsPerSec <= g.reads : null, R ? (R.readsPerSec >= 10 ? String(Math.round(R.readsPerSec)) : R.readsPerSec.toFixed(2)) : "run it"], [`≤ ${g.clash * 100}% of tries clash`, R ? R.clashShare <= g.clash : null, R ? pc(R.clashShare) : "·"]];
    },
  };
  const goodS = (c, R) => R.readsPerSec <= c.B.goals.reads && R.clashShare <= c.B.goals.clash;
})();

/* The Latency numbers unit (tunnel/lat.js):
     ladder     drag each wait onto a ruler from 1 ns to 1 s; once it's right, the ruler shows the same waits in human time
     race       two jobs side by side: tap the one you think finishes first, then two couriers race, slowed right down
     waterfall  a slow page loaded 2,000 times: its steps as a waterfall, and every page's time on a log scale
     globe      a page used in ten cities: datacenters on a map, and the round trips a page load takes */
(function () {
  "use strict";
  const UI = window.SD.UI, LT = window.LAT;
  const lg = Math.log10;
  const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
  const NUM = Object.fromEntries(LT.NUMS.map((n) => [n.id, n]));
  const ms = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1).replace(/\.0$/, "") : x.toFixed(1)) + " ms";
  const ran = (c, n) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);

  // ------------------------------------------------------------------------------------------------ ladder --
  const LX0 = 80, LX1 = 880, LY = 432, DEC = 9, TOP3 = lg(3) + 1e-9;
  const lx = (ns) => LX0 + (lg(Math.max(1, Math.min(1e9, ns))) / DEC) * (LX1 - LX0);
  const lns = (x) => Math.pow(10, ((Math.max(LX0, Math.min(LX1, x)) - LX0) / (LX1 - LX0)) * DEC);
  const TICK = ["1 ns", "10 ns", "100 ns", "1 µs", "10 µs", "100 µs", "1 ms", "10 ms", "100 ms", "1 s"];
  const PW = 262, PH = 44, CW = 168, BAND = 214;
  const LANES = [378, 324, 270, 216];
  UI.ladder = {
    init(c) {
      const n = c.B.cards.length;
      c.F.order = c.B.cards.slice().sort((a, b) => ((c.B.cards.indexOf(a) * 5 + 2) % n) - ((c.B.cards.indexOf(b) * 5 + 2) % n));
      Object.assign(c.F, { pos: {}, marks: {}, tries: 0, sel: null, won: false, snap: 1, from: null });
      if (c.done()) { for (const id of c.B.cards) { c.F.pos[id] = NUM[id].ns; c.F.marks[id] = "ok"; } c.F.won = true; c.F.tries = 1; }
    },
    draw(c) {
      const { s, h, F, B } = c, kids = [];
      const pile = F.order.filter((id) => F.pos[id] == null);
      if (!F.won) kids.push(s("text", { class: "sc-pileh", x: 40, y: 44 }, pile.length ? (F.sel && F.pos[F.sel] == null ? "now tap the ruler where it goes" : "the cards · drag one onto the ruler") : "every card is on the ruler"));
      // the ruler: a band to drop on, decade marks, and the units underneath
      kids.push(s("rect", { class: "ln-band" + (F.sel ? " armed" : ""), x: LX0 - 34, y: BAND, width: LX1 - LX0 + 68, height: LY - BAND + 12, rx: 16,
        onclick: (e) => { if (!F.sel || F.won) return; place(c, F.sel, lns(c.pt(e).x)); } }));
      kids.push(s("path", { class: "ln-rule", d: `M${LX0} ${LY}H${LX1}` }));
      for (let k = 0; k <= DEC; k++) {
        const x = lx(Math.pow(10, k));
        kids.push(s("path", { class: "ln-tick", d: `M${x} ${LY - 9}V${LY + 9}` }), s("text", { class: "ln-tl", x, y: LY + 26, "text-anchor": "middle" }, TICK[k]));
        if (k < DEC) for (let m = 2; m < 10; m++) kids.push(s("path", { class: "ln-tick minor", d: `M${lx(m * Math.pow(10, k))} ${LY - 4}V${LY + 4}` }));
      }
      // the three scales
      for (const [a, b, w] of [[0, 3, "nanoseconds · the CPU"], [3, 6, "microseconds · memory, SSDs, the datacenter"], [6, 9, "milliseconds · disks, oceans, people"]])
        kids.push(s("path", { class: "ln-zone", d: `M${lx(Math.pow(10, a)) + 4} ${LY + 40}H${lx(Math.pow(10, b)) - 4}` }), s("text", { class: "ln-zl", x: (lx(Math.pow(10, a)) + lx(Math.pow(10, b))) / 2, y: LY + 56, "text-anchor": "middle" }, w));
      // once it's right, the same waits if a nanosecond lasted a second, where the pile was
      if (F.won) {
        kids.push(s("text", { class: "ln-hh", x: 40, y: 50 }, "If a nanosecond lasted a second…"));
        const rows = [-1e9, -1e9, -1e9];
        LT.NUMS.filter((n) => B.cards.includes(n.id)).forEach((n, i) => {
          const x = lx(n.ns), w = 132, left = Math.max(30, Math.min(930 - w, x - w / 2));
          let r = rows.findIndex((q) => q < left - 4); if (r < 0) r = 2;
          rows[r] = left + w;
          const y = 84 + r * 44;
          kids.push(s("g", { class: "ln-hum", style: `animation-delay:${F.snap < 1 ? 0 : i * 70}ms` }, s("path", { class: "ln-hstem", d: `M${x} ${y + 12}V${BAND - 4}` }),
            s("text", { class: "ln-hl", x: left + w / 2, y }, LT.human(n.ns)), s("text", { class: "ln-hs", x: left + w / 2, y: y + 14 }, n.short)));
        });
      }
      // cards on the ruler, in lanes so they don't cover each other, each pinned to its spot
      const placed = F.order.filter((id) => F.pos[id] != null).map((id) => ({ id, ns: shown(F, id) })).sort((a, b) => a.ns - b.ns);
      const lastR = LANES.map(() => -1e9);
      for (const p of placed) {
        const x = lx(p.ns), left = Math.max(12, Math.min(948 - CW, x - CW / 2));
        let L = lastR.findIndex((r) => r < left - 6);
        if (L < 0) L = lastR.indexOf(Math.min(...lastR));
        lastR[L] = left + CW;
        const y = LANES[L], mark = F.marks[p.id];
        kids.push(s("path", { class: "ln-pin" + (mark ? " " + mark : ""), d: `M${x} ${y + PH - 2}V${LY}` }), s("circle", { class: "ln-dot" + (mark ? " " + mark : ""), cx: x, cy: LY, r: 5 }));
        kids.push(cardFo(c, p.id, left, y, CW, mark));
      }
      // the pile
      pile.forEach((id, k) => kids.push(cardFo(c, id, 40 + (k % 3) * (PW + 22), 56 + Math.floor(k / 3) * (PH + 8), PW, null)));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (F.snap >= 1) return;
      F.snap = Math.min(1, F.snap + dt / (c.REDUCED ? 0.1 : 0.9));
      c.redraw();
    },
    brief(c) {
      const { h, F } = c, left = F.order.filter((id) => F.pos[id] == null).length;
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, F.won ? "Every card is within 3× of the real number, and now shows it. Across the top: the same waits, if a nanosecond lasted a second." :
        left ? `${left} card${left > 1 ? "s" : ""} still to place. Drag one onto the ruler, or tap a card and then tap the ruler. Arrow keys nudge a card that's on it.` : "Every card is on the ruler. Check it."))];
    },
    tools(c) {
      const { h, F } = c, left = F.order.some((id) => F.pos[id] == null);
      if (F.won) return [h("ul", { class: "sd-rub" }, c.B.cards.map((id) => h("li", { class: "ok" }, h("i", {}, "✓"), h("b", {}, NUM[id].t + ": "), `${LT.fmt(NUM[id].ns)}, or ${LT.human(NUM[id].ns)} if a nanosecond lasted a second.`)))];
      return [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: left, onclick: () => checkL(c) }, "Check the ruler"), h("span", { class: "sd-runs" }, F.tries ? `${F.tries} check${F.tries > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const F = c.F, n = c.B.cards.length, ok = c.B.cards.filter((id) => F.marks[id] === "ok").length;
      return [["every card within 3×", F.tries ? ok === n : null, F.tries ? `${ok} of ${n}` : "place them"]];
    },
  };
  // where a card shows: where it was dropped, then, once solved, gliding to the real number
  const shown = (F, id) => (F.won && F.from ? Math.pow(10, lg(F.from[id]) + (lg(NUM[id].ns) - lg(F.from[id])) * F.snap) : F.pos[id]);
  function place(c, id, ns) { const F = c.F; F.pos[id] = Math.max(1, Math.min(1e9, ns)); delete F.marks[id]; F.sel = null; c.redraw(); c.rebrief(); }
  function cardFo(c, id, x, y, w, mark) {
    const { s, h, F } = c, on = F.pos[id] != null;
    const dir = mark === "no" ? (F.pos[id] < NUM[id].ns ? "→" : "←") : "";
    const card = h("div", { class: `sc-card ln-card${on ? " in" : ""}${mark ? " " + mark : ""}${F.sel === id ? " sel" : ""}`, xmlns: "http://www.w3.org/1999/xhtml", tabindex: 0, role: "button",
      "aria-label": `${NUM[id].t}: ${on ? "on the ruler at about " + LT.fmt(F.pos[id]) : "not placed yet"}${mark === "no" ? ", more than 3× off, move it " + (dir === "→" ? "right" : "left") : mark === "ok" ? ", right" : ""}` },
      F.won ? h("i", { class: "ln-v" }, LT.fmt(NUM[id].ns)) : mark === "ok" ? h("i", {}, "✓") : mark === "no" ? h("i", {}, "✗" + dir) : null, h("span", {}, NUM[id].t));
    const fo = s("foreignObject", { x, y, width: w, height: PH, class: "sc-fo", "data-card": id }, card);
    if (!F.won) dragL(c, fo, card, id);
    return fo;
  }
  function dragL(c, fo, card, id) {
    let st = null;
    card.addEventListener("pointerdown", (e) => { st = { x: e.clientX, y: e.clientY, moved: false }; card.setPointerCapture(e.pointerId); e.stopPropagation(); });
    card.addEventListener("pointermove", (e) => {
      if (!st) return;
      if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
      const p = c.pt(e);
      if (!st.moved) {
        st.moved = true; fo.setAttribute("width", CW); fo.classList.add("drag"); c.layer.append(fo);
        // moving the card to the top of the board drops its pointer capture: take it back
        try { card.setPointerCapture(e.pointerId); } catch (err) {}
        st.guide = c.s("path", { class: "ln-guide" }); st.read = c.s("text", { class: "ln-read", "text-anchor": "middle" }); c.layer.append(st.guide, st.read);
      }
      fo.setAttribute("x", p.x - CW / 2); fo.setAttribute("y", p.y - PH / 2);
      const on = p.y > BAND - 24, gx = Math.max(LX0, Math.min(LX1, p.x));
      st.guide.setAttribute("d", on ? `M${gx} ${p.y + PH / 2}V${LY}` : "");
      st.read.setAttribute("x", gx); st.read.setAttribute("y", Math.min(LY - 12, p.y + PH / 2 + 16)); st.read.textContent = on ? "≈ " + LT.fmt(lns(p.x)) : "";
    });
    card.addEventListener("pointerup", (e) => {
      if (!st) return;
      const was = st; st = null;
      if (!was.moved) { c.F.sel = c.F.sel === id ? null : id; c.redraw(); c.rebrief(); return; }
      const p = c.pt(e);
      if (p.y < BAND - 24) { delete c.F.pos[id]; delete c.F.marks[id]; c.redraw(); c.rebrief(); return; }
      place(c, id, lns(p.x));
    });
    card.addEventListener("keydown", (e) => {
      const F = c.F;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); F.sel = F.sel === id ? null : id; c.redraw(); c.rebrief(); return; }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      place(c, id, (F.pos[id] || Math.pow(10, 4.5)) * Math.pow(10, e.key === "ArrowRight" ? 0.25 : -0.25));
      requestAnimationFrame(() => { const el = c.layer.querySelector(`[data-card="${id}"] .sc-card`); if (el) el.focus(); });
    });
  }
  function checkL(c) {
    const F = c.F;
    F.tries++;
    let wrong = 0;
    for (const id of c.B.cards) { const ok = Math.abs(lg(F.pos[id]) - lg(NUM[id].ns)) <= TOP3; F.marks[id] = ok ? "ok" : "no"; if (!ok) wrong++; }
    if (!wrong) { F.won = true; F.from = { ...F.pos }; F.snap = 0; c.redraw(); c.solved(F.tries === 1 ? 3 : F.tries === 2 ? 2 : 1); return; }
    c.redraw();
    c.flash(`${wrong} card${wrong > 1 ? "s are" : " is"} more than 3× off. The arrow on ${wrong > 1 ? "each" : "it"} says which way to move.`);
    c.rebrief();
  }

  // -------------------------------------------------------------------------------------------------- race --
  const RX0 = 392, RX1 = 868, LANE = { a: 112, b: 292 }, RUN = 3.6;
  UI.race = {
    init(c) { Object.assign(c.F, { round: 0, guess: null, t: 0, playing: false, rights: [] }); },
    draw(c) {
      const { s, h, F } = c, r = LT.RACES[F.round], kids = [];
      const slow = Math.max(r.a.ns, r.b.ns), now = F.t * slow, over = F.guess && F.t >= 1;
      kids.push(s("text", { class: "sc-pileh", x: 40, y: 50 }, `race ${F.round + 1} of ${LT.RACES.length}`), s("text", { class: "ev-sub", x: RX1, y: 50, "text-anchor": "end" }, F.guess ? `slowed down: ${LT.fmt(slow)} takes ${RUN} s here` : "tap the one you think finishes first"));
      for (const k of ["a", "b"]) {
        const side = r[k], y = LANE[k], done = F.guess && now >= side.ns, p = F.guess ? Math.min(1, now / side.ns) : 0;
        const won = over && r.win === k, cls = "ln-job" + (F.guess === k ? " mine" : "") + (over ? (won ? " win" : " lose") : "");
        const job = h("button", { class: cls, xmlns: "http://www.w3.org/1999/xhtml", disabled: !!F.guess, onclick: () => go(c, k) },
          h("small", {}, k === "a" ? "A" : "B"), h("b", {}, side.t), over ? h("span", {}, side.how) : null);
        kids.push(s("foreignObject", { x: 36, y: y - 4, width: 324, height: 132, class: "sc-fo" }, job));
        // the track, the finish, and the courier
        const ty = y + 92;
        kids.push(s("path", { class: "ln-track", d: `M${RX0} ${ty}H${RX1}` }), s("path", { class: "ln-flag", d: `M${RX1} ${ty - 54}V${ty + 6}` }), s("rect", { class: "ln-flagc", x: RX1, y: ty - 54, width: 20, height: 13 }));
        const x = RX0 + p * (RX1 - RX0);
        if (F.guess && p > 0) kids.push(s("path", { class: "ln-trail" + (k === r.win ? " win" : ""), d: `M${RX0} ${ty}H${x}` }));
        kids.push(c.rx(!done ? "walk" : !over ? "bolt" : won ? "trophy" : "snail", x - 30, ty - 58, 58, over ? "pop" : ""));
        kids.push(s("text", { class: "ln-clock" + (done ? " done" : ""), x: Math.max(RX0 + 20, Math.min(RX1 - 40, x)), y: ty + 26, "text-anchor": "middle" }, F.guess ? LT.fmt(Math.min(now, side.ns)) : ""));
      }
      if (over) { const f = Math.max(r.a.ns, r.b.ns) / Math.min(r.a.ns, r.b.ns); kids.push(s("text", { class: "ln-times", x: RX1, y: 486, "text-anchor": "end" }, `${r.win === "a" ? "A" : "B"} wins, ${f >= 10 ? Math.round(f) : f.toFixed(1)}× faster`)); }
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.playing) return;
      F.t = Math.min(1, F.t + dt / (c.REDUCED ? 0.2 : RUN));
      c.redraw();
      if (F.t >= 1) { F.playing = false; F.rights[F.round] = F.guess === LT.RACES[F.round].win; if (F.round === LT.RACES.length - 1) { const n = F.rights.filter(Boolean).length; c.solved(n === LT.RACES.length ? 3 : n >= LT.RACES.length - 1 ? 2 : 1); } else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, r = LT.RACES[F.round];
      const right = F.rights.filter(Boolean).length;
      return [h("div", { class: "sd-ask" }, h("small", {}, `race ${F.round + 1} of ${LT.RACES.length}${F.round ? ` · ${right} right so far` : ""}`),
        !F.guess ? h("p", { class: "sd-quiet" }, "Tap A or B on the board.") : F.t < 1 ? h("p", { class: "sd-quiet" }, "Racing…") :
          h("p", { class: "sd-verdict " + (F.guess === r.win ? "ok" : "no") }, F.guess === r.win ? "✓ Right. " : "✗ Not that one. ", r.why))];
    },
    tools(c) {
      const { h, F } = c;
      if (!F.guess || F.t < 1 || F.round === LT.RACES.length - 1) return [];
      return [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => { Object.assign(F, { round: F.round + 1, guess: null, t: 0 }); c.redraw(); c.rebrief(); } }, "Next race →"))];
    },
  };
  function go(c, k) { const F = c.F; if (F.guess) return; F.guess = k; F.t = 0; F.playing = true; c.redraw(); c.rebrief(); }

  // --------------------------------------------------------------------------------------------- waterfall --
  const Q_WORD = { serial: "one after another", parallel: "all at once, 10 at a time", one: "as one query" };
  const PAY_WORD = { new: "on a new connection", open: "on a connection kept open", cache: "from a copy in Redis, kept 5 minutes" };
  const PH_WORD = { disk: "from the spinning disk", ssd: "from the SSD", ram: "already resized, from RAM" };
  const WX0 = 200, WX1 = 700, SCALES = [10, 30, 100, 300, 1000];
  const ROWS = { session: [118, 14, "session · Redis"], queries: [146, 92, "30 queries"], pay: [254, 14, "payments plan"], photo: [282, 14, "photo"] };
  const HX0 = 70, HX1 = 700, HB = 492, HH = 72, hx = (t) => HX0 + (lg(Math.max(1, Math.min(1000, t))) / 3) * (HX1 - HX0);
  UI.waterfall = {
    init(c) { Object.assign(c.F, { queries: "serial", pay: "new", photo: "disk", res: null, anim: 0, runs: 0, memo: {}, view: "typical" }); },
    draw(c) {
      const { s, F } = c, R = F.res, g = c.B.goals, kids = [];
      const P = R ? R[F.view] : null, sc = P ? SCALES.find((v) => v >= P.t * 1.04) || 1000 : 300, wx = (t) => WX0 + (Math.min(t, sc) / sc) * (WX1 - WX0);
      const now = P ? F.anim * P.t * 1.02 : 0;
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "A page, step by step"), s("text", { class: "ev-sub", x: 40, y: 94 }, !R ? "load it to see where the time goes" : F.view === "typical" ? "the typical page: half are faster, half slower" : "one of the slowest 1% of pages"));
      for (const [id, [y, hh, name]] of Object.entries(ROWS)) kids.push(s("text", { class: "ln-row", x: 40, y: y + Math.min(hh, 14) - 2 + (hh > 14 ? hh / 2 - 6 : 0) }, name));
      kids.push(s("path", { class: "ub-axis", d: `M${WX0} 306H${WX1}` }));
      for (let k = 0; k <= 5; k++) kids.push(s("text", { class: "ev-tick", x: WX0 + (k / 5) * (WX1 - WX0), y: 322, "text-anchor": "middle" }, k ? ms((k / 5) * sc) : "0"));
      if (P) {
        let big = null;
        for (const st of P.steps) {
          const [y, hh] = ROWS[st.id];
          if (!big || st.d > big.d) big = st;
          const bar = (t0, d, yy, h2, lost) => { const w = Math.max(0, Math.min(d, now - t0)); if (w > 0) kids.push(s("rect", { class: `ln-bar s-${st.id}${lost ? " lost" : ""}`, x: wx(t0), y: yy, width: Math.max(1.2, wx(t0 + w) - wx(t0)), height: h2, rx: Math.min(3, h2 / 2) })); };
          if (st.sub && st.sub.length > 1) st.sub.forEach(([t0, d, lost], i) => { const n = st.sub.length, rh = Math.min(14, (hh - 2) / n); bar(st.at + t0, d, n > 3 ? y + i * (hh / n) : y + (i * hh) / n, n > 3 ? Math.max(1.6, rh - 0.8) : 14, lost); });
          else bar(st.at, st.d, st.id === "queries" ? y + hh / 2 - 7 : y, 14, st.sub && st.sub[0] && st.sub[0][2]);
          if (now >= st.at + st.d) {
            const ly = y + Math.min(hh, 14) - 2 + (hh > 14 ? hh / 2 - 6 : 0), lost = st.sub && st.sub.some((x) => x[2]);
            kids.push(s("text", { class: "ln-st yt-halo" + (lost ? " lost" : ""), x: Math.min(WX1 + 40, wx(st.at + st.d) + 6), y: ly }, ms(st.d) + (lost ? " · a lost packet waited 200 ms" : "")));
          }
        }
        kids.push(s("path", { class: "tw-now", d: `M${wx(Math.min(now, P.t))} 104V306` }));
        if (F.anim >= 1) {
          kids.push(s("text", { class: "ln-done yt-halo", x: Math.min(WX1, wx(P.t)) + 6, y: 114 }, `ready at ${ms(P.t)}`));
          const [y, hh] = ROWS[big.id];
          if (!goodW(c, R)) kids.push(c.rx("snail", Math.min(WX1 - 10, wx(big.at + big.d)) - 44, y + Math.min(hh, 14) / 2 - 44, 40, "pop"));
        }
      }
      // every page, on a log scale, with the two goals
      kids.push(s("text", { class: "ev-h", x: 40, y: 362 }, "All 2,000 pages"), s("text", { class: "ev-sub", x: 40, y: 380 }, R && F.shown ? `half within ${ms(R.p50)}, 99% within ${ms(R.p99)} · ${(R.lostShare * 100).toFixed(1)}% lost a packet` : "how long each one took, on a scale that goes up ten times a step"));
      kids.push(s("path", { class: "ub-axis", d: `M${HX0} ${HB}H${HX1}` }));
      for (const t of [1, 10, 100, 1000]) kids.push(s("text", { class: "ev-tick", x: hx(t), y: HB + 16, "text-anchor": "middle" }, t === 1000 ? "1 s" : t + " ms"));
      for (const [t, w, up] of [[g.p50, `half within ${g.p50} ms`, 0], [g.p99, `99% within ${g.p99} ms`, 14]]) kids.push(s("path", { class: "ub-goal", d: `M${hx(t)} ${HB - HH - 4}V${HB + 22}` }), s("text", { class: "ev-tick yt-halo", x: hx(t) + 4, y: HB + 32 }, "goal: " + w));
      if (R && F.shown) {
        const NB = 60, bins = new Array(NB).fill(0);
        for (const t of R.times) bins[Math.min(NB - 1, Math.max(0, Math.floor((lg(Math.max(1, t)) / 3) * NB)))]++;
        const mx = Math.max(...bins), bw = (HX1 - HX0) / NB;
        bins.forEach((n, i) => { if (n) { const hh = Math.max(1.5, (Math.sqrt(n) / Math.sqrt(mx)) * HH); kids.push(s("rect", { class: "ln-hist" + (i * bw + HX0 >= hx(g.p99) ? " late" : ""), x: HX0 + i * bw + 0.5, y: HB - hh, width: bw - 1, height: hh })); } });
        const close = hx(R.p99) - hx(R.p50) < 34;
        for (const [v, w, an, dx] of [[R.p50, "p50", close ? "end" : "middle", close ? -3 : 0], [R.p99, "p99", close ? "start" : "middle", close ? 3 : 0]])
          kids.push(s("path", { class: "ln-pm", d: `M${hx(v)} ${HB - HH - 6}V${HB + 4}` }), s("text", { class: "ln-pl yt-halo", x: hx(v) + dx, y: HB - HH - 10, "text-anchor": an }, w));
      }
      // the numbers
      const NX = 760, done = R && F.shown;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 132 }, "half the pages within"), s("text", { class: "wa-big" + (done && R.p50 > g.p50 ? " over" : ""), x: NX, y: 172 }, done ? ms(R.p50) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 228 }, "99% within"), s("text", { class: "wa-big" + (done && R.p99 > g.p99 ? " over" : ""), x: NX, y: 268 }, done ? ms(R.p99) : "–"));
      if (done && goodW(c, R)) kids.push(c.rx("rocket", NX + 120, 280, 64, "pop"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      const P = R[F.view];
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : Math.max(1.6, Math.min(4.5, P.t / 60))));
      const first = F.anim >= 1 && !F.shown;
      if (first) F.shown = true;
      c.redraw();
      if (first) { if (goodW(c, R)) c.solved(ran(c, F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.anim >= 1 ? F.res : null, g = c.B.goals;
      const miss = R && F.shown ? [R.p50 > g.p50 && `half the pages took longer than ${ms(R.p50)}`, R.p99 > g.p99 && `the slowest 1% took ${ms(R.p99)}`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The waterfall is one page, slowed right down: each bar is a step, and the queries are 30 thin bars. Below, all 2,000 pages, with a red tail for the slowest."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.queries}:${F.pay}:${F.photo}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = LT.page({ queries: F.queries, pay: F.pay, photo: F.photo, seed: c.B.sim.seed })); F.anim = 0; F.shown = false; F.view = "typical"; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "run the 30 queries ", h("button", { class: "sd-word", onclick: () => set("queries", cyc(LT.QUERIES, F.queries)) }, Q_WORD[F.queries])),
        h("p", {}, "get the payments plan ", h("button", { class: "sd-word", onclick: () => set("pay", cyc(LT.PAYS, F.pay)) }, PAY_WORD[F.pay])),
        h("p", {}, "read the photo ", h("button", { class: "sd-word", onclick: () => set("photo", cyc(LT.PHOTOS, F.photo)) }, PH_WORD[F.photo])),
        F.res && F.shown ? h("p", {}, "show ", h("button", { class: "sd-word", onclick: () => { F.view = F.view === "typical" ? "slow" : "typical"; F.anim = 0; c.redraw(); c.rebrief(); } }, F.view === "typical" ? "a typical page" : "one of the slowest 1%")) : null),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && !F.shown, onclick: run }, "Load it 2,000 times"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.shown ? c.F.res : null, g = c.B.goals;
      return [[`half the pages within ${g.p50} ms`, R ? R.p50 <= g.p50 : null, R ? ms(R.p50) : "run it"], [`99% within ${g.p99} ms`, R ? R.p99 <= g.p99 : null, R ? ms(R.p99) : "·"]];
    },
  };
  const goodW = (c, R) => R.p50 <= c.B.goals.p50 && R.p99 <= c.B.goals.p99;

  // ------------------------------------------------------------------------------------------------- globe --
  // The land, as rough outlines [longitude, latitude], drawn as a field of dots so the roughness doesn't show
  const LAND = [
    [-166, 68, -156, 71, -141, 69.5, -125, 70, -110, 68, -95, 68, -85, 70, -80, 63, -94, 59, -92, 57, -82, 55, -79, 52, -77, 59, -70, 61, -64, 60, -61, 56, -56, 52, -60, 47, -64, 45, -70, 43, -70, 41.5, -74, 40.5, -76, 37, -75.5, 35, -81, 31, -80, 27, -80.5, 25.2, -82, 26.5, -83, 29.5, -85, 30, -89, 30, -90, 29, -94, 29.5, -97, 27.5, -97.5, 24, -97, 21, -95, 18.5, -91, 18.8, -90.5, 21, -87, 21.5, -88, 17, -88, 16, -84, 15.5, -83.5, 11, -81.5, 9, -79, 9.5, -77.5, 8.5, -80, 7.3, -83, 8.3, -86, 11, -88, 13.3, -92, 14.5, -95, 16, -100, 17, -105.5, 20, -105.5, 23, -109, 27, -112.5, 31, -114.5, 31.5, -112, 28, -110, 23.5, -112, 24.5, -114, 28, -115.5, 30, -117, 32.5, -118.5, 34, -120.6, 34.6, -122.5, 37.5, -124, 40.5, -124.5, 43, -124, 46.5, -124.7, 48.4, -123, 49, -127, 50.5, -130, 54.5, -134, 58, -140, 60, -146, 60.8, -152, 59, -154, 57.5, -158, 56.5, -162, 55, -158, 58.5, -162, 60, -165, 62, -165, 64.5],
    [-73, 78, -60, 82, -35, 83.5, -20, 82, -18, 77, -20, 72, -22, 70, -32, 68, -40, 65, -43, 60, -48, 61, -52, 65, -54, 69, -58, 75, -66, 76.5],
    [-80, 73.5, -72, 72, -66, 68, -62, 66.5, -66, 63, -71, 62.5, -78, 64.4, -74, 65.5, -73, 68, -80, 69.8, -90, 72],
    [-120, 71, -110, 73, -100, 73, -95, 74.5, -85, 76, -80, 79, -62, 82, -75, 83, -95, 81.5, -110, 78, -120, 76, -125, 72.5],
    [-59.4, 47.6, -53, 46.7, -52.6, 48.5, -55.6, 51.6],
    [-85, 21.8, -82, 23.2, -77, 22, -74.2, 20.2, -77.7, 19.8, -80, 21.7], [-74.4, 19.8, -70, 19.8, -68.4, 18.5, -71.5, 17.6, -74.4, 18.3],
    [-77.5, 8.5, -75, 11, -71.5, 12.4, -68, 10.6, -62, 10.7, -60, 8.5, -57, 6, -52, 4.5, -50, 1.8, -48.5, -1, -44.5, -2.5, -40, -3, -35, -5.5, -35, -9, -37, -12, -39, -17.5, -40.5, -21, -42, -23, -45, -23.7, -48.5, -26, -49, -29, -51, -31, -53.5, -34, -57, -35, -57, -37, -58, -38.5, -62, -39, -62.5, -41, -65, -41, -64, -42.5, -65.5, -45, -67.5, -46.5, -66, -48, -69, -51, -68.5, -53, -71, -54, -74.5, -52.5, -75.5, -48, -74, -43, -73.5, -39, -73.5, -37, -71.5, -32, -71.5, -28, -70.5, -25, -70.2, -18.5, -75, -15.5, -77, -12, -79.5, -7.5, -81, -5, -80, -2, -80, 0.8, -79, 1.7, -77.5, 4, -77.4, 7],
    [-5.6, 36, -4.5, 36.7, -2, 36.8, -0.5, 38.3, 0.2, 39.5, -0.3, 39.8, 1, 41, 3.2, 41.9, 3.1, 43.1, 4.5, 43.4, 6.5, 43.1, 7.5, 43.8, 8.8, 44.4, 10.2, 43.9, 10.5, 42.9, 12.3, 41.7, 13.7, 41.2, 15.6, 40, 16, 38, 16.6, 38.9, 17, 39.4, 16.5, 40.5, 18.5, 40.1, 16, 41.5, 14, 42.5, 12.4, 44.2, 12.3, 45.3, 13.7, 45.7, 14.5, 45.2, 15.2, 44.2, 17.5, 43, 19.4, 41.8, 19.3, 40.5, 20.2, 39.6, 21.1, 38.3, 22, 36.6, 23, 36.5, 23.2, 38, 24, 38.2, 22.8, 40.5, 24, 40.8, 26, 40.8, 26.2, 40.1, 26.7, 39.3, 26.8, 38.4, 27.2, 37.3, 28.2, 36.7, 30.5, 36.3, 32.5, 36.1, 34.6, 36.8, 36, 36.6, 35.8, 34.6, 35, 33, 34.2, 31.3, 34.9, 29.5, 35, 28, 36.5, 26, 37.5, 24.3, 39, 22, 39.8, 20.3, 41.2, 18.5, 42.8, 16, 43.3, 13, 45, 12.8, 48.5, 14, 52.2, 16, 55.5, 17.8, 57.5, 18.9, 58.5, 20.5, 59.8, 22.4, 58.6, 23.6, 57, 24, 56.4, 26.4, 56, 24.8, 54, 24.1, 51.6, 24.3, 51.3, 26, 50.2, 26.2, 48.5, 28.3, 47.9, 29.9, 48.8, 30.3, 50.1, 30.1, 51.5, 27.8, 54, 26.7, 57.3, 25.8, 61.5, 25.2, 66.5, 25.4, 67.5, 24, 68.7, 23.3, 70, 22.5, 72.6, 21.3, 72.8, 19.5, 73.5, 16, 74.8, 12.8, 76.3, 9.5, 77.5, 8.1, 78.2, 8.9, 79.3, 10.3, 79.9, 13, 80.2, 15.5, 82.3, 16.6, 84.8, 19.2, 86.9, 21, 88.8, 21.6, 90.5, 22, 91.8, 22.3, 92.4, 20.7, 94, 19, 94.5, 16.2, 97.7, 15.5, 98.6, 10, 98.3, 8, 100.3, 5.5, 101.3, 2.8, 103.5, 1.3, 104.2, 1.4, 103.4, 4.3, 102.3, 6.2, 100.4, 7.3, 99.2, 10.3, 100, 13.4, 101.5, 12.7, 103, 10.5, 104.8, 10.3, 105, 8.6, 107, 10.4, 109, 11.5, 109.2, 13, 108, 16, 105.7, 18.5, 106.5, 20, 108, 21.6, 110.5, 21, 114, 22.3, 117, 23.6, 119.5, 25.5, 121.8, 29, 121.9, 30.8, 120.8, 32.5, 119.5, 35, 120.5, 36, 122.5, 37, 119, 37.2, 117.7, 38.5, 118, 39, 121, 39, 121.5, 40, 125, 39.5, 126.5, 37.5, 126.5, 34.5, 129.5, 36, 129.5, 41, 131.5, 42.8, 135, 43.5, 140.5, 48, 141, 53, 137, 54, 143, 59.3, 151, 59.2, 155, 59.5, 161, 60.5, 156.5, 57.8, 155.7, 56, 156, 51, 163, 56, 162.5, 57, 164, 60, 170, 60, 174, 61.6, 178, 64.5, 180, 65, 180, 69, 170, 70, 160, 70, 150, 71.5, 140, 72.5, 132, 71.5, 128, 72, 120, 73, 112, 76, 105, 77.7, 95, 76, 87, 74, 80, 73.5, 74, 73, 72.5, 72.8, 67, 72, 68, 70, 60, 69, 54, 68.5, 44, 68.5, 44, 66.2, 40, 66, 41, 67.5, 33, 69.3, 31, 70, 28, 71, 24, 71, 19, 70, 16, 68.5, 13, 66.5, 10, 64, 5, 62.5, 5, 61, 5.5, 58.8, 8, 58, 11, 58.8, 12.8, 56.5, 14, 55.5, 16.5, 57, 18, 59, 19, 60, 17, 61, 17.5, 62.5, 22, 65.8, 25.3, 65, 21.5, 63.3, 21.5, 61, 23, 60, 28, 59.5, 23.5, 59.2, 24, 57.5, 21, 57, 21, 55, 18, 54.8, 14, 54, 12, 54.2, 12.5, 55.5, 10.5, 56, 10.5, 57.7, 8.2, 57, 8.5, 55.5, 7, 53.5, 4.5, 52.5, 3, 51.3, 1.5, 50.2, -1.5, 48.7, -4.7, 48.4, -2.5, 47.3, -1.5, 46, -2, 43.4, -8, 43.7, -9.3, 43, -8.8, 42, -9.5, 39, -9, 37, -7.5, 37.2, -6.3, 36.8],
    [-5.9, 35.8, -2, 35.1, 1, 36.4, 5, 36.8, 10, 37.2, 11, 35.6, 10.5, 34, 11.5, 33.1, 15.2, 32.3, 19, 30.3, 20, 32, 22, 32.9, 25, 31.8, 29, 30.9, 32.3, 31.2, 34.2, 31.3, 34.9, 29.5, 33.6, 28, 32.5, 29.9, 33.5, 27, 35.5, 23.9, 36.9, 22, 37.3, 18.8, 38.5, 17.9, 39.7, 15.4, 41.8, 13.2, 43.3, 11.8, 44.5, 10.4, 47.5, 11.2, 51.2, 11.8, 50.8, 10, 48.5, 5, 46, 2, 43, -0.5, 41, -2, 39.4, -5, 39, -7, 39.5, -10, 40.5, -11, 40.6, -15, 37, -17.5, 35.3, -22, 35.5, -24, 32.9, -26, 32.5, -29, 30, -31.3, 27.5, -33.5, 25, -34, 22, -34.2, 19, -34.8, 18.3, -33.5, 18, -31, 16.5, -28.6, 15, -26.5, 14.5, -22.9, 12, -18.5, 11.8, -16, 13.5, -12, 13, -8.5, 12.2, -6, 9, -1, 9.5, 3.5, 8.5, 4.5, 5.5, 4.3, 3, 6.4, -1, 5.1, -4, 5.2, -7.5, 4.4, -11, 6.8, -13, 8.2, -15, 11, -16.8, 13, -17.5, 14.7, -16.3, 19, -17, 21, -15.5, 24.5, -13, 27.6, -9.8, 30, -9.3, 32.6, -6.8, 34],
    [49.3, -12, 50.5, -15.5, 49.5, -17, 47.3, -25, 45, -25.5, 43.5, -22, 44.3, -16.5, 46.5, -15.5],
    [-5.7, 50, 1.4, 51.2, 1.7, 52.7, 0, 53.5, -1.6, 55.6, -2, 57.7, -3.3, 58.6, -5, 58.6, -6.2, 57.5, -5.5, 55.5, -4.8, 54.8, -3.2, 54.2, -3, 53.3, -4.6, 53.2, -4.2, 52.2, -5.2, 51.7, -3, 51.4],
    [-6, 52, -6.2, 53.8, -5.6, 54.6, -7.3, 55.3, -8.5, 54.5, -10, 53.5, -9.8, 51.6, -8, 51.6], [-24, 65.5, -22, 66.4, -16, 66.5, -13.6, 65.2, -15, 64.3, -18.7, 63.4, -22.7, 63.8],
    [130, 31, 131.5, 31.4, 132, 33.8, 135, 33.5, 136.8, 34.3, 139, 34.8, 140.8, 35.7, 141, 38.3, 142, 39.6, 141.4, 41.4, 140, 40.7, 139.8, 39, 138.5, 37.8, 136.8, 37.1, 136, 35.7, 133, 35.5, 131, 34.4, 130, 33.5],
    [140, 41.5, 141.5, 42.5, 143.3, 42, 145.6, 43.3, 144.5, 44, 142, 45.5, 141.6, 45.3, 141.4, 43.4, 140, 42.5], [142, 46, 143.5, 49, 143, 54, 142.5, 54.3, 142, 51],
    [79.8, 6, 81.8, 7.5, 81, 9.5, 79.9, 9.7], [120.2, 22.5, 121.5, 25.2, 121.9, 24.5, 120.8, 21.9],
    [120, 18.5, 122.3, 18.5, 122, 16.5, 124, 13, 121.5, 13.8, 120.3, 14.5, 120, 16], [122, 7, 126.5, 7.2, 126, 9.5, 125, 9, 123.5, 8],
    [109, 1.8, 110.5, -2.9, 114, -4, 116.5, -3, 118, 1, 119, 5, 117, 7, 115, 5, 113, 3, 111, 1.7], [95.3, 5.5, 97.5, 5.2, 100.3, 2.2, 104, -1, 106, -3.2, 105.8, -5.8, 104.5, -5.9, 102.3, -4, 100.4, -1, 98.7, 1.7],
    [105.2, -6.8, 108.5, -6.4, 111, -6.4, 114.5, -7.7, 114.5, -8.6, 110, -8.2, 106.5, -7.4], [119.4, -5.5, 120.5, -2.5, 121, 1.2, 124.8, 1.5, 121.5, -1, 123.3, -4.7, 121, -4.6],
    [131, -1.4, 134, -0.9, 138, -1.6, 141, -2.6, 145.8, -5.3, 147.5, -6.2, 150.5, -10.5, 147, -10, 144, -7.8, 141, -9, 138, -8.3, 137.6, -5.2, 133, -4, 132, -2.7],
    [113.5, -22, 114.2, -26, 115, -30, 115, -34, 118, -35, 121, -33.8, 124, -32.8, 127, -32.2, 131, -31.5, 134, -32.5, 135.6, -34.8, 137.7, -35.6, 138.5, -34.5, 140, -37.5, 143.5, -38.8, 146.3, -39.1, 148, -37.8, 150, -37.5, 151.2, -33.9, 153.1, -30.5, 153.6, -28, 153, -25.5, 151, -23.5, 149.5, -22.2, 146.3, -19, 145.4, -16, 145.3, -14.8, 143.6, -14, 142.5, -10.7, 141.6, -13, 141.5, -17, 139.5, -17.6, 136, -15.8, 135.5, -14.7, 136.8, -12.2, 133, -11.3, 131, -12.2, 129.5, -14.9, 127, -13.8, 125.5, -14.5, 124, -16.5, 122.3, -17.5, 121, -19.5, 118, -20.4, 115, -21.5],
    [144.6, -40.7, 148.3, -40.9, 148, -43.2, 146, -43.6], [172.6, -34.4, 174.5, -36, 175.9, -37.6, 178.5, -37.7, 177, -39.3, 176, -41.3, 174.7, -41.3, 175, -39.8, 173.8, -39.2, 174.5, -37.5],
    [172.7, -40.5, 174.3, -41.5, 173, -43.7, 171, -45.3, 169, -46.6, 166.5, -46, 168, -44, 170.7, -42.6], [52, 71.5, 57, 70.6, 61, 75.5, 68, 76.8, 57, 75.5],
  ];
  const SEAS = [[27.5, 42.5, 28, 41.3, 29.5, 41.2, 32, 41.9, 35, 42, 38, 41, 41.5, 41.5, 41.5, 42.5, 39.5, 44, 38, 44.5, 37, 45.3, 35, 45, 33.5, 44.5, 32.5, 45.4, 30.5, 46.5, 29.7, 45.3, 28.6, 44.3],
    [47, 45, 49, 46.5, 51.5, 47, 53, 45.5, 51, 44.5, 52.7, 42, 54, 40.5, 53.5, 37.5, 51, 36.7, 49, 37.6, 49.5, 40.3, 47.5, 42]];
  function inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const GX0 = 30, GX1 = 690, GTOP = 74, GBOT = -50, GY0 = 76, KX = (GX1 - GX0) / 360;
  const gx = (lon) => GX0 + (lon + 180) * KX, gy = (lat) => GY0 + (GTOP - lat) * KX;
  const GY1 = gy(GBOT);
  const TRIP_WORD = { 6: "6 round trips: two requests, each on a new connection", 2: "2 round trips: one connection, kept open", 1: "1 round trip: the data comes inside the page" };
  function land(c, F) {
    if (!F.dots) {
      F.dots = [];
      for (let lat = GTOP - 1.25; lat > GBOT; lat -= 2.5) for (let lon = -178.75; lon < 180; lon += 2.5)
        if (LAND.some((p) => inside(p, lon, lat)) && !SEAS.some((p) => inside(p, lon, lat))) F.dots.push(c.s("circle", { class: "ln-land", cx: gx(lon).toFixed(1), cy: gy(lat).toFixed(1), r: 2.1 }));
    }
    return F.dots;
  }
  // a round trip's path: a curve bowed towards the pole, so long ones read as arcs
  function arc(a, b) {
    const x1 = gx(a.lon), y1 = gy(a.lat), x2 = gx(b.lon), y2 = gy(b.lat), d = Math.hypot(x2 - x1, y2 - y1);
    return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 - d * 0.22 };
  }
  const bz = (A, u) => [(1 - u) * (1 - u) * A.x1 + 2 * (1 - u) * u * A.cx + u * u * A.x2, (1 - u) * (1 - u) * A.y1 + 2 * (1 - u) * u * A.cy + u * u * A.y2];
  const BX0 = 812, BX1 = 930, BMAX = 400, bxv = (v) => BX0 + (Math.min(v, BMAX) / BMAX) * (BX1 - BX0);
  UI.globe = {
    init(c) { Object.assign(c.F, { sites: c.B.start.sites.slice(), trips: c.B.start.trips, res: null, anim: 0, runs: 0, shown: false }); },
    draw(c) {
      const { s, F } = c, R = F.res, g = c.B.goals, kids = [];
      kids.push(s("text", { class: "ev-h", x: 40, y: 56 }, "Who waits how long"), s("text", { class: "ev-sub", x: 40, y: 74 }, R ? `each city uses its nearest datacenter · a page load is ${F.trips} round trip${F.trips > 1 ? "s" : ""} + ${LT.WORK} ms of work` : "tap a square to put a datacenter there, up to 3"));
      kids.push(...land(c, F));
      const worst = R ? R.worst.ms : 1, now = R ? F.anim * worst : 0;
      // the round trips, a pulse going out and back on each city's arc
      if (R) for (const ct of R.cities) {
        const city = LT.CITIES.find((x) => x.id === ct.id), site = LT.SITES.find((x) => x.id === ct.site);
        if (ct.km < 50) continue;
        const A = arc(city, site);
        kids.push(s("path", { class: "ln-arc", d: `M${A.x1} ${A.y1}Q${A.cx} ${A.cy} ${A.x2} ${A.y2}` }));
        const tt = Math.min(now, ct.ms - LT.WORK), k = Math.floor(tt / ct.rtt), u = (tt - k * ct.rtt) / ct.rtt;
        if (now < ct.ms - LT.WORK) { const [x, y] = bz(A, u < 0.5 ? u * 2 : 2 - u * 2); kids.push(s("circle", { class: "ln-pulse" + (u < 0.5 ? "" : " back"), cx: x, cy: y, r: 4.2 })); }
      }
      // the datacenters you can switch on
      for (const st of LT.SITES) {
        const on = F.sites.includes(st.id), x = gx(st.lon), y = gy(st.lat);
        kids.push(s("g", { class: "ln-site" + (on ? " on" : ""), role: "button", tabindex: 0, "aria-pressed": on ? "true" : "false", "aria-label": `A datacenter in ${st.name}: ${on ? "on" : "off"}`, "data-site": st.id,
          onclick: () => toggle(c, st.id), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(c, st.id); } } },
          s("rect", { class: "ln-hit", x: x - 15, y: y - 15, width: 30, height: 30 }), s("rect", { class: "ln-sq", x: x - 8, y: y - 8, width: 16, height: 16, rx: 3 }), s("title", {}, `${st.name}: ${on ? "tap to switch off" : "tap to put a datacenter here"}`)));
      }
      // the cities, each with its stopwatch
      const LBL = { ny: [8, -8], la: [-8, 16, "end"], sp: [10, 14], ld: [-6, -10, "end"], lg: [-8, 4, "end"], jb: [10, 10], mb: [-8, 16, "end"], sg: [10, 16], tk: [10, -8], sy: [10, 14] };
      for (const ct of LT.CITIES) {
        const r = R && R.cities.find((x) => x.id === ct.id), x = gx(ct.lon), y = gy(ct.lat), [dx, dy, an] = LBL[ct.id];
        const fin = r && now >= r.ms, t = r ? Math.min(now, r.ms) : 0;
        kids.push(s("circle", { class: "ln-city" + (fin ? (r.ms <= g.ms ? " ok" : " no") : ""), cx: x, cy: y, r: 4.6 }));
        kids.push(s("text", { class: "ln-cn yt-halo" + (fin ? (r.ms <= g.ms ? " ok" : " no") : ""), x: x + dx, y: y + dy, "text-anchor": an || "start" }, R ? `${ct.name} ${ms(t)}` : ct.name));
      }
      // every city's page, against the goal
      kids.push(s("text", { class: "wa-mn", x: 720, y: 96 }, "page load, by city"));
      kids.push(s("path", { class: "ub-goal", d: `M${bxv(g.ms)} 106V${110 + LT.CITIES.length * 22}` }), s("text", { class: "ev-tick", x: bxv(g.ms), y: 120 + LT.CITIES.length * 22, "text-anchor": "middle" }, `goal ${g.ms} ms`));
      LT.CITIES.forEach((ct, i) => {
        const r = R && R.cities.find((x) => x.id === ct.id), y = 116 + i * 22, t = r ? Math.min(now, r.ms) : 0, fin = r && now >= r.ms;
        kids.push(s("text", { class: "ln-bl", x: 720, y: y + 9 }, ct.name), s("rect", { class: "ln-bt", x: BX0, y, width: BX1 - BX0, height: 11, rx: 3 }));
        if (r) kids.push(s("rect", { class: "ln-bf" + (fin ? (r.ms <= g.ms ? " ok" : " no") : ""), x: BX0, y, width: Math.max(1.5, bxv(t) - BX0), height: 11, rx: 3 }));
        if (fin && r.ms > BMAX) kids.push(s("text", { class: "ln-over", x: BX1 + 3, y: y + 10 }, "»"));
      });
      // the big numbers, and light's speed limit
      const done = R && F.anim >= 1;
      kids.push(s("text", { class: "wa-mn", x: 40, y: 384 }, "the slowest city"), s("text", { class: "wa-big" + (done && R.worst.ms > g.ms ? " over" : ""), x: 40, y: 426 }, done ? ms(R.worst.ms) : "–"),
        s("text", { class: "ev-tick", x: 40, y: 446 }, done ? `${LT.CITIES.find((x) => x.id === R.worst.id).name}, ${c.num(R.worst.km)} km from ${LT.SITES.find((x) => x.id === R.worst.site).name}` : "after every city has its page"));
      kids.push(s("text", { class: "wa-mn", x: 300, y: 384 }, "datacenters"), s("text", { class: "wa-big" + (F.sites.length > g.sites ? " over" : ""), x: 300, y: 426 }, `${F.sites.length} of ${g.sites}`),
        s("text", { class: "ev-tick", x: 300, y: 446 }, F.sites.map((id) => LT.SITES.find((x) => x.id === id).name).join(", ") || "none yet"));
      const LR = 520, k1000 = (1000 * 2 * LT.DETOUR) / LT.LIGHT;
      kids.push(s("text", { class: "wa-mn", x: LR, y: 384 }, "the speed limit"), s("text", { class: "ev-sub", x: LR, y: 406 }, `light in glass: ${LT.LIGHT} km a millisecond`),
        s("text", { class: "ev-sub", x: LR, y: 424 }, `1,000 km there and back: ${k1000.toFixed(1)} ms`), s("text", { class: "ev-sub", x: LR, y: 442 }, "no hardware makes it any faster"));
      if (done && R.worst.ms <= g.ms) kids.push(c.rx("rocket", 850, 360, 70, "pop"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : Math.max(2.5, Math.min(6, R.worst.ms / 60))));
      const first = F.anim >= 1 && !F.shown;
      if (first) F.shown = true;
      c.redraw();
      if (first) { if (goodG(c, R)) c.solved(F.runs <= 3 ? 3 : F.runs <= 6 ? 2 : 1); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.shown ? F.res : null, g = c.B.goals;
      const late = R ? R.cities.filter((x) => x.ms > g.ms) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each city sends its page load to the nearest datacenter you've switched on; the dots are the round trips, going out and coming back."),
        late.length ? h("p", { class: "sd-verdict no" }, `✗ ${late.length} cit${late.length > 1 ? "ies wait" : "y waits"} longer than ${g.ms} ms: ${late.map((x) => `${LT.CITIES.find((y) => y.id === x.id).name} ${ms(x.ms)}`).join(", ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c;
      const run = () => { if (!F.sites.length) { c.flash("Switch on at least one datacenter: tap a square on the map."); return; } F.runs++; F.res = LT.globe({ sites: F.sites, trips: F.trips }); F.anim = 0; F.shown = false; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "a page load takes ", h("button", { class: "sd-word", onclick: () => { F.trips = cyc(LT.TRIPS, F.trips); F.res = null; c.redraw(); c.rebrief(); } }, TRIP_WORD[F.trips])),
        h("p", { class: "sd-quiet" }, "Datacenters: tap the squares on the map.")),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && !F.shown, onclick: run }, "Load the page everywhere"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.shown ? c.F.res : null, g = c.B.goals;
      return [[`every city within ${g.ms} ms`, R ? R.worst.ms <= g.ms : null, R ? ms(R.worst.ms) : "run it"], [`at most ${g.sites} datacenters`, c.F.sites.length <= g.sites, String(c.F.sites.length)]];
    },
  };
  const goodG = (c, R) => R.worst.ms <= c.B.goals.ms && R.sites <= c.B.goals.sites;
  function toggle(c, id) {
    const F = c.F;
    if (F.res && !F.shown) return;
    if (F.sites.includes(id)) F.sites = F.sites.filter((x) => x !== id);
    else if (F.sites.length >= c.B.goals.sites) { c.flash(`${c.B.goals.sites} datacenters is the budget. Switch one off first.`); return; }
    else F.sites = [...F.sites, id];
    F.res = null; c.redraw(); c.rebrief();
  }
})();

// ===================================================================================================== Caching --
// The Caching unit's pages (tunnel/cache.js has the simulators): the long tail, which order to write in, the
// stampede, and fresh enough.
(function () {
  "use strict";
  const UI = window.SD.UI, CA = window.CACHE;
  const lg = Math.log10;
  const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const pc = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const ran = (n) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);
  // drag on the board: the layer is redrawn every frame, so the pointer is caught by the board's own svg
  function dragger(c, on) {
    c.svg.addEventListener("pointermove", (e) => { if (c.isNow() && c.F.drag) on(c.pt(e)); });
    const up = () => { if (c.isNow() && c.F.drag) { c.F.drag = false; c.redraw(); } };
    c.svg.addEventListener("pointerup", up);
    c.svg.addEventListener("pointercancel", up);
  }
  const grab = (c, on) => (e) => { c.F.drag = true; try { c.svg.setPointerCapture(e.pointerId); } catch (err) {} on(c.pt(e)); e.preventDefault(); e.stopPropagation(); };

  // -------------------------------------------------------------------------------------------- the long tail --
  const TX0 = 96, TX1 = 640, TYB = 470, TYT = 128;
  const tx = (sh) => TX0 + ((lg(Math.max(1e-5, Math.min(1, sh))) + 5) / 5) * (TX1 - TX0);
  const txi = (x) => Math.pow(10, ((Math.max(TX0, Math.min(TX1, x)) - TX0) / (TX1 - TX0)) * 5 - 5);
  const ty = (v) => TYB - v * (TYB - TYT), tyi = (y) => (TYB - Math.max(TYT, Math.min(TYB, y))) / (TYB - TYT);
  const prodN = (sh) => sh * CA.PRODUCTS;
  const prods = (sh) => { const n = prodN(sh); return n >= 1e6 ? "all 1,000,000" : n >= 1e4 ? fmtN(Math.round(n / 1000) * 1000) : fmtN(n); };
  const mem = (sh) => { const mb = (prodN(sh) * CA.ITEM_KB) / 1000; return mb >= 1000 ? (mb / 1000).toFixed(mb >= 1e4 ? 0 : 1) + " GB" : mb >= 1 ? Math.round(mb) + " MB" : Math.round(mb * 1000) + " KB"; };
  const shareW = (sh) => (sh >= 0.1 ? pc(sh) : sh >= 0.001 ? pc(sh, sh >= 0.01 ? 1 : 2) : pc(sh, 3)).replace(/\.0+%$/, "%");
  const truth = (r) => (r.ask === "hit" ? CA.hit(r.at) : CA.size(r.at));
  const close = (r, g) => (r.ask === "hit" ? Math.abs(g - truth(r)) <= 0.06 : Math.abs(lg(g / truth(r))) <= lg(2));
  UI.tail = {
    init(c) {
      Object.assign(c.F, { round: 0, guess: null, checked: false, rights: [], picks: [], drag: false, draw: 0 });
      if (c.done()) { c.F.round = c.B.rounds.length; c.F.picks = c.B.rounds.map(truth); c.F.rights = c.B.rounds.map(() => true); c.F.draw = 1; }
      else c.F.guess = c.B.rounds[0].ask === "hit" ? 0.3 : 0.01;
      dragger(c, (p) => move(c, p));
    },
    draw(c) {
      const { s, F, B } = c, kids = [], R = B.rounds, r = R[F.round], over = F.round >= R.length;
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "Views the cache answers"), s("text", { class: "ev-sub", x: 40, y: 94 }, "by how much of the catalog it keeps; each step along is ten times more"));
      // the grid
      for (let v = 0; v <= 1.0001; v += 0.25) kids.push(s("path", { class: "cc-grid", d: `M${TX0} ${ty(v)}H${TX1}` }), s("text", { class: "ev-tick", x: TX0 - 8, y: ty(v) + 4, "text-anchor": "end" }, pc(v)));
      for (let k = -5; k <= 0; k++) {
        const x = tx(Math.pow(10, k));
        kids.push(s("path", { class: "cc-grid", d: `M${x} ${TYT}V${TYB}` }), s("text", { class: "ev-tick", x, y: TYB + 16, "text-anchor": "middle" }, ["0.001%", "0.01%", "0.1%", "1%", "10%", "100%"][k + 5]),
          s("text", { class: "cc-sm", x, y: TYB + 30, "text-anchor": "middle" }, ["10", "100", "1,000", "10,000", "100,000", "1,000,000"][k + 5]));
      }
      kids.push(s("text", { class: "cc-sm", x: TX0 - 26, y: TYB + 30, "text-anchor": "end" }, "products"), s("path", { class: "ub-axis", d: `M${TX0} ${TYB}H${TX1}` }));
      // the curve, once every guess is in
      if (F.draw > 0) {
        const pts = [], end = -5 + 5 * F.draw;
        for (let e = -5; e <= end + 1e-9; e += 0.04) pts.push([tx(Math.pow(10, e)), ty(CA.hit(Math.pow(10, e)))]);
        const d = "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L");
        kids.push(s("path", { class: "cc-area", d: `${d}L${pts[pts.length - 1][0].toFixed(1)} ${TYB}L${TX0} ${TYB}Z` }), s("path", { class: "cc-curve", d }));
      }
      // the rounds already answered: your pin and the real point
      F.picks.forEach((g, i) => {
        const q = R[i], t = truth(q), ok = F.rights[i];
        const gx = q.ask === "hit" ? tx(q.at) : tx(g), gy = q.ask === "hit" ? ty(g) : ty(q.at), x = q.ask === "hit" ? tx(q.at) : tx(t), y = q.ask === "hit" ? ty(t) : ty(q.at);
        kids.push(s("path", { class: "cc-miss" + (ok ? " ok" : ""), d: `M${gx} ${gy}L${x} ${y}` }), s("circle", { class: "cc-pin was" + (ok ? " ok" : " no"), cx: gx, cy: gy, r: 6 }), s("circle", { class: "cc-true", cx: x, cy: y, r: 7 }));
        const lab = q.ask === "hit" ? pc(t) + " of views" : `${shareW(t)} of the catalog · ${mem(t)}`;
        kids.push(s("text", { class: "cc-tl yt-halo", x: x + (q.ask === "hit" ? 12 : -10), y: y + (q.ask === "hit" ? 4 : -14), "text-anchor": q.ask === "hit" ? "start" : "end" }, lab));
      });
      // this round: a guide along what's given, and the pin you drag along it
      if (!over) {
        const g = F.guess, hitQ = r.ask === "hit";
        const x = hitQ ? tx(r.at) : tx(g), y = hitQ ? ty(g) : ty(r.at);
        kids.push(s("path", { class: "cc-guide", d: hitQ ? `M${x} ${TYB}V${TYT - 6}` : `M${TX0} ${y}H${TX1}` }));
        kids.push(s("text", { class: "cc-given yt-halo", x: hitQ ? x + 8 : TX0 + 8, y: hitQ ? TYT + 8 : y - 10 }, hitQ ? `the top ${shareW(r.at)} · ${prods(r.at)} products · ${mem(r.at)}` : `${pc(r.at)} of views`));
        if (!F.checked) {
          kids.push(s("rect", { class: "cc-hit", x: TX0 - 30, y: TYT - 20, width: TX1 - TX0 + 60, height: TYB - TYT + 40, onpointerdown: grab(c, (p) => move(c, p)) }));
          kids.push(s("path", { class: "cc-stem", d: hitQ ? `M${x - 18} ${y}H${x + 18}` : `M${x} ${y - 18}V${y + 18}` }), s("circle", { class: "cc-pin" + (F.drag ? " drag" : ""), cx: x, cy: y, r: 9 }));
          kids.push(s("text", { class: "cc-read yt-halo", x: x + (hitQ ? 16 : 0), y: y + (hitQ ? 5 : 32), "text-anchor": hitQ ? "start" : "middle" }, hitQ ? pc(g) + "?" : `${shareW(g)}? · ${mem(g)}`));
        }
      }
      // the tail itself, most viewed first, with a crown on the top product
      const BX = 700, BB = 368, BW = 5.2, H1 = 1 / CA.H(CA.PRODUCTS);
      kids.push(s("text", { class: "ev-h", x: BX, y: 154 }, "The long tail"), s("text", { class: "ev-sub", x: BX, y: 172 }, "views per product, most viewed first"));
      for (let k = 1; k <= 40; k++) { const hh = (150 / k); kids.push(s("rect", { class: "cc-tb" + (k === 1 ? " top" : ""), x: BX + (k - 1) * BW, y: BB - hh, width: BW - 1.2, height: hh })); }
      kids.push(s("path", { class: "cc-tdots", d: `M${BX + 40 * BW + 4} ${BB - 2}H${BX + 236}` }), s("path", { class: "ub-axis", d: `M${BX} ${BB}H${BX + 236}` }));
      kids.push(c.rx("crown", BX - 9, BB - 182, 30));
      kids.push(s("text", { class: "cc-sm", x: BX, y: BB + 18 }, `#1 gets ${pc(H1, 1)} of all views`), s("text", { class: "cc-sm", x: BX, y: BB + 32 }, `#1,000,000 gets 1 in ${fmtN(Math.round(1 / (H1 / 1e6) / 1e6))} million`));
      // the guess, in memory
      if (!over) {
        const sh = r.ask === "hit" ? r.at : F.guess;
        kids.push(s("text", { class: "wa-mn", x: BX, y: 436 }, "in the cache"), s("text", { class: "cc-big", x: BX, y: 470 }, mem(sh)), s("text", { class: "cc-sm", x: BX, y: 490 }, `${prods(sh)} product pages × ${CA.ITEM_KB} KB`));
      } else kids.push(s("text", { class: "cc-tl", x: BX, y: 440 }, `every ten times more memory`), s("text", { class: "cc-tl", x: BX, y: 456 }, `buys the same ${Math.round((100 * Math.LN10) / CA.H(CA.PRODUCTS))} points`), c.rx("trophy", BX + 150, 404, 74, F.draw >= 1 ? "pop" : ""));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (F.round < c.B.rounds.length || F.draw >= 1) return;
      F.draw = Math.min(1, F.draw + dt / (c.REDUCED ? 0.1 : 1.6));
      c.redraw();
    },
    brief(c) {
      const { h, F, B } = c, R = B.rounds;
      if (F.round >= R.length) return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, `${F.rights.filter(Boolean).length} of ${R.length} guesses close. The curve climbs fast and then crawls: that's the tail.`))];
      const r = R[F.round], t = truth(r);
      return [h("div", { class: "sd-ask" }, h("small", {}, `guess ${F.round + 1} of ${R.length}`), h("p", { html: r.say }),
        !F.checked ? h("p", { class: "sd-quiet" }, r.ask === "hit" ? "Drag the pin up or down the line." : "Drag the pin along the line.") :
          h("p", { class: "sd-verdict " + (F.rights[F.round] ? "ok" : "no") }, (F.rights[F.round] ? "✓ Close. " : "✗ Not quite. ") + (r.ask === "hit" ? `It's ${pc(t)} of views.` : `It takes ${shareW(t)} of the catalog: ${prods(t)} products, ${mem(t)}.`)))];
    },
    tools(c) {
      const { h, F, B } = c, R = B.rounds;
      if (F.round >= R.length) return [];
      if (!F.checked) return [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => check(c) }, "Check my guess"))];
      return [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => next(c) }, F.round === R.length - 1 ? "Draw the whole curve" : "Next guess →"))];
    },
  };
  function move(c, p) {
    const F = c.F, r = c.B.rounds[F.round];
    if (!r || F.checked) return;
    F.guess = r.ask === "hit" ? Math.max(0.01, Math.min(0.99, tyi(p.y))) : Math.max(1e-5, Math.min(1, txi(p.x)));
    c.redraw();
  }
  function check(c) {
    const F = c.F, r = c.B.rounds[F.round];
    F.checked = true; F.rights[F.round] = close(r, F.guess); F.picks[F.round] = F.guess;
    c.redraw(); c.rebrief();
  }
  function next(c) {
    const F = c.F, R = c.B.rounds;
    F.round++; F.checked = false;
    if (F.round < R.length) F.guess = R[F.round].ask === "hit" ? 0.3 : 0.01;
    else { const n = F.rights.filter(Boolean).length; F.draw = 0.001; c.solved(n === R.length ? 3 : n >= R.length - 1 ? 2 : 1); }
    c.redraw(); c.rebrief();
  }

  // ------------------------------------------------------------------------------------------- which order --
  const PRICE = { 0: "£3", 1: "£1", 2: "£2" }, P$ = (v) => (v == null ? "empty" : PRICE[v]);
  const ICON = { db: "→ database", set: "→ cache", del: "✕ cache" };
  const OCOL = { A: 452, B: 540, R: 628, cache: 756, db: 868 };
  const STEP = 0.75;
  const SHORT = { setdb: "cache, db", dbset: "db, cache", deldb: "delete, db", dbdel: "db, delete" };
  UI.inval = {
    init(c) {
      Object.assign(c.F, { I: CA.inval(), pick: null, picks: [], t: 0 });
      if (c.done()) { c.F.pick = c.B.answer; c.F.picks = [c.B.answer]; c.F.t = 99; c.F.won = true; }
    },
    draw(c) {
      const { s, h, F, B } = c, kids = [], I = F.I, ids = Object.keys(CA.ORDERS);
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "A writer's two steps"), s("text", { class: "ev-sub", x: 40, y: 94 }, F.pick ? "tap another to see how it goes wrong" : "tap the order you'd write in"));
      ids.forEach((id, i) => {
        const o = CA.ORDERS[id], seen = F.picks.includes(id), cur = F.pick === id;
        const card = h("button", { class: "cc-ord" + (cur ? " cur" : "") + (seen ? (id === B.answer ? " best" : " bad") : ""), xmlns: "http://www.w3.org/1999/xhtml", onclick: () => pick(c, id) },
          h("span", { class: "cc-steps" }, ...o.steps.map((k, j) => h("i", { class: "k-" + k }, `${j + 1} ${k === "db" ? "update the database" : k === "set" ? "update the cache" : "delete the key"}`))),
          seen ? h("small", {}, `wrong price left in ${I[id].stale} of ${I[id].total}`) : null);
        kids.push(s("foreignObject", { x: 36, y: 108 + i * 78, width: 336, height: 70, class: "sc-fo" }, card));
      });
      // every order's count, once you've picked
      if (F.pick) {
        kids.push(s("text", { class: "cc-sm", x: 40, y: 438 }, "interleavings that end with the wrong price in the cache"));
        const mx = Math.max(...ids.map((k) => I[k].total));
        ids.forEach((id, i) => {
          const w = (I[id].stale / mx) * 280, y = 450 + i * 18;
          kids.push(s("text", { class: "cc-sm", x: 40, y: y + 10 }, SHORT[id]), s("rect", { class: "ln-bt", x: 120, y, width: 210, height: 12, rx: 3 }), s("rect", { class: "cc-sb" + (id === B.answer ? " best" : ""), x: 120, y, width: Math.max(2, (w * 210) / 280), height: 12, rx: 3 }),
            s("text", { class: "cc-sm", x: 338, y: y + 10 }, `${I[id].stale}`));
        });
      }
      // the sequence: one way it goes wrong, step by step
      if (F.pick) {
        const ex = I[F.pick].example, log = ex.log, shown = Math.min(log.length, Math.floor(F.t / STEP) + 1), Y0 = 140, DY = Math.min(44, 300 / log.length);
        kids.push(s("text", { class: "ev-h", x: 420, y: 76 }, "One way it goes wrong"), s("text", { class: "ev-sub", x: 420, y: 94 }, `${CA.ORDERS[F.pick].say}, from a cache that's ${ex.warm ? "warm" : "empty"}`));
        for (const [k, w] of [["A", "writer A"], ["B", "writer B"], ["R", "shopper"], ["cache", "cache"], ["db", "database"]]) {
          kids.push(s("text", { class: "cc-col" + (k === "cache" || k === "db" ? " st" : ""), x: OCOL[k], y: 120, "text-anchor": "middle" }, w), s("path", { class: "cc-life", d: `M${OCOL[k]} 126V${Y0 + log.length * DY - 8}` }));
        }
        kids.push(s("path", { class: "cc-sep", d: `M${(OCOL.R + OCOL.cache) / 2 + 6} 108V${Y0 + log.length * DY}` }));
        const st0 = { cache: ex.warm ? 0 : null, db: 0 };
        for (let i = 0; i < shown; i++) {
          const e = log[i], y = Y0 + i * DY + 10, col = OCOL[e.who], to = e.k === "db" || e.k === "read" ? OCOL.db : OCOL.cache;
          const say = e.k === "db" ? `write ${P$(e.v)}` : e.k === "set" ? `set ${P$(e.v)}` : e.k === "del" ? "delete" : e.k === "get" ? (e.v == null ? "get: miss" : `get: ${P$(e.v)}`) : e.k === "read" ? `read: ${P$(e.v)}` : `fill ${P$(e.v)}`;
          const fresh = i === shown - 1 && F.t < log.length * STEP;
          kids.push(s("g", { class: "cc-row" + (fresh ? " in" : "") },
            s("path", { class: "cc-msg w-" + e.who, d: `M${col} ${y}H${to - (to > col ? 12 : -12)}`, "marker-end": "" }), s("circle", { class: "cc-who w-" + e.who, cx: col, cy: y, r: 5 }),
            s("path", { class: "cc-head w-" + e.who, d: `M${to - 12} ${y - 5}L${to - 3} ${y}L${to - 12} ${y + 5}` }),
            s("text", { class: "cc-say yt-halo", x: col + 10, y: y - 6 }, say)));
          // the state after this step
          const prev = i ? log[i - 1] : st0;
          for (const k of ["cache", "db"]) {
            const v = e[k], ch = v !== prev[k];
            if (ch || i === shown - 1) kids.push(s("text", { class: "cc-val" + (ch ? " ch" : ""), x: OCOL[k] + 8, y: y + 4 }, P$(v)));
          }
        }
        if (shown === log.length && F.t >= log.length * STEP) {
          const y = Y0 + log.length * DY + 26;
          kids.push(s("text", { class: "cc-end", x: 530, y }, `cache ${P$(ex.cache)}, database ${P$(ex.db)}`), s("text", { class: "cc-sm", x: 530, y: y + 18 }, "wrong until the key is deleted again, or its TTL runs out"));
          kids.push(c.rx(F.pick === B.answer ? "bug" : "ghost", 472, y - 32, 48, "pop"));
        }
      }
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.pick) return;
      const end = F.I[F.pick].example.log.length * STEP + 0.01;
      if (F.t >= end) return;
      F.t = Math.min(end, F.t + dt * (c.REDUCED ? 20 : 1));
      c.redraw();
    },
    brief(c) {
      const { h, F, B } = c;
      if (!F.pick) return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each card is the two steps a writer does when it changes the price. Below the line, a shopper reads it at the same time."))];
      const I = F.I, a = I[B.answer];
      const found = F.picks.includes(B.answer);
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-verdict " + (F.pick === B.answer ? "ok" : "no") },
        F.pick === B.answer ? `✓ The fewest: ${a.stale} of ${a.total}. Not zero, though: watch the one that's left.` : `✗ ${I[F.pick].stale} of ${I[F.pick].total} ways leave the wrong price.${found ? "" : " Try another order."}`))];
    },
    tools() { return []; },
  };
  function pick(c, id) {
    const F = c.F;
    if (!F.picks.includes(id)) F.picks.push(id);
    F.pick = id; F.t = 0;
    if (id === c.B.answer && !c.F.won) { c.F.won = true; c.solved(F.picks.length === 1 ? 3 : F.picks.length === 2 ? 2 : 1); }
    c.redraw(); c.rebrief();
  }

  // -------------------------------------------------------------------------------------------- stampede --
  const G_WORD = { none: "everyone asks the database", lock: "one shopper refills it, the rest wait (a lock)", early: "refresh it a little early, and keep serving the old copy" };
  const T_WORD = { same: "exactly 60 s", jitter: "60 s, give or take 10% at random" };
  const KX = 40, KY = 116, KC = 12, KCOL = 25;
  const QX = 452, QB = 350, QH = 200;
  const CX0 = 40, CX1 = 700, CB = 498, CH = 64;
  UI.stampede = {
    init(c) { Object.assign(c.F, { guard: "none", ttl: "same", res: null, anim: 0, runs: 0, memo: {}, shown: false }); },
    draw(c) {
      const { s, F, B } = c, R = F.res, g = B.goals, kids = [];
      const T = CA.ST.T, now = R ? play(R, F.anim) : 0, bi = R ? Math.min(R.bins.length - 1, Math.floor(now / CA.ST.bin)) : 0;
      // the keys, hottest first
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "500 hot keys in the cache"), s("text", { class: "ev-sub", x: 40, y: 94 }, R ? `${Math.floor(now)} s into the sale${slowNow(R, now) ? " · slowed right down" : ""}` : "hottest first; run the sale to watch them"));
      for (let k = 0; k < CA.ST.keys; k++) {
        const st = R ? keyAt(R.spans[k], now) : null;
        kids.push(s("rect", { class: "cc-key" + (st ? " " + st : ""), x: KX + (k % KCOL) * KC, y: KY + Math.floor(k / KCOL) * KC, width: KC - 2, height: KC - 2, rx: 2 }));
      }
      kids.push(s("text", { class: "cc-sm in", x: KX, y: KY + 20 * KC + 14 }, "■ in the cache"), s("text", { class: "cc-sm miss", x: KX + 104, y: KY + 20 * KC + 14 }, "■ gone: shoppers miss"), s("text", { class: "cc-sm early", x: KX + 252, y: KY + 20 * KC + 14 }, "■ refreshing"));
      // the database, and its line
      const b = R ? R.bins[bi] : null, wait = b ? b.wait : 0, errs = b ? b.err : 0;
      kids.push(s("text", { class: "ev-h", x: QX - 30, y: 76 }, "The database"), s("text", { class: "ev-sub", x: QX - 30, y: 94 }, "10 at a time, 200 more can wait"));
      kids.push(s("rect", { class: "cc-qbox", x: QX, y: QB - QH, width: 64, height: QH, rx: 6 }));
      const fill = (Math.min(CA.ST.line, wait) / CA.ST.line) * QH;
      if (fill > 0) kids.push(s("rect", { class: "cc-qfill" + (wait > g.wait ? " over" : ""), x: QX + 4, y: QB - fill, width: 56, height: fill, rx: 3 }));
      kids.push(s("path", { class: "ub-goal", d: `M${QX - 12} ${QB - (g.wait / CA.ST.line) * QH}H${QX + 76}` }), s("text", { class: "ev-tick", x: QX + 82, y: QB - (g.wait / CA.ST.line) * QH + 4 }, `goal: ${g.wait}`));
      kids.push(s("text", { class: "cc-qn yt-halo", x: QX - 10, y: Math.max(QB - QH + 12, QB - fill + 4), "text-anchor": "end" }, R ? `${fmtN(wait)} waiting` : ""));
      kids.push(c.rx(wait >= CA.ST.line ? "flame" : wait > 0 ? "hourglass" : "sleep", QX + 8, QB + 8, 48));
      if (errs) kids.push(s("text", { class: "cc-err yt-halo", x: QX + 64, y: QB + 38 }, `${fmtN(errs)} error pages`));
      // the timeline
      kids.push(s("text", { class: "ev-sub", x: CX0, y: CB - CH - 12 }, "queries asked of the database, every half second (taller is ten times more)"));
      kids.push(s("path", { class: "ub-axis", d: `M${CX0} ${CB}H${CX1}` }));
      for (let t = 0; t <= T; t += 30) kids.push(s("text", { class: "ev-tick", x: CX0 + (t / T) * (CX1 - CX0), y: CB + 16, "text-anchor": "middle" }, t + " s"));
      if (R) {
        const bw = (CX1 - CX0) / R.bins.length, top = lg(20000);
        R.bins.forEach((x, i) => {
          if (i > bi) return;
          if (x.q) { const hh = Math.max(2, (lg(1 + x.q) / top) * CH); kids.push(s("rect", { class: "cc-tq" + (x.err ? " err" : ""), x: CX0 + i * bw, y: CB - hh, width: Math.max(1.4, bw - 0.4), height: hh })); }
        });
        kids.push(s("path", { class: "tw-now", d: `M${CX0 + (now / T) * (CX1 - CX0)} ${CB - CH - 4}V${CB}` }));
      }
      // the numbers
      const NX = 760, done = R && F.shown;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 152 }, "error pages"), s("text", { class: "wa-big" + (done && R.errors > g.errors ? " over" : ""), x: NX, y: 192 }, R ? fmtN(sumTo(R, bi, "err")) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 244 }, "most queries waiting"), s("text", { class: "wa-big" + (done && R.queuePeak > g.wait ? " over" : ""), x: NX, y: 284 }, R ? fmtN(maxTo(R, bi)) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 336 }, "queries in all"), s("text", { class: "cc-big", x: NX, y: 368 }, R ? fmtN(sumTo(R, bi, "q")) : "–"));
      if (done) kids.push(c.rx(goodS(c, R) ? "rocket" : "snail", NX + 70, 390, 64, "pop"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.3 : 9));
      const first = F.anim >= 1 && !F.shown;
      if (first) F.shown = true;
      c.redraw();
      if (first) { if (goodS(c, R)) c.solved(ran(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.shown ? F.res : null, g = c.B.goals;
      const miss = R ? [R.errors > g.errors && `${fmtN(R.errors)} shoppers got an error page`, R.queuePeak > g.wait && `${fmtN(R.queuePeak)} queries were waiting at once`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each square is a key, hottest at the top left. It runs 150 s of the sale, and slows right down whenever a key runs out."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; F.shown = false; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.guard}:${F.ttl}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = prep(CA.stampede({ guard: F.guard, ttl: F.ttl, seed: c.B.sim.seed }))); F.anim = 0; F.shown = false; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "when a key runs out, ", h("button", { class: "sd-word", onclick: () => set("guard", cyc(CA.GUARDS, F.guard)) }, G_WORD[F.guard])),
        h("p", {}, "keep each key for ", h("button", { class: "sd-word", onclick: () => set("ttl", cyc(CA.TTLS, F.ttl)) }, T_WORD[F.ttl]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && !F.shown, onclick: run }, "Run the sale"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.shown ? c.F.res : null, g = c.B.goals;
      return [["no error pages", R ? R.errors <= g.errors : null, R ? fmtN(R.errors) : "run it"], [`at most ${g.wait} queries waiting`, R ? R.queuePeak <= g.wait : null, R ? fmtN(R.queuePeak) : "·"]];
    },
  };
  const goodS = (c, R) => R.errors <= c.B.goals.errors && R.queuePeak <= c.B.goals.wait;
  // playback: quick through the quiet stretches, slow wherever a key is out
  function prep(R) {
    const w = R.bins.map((b) => (b.q || b.wait || b.err ? 24 : 1)), cum = [0];
    for (const x of w) cum.push(cum[cum.length - 1] + x);
    R.play = { w, cum };
    return R;
  }
  function play(R, f) {
    const { w, cum } = R.play, total = cum[cum.length - 1], at = f * total;
    let i = 0; while (i < w.length - 1 && cum[i + 1] < at) i++;
    return Math.min(CA.ST.T, (i + (at - cum[i]) / w[i]) * CA.ST.bin);
  }
  const slowNow = (R, t) => { const i = Math.min(R.bins.length - 1, Math.floor(t / CA.ST.bin)); return R.play.w[i] > 1; };
  // a key's state now; a refill takes 50 ms, too quick to see, so a key stays marked for 2 s after, fading
  function keyAt(spans, t) {
    let was = null;
    for (const [a, b, k] of spans) { if (t >= a && t < b) return k; if (t >= b && t < b + 2) was = k + " was"; }
    return was;
  }
  const sumTo = (R, bi, k) => { let n = 0; for (let i = 0; i <= bi; i++) n += R.bins[i][k]; return n; };
  const maxTo = (R, bi) => { let n = 0; for (let i = 0; i <= bi; i++) n = Math.max(n, R.bins[i].wait); return n; };

  // ----------------------------------------------------------------------------------------- fresh enough --
  const W_WORD = { local: "in each app server's own memory", shared: "in one Redis, shared by all 50" };
  const E_WORD = { none: "do nothing: wait for the TTL", delete: "delete the key" };
  const TT_WORD = { 10: "10 seconds", 60: "60 seconds", 600: "10 minutes" };
  const FX0 = 150, FX1 = 690;
  UI.fresh = {
    init(c) { Object.assign(c.F, { where: "local", ttl: 600, edit: "none", res: null, demo: null, anim: 0, runs: 0, shown: false }); },
    draw(c) {
      const { s, F, B } = c, R = F.res, D = F.demo, g = B.goals, kids = [];
      const fx = (t) => FX0 + (t / 600) * (FX1 - FX0), now = D ? F.anim * 600 : 0;
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "One busy product, 10 minutes"), s("text", { class: "ev-sub", x: 40, y: 94 }, D ? (F.where === "local" ? "its copy in 6 of the 50 app servers" : "its copy in the shared Redis") : "run it to watch its price"));
      const lanes = D ? D.lanes : [];
      const LY = 132, LH = F.where === "local" || !D ? 30 : 44;
      // the database: the real price, and the two edits
      kids.push(s("text", { class: "cc-lane", x: 40, y: LY + 18 }, "database"));
      const prices = [[0, 100, "£30"], [100, 370, "£25"], [370, 600, "£28"]];
      for (const [a, b, p] of prices) if (!D || now > a) kids.push(s("rect", { class: "cc-dbseg", x: fx(a), y: LY, width: fx(Math.min(b, D ? now : b)) - fx(a), height: 26, rx: 3 }), s("text", { class: "cc-segt", x: fx(a) + 6, y: LY + 17 }, p));
      for (const e of [100, 370]) kids.push(s("path", { class: "cc-edit", d: `M${fx(e)} ${LY - 6}V${LY + 40 + Math.max(1, lanes.length) * (LH + 8)}` }), s("text", { class: "cc-sm", x: fx(e) + 4, y: LY - 8 }, "edited"));
      lanes.forEach((l, i) => {
        const y = LY + 40 + i * (LH + 8);
        kids.push(s("text", { class: "cc-lane", x: 40, y: y + LH / 2 + 4 }, F.where === "local" ? `app ${[3, 11, 17, 24, 38, 46][i]}` : "Redis"));
        for (const sg of l.segs) {
          if (sg.a >= now) continue;
          const b = Math.min(sg.b, now), w = fx(b) - fx(sg.a);
          if (w <= 0) continue;
          kids.push(s("rect", { class: "cc-seg" + (sg.ok ? "" : " stale"), x: fx(sg.a), y, width: Math.max(0.8, w - 0.8), height: LH, rx: 2 }));
          if (w > 30) kids.push(s("text", { class: "cc-segt" + (sg.ok ? "" : " stale"), x: fx(sg.a) + 5, y: y + LH / 2 + 4 }, "£" + sg.v));
        }
      });
      if (D) {
        const y1 = LY + 40 + lanes.length * (LH + 8);
        kids.push(s("path", { class: "tw-now", d: `M${fx(now)} ${LY - 4}V${y1}` }));
        for (let t = 0; t <= 600; t += 120) kids.push(s("text", { class: "ev-tick", x: fx(t), y: y1 + 14, "text-anchor": "middle" }, t ? `${t / 60} min` : "0"));
        kids.push(s("text", { class: "cc-sm in", x: FX0, y: y1 + 30 }, "■ the right price"), s("text", { class: "cc-sm miss", x: FX0 + 120, y: y1 + 30 }, "■ an old price"));
      }
      // the whole shop, worked out
      const NX = 740, done = R && F.shown;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 152 }, "database reads a second"), s("text", { class: "wa-big" + (done && R.db > g.db ? " over" : ""), x: NX, y: 192 }, done ? fmtN(R.db) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 244 }, "reads with an old price"), s("text", { class: "wa-big" + (done && R.stale > g.stale ? " over" : ""), x: NX, y: 284 }, done ? (R.stale === 0 ? "none" : pc(R.stale, R.stale < 0.01 ? 2 : 1)) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 336 }, "the oldest price seen"), s("text", { class: "cc-big", x: NX, y: 368 }, done ? (R.oldest ? `${TT_WORD[R.oldest]} old` : "the latest") : "–"));
      // the whole shop on two rulers, each going up ten times a step, with its goal
      const GX0 = 230, GX1 = 690;
      kids.push(s("text", { class: "ev-h", x: 40, y: 452 }, "The whole shop"));
      for (const [i, name, lo, hi, v, goal, f] of [[0, "database reads a second", 1, 1e5, R && done ? R.db : null, g.db, fmtN], [1, "reads with an old price", 1e-5, 1, R && done ? R.stale : null, g.stale, (x) => pc(x, x < 0.01 ? 2 : 1)]]) {
        const y = 474 + i * 34, gx = (x) => GX0 + ((lg(Math.max(lo, Math.min(hi, x))) - lg(lo)) / (lg(hi) - lg(lo))) * (GX1 - GX0);
        kids.push(s("text", { class: "cc-lane", x: 40, y: y + 10 }, name), s("rect", { class: "ln-bt", x: GX0, y, width: GX1 - GX0, height: 14, rx: 4 }));
        if (v != null) kids.push(s("rect", { class: "ln-bf " + (v <= goal ? "ok" : "no"), x: GX0, y, width: Math.max(3, gx(v || lo) - GX0), height: 14, rx: 4 }), s("text", { class: "cc-sm", x: Math.min(GX1 - 4, gx(v || lo) + 6), y: y + 11 }, v === 0 ? "none" : f(v)));
        kids.push(s("path", { class: "ub-goal", d: `M${gx(goal)} ${y - 4}V${y + 18}` }), s("text", { class: "ev-tick", x: gx(goal) + 4, y: y - 6 }, "goal " + f(goal)));
      }
      if (done) kids.push(c.rx(goodF(c, R) ? "rocket" : R.stale > g.stale ? "ghost" : "flame", NX + 70, 400, 64, "pop"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.2 : 5));
      const first = F.anim >= 1 && !F.shown;
      if (first) F.shown = true;
      c.redraw();
      if (first) { if (goodF(c, R)) c.solved(ran(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.shown ? F.res : null, g = c.B.goals;
      const miss = R ? [R.db > g.db && `${fmtN(R.db)} reads a second reach the database`, R.stale > g.stale && `${pc(R.stale, 2)} of reads show an old price`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The picture is one popular product: its price in the database, and its copies. The numbers on the right are the whole shop, all 10,000 products."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; F.demo = null; F.shown = false; c.redraw(); c.rebrief(); };
      const run = () => { F.runs++; const o = { where: F.where, ttl: F.ttl, edit: F.edit }; F.res = CA.fresh(o); F.demo = CA.freshDemo(o); F.anim = 0; F.shown = false; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "keep product pages ", h("button", { class: "sd-word", onclick: () => set("where", cyc(CA.WHERES, F.where)) }, W_WORD[F.where])),
        h("p", {}, "for ", h("button", { class: "sd-word", onclick: () => set("ttl", cyc(CA.FTTLS, F.ttl)) }, TT_WORD[F.ttl])),
        h("p", {}, "when a price is edited, ", h("button", { class: "sd-word", onclick: () => set("edit", cyc(CA.EDITS, F.edit)) }, E_WORD[F.edit]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && !F.shown, onclick: run }, "Run it"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.shown ? c.F.res : null, g = c.B.goals;
      return [[`at most ${g.db} reads a second on the database`, R ? R.db <= g.db : null, R ? fmtN(R.db) : "run it"], [`at most ${pc(g.stale, 1)} old prices`, R ? R.stale <= g.stale : null, R ? pc(R.stale, 2) : "·"]];
    },
  };
  const goodF = (c, R) => R.db <= c.B.goals.db && R.stale <= c.B.goals.stale;
})();

// ---------------------------------------------------------------------------------------- Splitting data --
// The Splitting data unit's own kinds; tunnel/split.js does the working out.
(function () {
  "use strict";
  const UI = window.SD.UI, SP = window.SPLIT;
  const lg = Math.log10;
  const cyc = (L, v) => L[(L.indexOf(v) + 1) % L.length];
  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const pc = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const ran = (n) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  function dragger(c, on) {
    c.svg.addEventListener("pointermove", (e) => { if (c.isNow() && c.F.drag) on(c.pt(e)); });
    const up = () => { if (c.isNow() && c.F.drag) { c.F.drag = false; c.redraw(); } };
    c.svg.addEventListener("pointerup", up);
    c.svg.addEventListener("pointercancel", up);
  }
  const grab = (c, on) => (e) => { c.F.drag = true; try { c.svg.setPointerCapture(e.pointerId); } catch (err) {} on(c.pt(e)); e.preventDefault(); e.stopPropagation(); };

  // keys round a ring: the first ND keys as dots, three rows deep, each in its server's colour. A dot is a zero-length
  // line with round ends, and every dot of one colour goes in one path, so hundreds of them redraw cheaply.
  const ND = 720;
  const dotXY = (p, i, cx, cy, R, out = 0) => { const a = 2 * Math.PI * p - Math.PI / 2, r = R + ((i % 3) - 1) * 8 + out; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  function paint(s, groups, base) {
    const out = [];
    for (const [k, xs] of Object.entries(groups)) {
      let d = "";
      for (let j = 0; j < xs.length; j += 2) d += `M${xs[j].toFixed(1)} ${xs[j + 1].toFixed(1)}h0`;
      out.push(s("path", { class: `${base} ${k}`, d }));
    }
    return out;
  }
  const put = (g, k, x, y) => (g[k] = g[k] || []).push(x, y);
  // a ring's points: one marker per server when there's one each, a fine tick per point when there are 200
  function marks(s, n, v, cx, cy, R, fresh) {
    const kids = [], pts = SP.points(n, v);
    if (v === 1) {
      for (const q of pts) {
        const a = 2 * Math.PI * q.p - Math.PI / 2, x = cx + (R + 30) * Math.cos(a), y = cy + (R + 30) * Math.sin(a);
        kids.push(s("path", { class: "sp-spoke s" + q.s, d: `M${cx + (R + 14) * Math.cos(a)} ${cy + (R + 14) * Math.sin(a)}L${x} ${y}` }),
          s("circle", { class: "sp-mark s" + q.s + (fresh && q.s === n - 1 ? " in" : ""), cx: x, cy: y, r: 8 }),
          s("text", { class: "sp-mk yt-halo", x: cx + (R + 50) * Math.cos(a), y: cy + (R + 50) * Math.sin(a) + 4, "text-anchor": "middle" }, String(q.s + 1)));
      }
      return kids;
    }
    const by = {};
    for (const q of pts) {
      const a = 2 * Math.PI * q.p - Math.PI / 2, c0 = Math.cos(a), s0 = Math.sin(a);
      by[q.s] = (by[q.s] || "") + `M${(cx + (R + 15) * c0).toFixed(1)} ${(cy + (R + 15) * s0).toFixed(1)}L${(cx + (R + 24) * c0).toFixed(1)} ${(cy + (R + 24) * s0).toFixed(1)}`;
    }
    for (const [k, d] of Object.entries(by)) kids.push(s("path", { class: "sp-tick s" + k + (fresh && +k === n - 1 ? " in" : ""), d }));
    return kids;
  }

  // ---------------------------------------------------------------------------------------------- add a server --
  const RCX = 236, RCY = 300, RR = 142;
  const RX0 = 520, RX1 = 900, RY = 474;
  const rx = (g) => RX0 + clamp(g) * (RX1 - RX0), rxi = (x) => clamp((x - RX0) / (RX1 - RX0));
  const truthR = (r) => (r.ask === "move" ? SP.moved(r.scheme, r.v, 4, 5).all : SP.fullest("ring", 5, r.v));
  const closeR = (r, g) => Math.abs(g - truthR(r)) <= 0.07;
  const END = { ask: "end", scheme: "ring", v: 200 };
  UI.ring = {
    init(c) {
      Object.assign(c.F, { round: 0, guess: 0.5, checked: false, rights: [], picks: [], drag: false, t: 0 });
      if (c.done()) { c.F.round = c.B.rounds.length; c.F.rights = c.B.rounds.map(() => true); c.F.picks = c.B.rounds.map(truthR); c.F.t = 9; }
      dragger(c, (p) => moveR(c, p));
    },
    draw(c) {
      const { s, F, B } = c, kids = [], R = B.rounds, over = F.round >= R.length, r = over ? END : R[F.round];
      const isMove = r.ask === "move", ph = isMove ? (F.checked ? ease((F.t - 0.2) / 2.2) : 0) : 1;
      const A = SP.layout(r.scheme, isMove ? 4 : 5, r.v), L5 = SP.layout(r.scheme, 5, r.v), { KP } = SP.keys();
      const n = isMove && ph < 0.5 && !F.checked ? 4 : 5;
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, `100,000 keys on ${n === 4 ? "4" : "5"} servers`),
        s("text", { class: "ev-sub", x: 40, y: 94 }, r.scheme === "mod" ? "each dot is a key, in its server's colour" : `each server sits at ${r.v === 1 ? "one point" : r.v + " points"} round the ring`));
      // the keys
      const g = {};
      for (let i = 0; i < ND; i++) {
        const a = A.own[i], b = L5.own[i], mv = a !== b, own = mv && ph >= 0.5 ? b : a;
        const [x, y] = dotXY(KP[i], i, RCX, RCY, RR, mv ? Math.sin(Math.PI * ph) * 20 : 0);
        put(g, "s" + own + (mv && ph > 0 && ph < 1 ? " mv" : ""), x, y);
      }
      kids.push(...paint(s, g, "sp-dot"));
      // the servers: a ring's points, or the rule in the middle
      if (r.scheme === "ring") kids.push(...marks(s, n, r.v, RCX, RCY, RR, isMove && F.checked));
      const mvShare = isMove ? SP.moved(r.scheme, r.v, 4, 5).all : 0;
      if (r.scheme === "mod") kids.push(s("text", { class: "sp-rule", x: RCX, y: RCY - 4, "text-anchor": "middle" }, `hash % ${n}`));
      else kids.push(s("text", { class: "sp-rule sm", x: RCX, y: RCY - 10, "text-anchor": "middle" }, "a key goes to"), s("text", { class: "sp-rule sm", x: RCX, y: RCY + 8, "text-anchor": "middle" }, "the next point clockwise"));
      if (isMove && F.checked) kids.push(s("text", { class: "sp-moved yt-halo", x: RCX, y: RCY + 36, "text-anchor": "middle" }, `${fmtN(Math.round(mvShare * 1e5 * ph))} keys moved`));
      // the keys on each server
      kids.push(s("text", { class: "ev-h", x: RX0, y: 140 }, "Keys on each server"));
      for (let i = 0; i < 5; i++) {
        const y = 158 + i * 34, sh = (A.share[i] || 0) * (1 - ph) + L5.share[i] * ph, ghost = i === 4 && n === 4;
        kids.push(s("text", { class: "sp-sn s" + i + (ghost ? " ghost" : ""), x: RX0, y: y + 12 }, `cache-${i + 1}`), s("rect", { class: "ln-bt" + (ghost ? " sp-ghost" : ""), x: RX0 + 74, y, width: 240, height: 16, rx: 4 }));
        if (ghost) kids.push(s("text", { class: "cc-sm", x: RX0 + 82, y: y + 12 }, "joins when you check"));
        else kids.push(s("rect", { class: "sp-bar s" + i, x: RX0 + 74, y, width: Math.max(2, (sh / 0.4) * 240), height: 16, rx: 4 }), s("text", { class: "cc-sm", x: RX0 + 322, y: y + 12 }, pc(sh, 1)));
      }
      kids.push(s("path", { class: "ub-goal", d: `M${RX0 + 74 + 120} 152V${158 + 5 * 34 - 10}` }), s("text", { class: "ev-tick", x: RX0 + 74 + 124, y: 158 + 5 * 34 + 2 }, "20%, a fair share of 5"));
      // the ruler
      if (!over) {
        kids.push(s("text", { class: "cc-given", x: RX0, y: RY - 40 }, r.ask === "move" ? "the share of keys that move" : "the fullest server's share"));
        kids.push(s("path", { class: "ub-axis", d: `M${RX0} ${RY}H${RX1}` }));
        for (let k = 0; k <= 10; k++) kids.push(s("path", { class: "cc-grid sp-rt", d: `M${rx(k / 10)} ${RY - (k % 5 ? 4 : 8)}V${RY + 4}` }));
        for (let k = 0; k <= 10; k += 2) kids.push(s("text", { class: "ev-tick", x: rx(k / 10), y: RY + 18, "text-anchor": "middle" }, k * 10 + "%"));
        if (!F.checked) {
          const x = rx(F.guess);
          kids.push(s("rect", { class: "cc-hit", x: RX0 - 24, y: RY - 34, width: RX1 - RX0 + 48, height: 60, onpointerdown: grab(c, (p) => moveR(c, p)) }));
          kids.push(s("path", { class: "cc-stem", d: `M${x} ${RY - 14}V${RY + 6}` }), s("circle", { class: "cc-pin" + (F.drag ? " drag" : ""), cx: x, cy: RY - 14, r: 9 }));
          kids.push(s("text", { class: "cc-read yt-halo", x, y: RY - 30, "text-anchor": "middle" }, pc(F.guess) + "?"));
        } else {
          const t = truthR(r), ok = F.rights[F.round];
          kids.push(s("path", { class: "cc-miss" + (ok ? " ok" : ""), d: `M${rx(F.guess)} ${RY - 14}L${rx(t)} ${RY - 14}` }), s("circle", { class: "cc-pin was" + (ok ? " ok" : " no"), cx: rx(F.guess), cy: RY - 14, r: 6 }),
            s("circle", { class: "cc-true", cx: rx(t), cy: RY - 14, r: 7 }), s("text", { class: "cc-tl yt-halo", x: rx(t), y: RY - 30, "text-anchor": "middle" }, pc(t)));
        }
      } else {
        const sh = L5.share;
        kids.push(s("text", { class: "cc-tl", x: RX0, y: RY - 24 }, `200 points each: every server holds ${pc(Math.min(...sh))} to ${pc(Math.max(...sh))}`),
          s("text", { class: "cc-tl", x: RX0, y: RY - 6 }, `and adding one moved ${pc(SP.moved("ring", 200, 4, 5).all)}, the least it could`), c.rx("trophy", RX1 - 70, RY - 112, 70, "pop"));
      }
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.checked || F.t >= 3) return;
      F.t = Math.min(3, F.t + dt * (c.REDUCED ? 20 : 1));
      c.redraw();
    },
    brief(c) {
      const { h, F, B } = c, R = B.rounds;
      if (F.round >= R.length) return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, `${F.rights.filter(Boolean).length} of ${R.length} guesses close. Lots of points per server: few keys move, and every server gets its share.`))];
      const r = R[F.round], t = truthR(r);
      return [h("div", { class: "sd-ask" }, h("small", {}, `guess ${F.round + 1} of ${R.length}`), h("p", { html: r.say }),
        !F.checked ? h("p", { class: "sd-quiet" }, "Drag the pin along the ruler.") :
          h("p", { class: "sd-verdict " + (F.rights[F.round] ? "ok" : "no") }, (F.rights[F.round] ? "✓ Close. " : "✗ Not quite. ") + (r.ask === "move" ? `${pc(t)} of the keys move.` : `The fullest holds ${pc(t)}, and the emptiest ${pc(Math.min(...SP.layout("ring", 5, 1).share))}.`)))];
    },
    tools(c) {
      const { h, F, B } = c, R = B.rounds;
      if (F.round >= R.length) return [];
      if (!F.checked) return [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => checkR(c) }, R[F.round].ask === "move" ? "Check, and add the 5th" : "Check my guess"))];
      return [h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: () => nextR(c) }, F.round === R.length - 1 ? "Give them 200 points each" : "Next guess →"))];
    },
  };
  function moveR(c, p) { const F = c.F; if (F.round >= c.B.rounds.length || F.checked) return; F.guess = rxi(p.x); c.redraw(); }
  function checkR(c) { const F = c.F, r = c.B.rounds[F.round]; F.checked = true; F.t = 0; F.rights[F.round] = closeR(r, F.guess); F.picks[F.round] = F.guess; c.redraw(); c.rebrief(); }
  function nextR(c) {
    const F = c.F, R = c.B.rounds;
    F.round++; F.checked = false; F.guess = 0.5; F.t = 0;
    if (F.round >= R.length) { const n = F.rights.filter(Boolean).length; c.solved(n === R.length ? 3 : n >= R.length - 1 ? 2 : 1); }
    c.redraw(); c.rebrief();
  }

  // -------------------------------------------------------------------------------------------------- which key --
  const KEY_WORD = {
    time: ["a range of time", "each partition holds a stretch of time; the newest is the last"],
    idrange: ["a range of van ids", "a–c, d–f, g–i … v–z"],
    hashread: ["a hash of each reading", "each reading goes wherever its hash says"],
    hashvan: ["a hash of the van id", "and each van's readings in time order inside"],
  };
  const PX0 = 446, PW = 42, PG = 12, PB = 380, PS = 110 / 2500, PMAX = 220;
  const pcx = (i) => PX0 + i * (PW + PG) + PW / 2;
  const PLAB = { time: ["…", "…", "…", "…", "…", "…", "…", "now"], idrange: ["a–c", "d–f", "g–i", "j–l", "m–o", "p–r", "s–u", "v–z"] };
  const plab = (k, i) => (PLAB[k] ? PLAB[k][i] : "#" + i);
  const FALL = 160;
  UI.pkey = {
    init(c) {
      Object.assign(c.F, { R: SP.pkey(), pick: null, picks: [], t: 0 });
      if (c.done()) Object.assign(c.F, { pick: c.B.answer, picks: [c.B.answer], t: 99, won: true });
    },
    draw(c) {
      const { s, h, F, B } = c, kids = [], R = F.R;
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "The partition key"), s("text", { class: "ev-sub", x: 40, y: 94 }, F.pick ? "tap another to try it" : "tap the one you'd pick"));
      SP.KEYS_P.forEach((id, i) => {
        const seen = F.picks.includes(id), cur = F.pick === id, r = R[id];
        const card = h("button", { class: "cc-ord sp-card" + (cur ? " cur" : "") + (seen ? (id === B.answer ? " best" : " bad") : ""), xmlns: "http://www.w3.org/1999/xhtml", onclick: () => pickK(c, id) },
          h("b", {}, KEY_WORD[id][0]), h("small", {}, seen ? `busiest ${fmtN(r.busiest)} a second · one van's hour: ${r.one === 1 ? "1 partition" : "all " + r.one}` : KEY_WORD[id][1]));
        kids.push(s("foreignObject", { x: 36, y: 108 + i * 78, width: 336, height: 70, class: "sc-fo" }, card));
      });
      kids.push(s("text", { class: "ev-h", x: PX0, y: 76 }, "8 partitions, one second"), s("text", { class: "ev-sub", x: PX0, y: 94 }, "each dot is a reading; amber ones are Acme's vans"));
      // the cap, and the columns filling
      const capY = PB - 2500 * PS, right = PX0 + 8 * (PW + PG) - PG;
      kids.push(s("path", { class: "ub-goal", d: `M${PX0 - 8} ${capY}H${right + 8}` }), s("text", { class: "ev-tick", x: PX0 - 12, y: capY + 4, "text-anchor": "end" }, "2,500"));
      kids.push(s("path", { class: "ub-axis", d: `M${PX0 - 8} ${PB}H${right + 8}` }));
      const k = F.pick, r = k ? R[k] : null, fr = k ? ease(F.t / 2.4) : 0;
      for (let i = 0; i < 8; i++) {
        const x = PX0 + i * (PW + PG), n = r ? r.counts[i] * fr : 0, hh = Math.min(PMAX, n * PS), over = r && r.counts[i] > 2500;
        kids.push(s("rect", { class: "sp-col", x, y: PB - PMAX, width: PW, height: PMAX, rx: 5 }));
        if (hh > 0) kids.push(s("rect", { class: "sp-fill" + (over ? " over" : ""), x, y: PB - hh, width: PW, height: hh, rx: 5 }));
        if (r && fr > 0.05) kids.push(s("text", { class: "sp-cnt" + (over ? " over" : ""), x: x + PW / 2, y: PB - hh - 7, "text-anchor": "middle" }, (n * PS > PMAX ? "▲ " : "") + fmtN(n)));
        kids.push(s("text", { class: "cc-sm", x: x + PW / 2, y: PB + 15, "text-anchor": "middle" }, plab(k || "hashvan", i)));
        if (over && fr >= 1) kids.push(c.rx("flame", x + PW / 2 - 16, PB - hh - 50, 32));
      }
      // a few vans' readings falling into place
      if (r && F.t < 3.2) {
        const FL = SP.fleet(), g = {};
        for (let j = 0; j < FALL; j++) {
          const at = j * 0.012, e = (F.t - at) / 0.5;
          if (e <= 0 || e >= 1) continue;
          const vi = FL.order[j], part = SP.partOf(k, FL.ids[vi]), x = pcx(part) + (((j * 37) % 26) - 13), y0 = 112, y1 = PB - Math.min(PMAX, r.counts[part] * PS * fr);
          put(g, FL.who[vi] === 0 ? "acme" : "van", x, y0 + (y1 - y0) * e * e);
        }
        kids.push(...paint(s, g, "sp-fall"));
      }
      // one van's last hour: the partitions it asks
      if (r && F.t > 2.4) {
        const hub = [PX0 + 4 * (PW + PG) - PG / 2, 452], q = SP.fleet().ids[7], parts = new Set();
        for (let t = 0; t < 3600; t += 1) parts.add(SP.partOf(k, q, 1763200000 - t));
        for (const p of parts) kids.push(s("path", { class: "sp-ask", d: `M${hub[0]} ${hub[1]}L${pcx(p)} ${PB + 24}` }));
        kids.push(s("circle", { class: "sp-hub", cx: hub[0], cy: hub[1], r: 6 }), s("text", { class: "cc-tl yt-halo", x: hub[0], y: hub[1] + 24, "text-anchor": "middle" }, `one van's last hour asks ${parts.size === 1 ? "1 partition" : "all " + parts.size}`));
      }
      if (r && F.t > 2.4) {
        const good = r.busiest <= 2500 && r.one === 1;
        kids.push(s("text", { class: "cc-sm", x: 40, y: 446 }, "the busiest partition"), s("text", { class: "sp-num" + (r.busiest > 2500 ? " over" : ""), x: 40, y: 472 }, `${fmtN(r.busiest)} a second`));
        kids.push(c.rx(good ? "thumbs" : r.busiest > 2500 ? "flame" : "snail", 290, 424, 56, "pop"));
      }
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F;
      if (!F.pick || F.t >= 4) return;
      F.t = Math.min(4, F.t + dt * (c.REDUCED ? 20 : 1));
      c.redraw();
    },
    brief(c) {
      const { h, F, B } = c;
      if (!F.pick) return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each card is a way to choose which partition a reading goes to. The columns are the 8 partitions, and the dashed line is the most one can take."))];
      const r = F.R[F.pick], ok = F.pick === B.answer;
      const why = r.busiest > 2500 ? `one partition gets ${fmtN(r.busiest)} writes a second` : `one van's hour is spread over all ${r.one} partitions`;
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-verdict " + (ok ? "ok" : "no") }, ok ? "✓ Even writes, and a van's hour in one place." : `✗ ${why[0].toUpperCase() + why.slice(1)}.${F.picks.includes(B.answer) ? "" : " Try another key."}`))];
    },
    tools() { return []; },
  };
  function pickK(c, id) {
    const F = c.F;
    if (!F.picks.includes(id)) F.picks.push(id);
    F.pick = id; F.t = 0;
    if (id === c.B.answer && !F.won) { F.won = true; c.solved(F.picks.length === 1 ? 3 : F.picks.length === 2 ? 2 : 1); }
    c.redraw(); c.rebrief();
  }

  // --------------------------------------------------------------------------------------------- grow the cache --
  const SC_WORD = { mod: "hash % N", ring1: "a ring, one point per server", ring200: "a ring, 200 points per server" };
  const HOW_WORD = { now: "switch it on at once", copy: "copy its keys over first, then switch it on" };
  const GCX = 210, GCY = 266, GR0 = 118;
  const VX = 470, VW = 30, VG = 14, VB = 340, VH = 150;
  const TX0 = 40, TX1 = 700, TB = 506, TH = 56;
  UI.grow = {
    init(c) { Object.assign(c.F, { scheme: "mod", how: "now", res: null, dots: null, anim: 0, runs: 0, memo: {}, shown: false }); },
    draw(c) {
      const { s, F, B } = c, R = F.res, G = SP.GR, g = B.goals, kids = [];
      const now = R ? playG(R, F.anim) : 0, bi = R ? Math.min(R.bins.length - 1, Math.floor(now / G.bin)) : 0, b = R ? R.bins[bi] : null;
      const after = R && now >= R.cut, copying = R && now >= G.at && now < R.cut, n = after ? 5 : 4;
      const [sc, v] = F.scheme === "mod" ? ["mod", 0] : ["ring", F.scheme === "ring1" ? 1 : 200];
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, `1,000,000 sessions on ${n} servers`),
        s("text", { class: "ev-sub", x: 40, y: 94 }, !R ? "add the 5th server to watch them" : copying ? "copying the 5th server's keys over" : after ? `${Math.floor(now)} s · ${R.cold0 ? "grey keys are missing, waiting for a read to fill them" : "every key was already on its new server"}` : `${Math.floor(now)} s · the peak; the 5th server is coming`));
      // the keys
      const D = F.dots || SP.growDots(F.scheme, ND), cold = R && R.cold0 > 0 && b ? b.cold / R.cold0 : 0, gg = {};
      D.forEach((d, i) => {
        const mv = d.a !== d.b, [x, y] = dotXY(d.p, i, GCX, GCY, GR0);
        let k = "s" + d.a;
        if (R && mv) {
          if (copying && d.b === 4) k = "s4 mv";
          else if (after) k = (F.how === "now" || d.b !== 4) && d.q < cold ? "gone" : "s" + d.b;
        }
        put(gg, k, x, y);
      });
      kids.push(...paint(s, gg, "sp-dot"));
      if (sc === "ring") kids.push(...marks(s, after || copying ? 5 : 4, v, GCX, GCY, GR0, copying || (after && now - R.cut < 1.5)));
      if (sc === "mod") kids.push(s("text", { class: "sp-rule", x: GCX, y: GCY + 6, "text-anchor": "middle" }, `hash % ${n}`));
      else kids.push(s("text", { class: "sp-rule sm", x: GCX, y: GCY - 4, "text-anchor": "middle" }, "next point"), s("text", { class: "sp-rule sm", x: GCX, y: GCY + 14, "text-anchor": "middle" }, "clockwise"));
      // how busy each server is
      const load = !R ? SP.layout(sc, 4, v).share.map((x) => x * G.rate) : after ? R.after : R.before;
      kids.push(s("text", { class: "ev-h", x: VX - 10, y: 140 }, "Each server"), s("text", { class: "ev-sub", x: VX - 10, y: 158 }, "how busy, of the 60,000 reads a second each takes"));
      for (let i = 0; i < 5; i++) {
        const x = VX + i * (VW + VG), l = load[i] || 0, f = l / G.cap, hh = Math.min(VH * 1.2, f * VH);
        kids.push(s("rect", { class: "sp-col", x, y: VB - VH * 1.2, width: VW, height: VH * 1.2, rx: 4 }));
        if (hh > 0) kids.push(s("rect", { class: "sp-bar s" + i + (f > 1 ? " over" : ""), x, y: VB - hh, width: VW, height: hh, rx: 4 }));
        kids.push(s("text", { class: "sp-sn s" + i + (i === 4 && !after ? " ghost" : ""), x: x + VW / 2, y: VB + 16, "text-anchor": "middle" }, String(i + 1)));
        if (l > 0) kids.push(s("text", { class: "cc-sm", x: x + VW / 2, y: VB - hh - 6, "text-anchor": "middle" }, pc(f)));
        if (f > 1) kids.push(c.rx("flame", x - 1, VB - hh - 52, 32));
      }
      const gx1 = VX + 5 * (VW + VG) - VG;
      kids.push(s("path", { class: "ub-goal", d: `M${VX - 6} ${VB - g.busy * VH}H${gx1 + 6}` }), s("text", { class: "ev-tick", x: gx1 + 10, y: VB - g.busy * VH + 4 }, "goal 80%"));
      kids.push(s("path", { class: "sp-full", d: `M${VX - 6} ${VB - VH}H${gx1 + 6}` }), s("text", { class: "ev-tick", x: gx1 + 10, y: VB - VH + 4 }, "full"));
      // the database's misses over the minute
      kids.push(s("text", { class: "ev-sub", x: TX0, y: TB - TH - 12 }, "misses a second asking the database (taller is ten times more); past the dashed line they fail"));
      kids.push(s("path", { class: "ub-axis", d: `M${TX0} ${TB}H${TX1}` }));
      const top = lg(200000), ly = (q) => TB - (lg(1 + q) / top) * TH;
      kids.push(s("path", { class: "ub-goal", d: `M${TX0} ${ly(G.db)}H${TX1}` }), s("text", { class: "ev-tick", x: TX1 + 6, y: ly(G.db) + 4 }, "20,000"));
      for (let t = 0; t <= G.T; t += 10) kids.push(s("text", { class: "ev-tick", x: TX0 + (t / G.T) * (TX1 - TX0), y: TB + 16, "text-anchor": "middle" }, t + " s"));
      if (R) {
        const bw = (TX1 - TX0) / R.bins.length;
        R.bins.forEach((x, i) => { if (i > bi || !x.miss) return; const hh = Math.max(2, (lg(1 + x.miss) / top) * TH); kids.push(s("rect", { class: "cc-tq" + (x.miss > G.db ? " err" : ""), x: TX0 + i * bw, y: TB - hh, width: Math.max(1.4, bw - 0.4), height: hh })); });
        const ax = TX0 + (G.at / G.T) * (TX1 - TX0);
        kids.push(s("path", { class: "sp-at", d: `M${ax} ${TB - TH - 4}V${TB}` }), s("path", { class: "tw-now", d: `M${TX0 + (now / G.T) * (TX1 - TX0)} ${TB - TH - 4}V${TB}` }));
      }
      // the numbers
      const NX = 760, done = R && F.shown, errs = R ? sumG(R, bi) : 0, busy = R ? Math.max(...(after ? R.after : R.before)) / G.cap : 0;
      kids.push(s("text", { class: "wa-mn", x: NX, y: 152 }, "failed reads"), s("text", { class: "wa-big" + (errs > g.errors ? " over" : ""), x: NX, y: 192 }, R ? fmtN(errs) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 244 }, "the busiest server"), s("text", { class: "wa-big" + (busy > g.busy ? " over" : ""), x: NX, y: 284 }, R ? pc(busy) : "–"));
      kids.push(s("text", { class: "wa-mn", x: NX, y: 336 }, "keys that moved"), s("text", { class: "cc-big", x: NX, y: 368 }, R && now >= G.at ? pc(R.moved.all) : "–"));
      if (done) kids.push(c.rx(goodG(c, R) ? "rocket" : R.dbErr > 0 ? "flame" : "snail", NX + 70, 390, 64, "pop"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.3 : 8));
      const first = F.anim >= 1 && !F.shown;
      if (first) F.shown = true;
      c.redraw();
      if (first) { if (goodG(c, R)) c.solved(ran(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.shown ? F.res : null, g = c.B.goals;
      const miss = R ? [R.errors > g.errors && `${fmtN(R.errors)} reads failed`, R.busiest > g.busy * SP.GR.cap && `the busiest server is ${pc(R.busiest / SP.GR.cap)} busy`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "The dots are 720 of the sessions, round the ring of hashes. At 10 s the 5th server joins; a grey dot has moved and isn't on its new server yet."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; F.shown = false; if (k === "scheme") F.dots = SP.growDots(v, ND); c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.scheme}:${F.how}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = prepG(SP.grow({ scheme: F.scheme, how: F.how }))); F.dots = SP.growDots(F.scheme, ND); F.anim = 0; F.shown = false; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "a key finds its server by ", h("button", { class: "sd-word", onclick: () => set("scheme", cyc(SP.SCHEMES, F.scheme)) }, SC_WORD[F.scheme])),
        h("p", {}, "the 5th server joins: ", h("button", { class: "sd-word", onclick: () => set("how", cyc(SP.HOWS, F.how)) }, HOW_WORD[F.how]))),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && !F.shown, onclick: run }, "Add the 5th server"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.shown ? c.F.res : null, g = c.B.goals;
      return [["no failed reads", R ? R.errors <= g.errors : null, R ? fmtN(R.errors) : "run it"], [`no server over ${pc(g.busy)}`, R ? R.busiest <= g.busy * SP.GR.cap : null, R ? pc(R.busiest / SP.GR.cap) : "·"]];
    },
  };
  const goodG = (c, R) => R.errors <= c.B.goals.errors && R.busiest <= c.B.goals.busy * SP.GR.cap;
  // playback: quick through the calm, slow while keys are missing and around the moment it joins
  function prepG(R) {
    const w = R.bins.map((b) => (b.miss > 1 || Math.abs(b.t - SP.GR.at) < 1.5 || (b.t >= SP.GR.at && b.t < R.cut + 1) ? 5 : 1)), cum = [0];
    for (const x of w) cum.push(cum[cum.length - 1] + x);
    R.play = { w, cum };
    return R;
  }
  function playG(R, f) {
    const { w, cum } = R.play, at = f * cum[cum.length - 1];
    let i = 0; while (i < w.length - 1 && cum[i + 1] < at) i++;
    return Math.min(SP.GR.T, (i + (at - cum[i]) / w[i]) * SP.GR.bin);
  }
  const sumG = (R, bi) => { let n = 0; for (let i = 0; i <= bi; i++) n += R.bins[i].err; return n; };

  // ------------------------------------------------------------------------------------------------ Friday night --
  const BY_WORD = { area: "neighbouring streets together (ranges of the map)", driver: "a hash of the driver's id" };
  const SPL_WORD = { never: "never", 0.9: "when it passes 90% busy", 0.5: "when it passes 50% busy" };
  const MX = 40, MY = 116, CS = 18, SIDE = 16;
  const BX0 = 404, BX1 = 900, BB = 336, BH = 120;
  const HX0 = 404, HX1 = 900, HB = 492, HH = 80;
  const RIDER = [10, 5];
  UI.hotcell = {
    init(c) { Object.assign(c.F, { by: "area", split: "never", res: null, anim: 0, runs: 0, memo: {}, shown: false }); },
    draw(c) {
      const { s, F, B } = c, R = F.res, H = SP.HC, g = B.goals, kids = [];
      const now = R ? Math.min(H.T, playH(F.anim)) : 0, fr = R ? R.frames[Math.floor(now)] : null;
      const P = fr ? fr.parts : Array.from({ length: 16 }, (_, i) => [i * 16, i * 16 + 16, 0, 0]);
      const own = new Int16Array(256); P.forEach((p, i) => { for (let d = p[0]; d < p[1]; d++) own[d] = i; });
      const area = F.by === "area";
      kids.push(s("text", { class: "ev-h", x: 40, y: 76 }, "The city"), s("text", { class: "ev-sub", x: 40, y: 94 }, !R ? "one colour per partition; run the night to watch it" : `${clock(now)} · ${P.length} partitions`));
      // the cells: a partition's colour, the crowd's heat on top
      const cellsBy = {}, heat = {};
      for (let d = 0; d < 256; d++) {
        const [x, y] = SP.XY[d], px = MX + x * CS, py = MY + y * CS, l = SP.cellLoad(d, now), k = area ? "p" + (own[d] % 6) : "mix";
        cellsBy[k] = (cellsBy[k] || "") + `M${px} ${py}h${CS}v${CS}h${-CS}Z`;
        const hl = clamp(l / 1600, 0, 0.9), hk = Math.round(hl * 10);
        if (hk > 1) heat[hk] = (heat[hk] || "") + `M${px + 1} ${py + 1}h${CS - 2}v${CS - 2}h${-(CS - 2)}Z`;
      }
      for (const [k, d] of Object.entries(cellsBy)) kids.push(s("path", { class: "sp-cell " + k, d }));
      for (const [k, d] of Object.entries(heat)) kids.push(s("path", { class: "sp-heat", d, style: `opacity:${k / 10}` }));
      // the borders between partitions, and the ones over their limit
      if (area) {
        let d = "";
        for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
          const o = own[SP.DOF[y * SIDE + x]];
          if (x < SIDE - 1 && own[SP.DOF[y * SIDE + x + 1]] !== o) d += `M${MX + (x + 1) * CS} ${MY + y * CS}v${CS}`;
          if (y < SIDE - 1 && own[SP.DOF[(y + 1) * SIDE + x]] !== o) d += `M${MX + x * CS} ${MY + (y + 1) * CS}h${CS}`;
        }
        kids.push(s("path", { class: "sp-border", d }));
        let od = "";
        P.forEach((p) => { if (p[2]) for (let dd = p[0]; dd < p[1]; dd++) { const [x, y] = SP.XY[dd]; od += `M${MX + x * CS} ${MY + y * CS}h${CS}v${CS}h${-CS}Z`; } });
        if (od) kids.push(s("path", { class: "sp-hotp", d: od }));
        P.forEach((p) => { if (p[3] > H.cap) for (let dd = p[0]; dd < p[1]; dd++) { const [x, y] = SP.XY[dd]; kids.push(s("rect", { class: "sp-over", x: MX + x * CS + 0.5, y: MY + y * CS + 0.5, width: CS - 1, height: CS - 1 })); } });
      }
      kids.push(s("rect", { class: "sp-frame", x: MX, y: MY, width: SIDE * CS, height: SIDE * CS, rx: 3 }));
      // the stadium, and one rider's nearby search
      const sx = MX + (H.cx + 0.5) * CS, sy = MY + (H.cy + 0.5) * CS;
      kids.push(s("circle", { class: "sp-stad", cx: sx, cy: sy, r: 6 }), s("text", { class: "cc-tl yt-halo", x: sx, y: sy - 12, "text-anchor": "middle" }, "stadium"));
      const [rx0, ry0] = RIDER, seen = new Set();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) seen.add(own[SP.DOF[(ry0 + dy) * SIDE + rx0 + dx]]);
      const asks = area ? seen.size : H.parts;
      kids.push(s("rect", { class: "sp-near", x: MX + (rx0 - 1) * CS, y: MY + (ry0 - 1) * CS, width: 3 * CS, height: 3 * CS, rx: 3 }), s("circle", { class: "sp-hub", cx: MX + (rx0 + 0.5) * CS, cy: MY + (ry0 + 0.5) * CS, r: 4 }));
      kids.push(s("text", { class: "cc-sm", x: MX, y: MY + SIDE * CS + 16 }, area ? `▢ a rider's nearby search asks ${asks} partition${asks > 1 ? "s" : ""}` : "every cell has drivers from all 16 partitions"));
      // the numbers, under the map
      const dropped = R ? dropTo(R, now) : 0, done = R && F.shown;
      [["updates dropped", R ? fmtN(dropped) : "–", dropped > 0], ["partitions", String(P.length), false], ["most a search asks", R ? (area ? maxSearch(R, now).toFixed(1) : "16") : "–", R && (area ? maxSearch(R, now) : 16) > g.search]].forEach(([k, v, bad], i) => {
        kids.push(s("text", { class: "cc-sm", x: MX + i * 104, y: 460 }, k), s("text", { class: "sp-num" + (bad ? " over" : ""), x: MX + i * 104, y: 486 }, v));
      });
      // every partition's load, in map order
      kids.push(s("text", { class: "ev-h", x: BX0, y: 140 }, "Each partition"), s("text", { class: "ev-sub", x: BX0, y: 158 }, "updates a second, in map order"));
      const n = P.length, bw = (BX1 - BX0) / n, cap = (x) => BB - Math.min(1.33, x) * BH;
      P.forEach((p, i) => {
        const f = p[3] / H.cap, hh = BB - cap(f);
        kids.push(s("rect", { class: "sp-pb " + (area ? "p" + (i % 6) : "mixb") + (f > 1 ? " over" : "") + (p[2] ? " splitting" : ""), x: BX0 + i * bw + 1, y: BB - hh, width: Math.max(1, bw - 2), height: hh, rx: 2 }));
      });
      kids.push(s("path", { class: "sp-full", d: `M${BX0} ${cap(1)}H${BX1}` }), s("text", { class: "ev-tick", x: BX1 + 4, y: cap(1) + 4 }, "full"));
      if (area && F.split !== "never") kids.push(s("path", { class: "ub-goal", d: `M${BX0} ${cap(+F.split)}H${BX1}` }), s("text", { class: "ev-tick", x: BX1 + 4, y: cap(+F.split) + 4 }, "split"));
      kids.push(s("path", { class: "ub-axis", d: `M${BX0} ${BB}H${BX1}` }));
      if (R && P.some((p) => p[2])) kids.push(s("text", { class: "cc-sm early", x: BX0, y: BB + 16 }, "▨ splitting: 10 s to copy half of it to a new partition"));
      // the busiest partition over the night
      kids.push(s("text", { class: "ev-sub", x: HX0, y: HB - HH - 14 }, "the busiest partition, as a share of what it takes"));
      const hy = (x) => HB - (Math.min(2.5, x) / 2.5) * HH, hx = (t) => HX0 + (t / H.T) * (HX1 - HX0);
      kids.push(s("path", { class: "ub-axis", d: `M${HX0} ${HB}H${HX1}` }), s("path", { class: "sp-full", d: `M${HX0} ${hy(1)}H${HX1}` }), s("text", { class: "ev-tick", x: HX1 + 4, y: hy(1) + 4 }, "100%"));
      for (let t = 0; t <= H.T; t += 60) kids.push(s("text", { class: "ev-tick", x: hx(t), y: HB + 16, "text-anchor": "middle" }, clock(t)));
      if (R) {
        let d = "", red = "";
        for (let t = 0; t <= Math.floor(now); t++) {
          const m = Math.max(...R.frames[t].parts.map((p) => p[3])) / H.cap;
          d += (t ? "L" : "M") + hx(t).toFixed(1) + " " + hy(m).toFixed(1);
          if (m > 1) red += `M${hx(t).toFixed(1)} ${hy(1).toFixed(1)}V${hy(m).toFixed(1)}`;
        }
        if (red) kids.push(s("path", { class: "sp-drop", d: red }));
        kids.push(s("path", { class: "sp-line", d }), s("path", { class: "tw-now", d: `M${hx(now)} ${HB - HH - 4}V${HB}` }));
      }
      if (fr && fr.drop > 0) kids.push(c.rx("flame", sx - 20, sy - 64, 40));
      if (done) kids.push(c.rx(goodH(c, R) ? "rocket" : R.dropped > 0 ? "flame" : "snail", 300, 424, 56, "pop"));
      c.layer.replaceChildren(...kids);
    },
    frame(c, dt) {
      const F = c.F, R = F.res;
      if (!R || F.anim >= 1) return;
      F.anim = Math.min(1, F.anim + dt / (c.REDUCED ? 0.3 : 10));
      const first = F.anim >= 1 && !F.shown;
      if (first) F.shown = true;
      c.redraw();
      if (first) { if (goodH(c, R)) c.solved(ran(F.runs)); else c.rebrief(); }
    },
    brief(c) {
      const { h, F } = c, R = F.res && F.shown ? F.res : null, g = c.B.goals;
      const miss = R ? [R.dropped > g.dropped && `${fmtN(R.dropped)} updates were dropped`, R.search > g.search && `a nearby search asks ${F.by === "area" ? R.search.toFixed(1) : "all 16"} partitions`].filter(Boolean) : [];
      return [h("div", { class: "sd-ask" }, h("p", { class: "sd-quiet" }, "Each colour on the map is a partition; red is where the drivers are. The concert ends at 9:00:40, and the crowd builds for a minute."),
        miss.length ? h("p", { class: "sd-verdict no" }, `✗ ${miss.join("; and ")}.`) : null)];
    },
    tools(c) {
      const { h, F } = c, set = (k, v) => { F[k] = v; F.res = null; F.shown = false; c.redraw(); c.rebrief(); };
      const run = () => { const key = `${F.by}:${F.split}`; F.runs++; F.res = F.memo[key] || (F.memo[key] = SP.hot({ by: F.by, split: F.split })); F.anim = 0; F.shown = false; c.redraw(); c.rebrief(); };
      return [h("div", { class: "sd-insp" },
        h("p", {}, "split drivers by ", h("button", { class: "sd-word", onclick: () => set("by", cyc(SP.BYS, F.by)) }, BY_WORD[F.by])),
        F.by === "area" ? h("p", {}, "split a partition in two ", h("button", { class: "sd-word", onclick: () => set("split", cyc(SP.SPLITS, F.split)) }, SPL_WORD[F.split])) : h("p", { class: "sd-quiet" }, "a hash already spreads drivers evenly, so there's nothing to split")),
        h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: F.res && !F.shown, onclick: run }, "Run Friday night"),
          h("span", { class: "sd-runs" }, F.runs ? `${F.runs} run${F.runs > 1 ? "s" : ""}` : ""))];
    },
    score(c) {
      const R = c.F.res && c.F.shown ? c.F.res : null, g = c.B.goals;
      return [["no updates dropped", R ? R.dropped <= g.dropped : null, R ? fmtN(R.dropped) : "run it"], [`a search asks at most ${g.search}`, R ? R.search <= g.search : null, R ? (c.F.by === "area" ? R.search.toFixed(1) : "16") : "·"]];
    },
  };
  const goodH = (c, R) => R.dropped <= c.B.goals.dropped && R.search <= c.B.goals.search;
  // playback: the quiet start goes by quickly, the crowd slowly
  const playH = (f) => { const q = SP.HC.from - 5, wq = 0.25, tot = q * wq + (SP.HC.T - q), at = f * tot; return at < q * wq ? at / wq : q + (at - q * wq); };
  const clock = (t) => `9:${String(Math.floor(t / 60)).padStart(2, "0")}${Math.floor(t % 60) ? ":" + String(Math.floor(t % 60)).padStart(2, "0") : ""} pm`;
  const dropTo = (R, now) => { let n = 0; for (let t = 0; t <= Math.floor(now); t++) n += R.frames[t].drop; return n; };
  const maxSearch = (R, now) => { let m = 0; for (let t = 0; t <= Math.floor(now); t++) m = Math.max(m, R.frames[t].search); return m; };
})();
