/* The Uber unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   city(o)      a city 20 km × 11 km with drivers in it: crowded downtown, a busy airport, thin suburbs.
   nearby(o)    find the 5 drivers nearest each of 40 riders, with a geo index: the city cut into square cells,
                each cell listing the drivers in it. Two choices:
                  cell     the cell's side, from 4 km down to 100 m (0: no index, check every driver)
                  search   "cell"   only the rider's own cell
                           "ring"   her cell and the 8 around it
                           "widen"  ring after ring, until no driver further out could be closer than the 5th found
                Work for one request is the cells opened plus the drivers measured.
   match(o)     an evening downtown: riders ask for rides, free drivers wait. Every `window` seconds the matcher
                pairs everyone waiting with free drivers. A window of 0 matches each rider the moment they ask,
                to the nearest free driver; a longer window collects riders and pairs the batch so the total drive
                is shortest (the assignment problem, solved exactly). What a rider feels: the wait to be matched
                plus the drive for the car to reach them.
   evening(o)   two matcher servers hand out drivers at the same time, and now and then a driver's phone drops
                after an offer arrives (a tunnel, a car park). Two choices:
                  claim    "check"  read that the driver is free, offer, and mark them busy when they accept
                           "cas"    claim the driver in one step (free → offered to this ride) before offering
                  expiry   seconds an offer stays open before it goes to the next driver (0: never) */
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
  const W = 20, H = 11;
  const gauss = (R) => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  // where people are: downtown, the airport, and everywhere else
  const HUBS = [{ x: 7.5, y: 5.5, s: 1.3, w: 0.55 }, { x: 16.2, y: 2.6, s: 0.55, w: 0.15 }];
  function spot(R) {
    const u = R();
    let acc = 0;
    for (const h of HUBS) {
      acc += h.w;
      if (u < acc) for (;;) { const x = h.x + gauss(R) * h.s, y = h.y + gauss(R) * h.s; if (x > 0 && x < W && y > 0 && y < H) return { x, y }; }
    }
    return { x: R() * W, y: R() * H };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ------------------------------------------------------------------------------------------------- the city --
  function city({ seed = 1, drivers = 3000, riders = 40 } = {}) {
    const R = rng(seed);
    const D = Array.from({ length: drivers }, (_, i) => ({ i, ...spot(R) }));
    // riders: mostly where people are, a few out in the suburbs, so a search has to cope with both
    const Q = Array.from({ length: riders }, (_, i) => (i % 4 === 3 ? { x: 0.5 + R() * (W - 1), y: 0.5 + R() * (H - 1) } : spot(R)));
    return { W, H, drivers: D, riders: Q };
  }

  // ----------------------------------------------------------------------------------------------- nearby --
  const CELLS = [4, 2, 1, 0.5, 0.25, 0.1, 0], SEARCH = ["cell", "ring", "widen"];
  function nearby({ cell = 4, search = "cell", seed = 1, k = 5, C } = {}) {
    C = C || city({ seed });
    const D = C.drivers, out = [];
    let grid = null;
    if (cell) {
      grid = new Map();
      for (const d of D) { const key = Math.floor(d.x / cell) + "," + Math.floor(d.y / cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(d); }
    }
    const nx = cell ? Math.ceil(W / cell) : 0, ny = cell ? Math.ceil(H / cell) : 0;
    for (const q of C.riders) {
      const truth = D.map((d) => [dist(d, q), d.i]).sort((a, b) => a[0] - b[0]).slice(0, k).map((p) => p[1]);
      let seen = [], cells = [], opened = 0;
      if (!cell) seen = D.slice();
      else {
        const cx = Math.floor(q.x / cell), cy = Math.floor(q.y / cell);
        const open = (r) => {
          for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || x < 0 || y < 0 || x >= nx || y >= ny) continue;
            opened++; cells.push([x, y]);
            const l = grid.get(x + "," + y); if (l) seen.push(...l);
          }
        };
        if (search === "cell") open(0);
        else if (search === "ring") { open(0); open(1); }
        else {
          // ring r's nearest point is at least (r - 1) cells away from the rider's cell, plus her distance to its edge
          const edge = Math.min(q.x - cx * cell, (cx + 1) * cell - q.x, q.y - cy * cell, (cy + 1) * cell - q.y);
          for (let r = 0; r <= Math.max(nx, ny); r++) {
            if (seen.length >= k) {
              const kth = seen.map((d) => dist(d, q)).sort((a, b) => a - b)[k - 1];
              if ((r - 1) * cell + edge >= kth) break;
            }
            open(r);
          }
        }
      }
      const found = seen.map((d) => [dist(d, q), d.i]).sort((a, b) => a[0] - b[0]).slice(0, k).map((p) => p[1]);
      const ok = found.length === k && found.every((i, j) => i === truth[j]);
      out.push({ q, cells, seen: cell ? seen.map((d) => d.i) : null, opened, checked: seen.length, work: opened + seen.length, found, truth, ok, near: found.length });
    }
    const n = out.length;
    return { C, cell, search, list: out, right: out.filter((r) => r.ok).length, n, work: out.reduce((a, r) => a + r.work, 0) / n, worst: Math.max(...out.map((r) => r.work)) };
  }

  // ------------------------------------------------------------------------------------------------- match --
  // the assignment problem: rows to columns, least total cost (rows ≤ columns), Hungarian method
  function assign(cost) {
    const n = cost.length, m = n ? cost[0].length : 0, INF = 1e18;
    if (!n) return [];
    const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = INF, j1 = 0;
        for (let j = 1; j <= m; j++) if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const res = new Array(n).fill(-1);
    for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
    return res;
  }
  const WINDOWS = [0, 5, 15, 30, 60, 120];
  const SPEED = 25 / 60 / 60, ROAD = 1.35; // 25 km/h, in km a second; roads wind 35% further than the crow flies
  const drive = (a, b) => (dist(a, b) * ROAD) / SPEED;
  function match({ window = 0, seed = 1, minutes = 30, perMin = 20, drivers = 240, trip = [360, 840], away = 0.3 } = {}) {
    const R = rng(seed), T = minutes * 60;
    const DT = 1;
    // one evening, fixed before any matching: who asks for a ride, when, from where, and how long the trip lasts
    const asks = [];
    for (let t = -Math.log(1 - R()) * (60 / perMin); t < T; t += -Math.log(1 - R()) * (60 / perMin)) asks.push({ t, ...near(R), len: trip[0] + R() * (trip[1] - trip[0]), drop: R() < away ? spot(R) : near(R) });
    const fleet = Array.from({ length: drivers }, () => ({ ...near(R), free: 0 }));
    const waiting = [], done = [];
    let next = 0, last = -1e9;
    for (let t = 0; t <= T + 1800; t += DT) {
      while (next < asks.length && asks[next].t <= t) waiting.push(asks[next++]);
      const due = window ? t - last >= window : true;
      if (!due || !waiting.length) continue;
      last = t;
      const free = fleet.filter((d) => d.free <= t);
      if (!free.length) continue;
      let pairs;
      if (!window) {
        // first come, first served: each waiting rider, oldest first, takes the nearest free driver
        pairs = [];
        const left = free.slice();
        for (const r of waiting) { if (!left.length) break; let b = 0; for (let j = 1; j < left.length; j++) if (drive(left[j], r) < drive(left[b], r)) b = j; pairs.push([r, left[b]]); left.splice(b, 1); }
      } else {
        const rs = waiting.slice(0, free.length), a = assign(rs.map((r) => free.map((d) => drive(d, r))));
        pairs = rs.map((r, i) => [r, free[a[i]]]);
      }
      for (const [r, d] of pairs) {
        const pick = drive(d, r);
        done.push({ ...r, matched: t, pick, from: { x: d.x, y: d.y }, wait: t - r.t + pick });
        d.free = t + pick + r.len; d.x = r.drop.x; d.y = r.drop.y;
        waiting.splice(waiting.indexOf(r), 1);
      }
      if (next >= asks.length && !waiting.length) break;
    }
    const n = done.length, mean = (f) => done.reduce((a, r) => a + f(r), 0) / n;
    return { window, rides: done, n, asked: asks.length, toMatch: mean((r) => r.matched - r.t), pick: mean((r) => r.pick), wait: mean((r) => r.wait) };
  }
  // an evening downtown: rides start near the middle of town
  function near(R) { for (;;) { const x = 7.5 + gauss(R) * 1.6, y = 5.5 + gauss(R) * 1.6; if (x > 0 && x < W && y > 0 && y < H) return { x, y }; } }

  // ----------------------------------------------------------------------------------------------- evening --
  const CLAIMS = ["check", "cas"], EXPIRY = [0, 5, 15, 60];
  function evening({ claim = "check", expiry = 0, seed = 1, rides = 240, hours = 4, drop = 0.06, accept = [3, 12], look = 0.4 } = {}) {
    const R = rng(seed), T = hours * 3600;
    // the same evening for every choice: when each request comes, and how each driver it reaches would answer
    const reqs = [];
    for (let i = 0; i < rides; i++) reqs.push({ i, t: R() * T, m: i % 2, g: i });
    reqs.sort((a, b) => a.t - b.t);
    // every ninth request has a twin: someone on the same street corner a moment later, going to the other matcher,
    // with the same drivers nearest
    for (let n = 1; n < reqs.length; n += 9) Object.assign(reqs[n], { t: reqs[n - 1].t + 0.2 + R() * 1.5, m: 1 - reqs[n - 1].m, g: reqs[n - 1].g, twin: reqs[n - 1].i });
    reqs.sort((a, b) => a.t - b.t);
    const dead = (d) => rng(seed * 104729 + d)() < drop; // this driver's phone drops when an offer reaches it
    const after = (ride, d) => { const A = rng(seed * 7919 + ride * 131 + d); A(); return accept[0] + A() * (accept[1] - accept[0]); };
    const cands = (r, k) => r.g * 10 + k; // her k-th nearest driver
    const busy = new Set(), held = new Map(), events = [], out = [];
    const at = (t, fn) => events.push([t, fn]);
    for (const r of reqs) {
      const o = { i: r.i, t: r.t, m: r.m, twin: r.twin, tries: [], got: null, at: null, st: "stuck" };
      out.push(o);
      const offer = (k, t) => {
        // the matcher picks her nearest driver that it sees as free
        while (busy.has(cands(r, k)) || (claim === "cas" && held.has(cands(r, k)))) k++;
        const d = cands(r, k), x = { d, t };
        if (claim === "cas") held.set(d, r.i); // claimed in one step: nobody else can be offered this driver
        o.tries.push(x);
        const close = () => at(t + expiry, () => { x.expired = true; held.delete(d); offer(k + 1, t + expiry); });
        if (dead(d)) { x.dead = true; if (expiry) close(); return; }
        const a = after(r.i, d);
        if (expiry && a > expiry) { x.late = true; close(); return; } // the offer closed while they were tapping accept
        at(t + a, () => { x.ok = true; o.got = d; o.at = t + a; o.st = "ok"; busy.add(d); });
      };
      at(r.t, () => offer(0, r.t + look));
    }
    events.sort((a, b) => a[0] - b[0]);
    for (let n = 0; n < events.length; n++) {
      events[n][1]();
      // events added while running land in time order among the ones still to come
      if (n + 1 < events.length) { const rest = events.splice(n + 1).sort((a, b) => a[0] - b[0]); events.push(...rest); }
    }
    // a driver who accepted two riders
    const by = new Map();
    for (const o of out) if (o.got != null) { if (by.has(o.got)) { o.st = "double"; by.get(o.got).st = "double"; o.with = by.get(o.got).i; } else by.set(o.got, o); }
    const n = out.length, doubled = out.filter((o) => o.st === "double").length / 2, stuck = out.filter((o) => o.st === "stuck").length;
    const late = out.reduce((a, o) => a + o.tries.filter((x) => x.late).length, 0), drops = out.reduce((a, o) => a + o.tries.filter((x) => x.dead).length, 0);
    const worst = Math.max(0, ...out.filter((o) => o.got != null).map((o) => o.at - o.t));
    return { rides: out.sort((a, b) => a.t - b.t), T, n, doubled, stuck, late, drops, worst };
  }

  const API = { rng, W, H, HUBS, city, CELLS, SEARCH, nearby, assign, WINDOWS, SPEED, ROAD, drive, match, CLAIMS, EXPIRY, evening, dist };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.GEO = API;
})(typeof self !== "undefined" ? self : this);
