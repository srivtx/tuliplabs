/* The Latency numbers unit: the numbers themselves, and its simulators. No DOM, so the page and
   tools/board-check.js run the same code.

   NUMS        the ladder: what a computer waits for, in nanoseconds, as round numbers for 2020s hardware
   BW          how fast bytes move once they're flowing, in bytes a second
   RACES       two jobs side by side; each side's time is worked out from NUMS and BW, so the winner is too
   human(ns)   the same wait if a nanosecond lasted a second
   page(o)     a profile page, loaded 2,000 times. It reads the session from Redis, runs 30 queries (`queries`: one
               after another, all at once over 10 connections, or folded into one), asks a payments API across the
               Atlantic for the user's plan (`pay`: on a new connection, on one kept open, or from a copy in Redis kept
               5 minutes), and reads the user's photo (`photo`: from a spinning disk, an SSD, or already resized in
               RAM). About one round trip in a thousand loses a packet and waits 200 ms to send it again. Reports
               every page's time, the middle (p50) and the slowest 1% (p99), and the steps of a typical page.
   globe(o)    a page used in ten cities. `sites` are the datacenters that serve it (each city uses its nearest),
               and `trips` the round trips a page load takes: 6 (two requests, each on a new connection), 2 (one
               connection kept open) or 1 (the data comes inside the page). Light in glass goes 200 km a millisecond
               and cables run about a third longer than a straight line. Reports each city's page time. */
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
  const logn = (R, med, sig) => med * Math.exp(sig * gauss(R));

  // ------------------------------------------------------------------------------------------- the ladder --
  const US = 1e3, MS = 1e6;
  const NUMS = [
    { id: "l1", short: "an L1 hit", t: "Read a value from the L1 cache", ns: 1 },
    { id: "mutex", short: "a mutex", t: "Lock and unlock a mutex", ns: 20 },
    { id: "ram", short: "a RAM read", t: "Read a value from RAM", ns: 100 },
    { id: "switch", short: "a thread switch", t: "Switch the CPU to another thread", ns: 5 * US },
    { id: "ssd", short: "an SSD read", t: "Read 4 KB at random from an SSD", ns: 100 * US },
    { id: "dc", short: "across the datacenter", t: "A round trip inside one datacenter", ns: 500 * US },
    { id: "seek", short: "a disk seek", t: "Seek on a spinning disk", ns: 10 * MS },
    { id: "ocean", short: "across the Atlantic", t: "A round trip across the Atlantic", ns: 80 * MS },
    { id: "notice", short: "a person notices", t: "A wait a person notices", ns: 100 * MS },
  ];
  const N = Object.fromEntries(NUMS.map((n) => [n.id, n.ns]));
  // bytes a second: RAM, an SSD reading in order, a spinning disk reading in order, the datacenter's 10 Gbps network,
  // a 100 Mbps internet link, and compressing with a fast compressor
  const BW = { ram: 10e9, ssd: 2e9, disk: 100e6, dc: 1.25e9, net: 12.5e6, zip: 500e6 };
  const xfer = (bytes, bw) => (bytes / bw) * 1e9;

  // a wait in words: 1 ns, 20 ns, 5 µs, 0.5 ms, 80 ms, 1.2 s
  function fmt(ns) {
    const r = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);
    if (ns < US) return r(ns) + " ns";
    if (ns < MS) return r(ns / US) + " µs";
    if (ns < 1e9) return r(ns / MS) + " ms";
    return r(ns / 1e9) + " s";
  }
  // if a nanosecond were a second
  function human(ns) {
    const s = ns, r = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
    if (s < 60) return `${r(s)} second${s === 1 ? "" : "s"}`;
    if (s < 3600) return `${r(s / 60)} minutes`;
    if (s < 86400) return `${r(s / 3600)} hours`;
    if (s < 86400 * 60) return `${r(s / 86400)} days`;
    if (s < 86400 * 365) return `${r(s / (86400 * 30.4))} months`;
    return `${r(s / (86400 * 365))} years`;
  }

  // ---------------------------------------------------------------------------------------------- the races --
  const RACES = [
    {
      a: { t: "Read 1 MB from another machine's RAM, across the datacenter", how: "a round trip, 1 MB over the 10 Gbps network, 1 MB from RAM", ns: N.dc + xfer(1e6, BW.dc) + xfer(1e6, BW.ram) },
      b: { t: "Read 1 MB from your own spinning disk", how: "a seek, then 1 MB at 100 MB/s", ns: N.seek + xfer(1e6, BW.disk) },
      why: "The network is faster than your own disk: a disk has to swing its arm and wait for the platter, and that's 10 ms before the first byte. This is why caches like Redis live on other machines and still win.",
    },
    {
      a: { t: "Ask Redis for 1 key, in the same datacenter", how: "one round trip; Redis itself takes about 1 µs", ns: N.dc + 1 * US },
      b: { t: "Look up 1,000 keys in a hash map in your own RAM", how: "1,000 reads from RAM", ns: 1000 * N.ram },
      why: "A thousand lookups in your own memory beat one trip to the fastest cache there is. Redis answers in a microsecond; the half millisecond is the network. Keep what's hot inside the process when you can.",
    },
    {
      a: { t: "Read the whole 400 MB file from an SSD, start to end", how: "one 100 µs read to start, then 400 MB at 2 GB/s", ns: N.ssd + xfer(400e6, BW.ssd) },
      b: { t: "Read 10,000 records of 4 KB at random from the same SSD", how: "10,000 random reads of 100 µs", ns: 10000 * N.ssd },
      why: "Reading 40 MB at random is slower than reading ten times as much in order. Random reads pay the 100 µs wait every time; in order, the drive streams. Logs, column stores and Kafka are all built to read and write in order.",
    },
    {
      a: { t: "Run 100 queries, one after another, on a database in your datacenter", how: "100 × (a round trip + 0.5 ms of work)", ns: 100 * (N.dc + 0.5 * MS) },
      b: { t: "Run 1 query on a database across the Atlantic", how: "a round trip across the ocean + 0.5 ms of work", ns: N.ocean + 0.5 * MS },
      why: "A hundred quick queries in a row add up to more than an ocean. This is the N+1 query problem: a loop that asks the database once per row. Fold them into one query and it's 1 ms.",
    },
    {
      a: { t: "Send a 1 MB page across the Atlantic on a 100 Mbps link", how: "a round trip, then 1 MB at 12.5 MB/s", ns: N.ocean + xfer(1e6, BW.net) },
      b: { t: "Compress it to 250 KB first, then send it", how: "2 ms to compress, a round trip, then 250 KB", ns: xfer(1e6, BW.zip) + N.ocean + xfer(250e3, BW.net) },
      why: "Two milliseconds of CPU saves 60 ms on the wire. The CPU is near the bottom of the ladder and the internet is near the top, so spending one to save the other almost always pays. Every web server compresses.",
    },
  ];
  for (const r of RACES) r.win = r.a.ns < r.b.ns ? "a" : "b";

  // ------------------------------------------------------------------------------------------------ page --
  const QUERIES = ["serial", "parallel", "one"], PAYS = ["new", "open", "cache"], PHOTOS = ["disk", "ssd", "ram"];
  const LOSS = 0.001, RTO = 200, POOL = 10, NQ = 30; // ms
  function page({ queries = "serial", pay = "new", photo = "disk", seed = 1, n = 2000 } = {}) {
    const R = rng(seed);
    let lost = 0;
    // a round trip inside the datacenter, in ms; now and then a packet is lost and waits 200 ms to go again
    // `was` says whether the last one did, so the waterfall can paint it
    let was = false;
    const dc = () => { let t = logn(R, 0.5, 0.25); was = R() < LOSS; if (was) { t += RTO; lost++; } return t; };
    const ocean = () => { let t = 80 + 4 * Math.abs(gauss(R)); was = R() < LOSS; if (was) { t += RTO; lost++; } return t; };
    const times = [], pages = [];
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const steps = [], lost0 = lost;
      let t = 0;
      const step = (id, d, sub) => { steps.push({ id, at: t, d, sub }); t += d; };
      { const d = dc() + 0.01; step("session", d, [[0, d, was]]); }
      // the 30 queries
      if (queries === "serial") { const sub = []; let q = 0; for (let k = 0; k < NQ; k++) { const d = dc(), w = was; sub.push([q, d + logn(R, 0.3, 0.4), w]); q += sub[k][1]; } step("queries", q, sub); }
      else if (queries === "parallel") {
        // 30 at once over a pool of 10 connections: three waves, each as slow as its slowest query
        const sub = []; let q = 0;
        for (let w = 0; w < NQ / POOL; w++) { let mx = 0; for (let k = 0; k < POOL; k++) { const d0 = dc(), lw = was, d = d0 + logn(R, 0.3, 0.4); sub.push([q, d, lw]); mx = Math.max(mx, d); } q += mx; }
        step("queries", q, sub);
      } else { const d0 = dc(), lw = was, d = d0 + logn(R, 1.2, 0.3); step("queries", d, [[0, d, lw]]); }
      // the payments plan
      if (pay === "new") { const sub = []; let q = 0; for (let k = 0; k < 3; k++) { const d = ocean(); sub.push([q, d, was]); q += d; } step("pay", q, sub); }
      else if (pay === "open") { const d = ocean(); step("pay", d, [[0, d, was]]); }
      else if (R() < 0.004) { const d1 = dc(), w1 = was, d = d1 + ocean(); step("pay", d, [[0, d, w1 || was]]); } // a miss: the copy ran out, ask again
      else { const d = dc(); step("pay", d, [[0, d, was]]); }
      // the photo: 2 MB to resize, or a 40 KB one resized earlier
      if (photo === "disk") step("photo", logn(R, 8, 0.35) + xfer(2e6, BW.disk) / 1e6 + 3);
      else if (photo === "ssd") step("photo", logn(R, 0.1, 0.3) + xfer(2e6, BW.ssd) / 1e6 + 3);
      else step("photo", 0.02);
      times.push(t);
      pages.push({ t, steps, lost: lost - lost0 });
      if (lost > lost0) hit++;
    }
    const sorted = times.slice().sort((a, b) => a - b), q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
    const p50 = q(0.5), p99 = q(0.99);
    // the page to draw: the one nearest the middle, and the slowest 1% one
    const near = (v) => pages.reduce((best, p) => (Math.abs(p.t - v) < Math.abs(best.t - v) ? p : best), pages[0]);
    return { p50, p99, times, typical: near(p50), slow: near(p99), lost, lostShare: hit / n, n };
  }

  // ----------------------------------------------------------------------------------------------- globe --
  // cities that use the page, and the places a datacenter could go: [id, name, longitude, latitude]
  const CITIES = [["ny", "New York", -74, 40.7], ["la", "Los Angeles", -118.2, 34.1], ["sp", "São Paulo", -46.6, -23.5], ["ld", "London", -0.1, 51.5], ["lg", "Lagos", 3.4, 6.5],
    ["jb", "Johannesburg", 28, -26.2], ["mb", "Mumbai", 72.9, 19.1], ["sg", "Singapore", 103.8, 1.35], ["tk", "Tokyo", 139.7, 35.7], ["sy", "Sydney", 151.2, -33.9]].map(([id, name, lon, lat]) => ({ id, name, lon, lat }));
  const SITES = [["va", "Virginia", -77.5, 39], ["or", "Oregon", -120.5, 45.6], ["br", "São Paulo", -46.6, -23.5], ["fr", "Frankfurt", 8.7, 50.1],
    ["in", "Mumbai", 72.9, 19.1], ["si", "Singapore", 103.8, 1.35], ["jp", "Tokyo", 139.7, 35.7], ["au", "Sydney", 151.2, -33.9]].map(([id, name, lon, lat]) => ({ id, name, lon, lat }));
  const TRIPS = [6, 2, 1], WORK = 10, LIGHT = 200, DETOUR = 1.35, LAST = 2; // ms of work; km a ms; cables vs a straight line; ms to reach the city's network
  function km(a, b) {
    const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  const rtt = (d) => (2 * d * DETOUR) / LIGHT + LAST;
  function globe({ sites = ["va"], trips = 6 } = {}) {
    const on = SITES.filter((s) => sites.includes(s.id));
    const cities = CITIES.map((c) => {
      let best = null;
      for (const s of on) { const d = km(c, s); if (!best || d < best.km) best = { site: s.id, km: d }; }
      const r = rtt(best.km);
      return { id: c.id, site: best.site, km: best.km, rtt: r, ms: trips * r + WORK };
    });
    const worst = cities.reduce((a, c) => (c.ms > a.ms ? c : a), cities[0]);
    return { cities, worst, sites: on.length, trips };
  }

  const API = { NUMS, N, BW, RACES, fmt, human, QUERIES, PAYS, PHOTOS, NQ, POOL, LOSS, RTO, page, CITIES, SITES, TRIPS, WORK, LIGHT, DETOUR, km, rtt, globe };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.LAT = API;
})(typeof self !== "undefined" ? self : this);
