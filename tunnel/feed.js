/* The Twitter / X unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   fanout(o)   one minute of tweets. Follower counts have a heavy tail: most accounts have a few dozen followers,
               a handful have tens of millions, and in this minute two of the biggest post. A tweet is either
               fanned out on write (its id pushed into every follower's cached timeline, by workers that write
               2 million entries a second, first come first served) or, for accounts at or over the threshold
               `T`, left alone and merged into each reader's timeline when they open it. Reports how long tweets
               take to reach their followers, and how long opening a timeline takes.
   likes(o)    a tweet goes viral: likes climb to 40,000 a second. The like count lives in database rows, and each
               row takes 1 ms per update (it's locked while it changes), so one row takes 1,000 likes a second.
               Split the count over `shards` rows (a like picks one at random; reading the count adds them all up),
               or batch likes in the 200 app servers' memory and write them every `batch` seconds.
   cache(o)    a cached home timeline for some of the 500 million accounts: who gets one, and how many tweet ids
               it keeps. Everything else is rebuilt from scratch when it's opened, which is slow. */
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

  // ------------------------------------------------------------------------------------------------ fan-out --
  const XMIN = 33, ALPHA = 1.2, CAP = 150e6;
  const THRESHOLDS = [Infinity, 10e6, 1e6, 100e3, 10e3, 1e3, 0];
  // the share of all follows that point at accounts with at least T followers (popular accounts are followed more)
  const share = (T) => (T === Infinity ? 0 : T <= XMIN ? 1 : Math.pow(T / XMIN, 1 - ALPHA));
  const followers = (R) => Math.min(CAP, Math.floor(XMIN / Math.pow(1 - R(), 1 / ALPHA)));
  function fanout({ T = Infinity, seed = 1, secs = 60, rate = 5787, C = 2e6, celebs = [[18, 120e6], [39, 30e6]], reads = 2000, base = 15, per = 0.6 } = {}) {
    const R = rng(seed), tw = [];
    for (let t = -Math.log(1 - R()) / rate; t < secs; t += -Math.log(1 - R()) / rate) tw.push({ t, f: followers(R) });
    for (const [t, f] of celebs) tw.push({ t, f, celeb: true });
    tw.sort((a, b) => a.t - b.t);
    // the fan-out workers: one queue, first come first served
    let free = 0, inserts = 0;
    const lags = [], big = [], steps = Math.round(secs * 4), backlog = new Array(steps + 1).fill(0);
    let k = 0;
    for (let i = 0; i <= steps; i++) {
      const s = i / 4;
      while (k < tw.length && tw[k].t <= s) {
        const x = tw[k++];
        if (x.f >= T) { x.read = true; x.lag = 0; if (x.f >= 1e6) big.push(x); continue; }
        free = Math.max(free, x.t) + x.f / C;
        x.lag = free - x.t; inserts += x.f;
        lags.push(x.lag);
        if (x.f >= 1e6) big.push(x);
      }
      backlog[i] = Math.max(0, free - s) * C;
    }
    // readers: how many accounts each follows, and how many of those are merged at read time
    const R2 = rng(seed * 7919 + 1), sh = share(T), lat = [], merged = [];
    for (let i = 0; i < reads; i++) {
      const F = Math.max(5, Math.min(5000, Math.round(Math.exp(Math.log(120) + 1.1 * gauss(R2)))));
      let m = 0;
      if (sh >= 1) m = F; else if (sh > 0) for (let j = 0; j < F; j++) if (R2() < sh) m++;
      merged.push(m); lat.push(base + per * m);
    }
    return { T, tweets: tw.length, tw, big, backlog, lagP99: pct(lags, 0.99), lagMax: lags.reduce((a, x) => Math.max(a, x), 0), readP99: pct(lat, 0.99), readP50: pct(lat, 0.5), lat, merged,
      mergedP99: pct(merged, 0.99), perSec: inserts / secs, onRead: tw.filter((x) => x.read).length };
  }

  // -------------------------------------------------------------------------------------------------- likes --
  const SHARDS = [1, 4, 16, 64, 256], BATCH = [0, 1, 5];
  // likes a second, t seconds after the tweet: a climb, a peak of 40,000, a long tail
  const curve = (t, peak = 40000) => peak * Math.min(1, t / 60) * Math.exp(-Math.max(0, t - 120) / 240);
  function likes({ shards = 1, batch = 0, secs = 600, rowMs = 1, readMs = 0.25, apps = 200, peak = 40000 } = {}) {
    const cap = (1000 / rowMs) * shards; // row updates a second, across all the rows
    const dt = 1, series = [];
    let q = 0, worstWait = 0, total = 0, maxRate = 0;
    for (let t = 0; t < secs; t += dt) {
      const rate = curve(t, peak), writes = batch ? Math.min(rate, apps / batch) : rate; // a batch is one update per app server
      maxRate = Math.max(maxRate, rate); total += rate * dt;
      q = Math.max(0, q + (writes - cap) * dt);
      const wait = batch ? 0 : (q / cap) * 1000 + rowMs / Math.max(0.05, 1 - Math.min(0.95, writes / cap)); // ms a like waits
      worstWait = Math.max(worstWait, wait);
      series.push({ t, rate, util: writes / cap, q, wait });
    }
    const p99 = batch ? 2 : worstWait; // batched likes are answered from memory at once
    return { shards, batch, cap, series, likeMs: p99, readMs: shards * readMs, stale: batch, lostOnCrash: batch ? Math.round((peak / apps) * batch) : 0, total, maxRate, backlog: Math.max(...series.map((x) => x.q)) };
  }

  // -------------------------------------------------------------------------------------------------- cache --
  // who opens their timeline: by when they were last active, their share of accounts and of timeline opens
  const GROUPS = [
    { id: "day", say: "active today", users: 250e6, opens: 0.94 },
    { id: "week", say: "earlier this week", users: 50e6, opens: 0.05 },
    { id: "month", say: "earlier this month", users: 80e6, opens: 0.008 },
    { id: "dormant", say: "longer ago", users: 120e6, opens: 0.002 },
  ];
  const WHO = ["day", "week", "month", "dormant"], KEEP = [100, 400, 800, 3200];
  // the share of timeline opens that scroll deeper than n tweets
  const DEEP = { 100: 0.12, 400: 0.03, 800: 0.005, 3200: 0.0005 };
  const ENTRY = 16, COPIES = 3; // bytes for a tweet id and its author; every timeline is kept on 3 machines
  function cache({ who = "day", keep = 800 } = {}) {
    const upto = WHO.indexOf(who) + 1, inn = GROUPS.slice(0, upto);
    const users = inn.reduce((a, g) => a + g.users, 0), cold = GROUPS.slice(upto).reduce((a, g) => a + g.opens, 0);
    const tb = (users * keep * ENTRY * COPIES) / 1e12, deep = (1 - cold) * DEEP[keep];
    return { who, keep, users, tb, cold, deep, slow: cold + deep };
  }

  const API = { rng, XMIN, ALPHA, THRESHOLDS, share, fanout, SHARDS, BATCH, curve, likes, GROUPS, WHO, KEEP, DEEP, ENTRY, COPIES, cache, pct };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.FEED = API;
})(typeof self !== "undefined" ? self : this);
