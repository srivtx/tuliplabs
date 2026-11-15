/* The YouTube unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   transcode(o)  an hour-long upload becomes four renditions (360p, 720p, 1080p, 4K). The raw file is cut into
                 pieces of `seg` seconds, and 200 workers encode them, one piece and one rendition at a time. Every
                 task pays a start-up cost (fetch the piece, find a keyframe, warm up the encoder), so tiny pieces
                 waste work. `order` is which tasks go first: each piece's four renditions together, or every
                 piece's 360p before anything else. Reports when the video is watchable (all of it in 360p),
                 when every rendition is done, and how much work went to start-up.
   abr(o)        a viewer on a train watches 8 minutes of a video in 2-second pieces while the bandwidth swings
                 (the city, a tunnel, open country, a crowded station). The player picks each piece's quality by a
                 `rule`, and fetches up to `ahead` seconds before the playhead. Reports stalls, average quality,
                 how often the picture changes quality, and the megabytes thrown away when the viewer leaves.
   premiere(o)   a premiere: 3 million people press play together, on 200 CDN edges in 10 regions. Every 4 s a
                 new piece goes live and everyone asks for it at once. On a miss an edge asks upstream: either
                 every waiting request goes on (`collapse` off) or one goes and the rest wait for it (on), and the
                 edges ask the origin directly or a regional shield first (`shield`). Reports the requests a
                 second that reach the origin, and how long viewers wait for each piece. */
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
  const gauss = (R) => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

  // ---------------------------------------------------------------------------------------------- transcode --
  // worker-seconds to encode one second of video, per rendition
  const RENDS = [{ id: "360p", cost: 0.5 }, { id: "720p", cost: 1.5 }, { id: "1080p", cost: 3 }, { id: "4K", cost: 8 }];
  const SEGS = [3600, 600, 60, 10, 2], ORDERS = ["piece", "low"];
  function transcode({ seg = 3600, order = "piece", seed = 1, length = 3600, workers = 200, startup = 4, jitter = 0.12 } = {}) {
    const R = rng(seed), pieces = Math.ceil(length / seg), tasks = [];
    for (let p = 0; p < pieces; p++) {
      const len = Math.min(seg, length - p * seg);
      RENDS.forEach((r, k) => tasks.push({ p, k, len, dur: (startup + len * r.cost) * Math.max(0.6, 1 + jitter * gauss(R)) }));
    }
    if (order === "low") tasks.sort((a, b) => a.k - b.k || a.p - b.p);
    // the workers: a heap would be faster, but a sorted list of free times is plenty for 7,200 tasks
    const free = new Array(Math.min(workers, tasks.length)).fill(0);
    let work = 0;
    for (const t of tasks) {
      let i = 0;
      for (let j = 1; j < free.length; j++) if (free[j] < free[i]) i = j;
      t.w = i; t.start = free[i]; t.end = t.start + t.dur; free[i] = t.end; work += t.dur;
    }
    const doneBy = (k) => tasks.filter((t) => t.k === k).reduce((a, t) => Math.max(a, t.end), 0);
    const ideal = RENDS.reduce((a, r) => a + r.cost, 0) * length;
    return { seg, order, pieces, tasks, workers, watchable: doneBy(0), ready: RENDS.map((_, k) => doneBy(k)), all: tasks.reduce((a, t) => Math.max(a, t.end), 0),
      work, ideal, overhead: (tasks.length * startup) / ideal, startupWork: tasks.length * startup };
  }

  // --------------------------------------------------------------------------------------------------- abr --
  // the quality ladder, in megabits a second
  const LADDER = [{ id: "240p", mbps: 0.4 }, { id: "360p", mbps: 0.8 }, { id: "480p", mbps: 1.5 }, { id: "720p", mbps: 3 }, { id: "1080p", mbps: 6 }];
  const RULES = ["top", "low", "rate", "buffer"], AHEAD = [10, 30, 120];
  // the train ride: sections of the line, their typical bandwidth, and how much it flickers second to second
  const RIDE = [
    { to: 150, say: "the city", mbps: 12, flick: 0.45 },
    { to: 175, say: "a tunnel", mbps: 0.6, flick: 0.3 },
    { to: 330, say: "open country", mbps: 4.5, flick: 0.6 },
    { to: 420, say: "a crowded station", mbps: 2.2, flick: 0.5 },
    { to: 900, say: "the city", mbps: 11, flick: 0.45 },
  ];
  function ride(seed = 1, secs = 900) {
    const R = rng(seed), bw = [];
    let drift = 0;
    for (let t = 0; t < secs; t++) {
      const sec = RIDE.find((x) => t < x.to);
      drift = 0.7 * drift + 0.3 * gauss(R);
      bw.push(Math.max(0.05, sec.mbps * Math.exp(sec.flick * drift - sec.flick * sec.flick / 2)));
    }
    return bw;
  }
  // seconds to fetch `mb` megabits starting at time t, through the bandwidth trace
  function fetch(bw, t, mb) {
    let left = mb;
    for (;;) {
      const i = Math.min(bw.length - 1, Math.floor(t)), room = Math.floor(t) + 1 - t, can = bw[i] * room;
      if (can >= left) return t + left / bw[i];
      left -= can; t = Math.floor(t) + 1;
    }
  }
  function abr({ rule = "top", ahead = 30, seed = 1, watch = 480, piece = 2, reservoir = 5 } = {}) {
    const bw = ride(seed), pieces = [], stalls = [], trace = [[0, 0, 0]]; // trace: [time, seconds buffered, seconds watched]
    let t = 0, buf = 0, play = 0, last = null, started = null, startup = 0, stalled = 0, est = 3;
    // the player: fetch the next piece when the buffer has room; the clock runs while it fetches
    const pick = () => {
      if (rule === "top") return LADDER.length - 1;
      if (rule === "low") return 1;
      if (rule === "rate") { let k = 0; LADDER.forEach((q, i) => { if (q.mbps <= 0.9 * est) k = i; }); return k; }
      // by the buffer: the lowest quality below the reservoir, the highest near a full buffer, a straight line between
      // (one step at a time, so the picture doesn't jump from 240p to 1080p)
      const cushion = Math.max(reservoir + piece, ahead * 0.9), f = (buf - reservoir) / (cushion - reservoir);
      const lvl = f * LADDER.length;
      if (last === null) return Math.max(0, Math.min(LADDER.length - 1, Math.floor(lvl)));
      // and only up when the buffer is well into the next band, so it doesn't flicker on a boundary
      return lvl >= last + 1.6 ? Math.min(LADDER.length - 1, last + 1) : lvl < last ? Math.max(0, last - 1) : last;
    };
    while (play < watch) {
      if (buf + piece > ahead) {
        // full: play until there's room for one more piece
        const wait = Math.min(buf + piece - ahead, watch - play);
        t += wait; play += wait; buf -= wait;
        trace.push([t, buf, play]);
        continue;
      }
      const k = pick(), mb = LADDER[k].mbps * piece, done = fetch(bw, t, mb), took = done - t;
      est = 0.6 * est + 0.4 * (mb / took);
      // while it fetches, the video plays from the buffer, and stalls if the buffer runs dry
      if (started !== null) {
        const played = Math.min(buf, took, watch - play), dry = Math.min(buf, took) < took ? took - buf : 0;
        play += played; buf -= played;
        trace.push([t + played, buf, play]);
        if (dry > 0 && play < watch) { stalled += dry; stalls.push({ at: t + played, len: dry }); }
      }
      t = done; buf += piece;
      trace.push([t, buf, play]);
      pieces.push({ t: done, k, start: done - took, at: started === null ? 0 : play });
      if (started === null && buf >= piece) { started = t; startup = t; }
      if (last !== null && last !== k) pieces[pieces.length - 1].sw = true;
      last = k;
    }
    // what was fetched but never watched, when the viewer leaves
    const watched = pieces.filter((p) => p.at < watch), mbits = (ps) => ps.reduce((a, p) => a + LADDER[p.k].mbps * piece, 0);
    const shown = pieces.slice(0, Math.ceil(watch / piece));
    const avg = shown.reduce((a, p) => a + LADDER[p.k].mbps, 0) / shown.length;
    const wasted = Math.max(0, mbits(pieces) - mbits(shown)) / 8;
    return { rule, ahead, bw, pieces, stalls, trace, stalled, stallShare: stalled / (watch + stalled), startup, avg, switches: shown.filter((p) => p.sw).length, wasted, end: t, watched: watched.length };
  }

  // ---------------------------------------------------------------------------------------------- premiere --
  const EDGES = 200, REGIONS = 10, TIMEOUT = 2;
  // A FIFO server that answers `cap` requests a second; a request that would wait longer than TIMEOUT is turned away.
  function server(cap) {
    let free = 0;
    return (t, n) => {
      // n requests arriving together at t: how many are served, and when the first and last answers leave
      const start = Math.max(t, free), room = Math.max(0, Math.floor((t + TIMEOUT - start) * cap)), served = Math.min(n, room);
      if (!served) return { served: 0, first: Infinity, last: Infinity };
      free = start + served / cap;
      return { served, first: start + 1 / cap, last: free };
    };
  }
  function premiere({ collapse = false, shield = false, seed = 1, viewers = 3e6, secs = 120, piece = 4, spread = 1.2, step = 0.02,
    toOrigin = 0.18, toShield = 0.03, shieldToOrigin = 0.16, originCap = 120, shieldCap = 20000, mile = 0.02 } = {}) {
    const R = rng(seed);
    // viewers per edge: big cities and small ones
    const wts = [];
    for (let e = 0; e < EDGES; e++) wts.push(Math.exp(0.9 * gauss(R)));
    const W = wts.reduce((a, x) => a + x, 0), per = wts.map((x) => (x / W) * viewers);
    const asked = new Array(secs).fill(0), served = new Array(secs).fill(0), waits = [], edgeUp = new Array(EDGES).fill(0), regionUp = new Array(REGIONS).fill(0), regionOrigin = new Array(REGIONS).fill(0);
    let originTotal = 0, failed = 0, total = 0;
    const origin = server(originCap), shields = Array.from({ length: REGIONS }, () => server(shieldCap));
    const toO = (t, n) => {
      const s = Math.min(secs - 1, Math.floor(t));
      asked[s] += n; originTotal += n;
      const o = origin(t, n);
      served[s] += o.served;
      return o;
    };
    for (let k = 0; k * piece < secs; k++) {
      const live = k * piece, batches = [];
      for (let e = 0; e < EDGES; e++) {
        const n = per[e] * (0.9 + 0.2 * R()), first = live + R() * 0.05, steps = Math.round(spread / step);
        for (let j = 0; j < steps; j++) batches.push({ e, t: first + j * step, n: n / steps });
      }
      batches.sort((a, b) => a.t - b.t);
      const edgeHas = new Array(EDGES).fill(Infinity), edgeAsked = new Array(EDGES).fill(false);
      const shieldHas = new Array(REGIONS).fill(Infinity), shieldAsked = new Array(REGIONS).fill(false);
      // one hop up from an edge: to the origin, or to its region's shield (which may itself ask the origin)
      const upstream = (e, t, n) => {
        if (!shield) {
          const o = toO(t + toOrigin / 2, n);
          return { served: o.served, first: o.first + toOrigin / 2, last: o.last + toOrigin / 2 };
        }
        const r = e % REGIONS, at = t + toShield / 2;
        regionUp[r] += n;
        const sv = shields[r](at, n);
        if (!sv.served) return { served: 0, first: Infinity, last: Infinity };
        const back = (x) => x + toShield / 2;
        if (sv.first >= shieldHas[r]) return { served: sv.served, first: back(sv.first), last: back(sv.last) };
        if (collapse && shieldAsked[r]) return { served: sv.served, first: back(Math.max(sv.first, shieldHas[r])), last: back(Math.max(sv.last, shieldHas[r])) };
        // the shield misses and asks the origin: one request if it collapses them, every one if it doesn't
        shieldAsked[r] = true;
        regionOrigin[r] += collapse ? 1 : sv.served;
        const o = toO(sv.first + shieldToOrigin / 2, collapse ? 1 : sv.served), got = o.first + shieldToOrigin / 2;
        if (o.served) shieldHas[r] = Math.min(shieldHas[r], got);
        const done = collapse ? (o.served ? sv.served : 0) : o.served;
        return { served: done, first: back(got), last: back(collapse ? got : o.last + shieldToOrigin / 2) };
      };
      for (const b of batches) {
        const { e, t, n } = b;
        total += n;
        if (t >= edgeHas[e]) { waits.push([mile, n]); continue; }
        if (collapse && edgeAsked[e]) {
          if (edgeHas[e] === Infinity) { failed += n; waits.push([TIMEOUT + piece, n]); } else waits.push([edgeHas[e] - t + mile, n]);
          continue;
        }
        // a miss: the edge asks upstream (once, if it collapses requests; for every viewer, if it doesn't)
        edgeAsked[e] = true;
        const ask = collapse ? 1 : n, u = upstream(e, t, ask);
        edgeUp[e] += ask;
        if (u.served) edgeHas[e] = Math.min(edgeHas[e], u.first);
        const ok = collapse ? (u.served ? n : 0) : (u.served / ask) * n;
        if (ok) waits.push([(collapse ? u.first : (u.first + u.last) / 2) - t + mile, ok]);
        if (n - ok > 1e-9) { failed += n - ok; waits.push([TIMEOUT + piece, n - ok]); }
      }
    }
    // the weighted 99th percentile of viewers' waits
    const wp = (p) => { const s = waits.slice().sort((a, b) => a[0] - b[0]), want = p * total; let acc = 0; for (const [w, n] of s) { acc += n; if (acc >= want) return w; } return s.length ? s[s.length - 1][0] : 0; };
    // and the waits in tenths of a second, up to 2 s; the last bin is everyone who gave up
    const hist = new Array(21).fill(0);
    for (const [w, n] of waits) hist[w > TIMEOUT ? 20 : Math.min(19, Math.floor(w * 10))] += n / total;
    return { collapse, shield, asked, served, hist, regionOrigin, originPeak: asked.reduce((a, x) => Math.max(a, x), 0), originTotal, cap: originCap, per, edgeUp, regionUp,
      failed: failed / total, waitP99: wp(0.99), waitP50: wp(0.5), pieces: Math.ceil(secs / piece) };
  }

  const API = { rng, pct, RENDS, SEGS, ORDERS, transcode, LADDER, RULES, AHEAD, RIDE, ride, fetch, abr, EDGES, REGIONS, TIMEOUT, premiere };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.VIDEO = API;
})(typeof self !== "undefined" ? self : this);
