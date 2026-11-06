/* The shelf for both labs, built like the course shelves (the same sidebar tree, poster, ladder and beds, from
   learn/engine.css), with pictures of the real thing:
     Wind Tunnel   each live experiment's own stage at the moment it bends, rendered by the lab itself
                   (tunnel/shots, made by tools/lab-thumbs.js); planned ones are the question they'll answer.
     Workbench     each program as a tiny terminal doing its signature trick: what you'll have built. Two
                   ladders: whole programs, and Build your own backend (Node first: your own Express, then
                   everything a backend needs, built on it).
   The posters are the same: the Ledger IDE mid-project, and a retry storm still going.
   Every card has a colour pair, a deep field and its bright twin. Progress comes from the shared store
   (vnl-code-v1): done ids wb01-t1… and wt01…. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let S = {};
  try { S = JSON.parse(localStorage.getItem("vnl-code-v1") || "{}"); } catch (e) { S = {}; }
  const done = S.done || {};
  const lab = document.body.classList.contains("k-wt") ? "wt" : "wb";

  const HUE = {
    pink: ["#ff6fb5", "#3a0f26"], red: ["#ff6a5f", "#3d1013"], violet: ["#9d7bff", "#1d1442"], amber: ["#f0b03a", "#3d2a08"],
    green: ["#5fcf72", "#0e3317"], yellow: ["#ffd84a", "#363005"], lilac: ["#c09cf5", "#291944"], teal: ["#3fd1a8", "#0b342a"],
    blue: ["#62acf5", "#0d2846"], orange: ["#ff7a4d", "#43170b"], cyan: ["#3cc7e6", "#07303a"],
  };
  const field = (hue) => `--a:${HUE[hue][0]};--b:${HUE[hue][1]}`;

  // ------------------------------------------------------------- pieces --
  function plot({ href, num, title, sub, hue, media, soon, pct, next, tag, bloomed }) {
    return h(href ? "a" : "div", { class: "plot la-plot" + (soon ? " soon" : "") + (bloomed ? " bloomed" : "") + (next ? " next" : ""), href, style: field(hue) },
      h("div", { class: "soil la-soil" }, media,
        h("span", { class: "ghost", "aria-hidden": "true" }, String(num).padStart(2, "0")),
        tag ? h("span", { class: "la-tag" }, tag) : null,
        next ? h("span", { class: "next-tag" }, next) : soon ? h("span", { class: "la-soon-tag" }, "soon") : null),
      h("span", { class: "num" }, String(num).padStart(2, "0")), h("b", {}, title), h("small", {}, sub),
      h("span", { class: "pbar" }, h("i", { style: `width:${pct || 0}%` })));
  }
  const glyph = (st, title) => h("i", { class: "g g" + st, title });
  const ladder = (steps) => h("ol", { class: "ladder" }, steps.map(([b, t], i) => h("li", { style: `--n:${i}` }, h("b", {}, b), t)));
  const secH = (t, small) => h("h3", { class: "sec-h" }, h("span", { class: "tree" }, "└──"), t, small ? h("small", {}, small) : null);
  function poster({ kind, corner, d, of, word, title, code, lede, cta, foot, fig, art, hue }) {
    return h("section", { class: `poster dark la-hero ${kind}`, style: field(hue) },
      h("div", { class: "p-corner tl", html: corner }),
      h("div", { class: "p-corner tr", html: `<b>${d}</b> / ${of}<br>${word}` }),
      h("div", { class: "p-body" }, h("h1", { html: title }), h("div", { class: "p-code", html: code }), h("p", { class: "lede", html: lede }), h("div", { class: "p-cta" }, cta)),
      h("div", { class: "la-art" }, art),
      h("div", { class: "p-corner bl" }, foot), h("div", { class: "p-corner br" }, fig));
  }
  function layout(side, col) {
    $("#shelf").replaceWith(h("div", { class: "wrap" }, side, h("main", { id: "main" }, col)));
    document.querySelector(".menu-btn")?.addEventListener("click", () => document.body.classList.toggle("menu"));
  }

  // ------------------------------------------------------------ Workbench --
  // Each program's card: a few lines of it running. p = prompt, o = output, e = the line that matters,
  // c = a note from the bench (a power cut).
  const PROGRAMS = [
    { num: 1, title: "Ledger", kind: "a key-value database with its own shell", hue: "orange", bar: "ledger · run.py",
      term: [["p", "ledger> ", "SET balance 90"], ["o", "OK"], ["c", "⚡ power cut, mid-write"], ["p", "ledger> ", "GET balance"], ["e", "90"]] },
    { num: 2, title: "Quill", kind: "a terminal text editor", hue: "violet", bar: "quill · notes.txt",
      term: [["o", " 1  Dear Tulip,"], ["o", " 2  the gap moves with the cursor▌"], ["o", " 3  ~"], ["e", "-- INSERT --   2:33   undo ×3"]] },
    { num: 3, title: "Tally", kind: "a spreadsheet engine", hue: "green", bar: "tally · budget.csv",
      term: [["o", "     A        B        C"], ["o", " 1   12       =A1*2    24"], ["o", " 2   =C2+1    =B1/4    6"], ["o", " 3   =B3      =A3"], ["e", "     #CYCLE!  A3 → B3 → A3"]] },
    { num: 4, title: "Conch", kind: "a shell", hue: "amber", bar: "conch",
      term: [["p", "$ ", "ls | grep .py | wc -l"], ["o", "3"], ["p", "$ ", "echo hi > note.txt"], ["p", "$ ", "cat note.txt"], ["e", "hi"]] },
    { num: 5, title: "Porch", kind: "an HTTP server and router", hue: "blue", bar: "porch · :8000",
      term: [["o", "GET  /notes/7     200   4 ms"], ["o", "POST /notes       201   {\"id\": 8}"], ["o", "GET  /notes/8     200   3 ms"], ["e", "GET  /nope        404   no such route"]] },
    { num: 6, title: "Twig", kind: "version control", hue: "pink", bar: "twig log --graph",
      term: [["e", "* 4f2a91c  add a parser   (main)"], ["o", "|\\"], ["o", "| * 9c03e1b  try a regex  (idea)"], ["o", "* | 1b77d02  first commit"], ["o", "|/"]] },
    { num: 7, title: "Sprout", kind: "a Lisp interpreter", hue: "teal", bar: "sprout",
      term: [["p", "sprout> ", "(define sq (lambda (x) (* x x)))"], ["p", "sprout> ", "(map sq '(1 2 3 12))"], ["e", "(1 4 9 144)"]] },
    { num: 8, title: "Pixelpond", kind: "a 2D game engine", hue: "yellow", bar: "pixelpond · 60 fps", pixels: true },
  ];
  // Backend, Node first. Two ladders, numbered apart from the programs so routes never collide:
  //   EXPRESS (101…)  the projects people build to learn Express, from a first route to a realtime app
  //   DEEP    (150…)  under the hood: your own Express, then the machinery big backends run on
  // Each card is the moment the project is about: the request that proves it works.
  const EXPRESS = [
    { num: 101, title: "Greenhouse", kind: "your first Express API: routes, JSON, params, queries, CRUD, middleware, errors", hue: "green", bar: "greenhouse · :3000",
      term: [["p", "api> ", "GET /api/plants?water=weekly"], ["o", '[{"id":1,"name":"Tulip","water":"weekly"}]'], ["p", "api> ", 'POST /api/plants {"name": "Rose"}'], ["e", '400 {"error":"water must be daily, weekly or monthly"}']] },
    { num: 102, title: "Taskflow", kind: "a todo app that keeps its data: a JSON file on disk, filters, pagination, and a page of its own", hue: "amber", bar: "taskflow · :3000",
      term: [["p", "api> ", 'POST /api/tasks {"title": "Water ferns"}'], ["c", "⚡ power cut while writing tasks.json.tmp"], ["p", "api> ", "GET /api/tasks?done=false&limit=5"], ["e", "200 OK · x-total-count: 12 · every saved task still there"]] },
    { num: 103, title: "Shortlink", kind: "a URL shortener: short codes, redirects, click stats, custom aliases, expiry", hue: "cyan", bar: "shortlink · :3000",
      term: [["p", "api> ", 'POST /api/links {"url":"https://…"}'], ["o", "201 Created · /k3x9"], ["p", "api> ", "GET /k3x9"], ["e", "302 Found · location: https://…"]] },
    { num: 104, title: "Inkwell", kind: "a blog with accounts: sign-up, hashed passwords, sessions and cookies, only authors edit", hue: "violet", bar: "inkwell · :3000",
      term: [["p", "api> ", 'POST /login {"email":"ada@…"}'], ["o", "set-cookie: sid=9f2c…; HttpOnly"], ["p", "api> ", "DELETE /posts/4"], ["e", "403 Forbidden · not your post"]] },
    { num: 105, title: "Keyring", kind: "token auth for an API: JWTs signed by you, refresh tokens, roles and scopes", hue: "pink", bar: "keyring · :3000",
      term: [["p", "api> ", 'GET /api/admin -H "Authorization: Bearer eyJ…"'], ["o", "401 · token expired 3 s ago"], ["p", "api> ", "POST /auth/refresh"], ["e", '200 {"token":"eyJ…"}']] },
    { num: 106, title: "Bookshelf", kind: "REST done right: cursor pagination, sorting, ETags and 304s, versions", hue: "blue", bar: "bookshelf · :3000",
      term: [["p", "api> ", "GET /v1/books?after=40&limit=2"], ["o", '{"books":[…],"next":"/v1/books?after=42"}'], ["p", "api> ", 'GET /v1/books/7 -H "If-None-Match: W/…"'], ["e", "304 Not Modified"]] },
    { num: 107, title: "Market", kind: "a shop: a cart in a session, stock that can't go negative, checkout that never charges twice", hue: "orange", bar: "market · :3000",
      term: [["p", "api> ", 'POST /checkout -H "Idempotency-Key: k7"'], ["o", "201 Created · order 1042 · $40"], ["p", "api> ", 'POST /checkout -H "Idempotency-Key: k7"'], ["e", "201 Created · order 1042 again, not a second charge"]] },
    { num: 108, title: "Chatroom", kind: "realtime with server-sent events: rooms, presence, history", hue: "red", bar: "chatroom · /events",
      term: [["o", "event: joined   data: ada"], ["o", 'event: message data: {"text":"hi"}'], ["e", "event: left     data: ada  (2 here)"]] },
  ];
  const DEEP = [
    { num: 150, title: "Trellis", kind: "your own Express: routes, middleware, bodies, errors, routers", hue: "teal", bar: "trellis · :3000",
      term: [["p", "api> ", 'POST /notes {"text": "prune"}'], ["o", "POST /notes → 201"], ["o", "201 Created"], ["e", '{"id":3,"text":"prune"}']] },
    { num: 151, title: "Tollbooth", kind: "production middleware: rate limits, caching, timeouts, circuit breakers", hue: "yellow", bar: "tollbooth · :3000",
      term: [["o", "GET /search   200   12 ms   cache miss"], ["o", "GET /search   200    0 ms   cache hit"], ["e", "GET /search   429   retry-after: 3"]] },
    { num: 152, title: "Courier", kind: "background jobs: a durable queue, retries with backoff, dead letters", hue: "lilac", bar: "courier · worker",
      term: [["o", "job 41  send-email   failed · retry in 2 s"], ["o", "job 41  send-email   failed · retry in 4 s"], ["o", "job 41  send-email   done (attempt 3)"], ["e", "job 42  dead-lettered after 5 tries"]] },
    { num: 153, title: "Relay", kind: "webhooks: signed deliveries, retries, and receivers that handle each event once", hue: "violet", bar: "relay · :3000",
      term: [["o", "→ POST hooks.example/in   503   retry in 8 s"], ["o", "→ POST hooks.example/in   200   delivered"], ["e", "← duplicate evt_91 ignored: seen at 12:04"]] },
  ];
  const BACKEND = [...EXPRESS, ...DEEP];
  // a tiny pond for the game engine's card: water, a frog, a lily pad, a fly
  const POND = ["................", "..........y.....", ".........yy.....", "................", "....gg..........", "...gGGg.........",
    "..gGwGwg........", "..gGGGGg...pp...", "...gGGg...pPPp..", "~~~~~~~~~~pPPp~~", "~~~~~~~~~~~pp~~~", "~~~~~~~~~~~~~~~~"];
  function pond() {
    const C = { g: "#4fbf5d", G: "#7be08a", w: "#fff", y: "#ffd84a", p: "#2c8f4f", P: "#3fae63", "~": "#1d5f8a" };
    let r = "";
    POND.forEach((row, y) => [...row].forEach((c, x) => { if (C[c]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${C[c]}"/>`; }));
    return `<svg viewBox="0 0 16 12" shape-rendering="crispEdges">${r}</svg>`;
  }
  function term(p) {
    const lines = p.pixels ? `<div class="la-pond">${pond()}</div><div class="la-ln o">frame 3,600 · 2 sprites · 1 collision</div>`
      : p.term.map(([k, a, b]) => (k === "p" ? `<div class="la-ln p"><i>${esc(a)}</i>${esc(b)}</div>` : `<div class="la-ln ${k}">${esc(a)}</div>`)).join("");
    return h("div", { class: "la-term", "aria-hidden": "true", html: `<div class="la-bar"><span></span>${esc(p.bar)}</div><div class="la-body">${lines}</div>` });
  }

  async function workbench() {
    let data = { projects: [] };
    try { data = await (await fetch("../content/wb.json")).json(); } catch (e) { /* offline: everything shows as coming */ }
    const live = Object.fromEntries(data.projects.map((p) => [p.num, p]));
    const got = (p) => p.tickets.filter((t) => done[`${p.id}-${t.id}`]).length;
    const cur = data.projects.find((p) => got(p) < p.tickets.length) || data.projects[0];
    const next = cur && cur.tickets.find((t) => !done[`${cur.id}-${t.id}`]);
    const total = data.projects.reduce((n, p) => n + p.tickets.length, 0), have = data.projects.reduce((n, p) => n + got(p), 0);

    const side = h("nav", { class: "side", id: "side", "aria-label": "Projects" },
      h("h2", {}, h("i", { class: "sq" }), "Workbench"),
      h("a", { class: "top-link", href: "./", "aria-current": "page" }, h("span", { class: "n" }, "✿"), "Your bench"));
    for (const p of data.projects) {
      const ex = EXPRESS.findIndex((b) => b.num === p.num), dp = DEEP.findIndex((b) => b.num === p.num);
      side.append(h("div", { class: "part" }, ex >= 0 ? `Express ${ex + 1} · ${p.title}` : dp >= 0 ? `Under the hood ${dp + 1} · ${p.title}` : `Project ${p.num} · ${p.title}`),
        h("div", { class: "branch" }, p.tickets.map((t, i) => {
          const d = !!done[`${p.id}-${t.id}`];
          return h("a", { href: `bench.html#${p.num}/${t.id}`, class: d ? "done" : null }, h("span", { class: "n" }, i + 1), h("span", { class: "t" }, t.title), glyph(d ? 2 : t === next ? 1 : 0, d ? "committed" : ""));
        })));
    }
    side.append(h("div", { class: "part" }, "Being written"),
      h("div", { class: "branch" }, [...EXPRESS.map((p, i) => ({ ...p, n: `E${i + 1}` })), ...DEEP.map((p, i) => ({ ...p, n: `U${i + 1}` })), ...PROGRAMS.map((p) => ({ ...p, n: p.num }))].filter((p) => !live[p.num])
        .map((p) => h("a", { class: "la-soon", "aria-disabled": "true" }, h("span", { class: "n" }, p.n), h("span", { class: "t" }, p.title), h("small", {}, "soon")))));

    const col = h("div", { class: "col wide hero" },
      poster({
        kind: "wb", hue: "orange", corner: "Tulip Labs<br>Lab · Workbench", d: have, of: total, word: "tickets committed",
        title: "Build real <i>software</i>, one ticket at a time",
        code: `└── { git commit -m "<i>${esc(((next || {}).title || "ship it").toLowerCase())}</i>" }`,
        lede: "Each project is one whole program in a real editor: a database, an editor, a shell, a backend. Write it, run it in a terminal, pull the plug on it, test it, commit it. When it's done, it's yours: download it and run it with your own Python or Node.",
        cta: [cur ? h("a", { class: "key primary", href: `bench.html#${cur.num}` }, `${have ? "Carry on" : "Start"} · ${cur.title}${next ? ` #${cur.tickets.indexOf(next) + 1}` : ""} →`) : null,
          h("a", { class: "key", href: "#how" }, "How a ticket works")],
        foot: `${PROGRAMS.length + BACKEND.length} projects · ${data.projects.length} open · Python and Node in your browser`,
        fig: "fig. 1 — ledger, ticket 8: a torn transaction rolls back whole",
        art: h("img", { class: "la-ide", src: "shots/ide.webp", alt: "The Workbench editor: Ledger's shell.py, its history of commits, and a terminal surviving a power cut" }),
      }),
      h("div", { id: "how" }),
      secH("Every ticket runs the same loop"),
      ladder([["Read the ticket", "What to build, and why real software is built that way."], ["Write it", "In a real editor: tabs, folding, errors underlined."],
        ["Run it", "Type commands at your own program in the terminal."], ["Pull the plug", "Kill it mid-write. Does your data survive?"],
        ["Test", "This ticket's checks, and every earlier ticket's too."], ["Commit", "It lands in history, and a part lights up on the map."]]),
      h("div", { class: "note", html: "Python runs on this page with nothing to install. Your files, the program's disk and your history stay in this browser. A finished project downloads as a zip with a <code>run.py</code>, so it runs anywhere." }),
      secH("Your programs", "one whole program each · the card shows what yours will do when it's done"),
      h("div", { class: "bed" }, h("div", { class: "plots la-plots" }, PROGRAMS.map((p) => card(p, p.num)))),
      h("div", { id: "backend" }),
      secH("Learn Express by building", "the projects people build to learn backend · Node · basic to advanced"),
      h("div", { class: "note", html: "Real Express, built into the page: <code>require(\"express\")</code> just works. Start with one route and end with a realtime app: an API, a todo app that keeps its data, a URL shortener, a blog with accounts, token auth, REST done right, a shop that never charges twice, and a chat. Every answer matches the real Express 5, checked line by line." }),
      h("div", { class: "bed" }, h("div", { class: "plots la-plots" }, EXPRESS.map((p, i) => card(p, i + 1)))),
      secH("Under the hood", "write the machinery yourself · your own Express first"),
      h("div", { class: "note", html: "Once you can use Express, build it: <b>Trellis</b> starts from a bare HTTP server and ends with routes, middleware, body parsing, errors and routers. Then the parts big backends run on: rate limits and caches, job queues, webhooks. Python (your own FastAPI) and Go follow Node." }),
      h("div", { class: "bed" }, h("div", { class: "plots la-plots" }, DEEP.map((p, i) => card(p, i + 1)))));
    function card(p, shown) {
      const L = live[p.num], g = L ? got(L) : 0, n = L ? L.tickets.length : 0;
      return plot({ href: L ? `bench.html#${p.num}` : null, num: shown, title: p.title, sub: L ? L.kind : p.kind, hue: p.hue, media: term(p),
        soon: !L, pct: n ? (100 * g) / n : 0, bloomed: L && g === n, next: L && L === cur ? (g ? "carry on" : "start here") : null,
        tag: L ? `${n} tickets · ${L.lang === "js" ? "Node" : "Python"}` : null });
    }
    layout(side, col);
  }

  // ---------------------------------------------------------- Wind Tunnel --
  const WT_HUE = { wt01: "cyan", wt02: "teal", wt03: "blue", wt04: "violet", wt05: "red", wt06: "amber", wt07: "green", wt08: "yellow", wt09: "orange", wt10: "lilac", wt11: "pink", wt12: "cyan" };
  function tunnel() {
    const X = (window.WT && window.WT.experiments) || [];
    const live = X.filter((x) => x.live), have = live.filter((x) => done[x.id]).length;
    const next = live.find((x) => !done[x.id]) || live[0];
    const P_ = S.wt || {};
    const side = h("nav", { class: "side", id: "side", "aria-label": "Experiments" },
      h("h2", {}, h("i", { class: "sq" }), "Wind Tunnel"),
      h("a", { class: "top-link", href: "./", "aria-current": "page" }, h("span", { class: "n" }, "✿"), "Your tunnel"),
      h("div", { class: "part" }, "Experiments"),
      h("div", { class: "branch" }, live.map((x) => h("a", { href: `lab.html#${X.indexOf(x) + 1}`, class: done[x.id] ? "done" : null },
        h("span", { class: "n" }, X.indexOf(x) + 1), h("span", { class: "t" }, x.title), glyph(done[x.id] ? 2 : P_[x.id] ? 1 : 0, done[x.id] ? "done" : "")))),
      h("div", { class: "part" }, "Being built"),
      h("div", { class: "branch" }, X.filter((x) => !x.live).map((x) => h("a", { class: "la-soon", "aria-disabled": "true" }, h("span", { class: "n" }, X.indexOf(x) + 1), h("span", { class: "t" }, x.title), h("small", {}, "soon")))));
    const plotOf = (x) => {
      const i = X.indexOf(x);
      const media = x.live ? h("img", { class: "la-shot", src: `shots/${x.id}.webp`, alt: "", loading: "lazy" })
        : h("p", { class: "la-ask" }, x.ask || x.teaser);
      return plot({ href: x.live ? `lab.html#${i + 1}` : null, num: i + 1, title: x.title, sub: x.teaser, hue: WT_HUE[x.id] || "cyan", media,
        soon: !x.live, pct: done[x.id] ? 100 : 0, bloomed: !!done[x.id], next: x === next ? (have ? "next" : "start here") : null, tag: x.live ? x.law : null });
    };
    const col = h("div", { class: "col wide hero" },
      poster({
        kind: "wt", hue: "red", corner: "Tulip Labs<br>Lab · Wind Tunnel", d: have, of: live.length, word: "experiments done",
        title: "Blow traffic <i>at a design.</i>",
        code: `└── { blow(<i>traffic</i>).at(design); }`,
        lede: "Every experiment is a small live system. Guess where it breaks, push the crowd at it, and watch requests queue, latency climb and servers drown. Then learn the law that did it, and fix the design on a budget, as code.",
        cta: [next ? h("a", { class: "key primary", href: `lab.html#${X.indexOf(next) + 1}` }, `${have ? "Carry on" : "Start"} · ${X.indexOf(next) + 1}. ${next.title} →`) : null,
          h("a", { class: "key", href: "#how" }, "How an experiment works")],
        foot: `${live.length} experiments live · ${X.length - live.length} being built · runs in your browser`,
        fig: "fig. 1 — a retry storm, 25 s after the surge ended",
        art: h("img", { class: "la-storm", src: "shots/wt05.webp", alt: "A crowd sending requests at a red, smoking server under a tall tower of queued retries" }),
      }),
      h("div", { id: "how" }),
      secH("Every experiment runs the same loop"),
      ladder([["Predict", "Drag a pin to where you think it breaks, and lock it in."], ["Push it", "Drag the crowd up. Watch queues stack and servers drown."],
        ["The law", "See your guess against the answer, and the law behind it."], ["Fix it", "A launch day, a budget, a goal. Change the design."],
        ["Read the diff", "Your design is system.yaml; the change shows as a diff."], ["Rewind", "Drag back along a timeline to the moment it broke."]]),
      h("div", { class: "note", html: "Every number in an experiment's text comes out of the same seeded simulator you're watching, and is checked before it ships. Same seed, same run: that's what makes rewind exact. The pictures below are frames from that simulator." }),
      secH("Live experiments", "each one is its own system, caught at the moment it bends"),
      h("div", { class: "bed" }, h("div", { class: "plots la-plots" }, live.map(plotOf))),
      secH("Being built", "the question each one will answer"),
      h("div", { class: "bed" }, h("div", { class: "plots la-plots" }, X.filter((x) => !x.live).map(plotOf))));
    layout(side, col);
  }

  lab === "wt" ? tunnel() : workbench();
})();
