/* Wind Tunnel's simulator: one server under load, as a seeded discrete-event simulation. No DOM, so the page and
   tools/tunnel-check.js run exactly the same code and get exactly the same numbers for the same seed.

   Load is either open (requests arrive at `rate` per second, a Poisson stream, whoever sends them) or closed
   (`users` people, each thinks for `think` seconds on average, sends one request, waits for the answer, thinks again).
   The server has `workers` that each serve one request at a time; a request's service time averages `service`
   seconds (exponential, or fixed with dist:"fixed"). Requests that find every worker busy wait in a queue of at most
   `queueMax` (then they're turned away: an error). A client gives up after `timeout` seconds (also an error).

   new Sim(cfg, seed) · sim.set({rate|users|workers|...}) · sim.advance(toTime) · sim.view() for drawing ·
   sim.stats(t0, t1) for a window · Sim.measure(cfg, {seed, warm, span}) for a steady-state number. */
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

  const DEFAULTS = { mode: "open", rate: 40, users: 100, think: 5, workers: 4, service: 0.05, dist: "exp", queueMax: 1000, timeout: 10 };

  class Sim {
    constructor(cfg, seed = 1) {
      this.cfg = { ...DEFAULTS, ...cfg };
      this.r = rng(seed);
      this.t = 0;
      this.ev = new Heap();
      this.queue = [];          // waiting requests, oldest first
      this.busy = [];           // requests in service, one per busy worker
      this.done = [];           // finished requests: {id, at, sent, lat, ok, why}
      this.busyTime = 0;        // worker-seconds spent serving, for utilisation
      this.busyLog = [];        // [t, busy workers] whenever it changes, for windowed utilisation
      this.nextId = 1;
      this.users = 0;           // closed loop: people who exist; some think, some wait
      this.thinking = 0;
      this.epoch = 0;           // bumps when the open-loop rate changes, so stale arrival events are ignored
      this.start();
    }
    exp(mean) { return -Math.log(1 - this.r()) * mean; }
    serviceTime() { const c = this.cfg; return c.dist === "fixed" ? c.service : this.exp(c.service); }
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
    // change knobs while it runs: more users join now, fewer users leave as they finish; a new rate starts a new stream
    set(patch) {
      const old = this.cfg;
      this.cfg = { ...old, ...patch };
      if (this.cfg.mode === "open" && patch.rate !== undefined && patch.rate !== old.rate) { this.epoch++; this.scheduleArrival(); }
      if (this.cfg.mode === "closed" && patch.users !== undefined && this.cfg.users > this.users) this.addUsers(this.cfg.users - this.users);
      if (patch.workers !== undefined) this.fill();
    }
    send() {
      const q = { id: this.nextId++, sent: this.t, closed: this.cfg.mode === "closed" };
      if (this.cfg.timeout > 0) this.ev.push({ t: this.t + this.cfg.timeout, type: "timeout", q });
      if (this.busy.length < this.cfg.workers) this.serve(q);
      else if (this.queue.length >= this.cfg.queueMax) this.finish(q, false, "full");
      else this.queue.push(q);
    }
    serve(q) {
      q.began = this.t;
      q.end = this.t + this.serviceTime();
      this.busy.push(q);
      this.logBusy();
      this.ev.push({ t: q.end, type: "served", q });
    }
    fill() { while (this.busy.length < this.cfg.workers && this.queue.length) this.serve(this.queue.shift()); }
    logBusy() { this.busyLog.push([this.t, this.busy.length]); if (this.busyLog.length > 200000) this.busyLog.splice(0, 100000); }
    finish(q, ok, why) {
      if (q.over) return;
      q.over = true;
      this.done.push({ id: q.id, at: this.t, sent: q.sent, lat: this.t - q.sent, ok, why });
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
        this.busyTime += this.busy.length * (e.t - this.t);
        this.t = e.t;
        if (e.type === "arrive") {
          if (e.epoch !== this.epoch || this.cfg.mode !== "open") continue;
          this.send();
          this.scheduleArrival();
        } else if (e.type === "wake") {
          this.thinking--;
          this.send();
        } else if (e.type === "served") {
          const i = this.busy.indexOf(e.q);
          if (i >= 0) this.busy.splice(i, 1);
          this.logBusy();
          // a request that already timed out still used the worker; its answer just arrives to nobody
          this.finish(e.q, true);
          // if workers were removed, the extra ones stop taking work
          this.fill();
        } else if (e.type === "timeout") {
          const q = e.q;
          if (q.over) continue;
          const i = this.queue.indexOf(q);
          if (i >= 0) this.queue.splice(i, 1);
          this.finish(q, false, "timeout");
        }
      }
      this.busyTime += this.busy.length * (until - this.t);
      this.t = until;
    }
    view() { return { t: this.t, queue: this.queue, busy: this.busy, workers: this.cfg.workers, thinking: this.thinking, users: this.users }; }
    // numbers for requests that finished in (t0, t1]
    stats(t0, t1) {
      const lats = [], d = this.done;
      let ok = 0, bad = 0, lo = 0, hi = d.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (d[m].at <= t0) lo = m + 1; else hi = m; }
      for (let i = lo; i < d.length && d[i].at <= t1; i++) { if (d[i].ok) { ok++; lats.push(d[i].lat); } else bad++; }
      lats.sort((a, b) => a - b);
      const span = t1 - t0, n = ok + bad;
      return {
        span, sent: n, ok, errors: bad, errRate: n ? bad / n : 0,
        tput: ok / span, mean: lats.length ? lats.reduce((s, x) => s + x, 0) / lats.length : 0,
        p50: pct(lats, 0.5), p95: pct(lats, 0.95), p99: pct(lats, 0.99), util: this.util(t0, t1),
      };
    }
    util(t0, t1) {
      const L = this.busyLog;
      if (!L.length || t1 <= t0) return 0;
      let lo = 0, hi = L.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (L[m][0] <= t0) lo = m + 1; else hi = m; }
      let cur = lo ? L[lo - 1][1] : 0, at = t0, area = 0;
      for (let i = lo; i < L.length && L[i][0] <= t1; i++) { area += cur * (L[i][0] - at); at = L[i][0]; cur = L[i][1]; }
      area += cur * (t1 - at);
      return area / ((t1 - t0) * this.cfg.workers);
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

  root.WTSim = { Sim, erlangC, rng, DEFAULTS };
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined") module.exports = globalThis.WTSim || window.WTSim;
