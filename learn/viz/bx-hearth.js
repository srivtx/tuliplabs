/* Build your own X, chapter 52: Hearth, team chat.
   Three phones and a chat server. HTTP only answers when asked, so how does a phone hear about a message
   someone else just sent? Two ways, side by side:
     polling      every phone asks "anything new?" every 3 s: most answers are empty, and a message
                  waits up to 3 s to be seen;
     long polling every phone always has one question waiting at the server; the server holds it
                  open and answers the moment a message arrives (or after 25 s with nothing).
   Then ben goes into a tunnel. When he comes back, his app can ask for "the latest messages" (and lose
   whatever scrolled past) or "everything after the last message I have" (a cursor, and loses nothing).
   Everything runs on a simulated clock: delays, request counts and losses are counted, not assumed. */
VIZ.register("bx-hearth", async (api) => {
  const W = await api.world3d();
  api.wide();
  const NET = 0.15, POLL = 3, HOLD = 25, TUNNEL = 9;
  const LINES = ["standup in 5?", "PR is up", "lunch?", "deploy done", "who broke main", "coffee?", "LGTM", "on it", "back in 10", "tests are green",
    "ship it", "meeting moved", "can you review?", "fixed", "brb", "nice", "1 min", "merged", "rollback?", "all good"];
  const PEOPLE = [{ name: "ana", x: -4.2 }, { name: "ben", x: 0 }, { name: "chloe", x: 4.2 }];
  const SERVER = [0, 2.4, 0];
  const phonePos = (p) => [p.x, -0.9, 0];
  let mode = "poll", catchup = "after", t = 0, msgs = [], flights = [], seq = 0, reached = api.wasDone;
  let stats, lastHud = -1, trip = null, longOk = false, tripOk = false, rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  function reset() {
    t = 0; msgs = []; seq = 0; trip = null; lastHud = -1;
    for (const f of flights) W.remove(f.key);
    flights = [];
    stats = { delays: [], requests: 0, empty: 0 };
    PEOPLE.forEach((p, i) => Object.assign(p, { lastId: 0, seen: new Set(), offline: false, offUntil: 0, inflight: false, held: null, nextPoll: 0.4 + i * 1.0, nextSend: 1.5 + i * 2.2 + rand() * 2, rejoin: false }));
    draw();
  }

  // a flight is a block moving from a to b over dur seconds, then calling done()
  function fly(kind, a, b, done) {
    const key = "f" + seq++;
    const look = { msg: ["c2", 0.32, 0.22], ask: ["c5", 0.16, 0.16], answer: ["c3", 0.2, 0.2], empty: ["c5", 0.12, 0.12] }[kind];
    flights.push({ key, a, b, t0: t, dur: NET, done });
    W.box(key, { x: a[0], y: a[1], z: 0.5, sx: look[1], sy: look[2], sz: 0.1, color: look[0], glow: kind === "msg" ? 0.5 : 0.2, instant: true });
  }

  // the server's two routes: POST a message, and GET messages after a cursor (or the latest few)
  function serverGet(p, latest) {
    if (latest) return msgs.slice(-2);
    return msgs.filter((m) => m.id > p.lastId);
  }
  function answer(p, list) {
    p.held = null;
    fly(list.length ? "answer" : "empty", SERVER, phonePos(p), () => receive(p, list));
  }
  function ask(p) {
    if (p.offline || p.inflight) return;
    p.inflight = true;
    stats.requests++;
    const latest = p.rejoin && catchup === "latest";
    p.rejoin = false;
    fly("ask", phonePos(p), SERVER, () => {
      if (p.offline) { p.inflight = false; return; } // lost in the tunnel
      const list = serverGet(p, latest); // "the latest 2": the cursor then jumps to the newest, past whatever was missed
      if (mode === "long" && !list.length) { p.held = { since: t }; draw(); return; }
      answer(p, list);
    });
  }
  function receive(p, list) {
    p.inflight = false;
    if (p.offline) return; // the answer went nowhere
    if (!list.length) stats.empty++;
    for (const m of list) {
      if (!p.seen.has(m.id) && m.from !== p.name) stats.delays.push(t - m.at);
      p.seen.add(m.id);
      p.lastId = Math.max(p.lastId, m.id);
    }
    if (trip && p.name === "ben" && trip.back && !trip.judged) judge();
    draw();
    if (mode === "long") ask(p);
    else p.nextPoll = t + POLL;
  }
  function send(p) {
    const text = LINES[Math.floor(rand() * LINES.length)];
    fly("msg", phonePos(p), SERVER, () => {
      const m = { id: msgs.length + 1, from: p.name, text, at: t };
      msgs.push(m);
      p.seen.add(m.id);
      W.flash("srv");
      // long polling: every question held open is answered now
      if (mode === "long") for (const q of PEOPLE) if (q.held) answer(q, serverGet(q));
      draw();
    });
  }

  const lostFor = (p) => msgs.filter((m) => m.from !== p.name && m.id <= p.lastId && !p.seen.has(m.id)).length;
  function judge() {
    trip.judged = true;
    const lost = lostFor(PEOPLE[1]);
    if (catchup === "after" && lost === 0) {
      tripOk = true;
      api.explain("Back from the tunnel, nothing lost", `<p>Ben's app asked for everything after the last message it had, <code>?after=${trip.cursor}</code>, and got all ${trip.missed} he missed, in order. The cursor is just the id of the last message he saw: the server needs to remember nothing about him.</p>`);
    } else if (catchup === "latest") {
      api.explain(`Ben lost ${lost} message${lost === 1 ? "" : "s"}`, `<p>His app asked for "the latest 2 messages" and moved on from there. Everything older that arrived while he was in the tunnel scrolled past, and nothing will ever bring it back. Switch to <b>after my last id</b> and try the tunnel again.</p>`);
    }
    check();
  }
  function check() {
    if (!reached && longOk && tripOk) { reached = true; api.done("Messages arrive the moment they're sent, and a reconnect loses nothing"); }
  }

  function draw() {
    W.box("srv", { x: SERVER[0], y: SERVER[1], z: 0, sx: 2.6, sy: 1.0, sz: 1.0, color: "c1", opacity: 0.85, label: `server · ${msgs.length} messages`, labelSize: 0.2, instant: true,
      info: { title: "The chat server", html: "<p>It keeps every message with an id that only goes up: 1, 2, 3… It has two routes: <code>POST</code> a message, and <code>GET</code> the messages <b>after</b> an id. That one number, the last id a phone has, is all a phone needs to catch up, from anywhere, at any time.</p>" } });
    for (const p of PEOPLE) {
      const got = msgs.filter((m) => p.seen.has(m.id)).length, lost = lostFor(p);
      const label = p.offline ? `${p.name}\nin a tunnel` : `${p.name}\nhas ${got} of ${msgs.length}${lost ? `\n${lost} lost` : ""}`;
      W.box("p_" + p.name, { x: p.x, y: -0.9, z: 0, sx: 1.0, sy: 1.7, sz: 0.2, color: p.offline ? "c5" : lost ? "bad" : "c2", opacity: p.offline ? 0.4 : 0.85, label, labelSize: 0.18, instant: true,
        info: { title: p.name + "'s phone", html: `<p>The chat app. It shows a message once the server has told it about it. Its cursor, the id of the last message it has, is <b>${p.lastId}</b>.</p>` } });
      if (p.held) W.box("h_" + p.name, { x: p.x * 0.55, y: 1.55, z: 0.3, sx: 0.22, sy: 0.22, sz: 0.1, color: "c4", glow: 0.5, instant: true,
        info: { title: "A question held open", html: "<p>This is " + p.name + "'s request, waiting at the server. It costs almost nothing while it waits. When a message arrives the server answers it at once, and the phone immediately sends the next one.</p>" } });
      else W.remove("h_" + p.name);
    }
  }

  function hud() {
    const d = stats.delays, avg = d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
    api.hud(`${mode === "poll" ? "polling" : "long polling"} · seen after <b>${avg == null ? "–" : avg.toFixed(2) + " s"}</b> on average · <b>${stats.requests}</b> requests, <b>${stats.empty}</b> empty`);
    return avg;
  }

  api.loop((dt) => {
    t += dt;
    for (const p of PEOPLE) {
      if (p.offline && t >= p.offUntil) {
        p.offline = false; p.rejoin = true;
        trip.back = true; trip.cursor = p.lastId; trip.missed = msgs.filter((m) => m.from !== p.name && m.id > p.lastId).length;
        draw(); ask(p);
      }
      if (!p.offline && t >= p.nextSend) { send(p); p.nextSend = t + (PEOPLE[1].offline ? 1.5 + rand() * 1.5 : 6 + rand() * 8); } // busier while ben is away, so he misses a few
      if (mode === "poll" && !p.offline && t >= p.nextPoll && !p.inflight) ask(p);
      if (mode === "long" && !p.offline && !p.inflight) ask(p);
      if (p.held && t - p.held.since >= HOLD) answer(p, []);
    }
    for (const f of flights.slice()) {
      const k = Math.min(1, (t - f.t0) / f.dur);
      W.box(f.key, { x: f.a[0] + (f.b[0] - f.a[0]) * k, y: f.a[1] + (f.b[1] - f.a[1]) * k, instant: true });
      if (k >= 1) { flights.splice(flights.indexOf(f), 1); W.remove(f.key); f.done(); }
    }
    if (t - lastHud > 0.25) {
      lastHud = t;
      const avg = hud();
      if (mode === "long" && avg != null && avg < 0.5 && stats.delays.length >= 3 && !longOk) {
        longOk = true;
        api.explain("Seen the moment it's sent", `<p>Every message reached the other phones in about ${avg.toFixed(2)} s: one trip to the server and one back. Nobody asked "anything new?" on a timer; each phone's question was already waiting there.</p><p>Now send <b>ben through a tunnel</b>.</p>`);
        check();
      }
    }
  });

  api.seg([{ label: "poll every 3 s", value: "poll" }, { label: "long polling", value: "long" }], mode, (m) => {
    mode = m; reset();
    api.explain(m === "poll" ? "Polling" : "Long polling", m === "poll"
      ? "<p>Every 3 seconds each phone asks the server \"anything after my last id?\". The asking never stops, even when nobody types, and a message waits until the next ask (1.5 s on average, up to 3), plus the trip there and back. Asking more often makes it faster and multiplies the requests.</p>"
      : "<p>Each phone asks once, and the server <b>holds the request open</b> until there's something to say. A message is answered to every waiting phone at once. After 25 s with nothing, the server answers empty and the phone asks again, so the connection never sits silent long enough for a proxy to cut it.</p>");
  });
  api.seg([{ label: "after my last id", value: "after" }, { label: "just the latest 2", value: "latest" }], catchup, (c) => { catchup = c; });
  api.button("Send ben through a tunnel", () => {
    const ben = PEOPLE[1];
    if (ben.offline) return;
    ben.offline = true; ben.offUntil = t + TUNNEL; ben.held = null; ben.inflight = false; // a held question dies with the connection
    trip = { back: false, judged: false };
    for (const p of PEOPLE) if (p !== ben) p.nextSend = Math.min(p.nextSend, t + 1 + rand());
    draw();
    api.status(`Ben is offline for ${TUNNEL} s. The others keep chatting. When he's back, his app asks: ${catchup === "after" ? "everything after my last id" : "the latest 2 messages"}.`);
  }, { primary: true });
  reset();
  const wide = api.view.clientWidth || 640;
  W.camera({ target: [0, 0.6, 0], dist: 11.5 * Math.max(1, 640 / wide), theta: 0, phi: 1.45, instant: true });
  hud();
  api.status("Three teammates chatting. A blue block is a message, grey dots are phones asking \"anything new?\", green is an answer with messages.");
  api.explain("How to read this", "<p>A server only answers when a phone asks. Watch how often the phones ask, and how long a message takes to show up on the other two. Click any block to see why.</p>");
});
