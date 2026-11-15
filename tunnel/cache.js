/* The Caching unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   hit(share)     a shop with a million products, viewed on a Zipf curve (the 2nd most viewed gets half the views
                  of the 1st, the 3rd a third, ...): the share of views a cache answers if it keeps the top `share`
                  of the products. size(rate) is the other way round: the share of products a hit rate takes.
   inval()        a key with two writers and a reader. Each writer changes the database and the cache in one of four
                  orders (ORDERS); the reader reads the cache and, on a miss, reads the database and puts what it
                  read in the cache. Every way the steps can interleave, from a cache that's empty and one that's
                  warm, and how many leave the cache holding something the database no longer says.
   stampede(o)    a sale: 500 hot products, 20,000 reads a second on a Zipf curve, all cached at a deploy and kept
                  60 s. A miss asks the database, which runs 10 queries at once for 50 ms each; a request that waits
                  1 s gets an error page. `guard`: on a miss everyone asks the database ("none"), one asks and the
                  rest wait for it ("lock"), or the first request in a key's last 10% refreshes it in the background
                  while everyone keeps reading the old copy ("early"). `ttl`: exactly 60 s ("same") or 60 s ± 10%
                  ("jitter"). 150 s of it, event by event.
   fresh(o)       a shop's 10,000 product pages, 50,000 reads a second, each product edited about once an hour.
                  `where`: in each of 50 app servers' memory ("local") or one shared Redis ("shared"); `ttl` in
                  seconds; `edit`: do nothing and wait for the TTL ("none"), or delete the key when it's edited
                  ("delete"; in local memory that only reaches the server that took the edit). Worked out exactly
                  per product (a renewal process), and freshDemo() plays one busy product for the picture. */
(function (root) {
  "use strict";
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const exp = (r, rate) => -Math.log(1 - r()) / rate;
  // the n-th harmonic number: the sum 1 + 1/2 + ... + 1/n, which is how a Zipf curve adds up
  const GAMMA = 0.5772156649015329;
  function H(n) {
    if (n <= 0) return 0;
    if (n < 200) { let s = 0; for (let k = 1; k <= n; k++) s += 1 / k; return s; }
    return Math.log(n) + GAMMA + 1 / (2 * n) - 1 / (12 * n * n);
  }

  // --------------------------------------------------------------------------------------- the long tail --
  const PRODUCTS = 1e6, ITEM_KB = 20;
  const hit = (share) => H(Math.round(Math.max(0, Math.min(1, share)) * PRODUCTS)) / H(PRODUCTS);
  function size(rate) {
    let lo = 0, hi = PRODUCTS;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (H(m) / H(PRODUCTS) >= rate) hi = m; else lo = m; }
    return hi / PRODUCTS;
  }

  // ------------------------------------------------------------------------------------- invalidation --
  // A writer's two steps, in its order. "db" writes its value to the database, "set" puts it in the cache,
  // "del" deletes the key.
  const ORDERS = {
    setdb: { steps: ["set", "db"], say: "update the cache, then the database" },
    dbset: { steps: ["db", "set"], say: "update the database, then the cache" },
    deldb: { steps: ["del", "db"], say: "delete the key, then update the database" },
    dbdel: { steps: ["db", "del"], say: "update the database, then delete the key" },
  };
  function inval() {
    const out = {};
    for (const [id, o] of Object.entries(ORDERS)) {
      const actors = [
        { who: "A", steps: o.steps.map((k) => ({ k, v: 1 })) },
        { who: "B", steps: o.steps.map((k) => ({ k, v: 2 })) },
        { who: "R", steps: [{ k: "get" }, { k: "read" }, { k: "fill" }] },
      ];
      let total = 0, stale = 0, example = null;
      for (const warm of [false, true]) {
        // every interleaving of the three actors' steps
        const walk = (pos, seq) => {
          if (actors.every((a, i) => pos[i] === a.steps.length)) {
            total++;
            const r = play(seq, warm);
            if (r.stale) { stale++; if (!example || r.log.length < example.log.length || (r.log.length === example.log.length && warm && !example.warm)) example = { ...r, warm }; }
            return;
          }
          actors.forEach((a, i) => { if (pos[i] < a.steps.length) { const p = pos.slice(); p[i]++; walk(p, seq.concat([[a.who, a.steps[pos[i]]]])); } });
        };
        walk([0, 0, 0], []);
      }
      out[id] = { id, say: o.say, total, stale, share: stale / total, example };
    }
    return out;
  }
  // one interleaving: the database starts at 0; the cache is empty, or warm with 0
  function play(seq, warm) {
    let db = 0, cache = warm ? 0 : null, got = null, read = null;
    const log = [];
    for (const [who, st] of seq) {
      if (who === "R") {
        if (st.k === "get") { got = cache; log.push({ who, k: "get", v: cache, cache, db }); }
        else if (got !== null) continue; // a hit: the reader is done
        else if (st.k === "read") { read = db; log.push({ who, k: "read", v: db, cache, db }); }
        else { cache = read; log.push({ who, k: "fill", v: read, cache, db }); }
      } else {
        if (st.k === "db") db = st.v; else if (st.k === "set") cache = st.v; else cache = null;
        log.push({ who, k: st.k, v: st.v, cache, db });
      }
    }
    return { log, cache, db, stale: cache !== null && cache !== db };
  }

  // ----------------------------------------------------------------------------------------- stampede --
  const ST = { keys: 500, rate: 20000, secs: 60, jit: 0.1, q: 0.05, conns: 10, timeout: 1, line: 200, hitMs: 1, T: 150, early: 0.1, bin: 0.5 };
  const GUARDS = ["none", "lock", "early"], TTLS = ["same", "jitter"];
  function stampede(o) {
    const P = { ...ST, ...o }, r = rng(o.seed || 1);
    const Hn = H(P.keys), lam = Array.from({ length: P.keys }, (_, i) => P.rate / ((i + 1) * Hn));
    const life = () => P.secs * (o.ttl === "jitter" ? 1 - P.jit + 2 * P.jit * r() : 1);
    // events on a binary heap by time
    const heap = [];
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].t <= heap[i].t) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a].t < heap[m].t) m = a; if (b < heap.length && heap[b].t < heap[m].t) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    // each key: when its copy goes, whether it's there, the requests waiting on it, its picture's history
    const K = lam.map(() => ({ exp: 0, gen: 0, has: true, fill: false, waits: [], spans: [] }));
    const NB = Math.ceil(P.T / P.bin), bins = Array.from({ length: NB }, () => ({ q: 0, wait: 0, err: 0, miss: 0 }));
    const bin = (t) => bins[Math.min(NB - 1, Math.floor(t / P.bin))];
    let busy = 0, queued = 0, lastT = 0;
    const line = [];
    const slow = [];
    let errors = 0, dbq = 0, refused = 0;
    const set = (k, t) => {
      const key = K[k];
      if (key.open != null) { key.spans.push([key.open, t, key.openKind]); key.open = null; }
      key.has = true; key.fill = false; key.gen++; key.exp = t + life();
      push({ t: key.exp, e: "exp", k, gen: key.gen });
      if (o.guard === "early") push({ t: key.exp - P.early * (key.exp - t) + exp(r, lam[k]), e: "soft", k, gen: key.gen });
    };
    const ask = (k, t, who) => { // a query on the database for key k, for these waiting requests (or a background refresh)
      dbq++; bin(t).q++;
      const job = { k, who, t };
      if (busy < P.conns) { busy++; push({ t: t + P.q * (0.8 + 0.4 * r()), e: "done", job }); return; }
      if (line.length < P.line) { line.push(job); queued++; return; }
      // the database's line is full: it turns the query away, and whoever asked gets an error now
      refused++;
      const key = K[k];
      if (who) { who.done = true; errors++; bin(t).err++; slow.push(Infinity); key.waits = key.waits.filter((q) => !q.done); }
      else if (key.has) { key.fill = false; if (key.open != null) { key.spans.push([key.open, t, key.openKind]); key.open = null; } }
      else { key.fill = false; for (const q of key.waits) if (!q.done) { q.done = true; errors++; bin(t).err++; slow.push(Infinity); } key.waits = []; }
    };
    for (let k = 0; k < P.keys; k++) set(k, 0);
    while (heap.length) {
      const ev = pop();
      if (ev.t > P.T) break;
      const t = ev.t, key = ev.k != null ? K[ev.k] : null;
      if (queued) { const b = bin(lastT); b.wait = Math.max(b.wait, queued); }
      lastT = t;
      if (ev.e === "exp") {
        if (ev.gen !== key.gen) continue;
        key.has = false; key.fill = false; key.open = t; key.openKind = "miss";
        push({ t: t + exp(r, lam[ev.k]), e: "req", k: ev.k, gen: key.gen });
      } else if (ev.e === "soft") {
        if (ev.gen !== key.gen || !key.has || key.fill || t >= key.exp) continue;
        key.fill = true; key.open = t; key.openKind = "early";
        ask(ev.k, t, null);
      } else if (ev.e === "req") {
        if (ev.gen !== key.gen || key.has) continue;
        bin(t).miss++;
        const rq = { t, done: false };
        key.waits.push(rq);
        push({ t: t + P.timeout, e: "tmo", rq });
        if (o.guard === "lock" ? !key.fill : true) { key.fill = true; ask(ev.k, t, o.guard === "lock" ? null : rq); }
        push({ t: t + exp(r, lam[ev.k]), e: "req", k: ev.k, gen: key.gen });
      } else if (ev.e === "tmo") {
        if (ev.rq.done) continue;
        ev.rq.done = true; errors++; bin(t).err++; slow.push(Infinity);
      } else if (ev.e === "done") {
        busy--;
        if (line.length) { busy++; queued--; push({ t: t + P.q * (0.8 + 0.4 * r()), e: "done", job: line.shift() }); }
        const k = ev.job.k, kk = K[k];
        // the answer fills the key, and everyone waiting on it is answered
        // with a lock, everyone waiting on the key gets this answer; without one, each request waits for its own query
        const was = kk.has, mine = ev.job.who;
        if (mine) { if (!mine.done) { mine.done = true; slow.push((t - mine.t) * 1000); } kk.waits = kk.waits.filter((q) => !q.done); }
        else { for (const rq of kk.waits) if (!rq.done) { rq.done = true; slow.push((t - rq.t) * 1000); } kk.waits = []; }
        if (!was || kk.fill) set(k, t);
      }
    }
    for (const key of K) if (key.open != null) key.spans.push([key.open, P.T, key.openKind]);
    for (const key of K) for (const rq of key.waits) if (!rq.done) { rq.done = true; slow.push(Infinity); }
    // every read: the hits take 1 ms, and the slow ones are the misses above
    const total = Math.round(P.rate * P.T), late = slow.slice().sort((a, b) => a - b);
    const pct = (p) => { const k = total - Math.ceil(p * total); return k < late.length ? late[late.length - 1 - k] : P.hitMs; };
    let dbPeak = 0;
    for (let i = 0; i + 1 < NB; i++) dbPeak = Math.max(dbPeak, bins[i].q + bins[i + 1].q);
    return { errors, refused, p99: pct(0.99), p50: pct(0.5), dbPeak, dbq, queuePeak: Math.max(...bins.map((b) => b.wait)), bins, spans: K.map((k) => k.spans), total, slow: slow.length, P };
  }

  // -------------------------------------------------------------------------------------------- fresh --
  const FR = { products: 10000, reads: 50000, perHour: 1, servers: 50 };
  const WHERES = ["local", "shared"], FTTLS = [10, 60, 600], EDITS = ["none", "delete"];
  // one cache of one product: reads at rate r, edits at rate mu, of which `own` reach this cache as a delete
  function cell(r, mu, T, own) {
    const d = mu * own, f = mu - d;
    const kept = d > 0 ? (1 - Math.exp(-d * T)) / d : T; // how long a copy lasts, on average
    const cyc = kept + 1 / r, staleHits = r * (kept - (1 - Math.exp(-mu * T)) / mu);
    return { misses: 1 / cyc, stale: staleHits / cyc, reads: r, f };
  }
  function fresh(o) {
    const P = { ...FR, ...o }, Hn = H(P.products), mu = P.perHour / 3600;
    const n = o.where === "local" ? P.servers : 1;
    const own = o.edit === "delete" ? 1 / n : 0;
    let db = 0, stale = 0;
    for (let i = 1; i <= P.products; i++) {
      const c = cell(P.reads / (i * Hn) / n, mu, o.ttl, own);
      db += c.misses * n; stale += c.stale * n;
    }
    const fresh0 = own === 1;
    return { db, stale: stale / P.reads, hit: 1 - db / P.reads, oldest: fresh0 ? 0 : o.ttl, edits: P.products * mu };
  }
  // one busy product over 10 minutes, for the picture: when it's edited, and each cache's copies
  function freshDemo(o) {
    const r = rng(o.seed || 7), W = 600, edits = [100, 370], lanes = o.where === "local" ? 6 : 1, ttl = o.ttl;
    const price = (t) => (t < edits[0] ? 30 : t < edits[1] ? 25 : 28);
    const out = [];
    for (let l = 0; l < lanes; l++) {
      // each server's copy was loaded at some point before the window
      let at = -r() * ttl, segs = [];
      const took = edits.map(() => o.where === "shared" || r() < 1 / 50); // the local server that took each edit
      if (o.where === "local") took[0] = took[0] || l === 2, took[1] = took[1] || l === 4;
      for (let t0 = at; t0 < W;) {
        const v = price(Math.max(0, t0)), end = Math.min(W, t0 + ttl);
        let cut = end;
        edits.forEach((e, i) => { if (o.edit === "delete" && took[i] && e > t0 && e < cut) cut = e; });
        // split the copy where the database moves on without it
        let a = Math.max(0, t0);
        for (const e of edits) if (e > a && e < cut) { segs.push([a, e, v, v === price(a)]); a = e; }
        if (cut > a) segs.push([a, cut, v, v === price(a)]);
        t0 = cut + 0.5;
      }
      out.push({ segs: segs.map(([a, b, v, ok]) => ({ a, b, v, ok: v === price(a) && ok })) });
    }
    return { W, edits, price: [30, 25, 28], lanes: out };
  }

  const API = { H, PRODUCTS, ITEM_KB, hit, size, ORDERS, inval, play, ST, GUARDS, TTLS, stampede, FR, WHERES, FTTLS, EDITS, cell, fresh, freshDemo };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.CACHE = API;
})(typeof self !== "undefined" ? self : this);
