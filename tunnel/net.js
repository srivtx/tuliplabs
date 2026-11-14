/* The whiteboard's simulator: any design you can draw, run as a seeded discrete-event simulation. No DOM, so the page
   and tools/board-check.js run the same code and get the same numbers for the same seed.

   A design is parts and wires: {nodes: [{id, kind, n, size, batch}], wires: [[from, to], ...]}.
   Every part is a station: c workers (n machines × workers each), each serving one request at a time for an
   exponential time averaging its service, in arrival order. The kinds:
     users     where requests come from: `rate` a second, a Poisson stream. Exactly one wire out.
     lb        a load balancer: hands each request to the next app box it's wired to, in turn.
     app       app servers (n machines). Does its own work, then reads: from a cache it's wired to, else a read
               replica (in turn), else the database. A click that also counts (`count`) then writes the count:
               into a queue it's wired to (and the user is answered), else straight into the database (and the
               user waits for it).
     cache     a hit (Zipf's law over the question's `keys` links: the cache holds the hottest ones) is answered at
               once; a miss reads from a replica or the database behind it.
     db        the database: reads and writes. size small or large.
     replica   a read-only copy of the database.
     queue     takes a count in a millisecond and holds it for the workers behind it.
     worker    background workers: each waits until `batch` counts are queued (or the oldest has waited a second)
               and writes them to the database in one go.
   compile(design, q) says what's wrong with a drawing in words, before anything runs.
   run(design, q, {rate, seed, settle, win}) runs it: requests that arrive in [settle, settle + win] are measured.
   stats: p50, p99 (seconds; a request still unanswered is counted at its age, and one slower than q.timeout is an
   error), errors (share), util per part (busy share of its workers), queue per part (average waiting), lag (the
   oldest count still waiting at the end, seconds), cost (dollars a month), dbLoad (requests a second at the db),
   tput per part (finished a second) and flow per wire ("from>to": requests a second along it), for the board's dots. */
(function (root) {
  "use strict";
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class Heap {
    constructor() { this.a = []; this.n = 0; }
    push(e) { e.k = this.n++; const a = this.a; a.push(e); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
      return top;
    }
    get size() { return this.a.length; }
  }
  const less = (x, y) => x.t < y.t || (x.t === y.t && x.k < y.k);
  // first in, first out, with a moving head so taking from the front costs nothing
  class Fifo {
    constructor() { this.a = []; this.h = 0; }
    get length() { return this.a.length - this.h; }
    push(x) { this.a.push(x); }
    peek() { return this.a[this.h]; }
    shift() { const x = this.a[this.h++]; if (this.h > 4096 && this.h * 2 > this.a.length) { this.a = this.a.slice(this.h); this.h = 0; } return x; }
    take(n) { const out = []; while (out.length < n && this.length) out.push(this.shift()); return out; }
  }

  // The parts tray. Prices are dollars a month. A question can change any service time with q.svc.
  const KINDS = {
    users: { name: "users", fixed: true },
    lb: { name: "load balancer", workers: 256, service: 0.0005, price: 20 },
    app: { name: "app servers", workers: 8, service: 0.015, price: 80, many: true },
    cache: { name: "cache", workers: 256, service: 0.001, sizes: { "1 GB": [10000, 30], "4 GB": [40000, 100], "16 GB": [160000, 350] }, size: "1 GB" },
    db: { name: "database", service: 0.012, sizes: { small: [8, 150], large: [32, 600] }, size: "small" },
    replica: { name: "read replicas", workers: 8, service: 0.012, price: 150, many: true },
    queue: { name: "queue", workers: 256, service: 0.001, price: 20 },
    worker: { name: "workers", workers: 4, service: 0.02, price: 80, many: true, batches: [1, 10, 100] },
  };
  const ORDER = ["users", "lb", "app", "cache", "db", "replica", "queue", "worker"];
  const workersOf = (nd) => nd.kind === "db" ? KINDS.db.sizes[nd.size || "small"][0] : (KINDS[nd.kind].workers || 1) * (KINDS[nd.kind].many ? nd.n || 1 : 1);
  const serviceOf = (nd, q) => ((q && q.svc) || {})[nd.kind] ?? KINDS[nd.kind].service;
  function costOf(design) {
    let c = 0;
    for (const nd of design.nodes) {
      const K = KINDS[nd.kind];
      if (nd.kind === "db") c += K.sizes[nd.size || "small"][1];
      else if (nd.kind === "cache") c += K.sizes[nd.size || K.size][1];
      else if (K.price) c += K.price * (K.many ? nd.n || 1 : 1);
    }
    return c;
  }
  // The share of clicks a cache of `size` answers: it holds the hottest links, and link k is clicked in proportion
  // to 1 / k^zipf (Zipf's law). So the hit rate is the top `size` links' share of all clicks.
  const H = new Map();
  function zipfShare(top, keys, s) {
    const id = keys + ":" + s;
    if (!H.has(id)) { const c = new Float64Array(keys + 1); for (let k = 1; k <= keys; k++) c[k] = c[k - 1] + 1 / Math.pow(k, s); H.set(id, c); }
    const c = H.get(id);
    return c[Math.min(top, keys)] / c[keys];
  }
  const hitRate = (nd, q) => zipfShare(KINDS.cache.sizes[nd.size || KINDS.cache.size][0], q.keys || 1000000, q.zipf || 1);

  const outs = (design, id) => design.wires.filter((w) => w[0] === id).map((w) => design.nodes.find((n) => n.id === w[1])).filter(Boolean);
  const ins = (design, id) => design.wires.filter((w) => w[1] === id).map((w) => design.nodes.find((n) => n.id === w[0])).filter(Boolean);
  const nameOf = (nd) => KINDS[nd.kind].name;

  // What's wrong with a drawing, in words, each tied to the part it's about. Problems stop a run; notes don't.
  function compile(design, q = {}) {
    const problems = [], notes = [], P = (node, text) => problems.push({ node, text }), N = (node, text) => notes.push({ node, text });
    const users = design.nodes.filter((n) => n.kind === "users");
    if (users.length !== 1) { P(null, "The board needs exactly one crowd of users."); return { problems, notes }; }
    const u = users[0], first = outs(design, u.id);
    if (!first.length) P(u.id, "Wire the users to your system: drag from the users to a load balancer or an app server.");
    else if (first.length > 1) P(u.id, "Users only know one address. Wire them to a single load balancer or app server.");
    else if (!["lb", "app"].includes(first[0].kind)) P(u.id, `Users can't talk to the ${nameOf(first[0])} directly. They reach an app server, or a load balancer in front of one.`);
    for (const nd of design.nodes) {
      const o = outs(design, nd.id), i = ins(design, nd.id), has = (k) => o.some((x) => x.kind === k);
      if (nd.kind !== "users" && !i.length && !o.length) { N(nd.id, `The ${nameOf(nd)} isn't wired to anything, so it does nothing (but it's on the bill).`); continue; }
      if (nd.kind !== "users" && !i.length) P(nd.id, `Nothing sends work to the ${nameOf(nd)}. Wire something into it.`);
      if (nd.kind === "lb" && (!o.length || o.some((x) => x.kind !== "app"))) P(nd.id, "A load balancer spreads requests over app servers: wire it to app servers only.");
      if (nd.kind === "app") {
        if ((nd.n || 1) > 1 && i.some((x) => x.kind === "users")) P(nd.id, `${nd.n} app servers, but users only know one address. Put a load balancer in front to share the clicks out.`);
        if (!has("cache") && !has("replica") && !has("db")) P(nd.id, "The app server needs somewhere to read links from: wire it to a cache, a replica or the database.");
        if (q.count && !has("queue") && !has("db")) P(nd.id, "Every click writes a count, and it needs somewhere to go: wire the app to the database, or to a queue.");
        if (o.some((x) => ["users", "lb", "app", "worker"].includes(x.kind))) P(nd.id, "App servers call caches, databases and queues, not other app servers or load balancers.");
      }
      if (nd.kind === "cache" && !o.some((x) => x.kind === "db" || x.kind === "replica")) P(nd.id, "A cache only holds some links. On a miss it reads from the database: wire it to the database or a replica.");
      if (nd.kind === "replica" && !design.nodes.some((x) => x.kind === "db")) P(nd.id, "A replica is a copy of the database, so there has to be a database to copy.");
      if (nd.kind === "replica" && o.length) P(nd.id, "A replica answers reads itself; it doesn't send them anywhere.");
      if (nd.kind === "db" && o.length) P(nd.id, "The database is the end of the line: wires go into it, not out of it.");
      if (nd.kind === "queue" && !has("worker")) P(nd.id, "A queue only holds work. Wire it to workers that take the counts out.");
      if (nd.kind === "worker" && !has("db")) P(nd.id, "The workers write the counts somewhere: wire them to the database.");
    }
    if (!design.nodes.some((n) => n.kind === "db")) P(null, "Every link lives in the database. Put one on the board.");
    if (design.nodes.filter((n) => n.kind === "db").length > 1) P(null, "One database is the source of truth here. Use read replicas for copies.");
    return { problems, notes };
  }

  // One run. Requests are clicks: each reads one link, and with q.count also writes one count.
  function run(design, q = {}, o = {}) {
    const rate = o.rate ?? q.rate ?? 100, seed = o.seed ?? 1, settle = o.settle ?? 10, win = o.win ?? 20, drain = q.timeout ?? 2;
    const A = settle, B = settle + win, END = B + drain, R = rng(seed), ev = new Heap();
    const ex = (m) => -Math.log(1 - R()) * m;
    const st = new Map();
    for (const nd of design.nodes) if (nd.kind !== "users") st.set(nd.id, { nd, c: workersOf(nd), s: serviceOf(nd, q), busy: 0, q: new Fifo(), area: 0, qarea: 0, last: 0, n: 0, rr: 0 });
    const FLUSH = 1;
    const kids = new Map(design.nodes.map((nd) => [nd.id, outs(design, nd.id)]));
    const pick = (from, kinds) => { for (const k of kinds) { const xs = kids.get(from).filter((x) => x.kind === k); if (xs.length) { const s = st.get(from); return xs[s.rr++ % xs.length]; } } return null; };
    const uid = design.nodes.find((n) => n.kind === "users").id, entry = outs(design, uid)[0];
    // a station's busy and waiting time, inside the measured window only
    const mark = (s, t) => { const a = Math.max(s.last, A), b = Math.min(t, B); if (b > a) { s.area += s.busy * (b - a); s.qarea += s.q.length * (b - a); } s.last = t; };
    const reqs = [], jobs = [], flow = {};
    let dbIn = 0;
    function arrive(t, id, r, from) {
      const s = st.get(id);
      mark(s, t);
      if (t >= A && t < B) { if (s.nd.kind === "db") dbIn++; const k = from + ">" + id; flow[k] = (flow[k] || 0) + 1; }
      if (s.nd.kind === "worker") { s.q.push(r); return tryWork(t, s); }
      if (s.busy < s.c) { s.busy++; ev.push({ t: t + ex(s.s), fn: finish, id, r }); }
      else s.q.push(r);
    }
    // a worker takes a full batch, or whatever is there once the oldest count has waited a second
    function tryWork(t, s) {
      const b = s.nd.batch || 1;
      while (s.busy < s.c && s.q.length && (s.q.length >= b || t - s.q.peek().t0 >= FLUSH - 1e-9)) {
        const take = s.q.take(b);
        s.busy++;
        ev.push({ t: t + ex(s.s), fn: finish, id: s.nd.id, r: { job: take } });
      }
      // a partial batch with a free worker: wake when its oldest count turns a second old (a busy worker calls
      // tryWork itself when it frees up, so it needs no timer)
      if (s.busy < s.c && s.q.length) {
        const at = s.q.peek().t0 + FLUSH;
        if (!(s.timer > t && s.timer <= at)) { s.timer = at; ev.push({ t: at, fn: (tt) => { mark(s, tt); tryWork(tt, s); }, id: s.nd.id }); }
      }
    }
    function free(t, s) {
      if (s.nd.kind === "worker") { s.busy--; return tryWork(t, s); }
      if (s.q.length) ev.push({ t: t + ex(s.s), fn: finish, id: s.nd.id, r: s.q.shift() });
      else s.busy--;
    }
    function finish(t, id, r) {
      const s = st.get(id), nd = s.nd;
      mark(s, t);
      if (t >= A && t < B) s.n++;
      free(t, s);
      if (r.job) { // workers wrote a batch: it goes to the database as one write
        if (nd.kind === "worker") return arrive(t, pick(id, ["db"]).id, { jobw: r.job }, id);
        return;
      }
      if (r.jobw) { for (const j of r.jobw) j.done = t; return; }
      const next = route(t, nd, r);
      // a count is written by the app server, whichever part answered the read, so it travels the app's wire
      if (next) arrive(t, next.id, r, r.phase === "write" ? r.app : id); else r.done = t;
    }
    function afterRead(t, r) {
      if (!q.count) return null;
      r.phase = "write";
      const qu = pick(r.app, ["queue"]);
      if (qu) return qu;
      return pick(r.app, ["db"]);
    }
    function route(t, nd, r) {
      switch (nd.kind) {
        case "lb": return pick(nd.id, ["app"]);
        case "app": r.app = nd.id; r.phase = "read"; return pick(nd.id, ["cache", "replica", "db"]);
        case "cache": return R() < hitRate(nd, q) ? afterRead(t, r) : pick(nd.id, ["replica", "db"]);
        case "replica": return afterRead(t, r);
        case "db": return r.phase === "read" ? afterRead(t, r) : null;
        case "queue": { const job = { t0: t, done: null }; jobs.push(job); arrive(t, pick(nd.id, ["worker"]).id, job, nd.id); return null; }
      }
      return null;
    }
    // arrivals: one Poisson stream
    let t = 0;
    for (;;) {
      t += ex(1 / rate);
      if (t >= B) break;
      const r = { t0: t, done: null };
      reqs.push(r);
      ev.push({ t, fn: (tt, id, rr) => arrive(tt, entry.id, rr, uid), r });
    }
    while (ev.size) { const e = ev.pop(); if (e.t > END) break; e.fn(e.t, e.id, e.r); }
    for (const s of st.values()) mark(s, END);
    const lat = reqs.filter((r) => r.t0 >= A).map((r) => (r.done == null ? END - r.t0 : r.done - r.t0)).sort((a, b) => a - b);
    const qt = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0;
    const util = {}, queue = {}, tput = {};
    for (const [id, s] of st) { util[id] = s.area / (s.c * win); queue[id] = s.qarea / win; tput[id] = s.n / win; }
    for (const k in flow) flow[k] /= win;
    const waiting = jobs.filter((j) => j.done == null || j.done > B).filter((j) => j.t0 <= B);
    return {
      p50: qt(0.5), p99: qt(0.99), errors: lat.filter((x) => x > drain).length / Math.max(1, lat.length), n: lat.length,
      util, queue, tput, flow, cost: costOf(design), dbLoad: dbIn / win,
      lag: waiting.length ? B - Math.min(...waiting.map((j) => j.t0)) : 0,
    };
  }

  // The path one click takes through a drawing, as part ids: {hit: true/false} says what its cache does.
  function path(design, { hit = false, count = false } = {}) {
    const ps = [], q = { count };
    let at = design.nodes.find((n) => n.kind === "users");
    const seen = new Set();
    ps.push(at.id);
    at = outs(design, at.id)[0];
    let phase = "read", app = null;
    const first = (from, kinds) => { for (const k of kinds) { const x = outs(design, from).find((n) => n.kind === k); if (x) return x; } return null; };
    const write = () => (q.count ? (phase = "write", first(app, ["queue", "db"])) : null);
    while (at && !seen.has(at.id + phase)) {
      seen.add(at.id + phase);
      ps.push(at.id);
      const k = at.kind;
      if (k === "lb") at = first(at.id, ["app"]);
      else if (k === "app") { app = at.id; at = first(at.id, ["cache", "replica", "db"]); }
      else if (k === "cache") at = hit ? write() : first(at.id, ["replica", "db"]);
      else if (k === "replica") at = write();
      else if (k === "db") at = phase === "read" ? write() : null;
      else if (k === "queue") at = null;
      else at = null;
    }
    return ps;
  }

  // Erlang C: the chance a request waits at an M/M/c station, and the mean wait. For the checker.
  function erlangC(c, lam, mu) {
    const a = lam / mu, rho = a / c;
    if (rho >= 1) return { pw: 1, wq: Infinity };
    let sum = 0, term = 1;
    for (let k = 0; k < c; k++) { if (k) term *= a / k; sum += term; }
    const last = term * (a / c) / (1 - rho);
    const pw = last / (sum + last);
    return { pw, wq: pw / (c * mu - lam) };
  }

  const API = { KINDS, ORDER, compile, run, path, costOf, zipfShare, hitRate, workersOf, serviceOf, erlangC, rng, outs, ins };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.NET = API;
})(typeof self !== "undefined" ? self : this);
