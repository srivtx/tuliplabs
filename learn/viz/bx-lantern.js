/* Build your own X, chapter 53: Lantern, a support bot.
   A day of 18 customer chats against Lantern, the bot you build in the chapter. Its brain is the same
   keyword classifier as the exercises: count each intent's keywords in the message and pick the most.
   Two settings change everything:
     memory   does Lantern remember the chat (the order number, the question it asked), or does it read
              every message on its own? "it's 1042" means nothing without the question before it;
     handoff  when Lantern doesn't understand: pass the customer to a person at the first miss, after
              two misses in a row, or never.
   Every customer is a script: what they want, the ways they'll say it, what they answer when asked
   for their order number. Nothing is rolled: each setting gives the same day every time, and every
   count on screen is what the bot really did. Two people staff the desk, and a chat takes them 8 s. */
VIZ.register("bx-lantern", async (api) => {
  const W = await api.world3d();
  api.wide();

  // ---- Lantern's brain, exactly as in the chapter ----
  const INTENTS = {
    track: ["where", "when", "track", "tracking", "arrived", "arrive", "shipped", "late", "status", "parcel", "package"],
    refund: ["refund", "money", "return", "returns", "broken", "damaged", "faulty", "cracked"],
    address: ["address", "moved", "street", "apartment", "flat"],
    cancel: ["cancel", "mistake", "accident", "undo"],
    hours: ["open", "hours", "close", "closing", "sunday"],
    human: ["human", "person", "agent", "someone", "manager"],
  };
  const NEEDS_ORDER = ["track", "refund", "address", "cancel"];
  const words = (t) => t.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  function classify(text) {
    const w = words(text);
    let best = null, score = 0;
    for (const [name, keys] of Object.entries(INTENTS)) {
      const s = w.filter((x) => keys.includes(x)).length;
      if (s > score) { best = name; score = s; }
    }
    return best;
  }
  const orderIn = (text) => (text.match(/\b\d{4}\b/) || [null])[0];
  function bot(state, text) {
    const id = orderIn(text);
    if (id && memory) state.order = id;
    let intent = classify(text);
    if (!intent && id && memory && state.pending) intent = state.pending; // "it's 1042" answers the question it asked
    if (!intent) {
      state.misses++;
      if (limit && state.misses >= limit) return { kind: "handoff" };
      return { kind: "rephrase" };
    }
    state.misses = 0;
    if (intent === "human") return { kind: "handoff", intent };
    if (NEEDS_ORDER.includes(intent)) {
      const order = id || (memory ? state.order : null);
      if (!order) { if (memory) state.pending = intent; return { kind: "ask", intent }; }
      state.pending = null;
      return { kind: "answer", intent, order };
    }
    return { kind: "answer", intent };
  }
  const REPLY = {
    ask: (r) => `Which order? I'll look it up.`,
    rephrase: () => "Sorry, could you say that another way?",
    handoff: () => "I'm passing you to a person.",
    answer: (r) => ({ track: `Order ${r.order} arrives Thursday.`, refund: `Refund for ${r.order} started.`, address: `Address on ${r.order} updated.`, cancel: `Order ${r.order} cancelled.`, hours: "Open 9 to 6, Sundays too." })[r.intent],
  };

  // ---- the day's customers ----
  const CUSTOMERS = [
    { want: "track", order: "1042", says: ["where is my order?"] },
    { want: "track", order: "1042", says: ["has 1042 shipped yet"] },
    { want: "track", order: "1077", says: ["any news on my stuff", "where is my parcel"] },
    { want: "track", order: "1077", says: ["my parcel is late"], then: { want: "address", says: "can you send it to my new address instead" } },
    { want: "track", order: "1093", says: ["is it coming today", "when will it be here", "track my order please"] },
    { want: "refund", order: "1042", says: ["the mug arrived broken, i want my money back"] },
    { want: "refund", order: "1093", says: ["the lid doesnt fit", "can i return it"] },
    { want: "refund", order: "1077", says: ["you sent the wrong size", "i want a refund"] },
    { want: "address", order: "1093", says: ["i moved last week, please update my address"] },
    { want: "address", order: "1042", says: ["send it to my office", "change the delivery address"] },
    { want: "cancel", order: "1077", says: ["cancel 1077"] },
    { want: "cancel", order: "1042", says: ["i ordered twice by accident"] },
    { want: "hours", says: ["are you open on sunday"] },
    { want: "hours", says: ["what time do you close today"] },
    { want: "human", says: ["can i talk to a person"] },
    { want: "human", says: ["this is the third time im asking", "let me speak to a manager"] },
    { want: "other", says: ["do you sell gift cards", "gift cards??"] },
    { want: "refund", order: "1093", says: ["when will my refund arrive"] }, // "when" and "arrive" outvote "refund"
  ];
  const NAMES = ["ana", "ben", "chloe", "dev", "eli", "fay", "gus", "hana", "ivo", "jo", "kai", "lea", "max", "nia", "omar", "pia", "raj", "sol"];
  const SLOTS = [-4.4, -2.2, 0, 2.2, 4.4];
  const BOT = [-1.9, 2.4, 0], DESK = [2.6, 2.4, 0];
  const FLY = 0.35, TYPE = 1.1, AGENT = 8, AGENTS = 2;

  let memory = false, limit = 0, t, nextArrive, deck, slots, queue, agents, flights, seq, ended, tally, waits, lastReply, judged, reached = api.wasDone, lastHud = -1;

  function reset() {
    for (const f of flights || []) W.remove(f.key);
    for (const c of (slots || []).concat(queue || [])) if (c) W.remove("c" + c.n);
    for (let i = 0; i < 12; i++) W.remove("q" + i);
    t = 0; nextArrive = 0.4; seq = 0; flights = []; queue = []; ended = 0; judged = false; lastReply = ""; lastHud = -1;
    let r = 11; const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    deck = CUSTOMERS.map((c, i) => ({ ...c, name: NAMES[i] })).map((c) => [rand(), c]).sort((a, b) => a[0] - b[0]).map((x, i) => ({ ...x[1], n: i }));
    slots = SLOTS.map(() => null);
    agents = Array.from({ length: AGENTS }, () => ({ busy: null, until: 0 }));
    tally = { solved: 0, people: 0, gave: 0, wrong: 0 };
    waits = [];
    draw(); hud();
  }

  function wrap(s, n = 18) {
    const out = []; let line = "";
    for (const w of s.split(" ")) { if ((line + " " + w).trim().length > n && line) { out.push(line); line = w; } else line = (line + " " + w).trim(); }
    if (line) out.push(line);
    return out.slice(0, 3).join("\n");
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);

  function fly(color, a, b, done) {
    const key = "f" + seq++;
    flights.push({ key, a, b, t0: t, done });
    W.box(key, { x: a[0], y: a[1], z: 0.5, sx: 0.24, sy: 0.18, sz: 0.1, color, glow: 0.5, instant: true });
  }
  const slotPos = (c) => [SLOTS[c.slot], -0.9, 0];

  function say(c) {
    c.sent++;
    c.log.push(["them", c.text]);
    draw();
    fly("c2", slotPos(c), BOT, () => {
      const r = bot(c.state, c.text);
      lastReply = REPLY[r.kind](r);
      W.flash("bot");
      fly({ ask: "c4", rephrase: "c5", handoff: "c1", answer: "c3" }[r.kind], BOT, slotPos(c), () => hear(c, r));
      draw();
    });
  }
  // the customer reads the reply and decides what to send next, the same rules for every setting
  function hear(c, r) {
    c.log.push(["bot", REPLY[r.kind](r)]);
    if (r.kind === "handoff") return finish(c, "people");
    if (c.sent >= 6) return finish(c, "gave");
    if (r.kind === "rephrase") {
      if (c.next < c.says.length) c.text = c.says[c.next++];
      else if (c.repeated) return finish(c, "gave");
      else c.repeated = true; // out of new ways to say it: they say the last thing once more
    } else if (r.intent !== c.goal) {
      c.wrong = true; tally.wrong++;
      c.text = "no, that's not what i asked. can i talk to a person";
    } else if (r.kind === "ask") c.text = "it's " + c.order;
    else if (c.then && !c.followed) { c.followed = true; c.goal = c.then.want; c.text = c.then.says; }
    else return finish(c, "solved");
    c.at = t + TYPE;
    draw();
  }
  function finish(c, how) {
    c.done = how; c.at = null;
    if (how === "people") { tally.people++; slots[c.slot] = null; c.queued = t; queue.push(c); W.remove("c" + c.n); }
    else { tally[how]++; c.leave = t + 1.6; ended++; }
    draw(); hud();
  }

  function draw() {
    W.box("bot", { x: BOT[0], y: BOT[1], z: 0, sx: 2.4, sy: 1.0, sz: 1.0, color: "c4", glow: 0.25, opacity: 0.9, label: `Lantern\n${lastReply ? wrap(lastReply, 22) : "the bot"}`, labelSize: 0.17, instant: true,
      info: { title: "Lantern, the bot", html: `<p>For every message it counts each intent's keywords and picks the intent with the most. <b>Memory ${memory ? "on" : "off"}:</b> ${memory ? "it keeps the order number and the question it asked, so \"it's 1042\" answers \"which order?\"." : "every message is read on its own, so \"it's 1042\" has no keywords and means nothing."} <b>Hand off:</b> ${limit ? `after ${limit === 1 ? "the first miss" : "2 misses in a row"}.` : "never."}</p>` } });
    const busy = agents.filter((a) => a.busy).length;
    W.box("desk", { x: DESK[0], y: DESK[1], z: 0, sx: 2.4, sy: 1.0, sz: 1.0, color: "c1", opacity: 0.85, label: `people · ${busy} of ${AGENTS} busy\n${queue.length} waiting`, labelSize: 0.17, instant: true,
      info: { title: "The support desk", html: `<p>Two people. Each handoff takes one of them 8 s, and they read the whole transcript first, so the customer doesn't repeat themselves. ${waits.length ? `Customers waited ${(waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1)} s on average for a person.` : ""}</p>` } });
    for (let i = 0; i < 12; i++) {
      if (i < queue.length) W.box("q" + i, { x: 4.35, y: 1.95 + i * 0.24, z: 0, sx: 0.5, sy: 0.18, sz: 0.4, color: "c1", glow: 0.2, instant: true });
      else W.remove("q" + i);
    }
    for (const c of slots) {
      if (!c) continue;
      const color = c.done === "solved" ? "c3" : c.done === "gave" ? "bad" : c.wrong ? "bad" : "c2";
      const last = c.done === "solved" ? "solved ✓" : c.done === "gave" ? "gave up" : `“${c.text}”`;
      W.box("c" + c.n, { x: SLOTS[c.slot], y: -0.9, z: 0, sx: 1.9, sy: 1.25, sz: 0.2, color, opacity: c.done ? 0.55 : 0.85, label: `${c.name}\n${wrap(last)}`, labelSize: 0.15, instant: true,
        info: { title: `${c.name}'s chat`, html: c.log.map(([who, s]) => `<p><b>${who === "bot" ? "Lantern" : c.name}:</b> ${esc(s)}</p>`).join("") } });
    }
  }

  function hud() {
    const done = tally.solved + tally.people + tally.gave;
    api.hud(`chat <b>${Math.min(done, 18)}</b> of 18 · Lantern solved <b>${tally.solved}</b> · to people <b>${tally.people}</b> · gave up <b>${tally.gave}</b>`);
  }

  function judge() {
    judged = true;
    const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
    const set = `${memory ? "Memory on" : "Memory off"}, hand off ${limit ? (limit === 1 ? "at the first miss" : "after 2 misses") : "never"}`;
    const line = `<p><b>${set}:</b> Lantern solved ${tally.solved} of 18, ${tally.people} went to a person (waiting ${avg.toFixed(1)} s on average), ${tally.gave} gave up${tally.wrong ? `, and ${tally.wrong} got a confidently wrong answer first` : ""}.</p>`;
    if (memory && tally.gave === 0 && tally.people <= 6) {
      api.explain("A good day at the desk", line + "<p>Lantern remembered each chat, so \"it's 1042\" finished the question it had asked. It let people rephrase once before giving up on them, and nobody was left stuck. The desk got only the chats that needed a person: the ones who asked for one, a question Lantern has no intent for, and one it read wrong.</p>");
      if (!reached) { reached = true; api.done("Nobody gave up, and the people at the desk took a third of the chats or fewer"); }
    } else if (!memory) {
      api.explain("Lantern forgot the question it asked", line + "<p>It asked \"which order?\", got \"it's 1042\", and read that on its own: no keywords, so it didn't understand. Turn <b>memory on</b>.</p>");
    } else if (tally.gave) {
      api.explain(`${tally.gave} customer${tally.gave === 1 ? "" : "s"} gave up`, line + "<p>With no handoff, a customer Lantern can't understand is stuck with \"say that another way\" until they leave. Click the red one to read the chat. Lantern needs a way out to a person.</p>");
    } else {
      api.explain("The desk is doing the bot's job", line + "<p>Handing off at the first miss sends people who would have been fine after one rephrase. Click a few chats: \"any news on my stuff\" has no keywords, but \"where is my parcel\" does. Try <b>after 2 misses</b>.</p>");
    }
  }

  api.loop((dt) => {
    t += dt;
    // a new customer takes a free slot
    if (t >= nextArrive && deck.length) {
      const free = slots.indexOf(null);
      if (free >= 0) {
        const c = deck.shift();
        Object.assign(c, { slot: free, goal: c.want, next: 1, text: c.says[0], sent: 0, log: [], state: { pending: null, order: null, misses: 0 }, at: t + 0.2 });
        slots[free] = c;
        nextArrive = t + 2.2;
        draw();
      }
    }
    for (const c of slots) {
      if (!c) continue;
      if (c.at != null && t >= c.at) { c.at = null; say(c); }
      if (c.leave != null && t >= c.leave) { slots[c.slot] = null; W.remove("c" + c.n); }
    }
    // the desk takes the next waiting customer
    for (const a of agents) {
      if (a.busy && t >= a.until) { a.busy = null; ended++; draw(); }
      if (!a.busy && queue.length) { const c = queue.shift(); waits.push(t - c.queued); a.busy = c; a.until = t + AGENT; draw(); }
    }
    for (const f of flights.slice()) {
      const k = Math.min(1, (t - f.t0) / FLY);
      W.box(f.key, { x: f.a[0] + (f.b[0] - f.a[0]) * k, y: f.a[1] + (f.b[1] - f.a[1]) * k, instant: true });
      if (k >= 1) { flights.splice(flights.indexOf(f), 1); W.remove(f.key); f.done(); }
    }
    if (!judged && ended === 18) judge();
    if (t - lastHud > 0.5) { lastHud = t; draw(); }
  });

  api.seg([{ label: "forgets each message", value: "off" }, { label: "remembers the chat", value: "on" }], "off", (v) => { memory = v === "on"; reset(); });
  api.seg([{ label: "hand off at 1st miss", value: "1" }, { label: "after 2 misses", value: "2" }, { label: "never", value: "0" }], "0", (v) => { limit = Number(v); reset(); });
  api.button("Start the day again", () => reset());
  reset();
  const wide = api.view.clientWidth || 640;
  W.camera({ target: [0, 0.7, 0], dist: 12 * Math.max(1, 640 / wide), theta: 0, phi: 1.45, instant: true });
  api.status("18 customers, one at a time. Blue is a customer's message, amber a question back, grey \"say that another way\", green an answer, orange a handoff to the desk.");
  api.explain("How to read this", "<p>Each customer at the bottom chats with Lantern. Click one to read the whole chat. Lantern answers what it can, asks for an order number when it needs one, and passes the rest to the two people at the desk. Change how much it remembers and when it gives up, and watch who's left stuck.</p>");
});
