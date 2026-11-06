/* Wind Tunnel's simulator: a small system under load, as a seeded discrete-event simulation. No DOM, so the page and
   tools/tunnel-check.js run exactly the same code and get exactly the same numbers for the same seed.

   Load is either open (requests arrive at `rate` per second, a Poisson stream, whoever sends them) or closed
   (`users` people, each thinks for `think` seconds on average, sends one request, waits for the answer, thinks again).

   The system, front to back:
     cache     optional (`cache` > 0 keys, LRU). Each request reads one of `keys` keys, chosen by Zipf's law with
               exponent `zipf`, so a few keys are hot. A hit is answered in `cacheTime`; a miss goes on to the servers,
               and the answer is put in the cache on its way back (evicting the least recently used key).
     balancer  when there's more than one server: `lb` is "rr" (round robin), "least" (fewest requests in flight)
               or "random".
     servers   `servers` machines, each with `workers` that serve one request at a time; service averages `service`
               seconds (exponential, or fixed with dist:"fixed"). Server 1 can be `slow` times slower. Each server
               queues up to `queueMax` requests (then turns them away: an error).
               With warm:true the cache starts full of the hottest keys, as one that has been running a while.
   A client gives up after `timeout` seconds (also an error), but its request still uses a worker if it got one.
   With cancel:true (the default) a request whose client gave up leaves the queue; with cancel:false the server never
   hears about it and serves it anyway, to nobody.
   Clients can retry a failed request (`retries` more tries). The wait before try n is `backoff` × 2^(n-1) seconds, or
   with jitter:true a random time between 0 and that. A user's request only counts once: as answered, with its latency
   from the first try, or as an error when the last try fails.
   surge: {at, for, rate} sends `rate` instead for `for` seconds starting at `at`, then the old rate again.
   batch: {at, every, n, service} is slow background work, such as emails: n jobs land at once at `at`, then again every
   `every` seconds, each taking a worker `service` seconds on average. With jobWorkers 0 they go to the servers and wait
   in the same line as the website's requests. With jobWorkers > 0 they go to a queue of their own, served by that many
   workers, and the website never sees them. Jobs never time out and never count in the website's numbers; stats give
   `jobAge` (the longest any job waited, or has been waiting, in the window), `backlog` (jobs not yet done) and
   `allWorkers` (website and job workers together).

   new Sim(cfg, seed) · sim.set({...}) · sim.advance(toTime) · sim.view() for drawing · sim.stats(t0, t1) for a window ·
   Sim.replay(cfg, seed, changes, T) rebuilds the run at any moment T (the page's rewind) ·
   Sim.measure(cfg, {seed, warm, span}) for a steady-state number. With one server and no cache it draws random numbers
   in exactly the same order as the one-server sim it grew from, so those experiments' numbers didn't move. */
(function (root) {
  "use strict";
  // mulberry32: small, fast, and the same in every JS engine
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
  // a binary heap of events ordered by time, then by insertion so equal times stay deterministic
  class Heap {
    constructor() { this.a = []; this.n = 0; }
    push(e) { e.k = this.n++; const a = this.a; a.push(e); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
      return top;
    }
    peek() { return this.a[0]; }
    get size() { return this.a.length; }
  }
  const less = (x, y) => x.t < y.t || (x.t === y.t && x.k < y.k);

  // Zipf's law over n keys: key k (1-based) is read in proportion to 1 / k^s. The cumulative table is shared.
  const ZIPF = new Map();
  function zipfTable(n, s) {
    const id = n + ":" + s;
    if (!ZIPF.has(id)) {
      const c = new Float64Array(n);
      let sum = 0;
      for (let k = 1; k <= n; k++) { sum += 1 / Math.pow(k, s); c[k - 1] = sum; }
      for (let k = 0; k < n; k++) c[k] /= sum;
      ZIPF.set(id, c);
    }
    return ZIPF.get(id);
  }

  const DEFAULTS = {
    mode: "open", rate: 40, users: 100, think: 5,
    servers: 1, workers: 4, service: 0.05, dist: "exp", slow: 1, lb: "rr", queueMax: 1000, timeout: 10,
    cache: 0, keys: 10000, zipf: 1, cacheTime: 0.002, warm: false,
    cancel: true, retries: 0, backoff: 0, jitter: false, surge: null,
    batch: null, jobWorkers: 0,
  };

  class Sim {
    constructor(cfg, seed = 1) {
      this.cfg = { ...DEFAULTS, ...cfg };
      this.r = rng(seed);
      this.t = 0;
      this.ev = new Heap();
      this.srv = [];            // servers: {queue, busy, gone}; gone ones take no new work and leave when empty
      this.done = [];           // finished requests: {id, at, sent, lat, ok, why, hit}
      this.area = [];           // per simulated second: worker-seconds spent busy, and worker-seconds that existed
      this.capA = [];
      this.at = 0; this.nb = 0; this.nc = 0; // since `at`, nb workers were busy out of nc
      this.nextId = 1;
      this.users = 0;           // closed loop: people who exist; some think, some wait
      this.thinking = 0;
      this.epoch = 0;           // bumps when the open-loop rate changes, so stale arrival events are ignored
      this.rr = 0;              // round robin's next server
      this.lru = new Map();     // the cache: key -> true, oldest first
      this.feed = null;         // set to [] and the page gets ["in", key?], ["hit"], ["route", server] and ["out", ok, why, server]
      this.tries = [];          // per simulated second: tries sent, first tries and retries both
      this.waiting = 0;         // requests waiting out a backoff before their next try
    this.jobQ = [];           // background jobs waiting for a job worker, and the ones being worked on
    this.jobBusy = [];
    this.batches = [];        // every batch that landed: {t, n, left, last}, for jobAge and backlog
      this.sizeServers();
      this.nc = this.live() * this.cfg.workers;
      // a warm cache already holds the hottest keys, hottest most recently used (a cache that has run for a while)
      if (this.cfg.warm) for (let k = Math.min(this.cfg.cache, this.cfg.keys); k >= 1; k--) this.lru.set(k, true);
      this.start();
      const sg = this.cfg.surge;
      if (sg) { this.ev.push({ t: sg.at, type: "surge", rate: sg.rate }); this.ev.push({ t: sg.at + sg.for, type: "surge", back: true }); }
      if (this.cfg.batch) this.ev.push({ t: this.cfg.batch.at, type: "batch" });
    }
    exp(mean) { return -Math.log(1 - this.r()) * mean; }
    serviceTime(i) { const c = this.cfg, m = c.service * (i === 0 ? c.slow || 1 : 1); return c.dist === "fixed" ? m : this.exp(m); }
    start() {
      if (this.cfg.mode === "open") this.scheduleArrival();
      else this.addUsers(this.cfg.users);
    }
    scheduleArrival() {
      if (this.cfg.rate > 0) this.ev.push({ t: this.t + this.exp(1 / this.cfg.rate), type: "arrive", epoch: this.epoch });
    }
    addUsers(n) {
      for (let i = 0; i < n; i++) { this.users++; this.thinking++; this.ev.push({ t: this.t + this.exp(this.cfg.think), type: "wake", user: true }); }
    }
    // servers that exist: more are added now; fewer means the last ones stop taking work and leave once empty
    sizeServers() {
      const n = Math.max(1, this.cfg.servers | 0);
      this.srv.forEach((s, i) => { s.gone = i >= n; });
      while (this.srv.length < n) this.srv.push({ queue: [], busy: [], gone: false });
      this.prune();
    }
    prune() { while (this.srv.length > 1 && this.srv[this.srv.length - 1].gone && !this.srv[this.srv.length - 1].busy.length && !this.srv[this.srv.length - 1].queue.length) this.srv.pop(); }
    // change knobs while it runs: more users join now, fewer users leave as they finish; a new rate starts a new stream
    set(patch) {
      const old = this.cfg;
      this.cfg = { ...old, ...patch };
      if (this.cfg.mode === "open" && patch.rate !== undefined && patch.rate !== old.rate) { this.epoch++; this.scheduleArrival(); }
      if (this.cfg.mode === "closed" && patch.users !== undefined && this.cfg.users > this.users) this.addUsers(this.cfg.users - this.users);
      if (patch.servers !== undefined) { this.sizeServers(); this.logBusy(); }
      if (patch.workers !== undefined) { this.srv.forEach((s, i) => this.fill(i)); this.logBusy(); }
      if (patch.cache !== undefined) this.evict();
      if (patch.jobWorkers !== undefined) {
        // no job workers any more: what was waiting for them goes to the servers instead
        if (!(this.cfg.jobWorkers > 0)) { for (const q of this.jobQ.splice(0)) this.toServer(q); }
        else this.fillJobs();
      }
    }
    // a batch of jobs lands: all at once, to their own queue or to the servers
    landBatch() {
      const B = this.cfg.batch, b = { t: this.t, n: B.n, left: B.n, last: this.t };
      this.batches.push(b);
      if (this.feed) this.feed.push(["batch", B.n, this.cfg.jobWorkers > 0]);
      for (let k = 0; k < B.n; k++) {
        const q = { job: true, b, sent: this.t };
        if (this.cfg.jobWorkers > 0) this.jobQ.push(q); else this.toServer(q);
      }
      this.fillJobs();
      if (B.every > 0) this.ev.push({ t: this.t + B.every, type: "batch" });
    }
    toServer(q) {
      const i = this.route();
      q.srv = i;
      const s = this.srv[i];
      if (s.busy.length < this.cfg.workers) this.serve(q); else s.queue.push(q);
    }
    fillJobs() {
      while (this.jobBusy.length < (this.cfg.jobWorkers | 0) && this.jobQ.length) {
        const q = this.jobQ.shift();
        q.began = this.t;
        q.end = this.t + this.exp(this.cfg.batch.service);
        this.jobBusy.push(q);
        this.ev.push({ t: q.end, type: "jobdone", q });
      }
    }
    jobDone(q) {
      q.b.left--; q.b.last = this.t;
      if (this.feed) this.feed.push(["sent", q.srv === undefined ? -1 : q.srv]);
    }
    evict() { const n = Math.max(0, this.cfg.cache | 0); while (this.lru.size > n) this.lru.delete(this.lru.keys().next().value); }
    pickKey() {
      const c = zipfTable(this.cfg.keys, this.cfg.zipf), u = this.r();
      let lo = 0, hi = c.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < u) lo = m + 1; else hi = m; }
      return lo + 1;
    }
    send(prev) {
      const q = { id: this.nextId++, sent: this.t, closed: this.cfg.mode === "closed" };
      if (prev) { q.first = prev.first ?? prev.sent; q.tries = (prev.tries || 0) + 1; q.closed = prev.closed; if (prev.key !== undefined) q.key = prev.key; }
      const sec = Math.floor(this.t);
      this.tries[sec] = (this.tries[sec] || 0) + 1;
      if (this.cfg.cache > 0) {
        if (q.key === undefined) q.key = this.pickKey();
        if (this.lru.has(q.key)) {
          this.lru.delete(q.key); this.lru.set(q.key, true);
          q.hit = true;
          if (this.feed) this.feed.push(["in"], ["hit"]);
          this.ev.push({ t: this.t + this.cfg.cacheTime, type: "hit", q });
          return;
        }
        q.hit = false;
      }
      if (this.feed) this.feed.push(["in"]);
      if (this.cfg.timeout > 0) this.ev.push({ t: this.t + this.cfg.timeout, type: "timeout", q });
      const i = this.route();
      q.srv = i;
      if (this.feed && this.live() > 1) this.feed.push(["route", i]);
      const s = this.srv[i];
      if (s.busy.length < this.cfg.workers) this.serve(q);
      else if (s.queue.length >= this.cfg.queueMax) this.finish(q, false, "full");
      else s.queue.push(q);
    }
    live() { let n = 0; for (const s of this.srv) if (!s.gone) n++; return n; }
    // the load balancer: which server gets the next request
    route() {
      const S = this.srv, n = S.length;
      if (n === 1) return 0;
      const ok = (i) => !S[i].gone;
      if (this.cfg.lb === "random") {
        const L = []; for (let i = 0; i < n; i++) if (ok(i)) L.push(i);
        return L[Math.min(L.length - 1, Math.floor(this.r() * L.length))];
      }
      if (this.cfg.lb === "least") {
        // fewest in flight (serving + waiting); ties go round the ring so nobody is favoured
        let best = -1, bn = Infinity;
        for (let j = 0; j < n; j++) {
          const i = (this.rr + j) % n;
          if (!ok(i)) continue;
          const f = S[i].busy.length + S[i].queue.length;
          if (f < bn) { bn = f; best = i; }
        }
        this.rr = (best + 1) % n;
        return best;
      }
      for (let j = 0; j < n; j++) { const i = (this.rr + j) % n; if (ok(i)) { this.rr = (i + 1) % n; return i; } }
      return 0;
    }
    serve(q) {
      const i = q.srv || 0, s = this.srv[i];
      q.began = this.t;
      q.end = this.t + (q.job ? this.exp(this.cfg.batch.service) : this.serviceTime(i));
      s.busy.push(q);
      this.logBusy();
      this.ev.push({ t: q.end, type: "served", q });
    }
    fill(i) { const s = this.srv[i]; if (!s) return; while (s.busy.length < this.cfg.workers && s.queue.length) this.serve(s.queue.shift()); }
    busyNow() { let n = 0; for (const s of this.srv) n += s.busy.length; return n; }
    // utilisation is kept as busy and existing worker-seconds per simulated second, so any window adds up exactly
    logBusy() { this.acc(this.t); this.nb = this.busyNow(); this.nc = this.live() * this.cfg.workers; }
    acc(to) {
      while (this.at < to) {
        const s = Math.floor(this.at), end = Math.min(to, s + 1), d = end - this.at;
        this.area[s] = (this.area[s] || 0) + this.nb * d;
        this.capA[s] = (this.capA[s] || 0) + this.nc * d;
        this.at = end;
      }
    }
    finish(q, ok, why) {
      if (q.over) return;
      q.over = true;
      // a failed try is retried after its backoff, if it has tries left; the user only sees the last one
      if (!ok && (q.tries || 0) < this.cfg.retries) {
        let d = this.cfg.backoff * Math.pow(2, q.tries || 0);
        if (this.cfg.jitter) d *= this.r();
        this.waiting++;
        this.ev.push({ t: this.t + d, type: "retry", q });
        if (this.feed && !q.hit) this.feed.push(["out", false, why, q.srv || 0]);
        return;
      }
      const sent = q.first ?? q.sent;
      this.done.push({ id: q.id, at: this.t, sent, lat: this.t - sent, ok, why, hit: q.hit });
      if (this.feed && !q.hit) this.feed.push(["out", ok, why, q.srv || 0]);
      if (this.done.length > 400000) this.done.splice(0, 200000);
      if (q.closed) this.rethink();
    }
    // a closed-loop user got an answer (or gave up): think again, or leave if there are now too many users
    rethink() {
      if (this.users > this.cfg.users) { this.users--; return; }
      this.thinking++;
      this.ev.push({ t: this.t + this.exp(this.cfg.think), type: "wake", user: true });
    }
    advance(until) {
      for (;;) {
        const e = this.ev.peek();
        if (!e || e.t > until) break;
        this.ev.pop();
        this.t = e.t;
        if (e.type === "arrive") {
          if (e.epoch !== this.epoch || this.cfg.mode !== "open") continue;
          this.send();
          this.scheduleArrival();
        } else if (e.type === "wake") {
          this.thinking--;
          this.send();
        } else if (e.type === "retry") {
          this.waiting--;
          this.send(e.q);
        } else if (e.type === "batch") {
          if (this.cfg.batch) this.landBatch();
        } else if (e.type === "jobdone") {
          const k = this.jobBusy.indexOf(e.q);
          if (k >= 0) this.jobBusy.splice(k, 1);
          this.jobDone(e.q);
          this.fillJobs();
        } else if (e.type === "surge") {
          if (e.back) this.set({ rate: this.base }); else { this.base = this.cfg.rate; this.set({ rate: e.rate }); }
        } else if (e.type === "hit") {
          this.finish(e.q, true);
        } else if (e.type === "served") {
          const q = e.q, i = q.srv || 0, s = this.srv[i];
          const k = s.busy.indexOf(q);
          if (k >= 0) s.busy.splice(k, 1);
          this.logBusy();
          if (q.job) { this.jobDone(q); this.fill(i); this.prune(); continue; }
          // the answer fills the cache on its way back, even if the client already gave up
          if (q.key !== undefined && this.cfg.cache > 0) { this.lru.delete(q.key); this.lru.set(q.key, true); this.evict(); }
          // a request that already timed out still used the worker; its answer just arrives to nobody
          this.finish(q, true);
          this.fill(i);
          this.prune();
        } else if (e.type === "timeout") {
          const q = e.q;
          if (q.over) continue;
          // with cancel off the server never hears that the client left: the request keeps its place and is served
          const s = this.srv[q.srv || 0], k = s && this.cfg.cancel ? s.queue.indexOf(q) : -1;
          if (k >= 0) s.queue.splice(k, 1);
          this.finish(q, false, "timeout");
        }
      }
      this.t = until;
      this.acc(until);
    }
    // for drawing: every server's queue and busy list, and the totals the one-server page used
    get queue() { return this.srv.length === 1 ? this.srv[0].queue : this.srv.flatMap((s) => s.queue); }
    get busy() { return this.srv.length === 1 ? this.srv[0].busy : this.srv.flatMap((s) => s.busy); }
    view() { return { t: this.t, srv: this.srv, workers: this.cfg.workers, thinking: this.thinking, users: this.users, cached: this.lru.size, waiting: this.waiting }; }
    // background jobs: how long the slowest waited in (t0, t1] (done in the window, or still waiting at its end), and
    // how many are not done yet. Judged as of now, so ask about windows that end now (as the page and the checks do).
    jobStats(t0, t1) {
      let age = 0, backlog = 0;
      for (const b of this.batches) {
        if (b.t > t1) continue;
        if (b.left > 0) { age = Math.max(age, t1 - b.t); backlog += b.left; }
        else if (b.last > t0) age = Math.max(age, b.last - b.t);
      }
      // every worker you pay for, website and job workers together, for a budget
      return { jobAge: age, backlog, allWorkers: this.live() * this.cfg.workers + (this.cfg.jobWorkers | 0) };
    }
    // numbers for requests that finished in (t0, t1]
    stats(t0, t1) {
      const lats = [], d = this.done;
      let ok = 0, bad = 0, hits = 0, looked = 0, lo = 0, hi = d.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (d[m].at <= t0) lo = m + 1; else hi = m; }
      for (let i = lo; i < d.length && d[i].at <= t1; i++) {
        const r = d[i];
        if (r.ok) { ok++; lats.push(r.lat); } else bad++;
        if (r.hit !== undefined) { looked++; if (r.hit) hits++; }
      }
      lats.sort((a, b) => a - b);
      const span = t1 - t0, n = ok + bad;
      return {
        span, sent: n, ok, errors: bad, errRate: n ? bad / n : 0,
        tput: ok / span, mean: lats.length ? lats.reduce((s, x) => s + x, 0) / lats.length : 0,
        p50: pct(lats, 0.5), p95: pct(lats, 0.95), p99: pct(lats, 0.99), util: this.util(t0, t1),
        hit: looked ? hits / looked : 0, misses: (looked - hits) / span, tries: this.triesIn(t0, t1) / span,
        ...this.jobStats(t0, t1),
      };
    }
    triesIn(t0, t1) { let n = 0; for (let i = Math.floor(t0); i < Math.ceil(t1); i++) n += this.tries[i] || 0; return n; }
    // busy workers ÷ workers that existed, over the window (whole seconds, as the page and the checks ask for)
    util(t0, t1) {
      this.acc(Math.min(t1, this.t));
      let a = 0, c = 0;
      for (let i = Math.floor(t0); i < Math.ceil(t1); i++) { a += this.area[i] || 0; c += this.capA[i] || 0; }
      return c ? a / c : 0;
    }
    // rewind: the same seed and the same changes at the same moments give the same run, so any moment can be rebuilt
    // from the start. changes: [{t, patch}], oldest first, each made right after the sim reached t.
    static replay(cfg, seed, changes, T) {
      const s = new Sim(cfg, seed);
      for (const c of changes) { if (c.t > T) break; s.advance(c.t); s.set(c.patch); }
      s.advance(T);
      return s;
    }
    static measure(cfg, o = {}) {
      const s = new Sim(cfg, o.seed || 7), warm = o.warm ?? 30, span = o.span ?? 300;
      s.advance(warm + span);
      return s.stats(warm, warm + span);
    }
  }
  function pct(sorted, p) {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[i];
  }

  // Queueing theory, for the check tool and the "why" text: M/M/c (Erlang C).
  // a = λ/μ offered load in workers; returns the chance a request waits, and the mean wait in the queue.
  function erlangC(lambda, mu, c) {
    const a = lambda / mu, rho = a / c;
    if (rho >= 1) return { wait: Infinity, pWait: 1, rho };
    let sum = 0, term = 1;
    for (let k = 0; k < c; k++) { if (k) term *= a / k; sum += term; }
    const top = term * a / c / (1 - rho); // a^c / c! / (1-ρ)
    const pWait = top / (sum + top);
    return { pWait, wait: pWait / (c * mu - lambda), rho };
  }
  // the share of reads the hottest n of N keys get under Zipf(s): the best any cache of n keys could do
  function zipfShare(n, N, s = 1) { const c = zipfTable(N, s); return n <= 0 ? 0 : c[Math.min(N, n) - 1]; }

  root.WTSim = { Sim, erlangC, zipfShare, rng, DEFAULTS };
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined") module.exports = globalThis.WTSim || window.WTSim;
