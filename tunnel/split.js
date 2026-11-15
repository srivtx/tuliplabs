/* The Splitting data unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   layout(scheme, n, v)  where 100,000 keys live on n servers: "mod" sends a key to hash % n; "ring" puts each server
                         at v points on a ring and sends a key to the next point clockwise (consistent hashing).
   moved(scheme, v, a, b) the share of keys that change server when a cluster grows from a to b servers.
   pkey()                a fleet of 10,000 vans, each sending a reading every second, kept in a table split over 8
                         partitions. Four ways to pick the partition (KEYS_P), and for each: the writes each partition
                         takes, and how many partitions two questions have to ask.
   grow(o)               a cache of 1,000,000 logged-in sessions on 4 servers, 200,000 reads a second spread evenly,
                         and a 5th server added at the peak. `scheme`: hash % n, a ring with one point per server, or
                         a ring with 200 points per server. `how`: switch it on at once, or copy its keys over from
                         their old homes first. Keys that move are missing until a read fills them from the database,
                         which takes 20,000 reads a second; a server takes at most 60,000. Worked out in 50 ms steps.
   hot(o)                a ride app keeps its drivers' locations split over 16 partitions, each taking 5,000 updates a
                         second. The city is a 16 × 16 grid of cells; `by` "area" keeps neighbouring cells together
                         (ranges along a Hilbert curve), "driver" hashes the driver's id. On Friday night a concert
                         ends and, over a minute, 24,000 more updates a second pile into the streets around the stadium. `split`:
                         never, or split a partition in two when it passes 90% or 50% busy; a split takes 10 s. */
(function (root) {
  "use strict";
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // a 32-bit hash of a string (FNV-1a, then mixed so nearby strings land far apart), and the same as a point on a ring
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  const spot = (str) => hash(str) / 4294967296;

  // ---------------------------------------------------------------------------------------------- the ring --
  const KEYS = 100000;
  let KH = null, KP = null;
  function keys() {
    if (!KH) { KH = new Uint32Array(KEYS); KP = new Float64Array(KEYS); for (let i = 0; i < KEYS; i++) { KH[i] = hash("user:" + i); KP[i] = KH[i] / 4294967296; } }
    return { KH, KP };
  }
  // the points of a ring, in order round it: each server at v points
  function points(n, v) {
    const pts = [];
    for (let s = 0; s < n; s++) for (let i = 0; i < v; i++) pts.push({ p: spot(`cache-${s + 1}#${i}`), s });
    return pts.sort((a, b) => a.p - b.p);
  }
  function ownerOf(pts, x) {
    let lo = 0, hi = pts.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].p < x) lo = m + 1; else hi = m; }
    return pts[lo === pts.length ? 0 : lo].s;
  }
  const memo = {};
  function layout(scheme, n, v) {
    const id = `${scheme}:${n}:${v}`;
    if (memo[id]) return memo[id];
    const { KH, KP } = keys(), own = new Uint8Array(KEYS), count = new Array(n).fill(0);
    const pts = scheme === "ring" ? points(n, v) : null;
    for (let i = 0; i < KEYS; i++) { own[i] = pts ? ownerOf(pts, KP[i]) : KH[i] % n; count[own[i]]++; }
    return (memo[id] = { own, pts, share: count.map((c) => c / KEYS) });
  }
  function moved(scheme, v, a, b) {
    const A = layout(scheme, a, v), B = layout(scheme, b, v);
    let toNew = 0, among = 0;
    for (let i = 0; i < KEYS; i++) if (A.own[i] !== B.own[i]) { if (B.own[i] >= a) toNew++; else among++; }
    return { all: (toNew + among) / KEYS, toNew: toNew / KEYS, among: among / KEYS };
  }
  const fullest = (scheme, n, v) => Math.max(...layout(scheme, n, v).share);
  // on average over every way the points could fall, the fullest of n servers with one point each holds H(n)/n
  const fullestAvg = (n) => { let s = 0; for (let k = 1; k <= n; k++) s += 1 / k; return s / n; };

  // ------------------------------------------------------------------------------------- the partition key --
  const PK = { vans: 10000, parts: 8, cap: 2500, big: "acme", bigVans: 4000 };
  const KEYS_P = ["time", "idrange", "hashread", "hashvan"];
  const STARTS = "adgjmpsv";
  let FLEET = null;
  function fleet() {
    if (FLEET) return FLEET;
    const r = rng(11), ids = [], who = [];
    for (let k = 1; k <= PK.bigVans; k++) { ids.push(`${PK.big}-${String(k).padStart(4, "0")}`); who.push(0); }
    let c = 1;
    while (ids.length < PK.vans) {
      let name = "";
      for (let j = 0, L = 4 + Math.floor(r() * 3); j < L; j++) name += "abcdefghijklmnopqrstuvwxyz"[Math.floor(r() * 26)];
      if (name.startsWith(PK.big)) continue;
      for (let k = 1, m = 1 + Math.floor(r() * 40); k <= m && ids.length < PK.vans; k++) { ids.push(`${name}-${k}`); who.push(c); }
      c++;
    }
    // a fixed shuffle of the vans, to draw a few of their readings falling into partitions
    const order = ids.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return (FLEET = { ids, who, order, customers: c });
  }
  const NOW = 1763200000; // the second the readings are written
  function partOf(key, id, t = NOW) {
    if (key === "time") return PK.parts - 1; // the newest hour lives in the last partition
    if (key === "idrange") { let p = 0; for (let i = 0; i < STARTS.length; i++) if (id[0] >= STARTS[i]) p = i; return p; }
    if (key === "hashread") return hash(`${id}@${t}`) % PK.parts;
    return hash(id) % PK.parts;
  }
  function pkey() {
    const F = fleet(), out = {};
    for (const key of KEYS_P) {
      const counts = new Array(PK.parts).fill(0);
      for (const id of F.ids) counts[partOf(key, id)]++;
      // one van's last hour: 3,600 readings; the whole fleet's last minute: every van
      const one = new Set(); for (let t = NOW - 3599; t <= NOW; t++) one.add(partOf(key, F.ids[7], t));
      const all = key === "time" ? 1 : PK.parts;
      out[key] = { counts, busiest: Math.max(...counts), one: one.size, all };
    }
    return out;
  }

  // --------------------------------------------------------------------------------------- grow the cache --
  const GR = { sessions: 1e6, rate: 200000, cap: 60000, busy: 0.8, db: 20000, T: 60, at: 10, copy: 100000, dt: 0.05, bin: 0.5 };
  const SCHEMES = ["mod", "ring1", "ring200"], HOWS = ["now", "copy"];
  const parts = (scheme) => (scheme === "mod" ? ["mod", 0] : ["ring", scheme === "ring1" ? 1 : 200]);
  function grow(o) {
    const [sc, v] = parts(o.scheme), A = layout(sc, 4, v), B = layout(sc, 5, v), mv = moved(sc, v, 4, 5);
    const cold0 = o.how === "copy" ? mv.among : mv.all, copyTime = o.how === "copy" ? (mv.toNew * GR.sessions) / GR.copy : 0, cut = GR.at + copyTime;
    const before = A.share.map((x) => x * GR.rate), after = B.share.map((x) => x * GR.rate);
    let C = 0, cut0 = false, errors = 0, dbErr = 0, cacheErr = 0, dbPeak = 0, refill = null;
    const bins = [], per = Math.round(GR.bin / GR.dt);
    let acc = { q: 0, miss: 0, err: 0, n: 0 };
    for (let k = 0; k < Math.round(GR.T / GR.dt); k++) {
      const t = k * GR.dt;
      if (!cut0 && t >= cut - 1e-9) { cut0 = true; C = cold0 * GR.sessions; }
      const load = cut0 ? after : before;
      const miss = (GR.rate * C) / GR.sessions, served = Math.min(miss, GR.db), refused = miss - served;
      const over = load.reduce((s, l) => s + Math.max(0, l - GR.cap), 0);
      errors += (refused + over) * GR.dt; dbErr += refused * GR.dt; cacheErr += over * GR.dt;
      dbPeak = Math.max(dbPeak, miss);
      C = Math.max(0, C - served * GR.dt);
      if (cut0 && refill == null && C < GR.sessions / 1000) refill = t - cut;
      acc.q += served; acc.miss += miss; acc.err += (refused + over) * GR.dt; acc.n++;
      if (acc.n === per) { bins.push({ t: t + GR.dt - GR.bin, q: acc.q / per, miss: acc.miss / per, err: acc.err, cold: C / GR.sessions, busiest: Math.max(...load) }); acc = { q: 0, miss: 0, err: 0, n: 0 }; }
    }
    return {
      errors: Math.round(errors), dbErr: Math.round(dbErr), cacheErr: Math.round(cacheErr), dbPeak, cold0, copyTime, cut, refill,
      moved: mv, before, after, busiestBefore: Math.max(...before), busiest: Math.max(...after), bins,
    };
  }
  // for the picture: each of the first `n` keys, where it is before and after, and when it fills (as a share of the cold)
  function growDots(scheme, n) {
    const [sc, v] = parts(scheme), A = layout(sc, 4, v), B = layout(sc, 5, v), { KP } = keys(), r = rng(5), out = [];
    for (let i = 0; i < n; i++) out.push({ p: KP[i], a: A.own[i], b: B.own[i], q: r() });
    return out;
  }

  // ----------------------------------------------------------------------------------------- hot cells --
  const HC = { side: 16, parts: 16, cap: 5000, T: 240, base: 32000, hot: 24000, from: 40, ramp: 60, cx: 12, cy: 3, sigma: 1.4, splitT: 10 };
  const BYS = ["area", "driver"], SPLITS = ["never", 0.9, 0.5];
  // a Hilbert curve visits every cell of the grid once, and cells close along it are close on the map
  function d2xy(n, d) {
    let x = 0, y = 0, t = d;
    for (let s = 1; s < n; s *= 2) {
      const rx = 1 & (t / 2), ry = 1 & (t ^ rx);
      if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; }
      x += s * rx; y += s * ry; t = Math.floor(t / 4);
    }
    return [x, y];
  }
  const NC = HC.side * HC.side;
  const XY = Array.from({ length: NC }, (_, d) => d2xy(HC.side, d));
  const DOF = []; XY.forEach(([x, y], d) => { DOF[y * HC.side + x] = d; });
  // the city: busier towards the middle; the stadium's crowd is a bump around (cx, cy)
  const BASEW = XY.map(([x, y]) => 1 + 2.2 * Math.exp(-((x - 7.5) ** 2 + (y - 8.5) ** 2) / (2 * 4.5 ** 2)));
  const BSUM = BASEW.reduce((a, b) => a + b, 0);
  const HOTW = XY.map(([x, y]) => Math.exp(-((x - HC.cx) ** 2 + (y - HC.cy) ** 2) / (2 * HC.sigma ** 2)));
  const HSUM = HOTW.reduce((a, b) => a + b, 0);
  const crowd = (t) => HC.hot * Math.max(0, Math.min(1, (t - HC.from) / HC.ramp));
  const cellLoad = (d, t) => (HC.base * BASEW[d]) / BSUM + (crowd(t) * HOTW[d]) / HSUM;
  // a nearby search reads the rider's cell and the 8 around it
  const AROUND = XY.map(([x, y]) => { const r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < HC.side && Y < HC.side) r.push(DOF[Y * HC.side + X]); } return r; });
  function hot(o) {
    const thr = o.split === "never" ? null : +o.split;
    let P = Array.from({ length: HC.parts }, (_, i) => ({ a: i * (NC / HC.parts), b: (i + 1) * (NC / HC.parts), until: null }));
    const frames = [];
    let dropped = 0, peak = 0, search = 0, splits = 0;
    for (let t = 0; t <= HC.T; t++) {
      const L = Array.from({ length: NC }, (_, d) => cellLoad(d, t)), total = L.reduce((a, b) => a + b, 0);
      // finish the splits that are due: cut where the load is even on both sides
      if (o.by === "area") {
        const next = [];
        for (const p of P) {
          if (p.until != null && t >= p.until) {
            let best = p.a + 1, diff = Infinity, left = 0, all = 0;
            for (let d = p.a; d < p.b; d++) all += L[d];
            for (let m = p.a + 1; m < p.b; m++) { left += L[m - 1]; const df = Math.abs(2 * left - all); if (df < diff) { diff = df; best = m; } }
            next.push({ a: p.a, b: best, until: null }, { a: best, b: p.b, until: null }); splits++;
          } else next.push(p);
        }
        P = next;
      }
      const loads = o.by === "area" ? P.map((p) => { let s = 0; for (let d = p.a; d < p.b; d++) s += L[d]; return s; }) : P.map(() => total / HC.parts);
      let drop = 0;
      loads.forEach((l, i) => {
        drop += Math.max(0, l - HC.cap); peak = Math.max(peak, l / HC.cap);
        if (o.by === "area" && thr != null && l > thr * HC.cap && P[i].until == null && P[i].b - P[i].a > 1) P[i].until = t + HC.splitT;
      });
      dropped += drop;
      // the average nearby search, weighted by where the riders are (where the drivers are)
      let sr = HC.parts;
      if (o.by === "area") {
        const own = new Int16Array(NC); P.forEach((p, i) => { for (let d = p.a; d < p.b; d++) own[d] = i; });
        let w = 0, s = 0;
        for (let d = 0; d < NC; d++) { const set = new Set(AROUND[d].map((e) => own[e])); s += L[d] * set.size; w += L[d]; }
        sr = s / w;
      }
      search = Math.max(search, sr);
      frames.push({ t, parts: P.map((p, i) => [p.a, p.b, p.until != null ? 1 : 0, loads[i]]), drop, search: sr, total });
    }
    return { dropped: Math.round(dropped), peak, search, splits, count: P.length, frames };
  }

  const API = {
    hash, spot, KEYS, keys, points, layout, moved, fullest, fullestAvg,
    PK, KEYS_P, STARTS, fleet, partOf, pkey,
    GR, SCHEMES, HOWS, grow, growDots,
    HC, BYS, SPLITS, XY, DOF, crowd, cellLoad, hot,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SPLIT = API;
})(typeof self !== "undefined" ? self : this);
