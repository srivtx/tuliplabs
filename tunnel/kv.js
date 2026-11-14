/* The Redis unit's simulators: a real keyspace under eviction, a write log with a plug to pull, and Redis Cluster's
   hash slots. No DOM, so the page and tools/board-check.js run the same code and get the same numbers.

   evict(o)    cache-aside traffic against a keyspace that holds `cap` of `keys` keys. Each request GETs a key picked by
               Zipf's law; a miss SETs it, and when memory is full the policy decides what goes:
                 noeviction   Redis's default: the SET fails with an out-of-memory error, so the key is never cached
                 random       allkeys-random: drop any key
                 lru          allkeys-lru: drop the key used longest ago
                 lfu          allkeys-lfu: drop the key used least often (counts never fade here)
               With `shift`, halfway through the popular keys change: a new set of keys becomes the hot one.
   persist(o)  writes arrive at `rate` a second into one event-loop thread. With an append-only log (aof):
                 always    every batch of writes is fsynced before the clients hear back (a fsync takes `fsync` s)
                 everysec  clients hear back at once; a background fsync runs once a second
                 no        clients hear back at once; the OS writes the file out about every 30 s
                 off       no log at all, only the snapshot (if `rdb`): the whole keyspace every 5 minutes
               Then the plug is pulled at `plug` s. lost = acknowledged writes that never reached the disk.
   crc16, slot  Redis Cluster's key → slot: CRC16 (XMODEM) of the key, or of its {hash tag}, mod 16384.
   Cluster     slots dealt out to nodes, resharded the way Redis does it: a new node takes slots from every other one,
               so only about 1/n of the keys move. load() sums ops and bytes per node. */
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

  // ---------------------------------------------------------------------------------------------- eviction --
  const ZT = new Map();
  function zipfCum(n, s) {
    const id = n + ":" + s;
    if (!ZT.has(id)) { const c = new Float64Array(n); let acc = 0; for (let k = 0; k < n; k++) { acc += 1 / Math.pow(k + 1, s); c[k] = acc; } for (let k = 0; k < n; k++) c[k] /= acc; ZT.set(id, c); }
    return ZT.get(id);
  }
  // the share of requests the `top` most popular keys get
  const topShare = (top, n, s) => zipfCum(n, s)[Math.min(top, n) - 1];
  function pickRank(c, u) { let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < u) lo = m + 1; else hi = m; } return lo; }

  // the keyspace, with each policy's bookkeeping
  function keyspace(policy, cap, R) {
    if (policy === "lru") {
      const m = new Map();
      return { has: (k) => { if (!m.has(k)) return false; m.delete(k); m.set(k, 1); return true; }, set: (k) => { if (m.size >= cap) m.delete(m.keys().next().value); m.set(k, 1); return true; }, held: (k) => m.has(k), size: () => m.size };
    }
    if (policy === "lfu") { // O(1) LFU: buckets of keys by count; the oldest key in the lowest bucket goes
      const f = new Map(), b = new Map();
      let min = 1;
      const bump = (k) => { const n = f.get(k); b.get(n).delete(k); if (!b.get(n).size) { b.delete(n); if (min === n) min = n + 1; } f.set(k, n + 1); if (!b.has(n + 1)) b.set(n + 1, new Set()); b.get(n + 1).add(k); };
      return {
        has: (k) => { if (!f.has(k)) return false; bump(k); return true; },
        set: (k) => {
          if (f.size >= cap) { const s = b.get(min), v = s.values().next().value; s.delete(v); if (!s.size) b.delete(min); f.delete(v); }
          f.set(k, 1); if (!b.has(1)) b.set(1, new Set()); b.get(1).add(k); min = 1; return true;
        },
        held: (k) => f.has(k), size: () => f.size,
      };
    }
    if (policy === "random") {
      const arr = [], at = new Map();
      return {
        has: (k) => at.has(k),
        set: (k) => { if (arr.length >= cap) { const i = Math.floor(R() * arr.length), v = arr[i], last = arr.pop(); at.delete(v); if (i < arr.length) { arr[i] = last; at.set(last, i); } } at.set(k, arr.length); arr.push(k); return true; },
        held: (k) => at.has(k), size: () => arr.length,
      };
    }
    // noeviction: once full, every new key is refused
    const s = new Set();
    return { has: (k) => s.has(k), set: (k) => { if (s.size >= cap) return false; s.add(k); return true; }, held: (k) => s.has(k), size: () => s.size };
  }
  const POLICIES = ["noeviction", "random", "lru", "lfu"];
  function evict({ policy = "lru", cap = 2500, keys = 50000, zipf = 1, n = 200000, shift = false, seed = 1, buckets = 40, grid = 400 } = {}) {
    const R = rng(seed), c = zipfCum(keys, zipf), ks = keyspace(policy, cap, R);
    const per = Math.floor(n / buckets), hits = [], snaps = [];
    let h = 0, bh = 0, errors = 0, lateH = 0, lateN = 0;
    const keyOf = (rank, i) => (shift && i >= n / 2 ? (rank + Math.floor(keys / 2)) % keys : rank);
    for (let i = 0; i < n; i++) {
      const k = keyOf(pickRank(c, R()), i);
      const hit = ks.has(k);
      if (hit) { h++; bh++; } else if (!ks.set(k)) errors++;
      if (i >= n / 2) { lateN++; if (hit) lateH++; }
      if ((i + 1) % per === 0) {
        hits.push(bh / per); bh = 0;
        // which of the `grid` hottest keys (hottest right now) are in memory
        const g = new Uint8Array(grid);
        for (let r = 0; r < grid; r++) g[r] = ks.held(keyOf(r, i)) ? 1 : 0;
        snaps.push(g);
      }
    }
    return { policy, hit: h / n, late: lateH / Math.max(1, lateN), hits, snaps, errors, best: topShare(cap, keys, zipf) };
  }

  // ------------------------------------------------------------------------------------------- persistence --
  // One event-loop thread. Each turn it takes every write that has arrived, runs them (`svc` s each), appends them
  // to the log, and (with always) fsyncs before answering. Durable means on the disk: after its own fsync (always),
  // after the next once-a-second fsync (everysec), after the OS's ~30 s write-back (no), or in a snapshot (rdb).
  const MODES = ["always", "everysec", "no", "off"];
  function persist({ aof = "everysec", rdb = true, rate = 5000, svc = 0.00002, fsync = 0.002, T = 30, plug = 27.4, seed = 1, osEvery = 30, rdbEvery = 300, col = 0.1, window = 10 } = {}) {
    const R = rng(seed), ex = (m) => -Math.log(1 - R()) * m;
    const arr = [];
    for (let t = ex(1 / rate); t < T; t += ex(1 / rate)) arr.push(t);
    const done = new Float64Array(arr.length); // when the client heard back
    let t = 0, i = 0;
    while (i < arr.length) {
      if (arr[i] > t) t = arr[i];
      let j = i;
      while (j < arr.length && arr[j] <= t) j++;
      t += (j - i) * svc;
      if (aof === "always") t += fsync;
      for (let k = i; k < j; k++) done[k] = t;
      i = j;
    }
    // the last moment before the plug up to which everything written is safe on disk
    const safeBy = (P) => {
      if (aof === "always") return P; // nothing is acknowledged before its fsync
      if (aof === "everysec") { const k = Math.floor((P - fsync) / 1); return k >= 1 ? k : 0; }
      const snap = rdb ? Math.floor(P / rdbEvery) * rdbEvery : 0;
      if (aof === "no") return Math.max(snap, Math.floor(P / osEvery) * osEvery);
      return snap;
    };
    const safe = safeBy(plug);
    let acked = 0, lost = 0;
    const lat = [];
    for (let k = 0; k < arr.length; k++) {
      lat.push(done[k] - arr[k]);
      if (done[k] <= plug) { acked++; if (aof !== "always" && done[k] > safe) lost++; }
    }
    lat.sort((a, b) => a - b);
    const p99 = lat[Math.floor(0.99 * lat.length)] || 0;
    // the worst a crash can do with this setting: the longest stretch of acknowledged writes not yet on disk
    const worst = aof === "always" ? 0 : aof === "everysec" ? 1 + fsync : aof === "no" ? (rdb ? Math.min(osEvery, rdbEvery) : osEvery) : rdb ? rdbEvery : Infinity;
    // the picture: the last `window` seconds before the plug in columns of `col` s: writes in each, and how many were safe
    const cols = [];
    for (let c0 = plug - window; c0 < plug - 1e-9; c0 += col) cols.push({ t: c0, n: 0, safe: 0 });
    for (let k = 0; k < arr.length; k++) {
      if (done[k] > plug || arr[k] < plug - window) continue;
      const ci = Math.min(cols.length - 1, Math.floor((arr[k] - (plug - window)) / col));
      cols[ci].n++;
      if (aof === "always" || done[k] <= safe) cols[ci].safe++;
    }
    return { aof, rdb, p99, acked, lost, lostFor: aof === "always" ? 0 : Math.max(0, plug - safe), worst, safe, cols, writes: arr.length };
  }

  // ---------------------------------------------------------------------------------------------- hash slots --
  const SLOTS = 16384;
  const CRC = new Uint16Array(256);
  for (let i = 0; i < 256; i++) { let c = i << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; CRC[i] = c; }
  function crc16(s) { let c = 0; for (let i = 0; i < s.length; i++) c = ((c << 8) & 0xffff) ^ CRC[((c >> 8) ^ s.charCodeAt(i)) & 0xff]; return c; }
  // only the part inside {braces} is hashed, when there is one, so related keys can share a slot
  function slot(key) { const a = key.indexOf("{"); if (a >= 0) { const b = key.indexOf("}", a + 1); if (b > a + 1) key = key.slice(a + 1, b); } return crc16(key) % SLOTS; }

  class Cluster {
    constructor(n) { this.n = n; this.own = new Int16Array(SLOTS); for (let s = 0; s < SLOTS; s++) this.own[s] = Math.min(n - 1, Math.floor((s * n) / SLOTS)); }
    count() { const c = new Array(this.n).fill(0); for (const o of this.own) c[o]++; return c; }
    // a new node takes an even share of slots, a few from every node; returns the slots that moved
    add() {
      const moved = [], want = Math.floor(SLOTS / (this.n + 1)), c = this.count(), give = c.map((x) => x - Math.floor(SLOTS / (this.n + 1)));
      let need = want;
      // take from the end of each node's slots, as evenly as the counts allow
      for (let s = SLOTS - 1; s >= 0 && need > 0; s--) { const o = this.own[s]; if (give[o] > 0) { give[o]--; this.own[s] = this.n; moved.push(s); need--; } }
      this.n++;
      return moved;
    }
    // the last node hands its slots back, spread over the others
    remove() {
      if (this.n <= 1) return [];
      const last = this.n - 1, moved = [];
      this.n--;
      const c = this.count();
      for (let s = 0; s < SLOTS; s++) if (this.own[s] === last) { let m = 0; for (let k = 1; k < this.n; k++) if (c[k] < c[m]) m = k; this.own[s] = m; c[m]++; moved.push(s); }
      return moved;
    }
    // ops a second and bytes on each node, for keys [{slot, ops, bytes}]
    load(keys) {
      const ops = new Array(this.n).fill(0), bytes = new Array(this.n).fill(0);
      for (const k of keys) { const o = this.own[k.slot]; ops[o] += k.ops; bytes[o] += k.bytes; }
      return { ops, bytes };
    }
  }
  // the share of keys that land on a different node when n becomes n + 1, if keys went to hash % n instead
  function modMoved(keys, n) { let m = 0; for (const k of keys) if (k.h % n !== k.h % (n + 1)) m++; return m / keys.length; }

  const API = { rng, zipfCum, topShare, evict, POLICIES, persist, MODES, crc16, slot, SLOTS, Cluster, modMoved };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.KV = API;
})(typeof self !== "undefined" ? self : this);
