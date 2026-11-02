/* Build your own X, chapter 20: distributed consensus with Raft.
   Five servers in a ring. Each has a role (follower, candidate, leader), a term number, an
   election timer (the bar above it) and a log (the row of blocks below it). Messages fly between
   them: vote requests, votes, AppendEntries (heartbeats that also carry new log entries) and replies.
   Crash servers by clicking them, or crash the leader, and watch the rest elect a new one.
   The "why": with one copy of the data, one crash loses it. With copies, servers must agree on the
   order of writes even while some are down; a write counts only once a majority has it, and any two
   majorities overlap, so a new leader always has every committed write. */
VIZ.register("bx-raft", async (api) => {
  const W = await api.world3d();
  const N = 5, MAJ = 3, R = 3.4, CY = 1.5, DELAY = 3, HB = 4, TICK = 0.14, SHOW = 8;
  const POS = Array.from({ length: N }, (_, i) => {
    const a = Math.PI / 2 - (i * 2 * Math.PI) / N;
    return [R * Math.cos(a), CY + R * Math.sin(a)];
  });
  const TERMC = ["c2", "c1", "c4", "c3"];
  let seed = 4242, tickNo = 0, uid = 0, writes = 0, paused = false, acc = 0;
  let msgs = [], nodes = [], lastLeader = null;
  let crashedLeaderTerm = null, goalWrite = null, reached = false;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const timeout = () => 14 + Math.floor(rnd() * 14);
  const lastTerm = (n) => (n.log.length ? n.log[n.log.length - 1].t : 0);

  function init() {
    nodes = Array.from({ length: N }, (_, i) => ({ i, alive: true, role: "f", term: 0, voted: null, log: [], commit: 0, timer: timeout() + i * 3, votes: new Set(), next: [], match: [], hb: 0 }));
    for (const m of msgs) W.remove(m.id);
    msgs = [];
  }
  function send(from, to, type, body) {
    const m = { id: "m" + uid++, from, to, type, t0: tickNo, ...body };
    msgs.push(m);
    const big = (type === "append" && m.entries.length) || type === "vote";
    W.box(m.id, { x: POS[from][0], y: POS[from][1], z: 0.6, s: big ? 0.3 : 0.2, color: { reqvote: "c4", vote: m.granted ? "c4" : "c5", append: m.entries?.length ? "c2" : "c5", reply: "c3" }[type], glow: 0.3, instant: true,
      info: {
        reqvote: { title: `S${from + 1} asks S${to + 1} for its vote (term ${m.term})`, html: "<p>A candidate asks every server for a vote. Each server votes at most once per term, and only for a candidate whose log is <b>at least as up to date</b> as its own. That rule is what stops a server that missed committed writes from becoming leader.</p>" },
        vote: { title: m.granted ? `S${from + 1} votes for S${to + 1}` : `S${from + 1} refuses S${to + 1}`, html: "<p>A vote. A candidate needs votes from a <b>majority</b> (3 of 5, counting its own). Two candidates can't both get 3 of 5 in the same term, so there is never more than one leader per term.</p>" },
        append: { title: m.entries?.length ? `AppendEntries: ${m.entries.length} new entr${m.entries.length > 1 ? "ies" : "y"}` : "Heartbeat (an empty AppendEntries)", html: "<p>The leader sends these regularly. Empty ones are <b>heartbeats</b>: \"I'm still here, don't start an election.\" Non-empty ones copy log entries to the follower, along with the index and term of the entry just before them so the follower can check its log matches.</p>" },
        reply: { title: m.ok ? `S${from + 1}: "my log now matches up to entry ${m.match}"` : `S${from + 1}: "my log doesn't match there"`, html: "<p>On a mismatch the leader steps back one entry and tries again, until it finds where the logs agree, then overwrites the follower's log from there. The leader's log always wins.</p>" },
      }[type] });
  }
  function stepDown(n, term) { n.term = term; n.role = "f"; n.voted = null; }
  function becomeLeader(n) {
    n.role = "l"; n.hb = 0;
    n.next = Array(N).fill(n.log.length); n.match = Array(N).fill(0);
    lastLeader = n.i;
    if (crashedLeaderTerm !== null && n.term > crashedLeaderTerm)
      api.explain(`S${n.i + 1} is the new leader (term ${n.term})`, `<p>Its election timer ran out first, it asked for votes, and got ${n.votes.size} of ${N}. A majority was still alive, so the cluster recovered by itself, in a few heartbeats.</p><p>Now press <b>Client write</b>: the new leader must get the write onto a majority before it counts.</p>`);
    else api.explain(`S${n.i + 1} became leader for term ${n.term}`, `<p>It got ${n.votes.size} of ${N} votes. Its heartbeats now reset everyone's election timers, so nobody else starts an election.</p><p>Try <b>Client write</b>, then <b>Crash the leader</b>.</p>`);
  }
  function deliver(m) {
    const n = nodes[m.to];
    if (!n.alive) return;
    if (m.term > n.term) stepDown(n, m.term);
    if (m.type === "reqvote") {
      const upToDate = m.lastTerm > lastTerm(n) || (m.lastTerm === lastTerm(n) && m.lastIdx >= n.log.length);
      const granted = m.term === n.term && (n.voted === null || n.voted === m.from) && upToDate;
      if (granted) { n.voted = m.from; n.timer = timeout(); }
      send(n.i, m.from, "vote", { term: n.term, granted });
    } else if (m.type === "vote") {
      if (n.role === "c" && m.term === n.term && m.granted) {
        n.votes.add(m.from);
        if (n.votes.size >= MAJ) becomeLeader(n);
      }
    } else if (m.type === "append") {
      if (m.term < n.term) { send(n.i, m.from, "reply", { term: n.term, ok: false, match: 0 }); return; }
      n.role = "f"; n.timer = timeout();
      const fits = m.prevIdx === 0 || (n.log[m.prevIdx - 1] && n.log[m.prevIdx - 1].t === m.prevTerm);
      if (!fits) { send(n.i, m.from, "reply", { term: n.term, ok: false, match: 0 }); return; }
      n.log = n.log.slice(0, m.prevIdx).concat(m.entries);
      const upto = m.prevIdx + m.entries.length;
      n.commit = Math.max(n.commit, Math.min(m.commit, upto));
      send(n.i, m.from, "reply", { term: n.term, ok: true, match: upto });
    } else if (m.type === "reply") {
      if (n.role !== "l" || m.term !== n.term) return;
      if (m.ok) { n.match[m.from] = Math.max(n.match[m.from], m.match); n.next[m.from] = n.match[m.from]; }
      else n.next[m.from] = Math.max(0, n.next[m.from] - 1);
      for (let k = n.log.length; k > n.commit; k--) {
        const have = 1 + nodes.filter((o) => o.i !== n.i && n.match[o.i] >= k).length;
        if (have >= MAJ && n.log[k - 1].t === n.term) { n.commit = k; break; }
      }
    }
  }
  function heartbeat(n) {
    for (let j = 0; j < N; j++) if (j !== n.i) {
      const prevIdx = n.next[j];
      send(n.i, j, "append", { term: n.term, prevIdx, prevTerm: prevIdx ? n.log[prevIdx - 1].t : 0, entries: n.log.slice(prevIdx), commit: n.commit });
    }
  }
  function tick() {
    tickNo++;
    const now = [];
    msgs = msgs.filter((m) => {
      const p = (tickNo - m.t0) / DELAY;
      if (p >= 1) { W.remove(m.id); now.push(m); return false; }
      W.box(m.id, { x: POS[m.from][0] + (POS[m.to][0] - POS[m.from][0]) * p, y: POS[m.from][1] + (POS[m.to][1] - POS[m.from][1]) * p });
      return true;
    });
    for (const m of now) deliver(m);
    for (const n of nodes) {
      if (!n.alive) continue;
      if (n.role === "l") { if (n.hb-- <= 0) { heartbeat(n); n.hb = HB; } continue; }
      if (--n.timer <= 0) {
        n.role = "c"; n.term++; n.voted = n.i; n.votes = new Set([n.i]); n.timer = timeout();
        for (let j = 0; j < N; j++) if (j !== n.i) send(n.i, j, "reqvote", { term: n.term, lastIdx: n.log.length, lastTerm: lastTerm(n) });
      }
    }
    checkGoal();
    draw();
  }
  function leader() {
    const ls = nodes.filter((n) => n.alive && n.role === "l");
    return ls.sort((a, b) => b.term - a.term)[0] || null;
  }
  function checkGoal() {
    if (reached || !goalWrite) return;
    const n = nodes[goalWrite.node];
    if (n.alive && n.role === "l" && n.term === goalWrite.term && n.commit >= goalWrite.idx) {
      reached = true;
      api.explain("Committed, after a crash", `<p>The write <b>${goalWrite.cmd}</b> is on ${1 + nodes.filter((o) => o.i !== n.i && n.match[o.i] >= goalWrite.idx).length} of ${N} servers, so it's <b>committed</b>: the leader can tell the client \"done\", and no future leader can lose it, because any majority that elects one overlaps this one.</p><p>Now crash a third server. With only 2 of 5 alive, nobody can win an election and nothing commits: Raft chooses being unavailable over being wrong.</p>`);
      api.done("A new leader took over and committed a write");
    }
  }
  function draw() {
    nodes.forEach((n, i) => {
      const [x, y] = POS[i];
      const role = !n.alive ? "crashed" : { f: "follower", c: "candidate", l: "leader" }[n.role];
      W.box("n" + i, { x, y, z: 0, s: 1.1, color: !n.alive ? "c5" : { f: "c2", c: "c4", l: "c3" }[n.role], opacity: n.alive ? 1 : 0.3, glow: n.role === "l" && n.alive ? 0.35 : 0,
        label: `S${i + 1} ${role}\nterm ${n.term}`, labelSize: 0.26, labelUp: -0.55,
        info: { title: `S${i + 1}: ${role}, term ${n.term}`, html: `<p><b>Click the server to ${n.alive ? "crash" : "restart"} it.</b></p><p>Log: ${n.log.length} entries, ${n.commit} committed. ${n.voted !== null ? `Voted for S${n.voted + 1} in term ${n.term}.` : "Hasn't voted this term."}</p><p>The <b>term</b> is a logical clock: every election starts a new one. Seeing a higher term in any message makes a server step down to follower at once, so a stale leader that comes back can't do damage.</p>` } });
      const tw = n.alive && n.role !== "l" ? Math.max(0.04, (n.timer / 28) * 1.2) : 0.04;
      W.box("tm" + i, { x: x - 0.6 + tw / 2, y: y + 0.78, z: 0, sx: tw, sy: 0.1, sz: 0.1, color: n.timer < 5 ? "c1" : "muted", opacity: n.alive && n.role !== "l" ? 0.9 : 0,
        info: { title: "Election timer", html: "<p>Counts down; any message from a leader resets it. If it runs out, this server assumes the leader is dead and starts an election. Each server picks a <b>random</b> timeout, so usually one wakes up first and wins before the others start, instead of all splitting the vote forever.</p>" } });
      const from = Math.max(0, n.log.length - SHOW);
      for (let k = 0; k < SHOW; k++) {
        const e = n.log[from + k], key = `L${i}_${k}`;
        if (!e) { if (W.has(key)) W.remove(key); continue; }
        const done = from + k < n.commit;
        W.box(key, { x: x - 1.05 + k * 0.3, y: y - 0.92, z: 0, s: 0.26, color: TERMC[(e.t - 1) % TERMC.length], opacity: done ? 1 : 0.35, instant: !W.has(key),
          info: { title: `S${i + 1}, entry ${from + k + 1}: ${e.cmd} (term ${e.t}) ${done ? "committed" : "not committed yet"}`, html: "<p>Colour = the term in which a leader created it. Solid = <b>committed</b> (stored on a majority, so it's permanent). Faded = only on some servers so far; it could still be overwritten by a new leader if it never reached a majority.</p>" } });
      }
    });
    const L = leader();
    api.status(`tick ${tickNo}   leader: ${L ? `S${L.i + 1} (term ${L.term})` : "none (election in progress)"}   alive: ${nodes.filter((n) => n.alive).length}/${N}\n` +
      nodes.map((n) => `S${n.i + 1} ${(n.alive ? { f: "follower ", c: "candidate", l: "leader   " }[n.role] : "crashed  ")} term ${n.term}  committed ${n.commit}/${n.log.length}`).join("\n"));
  }
  function crash(i) {
    const n = nodes[i];
    if (n.alive && n.role === "l") crashedLeaderTerm = n.term;
    n.alive = !n.alive;
    if (n.alive) { n.role = "f"; n.commit = 0; n.timer = timeout(); }
    const alive = nodes.filter((o) => o.alive).length;
    if (!n.alive) api.explain(`S${i + 1} crashed`, alive >= MAJ ? `<p>${alive} of ${N} servers are still up: a majority. ${crashedLeaderTerm !== null && lastLeader === i ? "The followers stop hearing heartbeats; the first election timer to run out starts an election." : "The cluster carries on."}</p>` : `<p>Only ${alive} of ${N} are up, less than a majority. Elections keep starting (watch the terms climb) and never finish, and no write can commit. That's on purpose: if two halves of a split network could each elect a leader, they'd accept conflicting writes.</p>`);
    else api.explain(`S${i + 1} is back`, "<p>It kept its term, its vote and its log on disk. It rejoins as a follower; the leader's next AppendEntries finds where their logs agree and brings it up to date.</p>");
    draw();
  }
  W.onPick((key) => {
    if (/^n\d$/.test(key)) { crash(+key[1]); return false; }
  });
  api.button("Client write", () => {
    const L = leader();
    if (!L) { api.explain("No leader right now", "<p>An election is in progress (or there's no majority alive). A real client retries after a moment, or asks another server who the leader is.</p>"); return; }
    const cmd = `x=${++writes}`;
    L.log.push({ t: L.term, cmd });
    W.flash("n" + L.i);
    if (crashedLeaderTerm !== null && L.term > crashedLeaderTerm && !reached) goalWrite = { node: L.i, term: L.term, idx: L.log.length, cmd };
    api.explain(`S${L.i + 1} appends ${cmd}`, `<p>Only the leader accepts writes. It adds the entry to its own log (faded: not committed) and sends it with the next AppendEntries. Once 3 of ${N} servers have it, it's committed and turns solid.</p>`);
    draw();
  }, { primary: true });
  api.button("Crash the leader", () => {
    const L = leader();
    if (!L) { api.explain("No leader to crash", "<p>Wait for an election to finish.</p>"); return; }
    crash(L.i);
  });
  api.button("Restart all", () => { nodes.forEach((n, i) => { if (!n.alive) crash(i); }); });
  const pb = api.button("Pause", () => { paused = !paused; pb.textContent = paused ? "Resume" : "Pause"; });
  api.loop((dt) => {
    if (paused) return;
    acc += dt;
    while (acc >= TICK) { acc -= TICK; tick(); }
  });
  W.camera({ target: [0, 1.3, 0], dist: 15, theta: 0, phi: 1.5, instant: true });
  api.hud("click a server to crash or restart it · bar = election timer · row = log");
  init();
  draw();
  api.explain("How to read this", "<p>Five servers keep copies of the same log. One is the <b>leader</b> (green): it takes writes and copies them to the others. Blue are followers, amber a candidate asking for votes.</p><p>Wait for a leader, press <b>Client write</b> a few times, then <b>Crash the leader</b> and watch the others elect a new one.</p>");
});
