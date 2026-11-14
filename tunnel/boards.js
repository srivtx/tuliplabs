/* The whiteboard's questions, as a ladder of units (docs/system-design-roadmap.md). A unit is one system, looked at
   in two modes:
     Whiteboard (mode "w"), what a design interview asks for:
       scope       sort sticky cards into what it does, how well, and not now
       napkin      fill the sticky notes on the sketch with back-of-the-envelope numbers (within 1.5x counts)
       sketch      draw the design from a tray of parts; a rubric grades it (grade() below), and some parts are wrong
       follow      tap the parts one click passes through, in order (rounds: a cache hit, a miss, ...)
     Simulate (mode "s"), where the design runs:
       bottleneck  traffic is about to climb: tap the part that gives out first, then watch the ramp
       draw        a brief, goals and a budget: change the drawing until 30 s of traffic meets every goal
       evict, persist, shard   the Redis unit's labs (tunnel/kv.js; their pages are in tunnel/board-kinds.js)
       conns, offline, order   WhatsApp's labs (tunnel/chat.js)
       nearby, batch, dispatch Uber's labs (tunnel/geo.js)
   Every number here is checked by tools/board-check.js against the simulators the page runs.
   A design: parts {id, kind, x, y, n (machines), size, batch} on a 960 × 540 board, and wires [from, to]. */
(function (root) {
  "use strict";
  const P = (id, kind, x, y, o = {}) => ({ id, kind, x, y, n: 1, ...o });
  const SNIP = { keys: 1000000, zipf: 1, timeout: 2 };

  // Every part a whiteboard can hold, with a line drawing in a 26 × 26 box. The first eight also run in tunnel/net.js;
  // the rest are for sketching. `say` is the part's one-line job, shown on it and in the inspector.
  const PARTS = {
    users: { name: "users", fixed: true, say: "clicking links", icon: '<circle cx="9" cy="8" r="4"/><circle cx="18.5" cy="9.5" r="3"/><path d="M2 23c0-5.5 3-8.5 7-8.5s7 3 7 8.5M15.5 23c0-4 1.5-6.5 3.5-6.5s4.5 2.5 4.5 6.5"/>' },
    lb: { name: "load balancer", say: "one address, many servers", icon: '<circle cx="4.5" cy="13" r="2.6"/><path d="M7 13h5m0 0 9-8m-9 8h9m-9 0 9 8"/><path d="M18 3.5l3.4 1.6-1.4 3.4M18.4 10.6l3 2.4-3 2.4M18 22.5l3.4-1.6-1.4-3.4"/>' },
    app: { name: "app servers", say: "the code that answers", icon: '<rect x="3" y="3" width="20" height="6" rx="1.6"/><rect x="3" y="10.5" width="20" height="6" rx="1.6"/><rect x="3" y="18" width="20" height="6" rx="1.6"/><path d="M6.5 6h.1M6.5 13.5h.1M6.5 21h.1"/>' },
    cache: { name: "cache", say: "hot links in memory", icon: '<path d="M15 2 5.5 15h7l-2 9.5L20 11h-7l2-9z"/>' },
    db: { name: "database", say: "every link, on disk", icon: '<ellipse cx="13" cy="6" rx="9" ry="3.4"/><path d="M4 6v14c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4V6M4 13c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4"/>' },
    replica: { name: "read replicas", say: "read-only copies", icon: '<ellipse cx="10" cy="7" rx="7" ry="2.6"/><path d="M3 7v11c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V7"/><path d="M19.5 6.5c2 .5 3.5 1.3 3.5 2.3V20c0 1.4-3.1 2.6-7 2.6"/>' },
    queue: { name: "queue", say: "work for later", icon: '<rect x="2" y="8" width="22" height="10" rx="2"/><path d="M7.5 8v10M13 8v10M18.5 8v10"/><path d="M1 4h7M5 1.5 8 4 5 6.5"/>' },
    worker: { name: "workers", say: "do the queued work", icon: '<circle cx="13" cy="13" r="4"/><path d="M13 2.5v4M13 19.5v4M2.5 13h4M19.5 13h4M5.6 5.6l2.8 2.8M17.6 17.6l2.8 2.8M5.6 20.4l2.8-2.8M17.6 8.4l2.8-2.8"/>' },
    idgen: { name: "key generator", say: "hands out short codes", icon: '<path d="M9.5 3 7.5 23M18.5 3l-2 20M3.5 9h20M2.5 17h20"/>' },
    cdn: { name: "CDN", say: "copies near the users", icon: '<circle cx="13" cy="13" r="10"/><path d="M3 13h20M13 3c-3.5 3-3.5 17 0 20M13 3c3.5 3 3.5 17 0 20"/>' },
    client: { name: "clients", fixed: true, say: "apps sending commands", icon: '<rect x="4" y="5" width="18" height="12" rx="1.5"/><path d="M2 21h22M10 21l1-4h4l1 4"/>' },
    loop: { name: "event loop", say: "one thread, one command at a time", icon: '<path d="M21.5 13a8.5 8.5 0 1 1-3.2-6.6"/><path d="M19.4 2.2l-.9 4.6-4.6-.6"/><path d="M13 9v4.5l3 2"/>' },
    keyspace: { name: "keyspace", say: "key → value, all in RAM", icon: '<rect x="3" y="4" width="20" height="18" rx="2"/><path d="M3 10h20M3 16h20M10 4v18"/>' },
    expiry: { name: "expiry", say: "keys with a deadline", icon: '<circle cx="13" cy="14" r="9"/><path d="M13 9v5.5l3.5 2M10 2h6"/>' },
    evict: { name: "evictor", say: "drops keys when RAM is full", icon: '<rect x="3" y="5" width="13" height="16" rx="2"/><path d="M11 13h12M19.5 9.5 23 13l-3.5 3.5"/>' },
    aof: { name: "append-only log", say: "every write, added to a file", icon: '<path d="M6 3h11l4 4v16H6z"/><path d="M9.5 11h8M9.5 15h8M9.5 19h5"/>' },
    rdb: { name: "snapshot", say: "all of it, now and then", icon: '<rect x="3" y="7" width="20" height="14" rx="2.5"/><circle cx="13" cy="14" r="4"/><path d="M9 7l1.5-3h5L17 7"/>' },
    rreplica: { name: "replica", say: "a copy that follows along", icon: '<rect x="2" y="6" width="14" height="14" rx="2"/><path d="M10 2h12a2 2 0 0 1 2 2v12M6 13h6"/>' },
    sql: { name: "SQL database", say: "tables on disk", icon: '<ellipse cx="13" cy="6" rx="9" ry="3.4"/><path d="M4 6v14c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4V6"/><path d="M9 14h8M9 18h8"/>' },
    threads: { name: "thread pool", say: "many threads, one table", icon: '<path d="M5 3c-3 5 3 10 0 20M13 3c-3 5 3 10 0 20M21 3c-3 5 3 10 0 20"/>' },
    phone: { name: "phone", fixed: true, say: "an app with one connection open", icon: '<rect x="7" y="2" width="12" height="22" rx="2.5"/><path d="M11 20.5h4"/>' },
    gateway: { name: "gateway", say: "holds millions of open connections", icon: '<rect x="3" y="8" width="20" height="10" rx="2"/><path d="M7 8V4M13 8V4M19 8V4M7 18v4M13 18v4M19 18v4"/>' },
    sessions: { name: "sessions", say: "which gateway each phone is on", icon: '<rect x="5" y="3" width="16" height="20" rx="2"/><circle cx="13" cy="10" r="3"/><path d="M8.5 18c.8-2.5 2.5-3.5 4.5-3.5s3.7 1 4.5 3.5M3 8h3M3 13h3M3 18h3"/>' },
    chat: { name: "chat service", say: "decides where each message goes", icon: '<path d="M4 5h18v12H11l-5 4v-4H4z"/><path d="M8.5 10h9M8.5 13h6"/>' },
    inbox: { name: "inbox", say: "keeps messages until the phone acks", icon: '<path d="M3 14l3-9h14l3 9v7H3z"/><path d="M3 14h6l1.5 3h5L17 14h6"/>' },
    push: { name: "push", say: "wakes an offline phone (APNs, FCM)", icon: '<path d="M6 18V11a7 7 0 0 1 14 0v7l2 2H4z"/><path d="M11 22.5h4"/>' },
    blob: { name: "blob store", say: "photos and videos, by link", icon: '<rect x="3" y="4" width="20" height="18" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 19l6-6 4 4 3-3 7 7"/>' },
    poller: { name: "poller", say: "phones ask \"anything new?\" every 5 s", icon: '<path d="M4 10a8.5 8.5 0 0 1 15-3.5l1.5 1.5M22 16a8.5 8.5 0 0 1-15 3.5L5.5 18"/><path d="M21 3v5h-5M5 23v-5h5"/>' },
    index: { name: "message search", say: "an index of every message", icon: '<circle cx="11" cy="11" r="7"/><path d="M16 16l7 7"/>' },
    rider: { name: "rider", fixed: true, say: "the app that asks for a ride", icon: '<path d="M13 24s-7-7.5-7-13a7 7 0 0 1 14 0c0 5.5-7 13-7 13z"/><circle cx="13" cy="11" r="2.6"/>' },
    driver: { name: "driver", fixed: true, say: "the app in the car, sending where it is", icon: '<path d="M3 17v-4l3-6h14l3 6v4z"/><path d="M3 13h20"/><circle cx="8" cy="19" r="2.2"/><circle cx="18" cy="19" r="2.2"/>' },
    locsvc: { name: "location service", say: "takes every driver's pings", icon: '<circle cx="13" cy="18" r="3"/><path d="M8 12.5a7 7 0 0 1 10 0M4.5 9a12 12 0 0 1 17 0"/>' },
    geoidx: { name: "geo index", say: "map cells → the drivers in them, in RAM", icon: '<rect x="3" y="3" width="20" height="20" rx="2"/><path d="M3 9.7h20M3 16.3h20M9.7 3v20M16.3 3v20"/><circle cx="13" cy="13" r="1.6"/>' },
    matcher: { name: "matcher", say: "pairs riders with drivers", icon: '<circle cx="6" cy="7" r="3"/><circle cx="20" cy="19" r="3"/><path d="M9 7h4a4 4 0 0 1 4 4v5"/><path d="M14.5 13.5 17 16l2.5-2.5"/>' },
    eta: { name: "ETA service", say: "minutes to reach her, by road", icon: '<path d="M8 23 11 3M18 23 15 3M13 6v2M13 12v2M13 18v2"/>' },
    trips: { name: "trip store", say: "each ride and its driver, claimed once", icon: '<path d="M6 2h14v21l-2.5-1.5L15 23l-2-1.5L11 23l-2.5-1.5L6 23z"/><path d="M9.5 8h7M9.5 12h7M9.5 16h4"/>' },
    pingdb: { name: "ping table", say: "every ping, a row on disk", icon: '<ellipse cx="13" cy="5" rx="9" ry="3"/><path d="M4 5v16c0 1.7 4 3 9 3s9-1.3 9-3V5M8 11h10M8 15h10M8 19h10"/>' },
    scan: { name: "scan every driver", say: "measure the rider to all of them", icon: '<circle cx="13" cy="13" r="10"/><circle cx="13" cy="13" r="5"/><path d="M13 13 20 6"/>' },
  };

  // what a part says on the board itself, where there's room for about 18 characters
  const TAGS = { users: "clicking links", lb: "one address", app: "your code", cache: "hot links", db: "every link", replica: "read copies", queue: "work for later",
    worker: "does queued work", idgen: "next short code", cdn: "near the users", client: "send commands", loop: "one thread", keyspace: "key → value, RAM",
    expiry: "keys with a TTL", evict: "frees RAM", aof: "every write", rdb: "a periodic copy", rreplica: "follows along", sql: "tables on disk", threads: "many threads",
    phone: "one open socket", gateway: "holds sockets", sessions: "who's where", chat: "routes messages", inbox: "waits for acks", push: "wakes a phone", blob: "photos, videos",
    poller: "asks every 5 s", index: "reads messages", rider: "wants a ride", driver: "pings every 4 s", locsvc: "takes pings", geoidx: "cells → drivers",
    matcher: "pairs them up", eta: "minutes by road", trips: "one ride each", pingdb: "a row a ping", scan: "checks them all" };
  for (const k in TAGS) PARTS[k].tag = TAGS[k];

  // A sketch's grade: each rubric item is a link the design needs (between parts of these kinds, either way round),
  // and a part of a `wrong` kind is a mistake however it's wired.
  function grade(design, rubric, wrong = {}) {
    const kind = (id) => (design.nodes.find((n) => n.id === id) || {}).kind;
    const linked = (a, b) => design.wires.some(([x, y]) => (kind(x) === a && kind(y) === b) || (kind(x) === b && kind(y) === a));
    const has = (k) => design.nodes.some((n) => n.kind === k);
    const items = rubric.map((r) => ({ ...r, ok: r.link.some(([a, b]) => linked(a, b)), parts: r.link.some(([a, b]) => has(a) && has(b)) }));
    const bad = design.nodes.filter((n) => wrong[n.kind]).map((n) => ({ node: n.id, text: wrong[n.kind] }));
    return { items, bad, pass: items.every((i) => i.ok) && !bad.length };
  }

  const SNIPQ = [
    {
      id: "sd01", kind: "follow", title: "Follow a click",
      lede: "Someone taps <b>snip.ly/x7</b>. Before it can send them on, Snip has to find where x7 points. Tap the parts the click passes through, in order, starting with the users.",
      q: SNIP,
      design: {
        nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 3 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 290)],
        wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"]],
      },
      rounds: [
        { say: "x7 is a popular link: it's in the cache.", hit: true, path: ["u", "l", "a", "c"] },
        { say: "Now <b>snip.ly/q2</b>, a link nobody has clicked since 2019. It isn't in the cache.", hit: false, path: ["u", "l", "a", "c", "d"] },
      ],
      why: "A hit stops at the cache: the answer is a millisecond away in memory. A miss goes on to the database, which keeps every link, and the answer comes back the same way. Most clicks are hits, because most clicks are on a few popular links, so the cache is what keeps the database calm.",
    },
    {
      id: "sd02", kind: "napkin", title: "Napkin math",
      lede: "Before drawing anything, size it. Snip makes <b>100 million</b> new links a month, and each one is clicked <b>100 times</b> on average. A link takes about <b>500 bytes</b>, and you keep links for <b>5 years</b>. Fill in the notes. Within 1.5× counts: it's a napkin.",
      q: SNIP,
      design: {
        nodes: [P("u", "users", 95, 300), P("l", "lb", 285, 300), P("a", "app", 475, 300, { n: 3 }), P("d", "db", 860, 300)],
        wires: [["u", "l"], ["l", "a"], ["a", "d"]],
      },
      notes: [
        { id: "w", on: "d", dx: -40, dy: -150, label: "new links a second", unit: "/s", calc: "100e6 / (30 * 24 * 3600)", hint: "a month is 30 × 24 × 3,600 ≈ 2.6 million seconds" },
        { id: "r", on: "u", dx: 20, dy: -150, label: "clicks a second", unit: "/s", calc: "100e6 / (30 * 24 * 3600) * 100", hint: "every link is clicked 100 times" },
        { id: "s", on: "d", dx: -40, dy: 70, label: "storage after 5 years", unit: "TB", calc: "100e6 * 12 * 5 * 500 / 1e12", hint: "links × bytes, then 1 TB = 10¹² bytes" },
      ],
      why: "About 40 new links a second, and 100 times that in clicks: about 3,900 a second. Reads beat writes 100 to 1, so this is a read-heavy system, and caching reads is the first move. Storage is 6 billion links × 500 bytes = 3 TB: one database can hold it all, so you don't have to split the data yet.",
    },
    {
      id: "sd03", kind: "bottleneck", title: "Where does it give out?",
      lede: "Snip is in the news. Traffic will climb from <b>200</b> to <b>1,200</b> clicks a second on this design. Tap the part that gives out first.",
      q: SNIP,
      design: {
        nodes: [P("u", "users", 95, 280), P("l", "lb", 285, 280), P("a", "app", 475, 280, { n: 2 }), P("d", "db", 860, 280, { size: "large" })],
        wires: [["u", "l"], ["l", "a"], ["a", "d"]],
      },
      ramp: [200, 400, 600, 800, 900, 1000, 1200], answer: "a", at: 1000,
      why: "Capacity is workers ÷ time per request. The two app servers have 16 workers at 15 ms each: about 1,067 clicks a second. The large database has 32 workers at 12 ms: about 2,667. So the app servers give out first, near 1,000 a second, while the database is barely a third busy. Adding database power here would change nothing; adding app servers would.",
    },
    {
      id: "sd04", kind: "draw", title: "Serve 2,000 clicks a second",
      lede: "Snip has to answer <b>2,000 clicks a second</b> with p99 under <b>100 ms</b> and no errors, for at most <b>$800 a month</b>. Right now it's one app server and a small database. Add parts from the tray, wire them, click a part to change its size, then run the traffic.",
      q: SNIP, rate: 2000,
      goals: [["p99", "<", 0.1, "p99 under 100 ms"], ["errors", "<", 0.001, "no errors"], ["cost", "<=", 800, "at most $800 a month"]],
      tray: ["lb", "app", "cache", "replica", "db"],
      design: {
        nodes: [P("u", "users", 95, 270), P("a", "app", 475, 270), P("d", "db", 860, 270)],
        wires: [["u", "a"], ["a", "d"]],
      },
      reference: {
        nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270)],
        wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"]],
      },
      traps: [
        { why: "a large database instead of a cache", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("d", "db", 860, 270, { size: "large" })], wires: [["u", "l"], ["l", "a"], ["a", "d"]] } },
        { why: "a 1 GB cache", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "1 GB" }), P("d", "db", 860, 270)], wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"]] } },
        { why: "four read replicas", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("r", "replica", 665, 400, { n: 4 }), P("d", "db", 860, 270)], wires: [["u", "l"], ["l", "a"], ["a", "r"], ["a", "d"]] } },
        { why: "three app servers", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 3 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270)], wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"]] } },
      ],
      says: [["hit", "c", 0.78, 0.01], ["dbLoad", null, 450, 0.05], ["util", "d", 0.68, 0.06]],
      why: "A 4 GB cache holds the 40,000 hottest links, and by Zipf's law they get 78% of all clicks. So the database sees about 450 reads a second instead of 2,000, and is 68% busy. Five app servers behind a load balancer have 40 workers, enough for 2,667 a second. A large database could take all 2,000 reads itself, but it costs $600 and blows the budget; the cache costs $100.",
    },
    {
      id: "sd05", kind: "bottleneck", title: "Count every click",
      lede: "Snip now shows each link's owner how often it's clicked, so every click also <b>writes a count</b> to the database, and waits for it. Same design that served 2,000 a second. Traffic climbs from <b>250</b> to <b>2,000</b>. Tap the part that gives out first.",
      q: { ...SNIP, count: true },
      design: {
        nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270)],
        wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "d"]],
      },
      ramp: [250, 500, 750, 1000, 1500, 2000], answer: "d", at: 500,
      why: "The cache only helps reads. Every count is a write, and every write goes to the database, so at 500 clicks a second it sees about 110 reads plus 500 writes, against a small database's 667 a second. The app servers are only a fifth busy. One write per click was fine for reads' sake; it is a lot of writes.",
    },
    {
      id: "sd06", kind: "draw", title: "Count without waiting",
      lede: "Fix it. At <b>2,000 clicks a second</b>, every click still has to be counted, but the counts may land a few seconds late. Keep p99 under <b>100 ms</b>, every count in within <b>5 seconds</b>, for at most <b>$1,000 a month</b>. A queue takes work now and does it later.",
      q: { ...SNIP, count: true }, rate: 2000,
      goals: [["p99", "<", 0.1, "p99 under 100 ms"], ["errors", "<", 0.001, "no errors"], ["lag", "<", 5, "counts in within 5 s"], ["cost", "<=", 1000, "at most $1,000 a month"]],
      tray: ["queue", "worker", "lb", "app", "cache", "replica", "db"],
      design: {
        nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270)],
        wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "d"]],
      },
      reference: {
        nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270), P("q", "queue", 665, 420), P("w", "worker", 860, 440, { batch: 100 })],
        wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "q"], ["q", "w"], ["w", "d"]],
      },
      traps: [
        { why: "a queue, but workers that write one count at a time", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270), P("q", "queue", 665, 420), P("w", "worker", 860, 440, { batch: 1 })], wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "q"], ["q", "w"], ["w", "d"]] } },
        { why: "workers that write 10 at a time", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270), P("q", "queue", 665, 420), P("w", "worker", 860, 440, { batch: 10 })], wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "q"], ["q", "w"], ["w", "d"]] } },
        { why: "a large database instead of a queue", design: { nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270, { n: 5 }), P("c", "cache", 665, 160, { size: "4 GB" }), P("d", "db", 860, 270, { size: "large" })], wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "d"]] } },
      ],
      says: [["dbLoad", null, 470, 0.05], ["util", "d", 0.71, 0.06]],
      why: "The queue takes each count in a millisecond, so the click is answered at once. Workers write the counts in batches of 100, so 2,000 counts a second become about 20 database writes a second. The database sees about 470 requests a second in all, and is 71% busy. Batch 1 means 2,000 writes and a backlog that never catches up; batch 10 means 200, and the database drowns. A large database could take the raw writes too, but not inside $1,000.",
    },
  ];
  const byId = (xs, id) => xs.find((x) => x.id === id);

  // ------------------------------------------------------------------------------------------------- Snip --
  const SNIP_SCOPE = {
    id: "sn-scope", kind: "scope", title: "Scope it",
    lede: "The interview starts with a question back: <b>what exactly are we building?</b> Sort the cards. <b>What it does</b> is a feature. <b>How well</b> is a promise about speed, size or safety. <b>Not now</b> is out of this version. Drag a card to a column, or tap it to move it along.",
    cards: [
      { t: "Turn a long link into a short one", bin: "does", why: "The first of Snip's two jobs." },
      { t: "Send anyone who opens a short link on to the long one", bin: "does", why: "The other job, and the one that happens 100 times more often." },
      { t: "Show a link's owner how often it was clicked", bin: "does", why: "A feature people see, so it goes under what it does. Later it costs a write on every click." },
      { t: "Redirect in under 100 ms", bin: "how", why: "A promise about speed: the p99 you'll design against." },
      { t: "Never lose a link, for 5 years", bin: "how", why: "Durability: the database has to keep every link." },
      { t: "Keep working when a machine dies", bin: "how", why: "Availability: no single box can be the only copy of anything." },
      { t: "A screenshot preview of every page", bin: "not", why: "Nice, but it's a whole rendering farm. Not this version." },
      { t: "A chat room under every link", bin: "not", why: "A different product." },
      { t: "Search all links by keyword", bin: "not", why: "Search needs its own index. Leave it out until someone asks." },
    ],
    why: "Two features carry Snip: make a short link, follow one. The \"how well\" cards set the numbers you'll design against, which are speed, durability and staying up. Saying out loud what you won't build is part of the answer: it keeps a 45-minute design from turning into three products.",
  };
  const SNIP_SKETCH = {
    id: "sn-sketch", kind: "sketch", title: "Draw Snip",
    lede: "Now draw it: both paths, <b>making a short link</b> and <b>following one</b>. Thousands of clicks a second, mostly on a few hot links, and every new link needs a short code nobody else has. Drag parts in from the tray, wire them, then check the drawing.",
    q: SNIP,
    tray: ["lb", "app", "cache", "db", "idgen", "replica", "queue", "cdn"],
    design: { nodes: [P("u", "users", 95, 270)], wires: [] },
    reference: {
      nodes: [P("u", "users", 95, 270), P("l", "lb", 285, 270), P("a", "app", 475, 270), P("c", "cache", 665, 160), P("d", "db", 860, 270), P("g", "idgen", 665, 420)],
      wires: [["u", "l"], ["l", "a"], ["a", "c"], ["c", "d"], ["a", "g"]],
    },
    rubric: [
      { link: [["users", "lb"]], say: "Users reach one address: a load balancer, so many app servers can share the clicks." },
      { link: [["lb", "app"]], say: "The load balancer hands each click to an app server." },
      { link: [["app", "cache"]], say: "Reads try a cache first: most clicks are on a few hot links." },
      { link: [["cache", "db"], ["app", "db"]], say: "Every link lives in the database; a cache miss reads it from there." },
      { link: [["app", "idgen"]], say: "A new link takes the next code from a key generator, so two links never get the same code." },
    ],
    wrong: {},
    why: "Clicks come in through one address, a load balancer, and spread over app servers. Reads try the cache and fall through to the database. Making a link asks the key generator for the next number and writes it in base 62: 7 characters give 62⁷ ≈ 3.5 trillion codes. That's enough for 6 billion links with no collisions to check for. A queue, replicas or a CDN aren't wrong, but nothing needs them yet.",
  };
  const SNIP_UNIT = {
    id: "snip", name: "Snip", sub: "a link shortener", floor: 7, group: "Everyday apps",
    w: [SNIP_SCOPE, byId(SNIPQ, "sd02"), SNIP_SKETCH, byId(SNIPQ, "sd01")],
    s: ["sd03", "sd04", "sd05", "sd06"].map((id) => byId(SNIPQ, id)),
  };

  // ------------------------------------------------------------------------------------------------ Redis --
  const RD = { client: P("cl", "client", 95, 270), loop: P("lp", "loop", 285, 270), ks: P("ks", "keyspace", 475, 270) };
  const REDIS_REF = {
    nodes: [RD.client, RD.loop, RD.ks, P("ex", "expiry", 665, 110), P("ev", "evict", 665, 430), P("ao", "aof", 285, 110), P("sn", "rdb", 860, 270), P("rp", "rreplica", 285, 430)],
    wires: [["cl", "lp"], ["lp", "ks"], ["ks", "ex"], ["ev", "ks"], ["lp", "ao"], ["ks", "sn"], ["lp", "rp"]],
  };
  const REDIS_UNIT = {
    id: "redis", name: "Redis", sub: "an in-memory key-value store", floor: 6,
    w: [
      {
        id: "rd-scope", kind: "scope", title: "What is a Redis?",
        lede: "You're building an in-memory key-value store, like Redis: the thing a thousand apps put in front of their database. First pin down what it does. Sort the cards: <b>what it does</b>, <b>how well</b>, <b>not now</b>.",
        cards: [
          { t: "GET and SET a value by its key", bin: "does", why: "The core: a key in, its value out." },
          { t: "Make a key vanish after a time (a TTL)", bin: "does", why: "Sessions and caches need keys that expire on their own." },
          { t: "Counters, lists and sorted sets, changed in place", bin: "does", why: "INCR, LPUSH, ZADD: the server changes the value, so two clients never race." },
          { t: "Answer in well under a millisecond", bin: "how", why: "That's the point of keeping everything in memory." },
          { t: "100,000 commands a second on one machine", bin: "how", why: "Throughput: a number to design against." },
          { t: "Lose at most a second of writes in a crash", bin: "how", why: "Durability is a \"how well\": Redis trades a little of it for speed." },
          { t: "Join two tables with SQL", bin: "not", why: "Redis looks things up by key. Queries over many rows belong in a database." },
          { t: "Search for words inside values", bin: "not", why: "Full-text search needs an inverted index: a search engine's job." },
          { t: "Keep 50 TB on one machine's disk", bin: "not", why: "Redis holds its data in RAM. 50 TB means many machines, or a different store." },
        ],
        why: "A Redis is a dictionary on the network: keys in, values out, with types that change in place and keys that expire. Every \"how well\" pulls the same way: keep it all in RAM and answer from one fast thread. Anything that needs to scan or join many rows is out, because that's what makes it fast.",
      },
      {
        id: "rd-napkin", kind: "napkin", title: "Size a Redis",
        lede: "A key with a small value takes about <b>100 bytes</b> in memory, overhead included. One command takes the thread about <b>10 µs</b>, reading the request and writing the reply included. A machine has <b>64 GB</b>. The app wants <b>400 GB</b> of data and <b>1 million</b> commands a second.",
        q: {},
        design: { nodes: [P("cl", "client", 95, 330), P("lp", "loop", 420, 330), P("ks", "keyspace", 760, 330)], wires: [["cl", "lp"], ["lp", "ks"]] },
        notes: [
          { id: "k", on: "ks", dx: -10, dy: -190, label: "keys in 64 GB", unit: "keys", calc: "64e9 / 100", hint: "64 GB is 64 × 10⁹ bytes; divide by 100 bytes a key" },
          { id: "o", on: "lp", dx: 0, dy: -190, label: "commands a second, one thread", unit: "/s", calc: "1 / 10e-6", hint: "a second is 1,000,000 µs" },
          { id: "m", on: "cl", dx: 90, dy: 60, label: "machines, flat out", unit: "", calc: "Math.max(1e6 / 1e5, 400 / 64)", hint: "enough for the commands AND for the data: take the bigger" },
        ],
        why: "640,000,000 keys fit in 64 GB. One thread at 10 µs a command does 100,000 a second. So 1 million a second needs 10 machines for speed, but only 7 for memory: here the CPU decides, not the RAM. And that's with every machine flat out, which is why the next step is to split the keys over a cluster with room to spare.",
      },
      {
        id: "rd-sketch", kind: "sketch", title: "Draw the inside of a Redis",
        lede: "Draw what's inside one Redis server. Commands come in from clients. It has to keep everything in memory, expire keys on time, survive a restart, make room when RAM is full, and keep a copy ready to take over. Drag parts in from the tray and wire them; two of the parts don't belong.",
        q: {},
        tray: ["loop", "keyspace", "expiry", "evict", "aof", "rdb", "rreplica", "sql", "threads"],
        design: { nodes: [RD.client], wires: [] },
        reference: REDIS_REF,
        rubric: [
          { link: [["client", "loop"]], say: "Clients send commands to one event loop: a single thread that takes them one at a time." },
          { link: [["loop", "keyspace"]], say: "The loop runs each command against the keyspace, one hash table in RAM: key → value in O(1)." },
          { link: [["keyspace", "expiry"], ["loop", "expiry"]], say: "Keys with a TTL also sit in an expiry table, and are deleted when touched or found by sampling, 10 times a second." },
          { link: [["keyspace", "evict"], ["loop", "evict"]], say: "When memory reaches maxmemory, the evictor picks keys to drop." },
          { link: [["loop", "aof"], ["keyspace", "aof"]], say: "Every write is appended to a log file, so a restart can replay it." },
          { link: [["keyspace", "rdb"], ["loop", "rdb"]], say: "Now and then a forked child writes the whole keyspace to a snapshot." },
          { link: [["loop", "rreplica"], ["keyspace", "rreplica"], ["aof", "rreplica"]], say: "The primary streams every write to a replica, which can take over if it dies." },
        ],
        wrong: {
          sql: "A SQL database puts a disk under every read. Redis answers from RAM; disk is only for getting back up after a crash.",
          threads: "Many threads would need a lock around the hash table. Redis runs commands on one thread: no locks, and every command is atomic.",
        },
        why: "One thread runs every command, so no command ever sees half of another: INCR is atomic without a lock. Disk never sits on the read path: the log and the snapshot only bring the data back after a crash. The evictor and the expiry table keep memory in bounds. The replica follows the primary's stream of writes. Each of these is a lab in Simulate.",
      },
    ],
    s: [
      {
        id: "rd-evict", kind: "evict", title: "Memory is full",
        lede: "Your Redis can hold <b>2,500</b> of <b>50,000</b> keys. Apps ask for a key, and on a miss they load it from the database and SET it. Which key should go when memory is full? Pick the policy you think keeps the most hits, then race all four.",
        sim: { cap: 2500, keys: 50000, n: 200000, seed: 1 },
        rounds: [
          { shift: false, say: "Traffic is steady: the same keys stay popular.", answer: "lfu" },
          { shift: true, say: "Halfway through, the trend flips: a whole new set of keys becomes the popular one.", answer: "lru" },
        ],
        says: [[0, "lfu", 71], [0, "lru", 64], [0, "random", 60], [0, "noeviction", 65], [1, "lru", 64], [1, "random", 60], [1, "lfu", 51]],
        why: "Steady traffic: LFU keeps 71% hits, LRU 64%, random 60%. noeviction keeps 65% too, but it never makes room, so every key it can't fit is an out-of-memory error: 34% of all requests. After the flip, LRU is back at 64% and random at 60%, but LFU sits at 51%: its old counts pin yesterday's keys in memory. That's why Redis's LFU halves its counts as they age (lfu-decay-time), and why LRU is the safe pick when you can't predict the traffic.",
      },
      {
        id: "rd-persist", kind: "persist", title: "Pull the plug",
        lede: "Your Redis takes <b>5,000 writes a second</b>, and its data lives in RAM. Pick how the append-only log reaches the disk, then pull the plug. The goal: answer every write in under <b>1 ms</b> (p99), and lose at most <b>2 seconds</b> of acknowledged writes in a crash.",
        sim: { rate: 5000, T: 30 },
        goals: { p99: 0.001, lose: 2 },
        answer: "everysec",
        why: "always fsyncs every batch before it answers, so nothing acknowledged is ever lost, but every write waits for the disk: p99 4.5 ms. everysec answers in 0.04 ms and fsyncs in the background once a second, so a crash loses at most about a second. no leaves it to the OS, which writes out about every 30 s. A snapshot alone runs every 5 minutes. Redis's own default is everysec, for exactly this trade.",
      },
      {
        id: "rd-shard", kind: "shard", title: "Outgrow one machine",
        lede: "The app needs <b>400 GB</b> and <b>1 million commands a second</b>; one machine has <b>64 GB</b> and one thread that does <b>100,000</b>. Redis Cluster splits keys into <b>16,384 hash slots</b> (CRC16 of the key, mod 16,384) and deals the slots out to machines. Add machines until every one is under <b>80%</b> busy and under 80% full, using as few as you can.",
        sim: { keys: 20000, ops: 50, bytes: 20e6, capOps: 100000, capBytes: 64e9, under: 0.8 },
        best: 13,
        hot: { key: "post:7:likes", ops: 120000, apps: 200 },
        fixes: [
          { id: "more", say: "add 6 more machines" },
          { id: "big", say: "move it to a machine with twice the cores" },
          { id: "local", say: "cache it in the app servers for 1 second" },
        ],
        answer: "local",
        why: "One machine does 100,000 commands a second, so 1 million needs 10 at full tilt and 13 to stay under 80%: at 13 the busiest is 78% busy and the fullest 48% full. Adding the 13th moved only 8% of the keys; with hash % N it would have been 92%. A hot key lives in one slot on one machine, and Redis runs commands on one thread, so neither more machines nor more cores can split it. Caching it in the 200 app servers for a second turns 120,000 reads a second into about 200.",
      },
    ],
  };


  // --------------------------------------------------------------------------------------------- WhatsApp --
  const WA_FOLLOW = {
    nodes: [P("A", "phone", 95, 190, { label: "Alice" }), P("g1", "gateway", 285, 190), P("ch", "chat", 475, 270), P("se", "sessions", 475, 92), P("g2", "gateway", 665, 190),
      P("B", "phone", 860, 190, { label: "Bob" }), P("in", "inbox", 665, 420), P("pu", "push", 860, 420)],
    wires: [["A", "g1"], ["g1", "ch"], ["ch", "se"], ["ch", "g2"], ["g2", "B"], ["ch", "in"], ["in", "pu"], ["pu", "B"]],
  };
  const WA_REF = {
    nodes: [P("ph", "phone", 95, 270), P("gw", "gateway", 285, 270), P("ch", "chat", 475, 270), P("se", "sessions", 475, 100), P("ib", "inbox", 665, 270), P("pu", "push", 860, 270), P("bl", "blob", 285, 430)],
    wires: [["ph", "gw"], ["gw", "ch"], ["ch", "se"], ["ch", "ib"], ["ib", "pu"], ["ph", "bl"]],
  };
  const WA_UNIT = {
    id: "whatsapp", name: "WhatsApp", sub: "a chat app for 2 billion people", floor: 7, group: "Talk in real time",
    w: [
      {
        id: "wa-scope", kind: "scope", title: "What is WhatsApp?",
        lede: "You're designing a chat app the size of WhatsApp. Before any boxes, pin down what it must do. Sort the cards: <b>what it does</b>, <b>how well</b>, <b>not now</b>.",
        cards: [
          { t: "Send a message to a friend or a group", bin: "does", why: "The whole point." },
          { t: "Show ✓ sent, ✓✓ delivered, and blue when read", bin: "does", why: "Receipts are a feature people see, and each one is a message going the other way." },
          { t: "Hold messages for a phone that's offline", bin: "does", why: "Phones drop off all day. Messages have to wait somewhere for them." },
          { t: "Arrive in under a second when both phones are online", bin: "how", why: "A promise about speed, and the reason for keeping a connection open." },
          { t: "Never lose a message, never show one twice", bin: "how", why: "Reliability: at-least-once delivery, plus ids so copies are dropped." },
          { t: "Only the two phones can read a message", bin: "how", why: "End-to-end encryption: a promise about privacy, and it shapes everything the server can do." },
          { t: "Video calls", bin: "not", why: "Live media is a different system with its own unit (Zoom)." },
          { t: "Stories that vanish after 24 hours", bin: "not", why: "A different feature, more like a feed. Not this version." },
          { t: "Search everyone's messages on the server", bin: "not", why: "With end-to-end encryption the server can't read messages, so it can't search them. Search happens on the phone." },
        ],
        why: "A chat app does three things: send, show receipts, hold messages for phones that are away. The \"how well\" cards are the hard part: fast, never lost, never doubled, and private. End-to-end encryption also rules things out. The server only moves sealed envelopes, so anything that needs to read messages, like server-side search, isn't on the table.",
      },
      {
        id: "wa-napkin", kind: "napkin", title: "Size WhatsApp",
        lede: "<b>2 billion</b> people send <b>100 billion</b> messages a day. At the busiest hour <b>500 million</b> phones are connected at once, and one gateway machine can hold about <b>2 million</b> open connections. A text message is about <b>100 bytes</b>.",
        q: {},
        design: { nodes: [P("ph", "phone", 95, 330), P("gw", "gateway", 420, 330), P("ib", "inbox", 760, 330)], wires: [["ph", "gw"], ["gw", "ib"]] },
        notes: [
          { id: "m", on: "gw", dx: 0, dy: -190, label: "messages a second", unit: "/s", calc: "100e9 / (24 * 3600)", hint: "a day is 86,400 seconds" },
          { id: "g", on: "gw", dx: 0, dy: 60, label: "gateway machines", unit: "", calc: "500e6 / 2e6", hint: "phones online ÷ connections a machine holds" },
          { id: "s", on: "ib", dx: -10, dy: -190, label: "a day of messages", unit: "TB", calc: "100e9 * 100 / 1e12", hint: "messages × bytes; 1 TB is 10¹² bytes" },
        ],
        why: "100 billion a day is 1,157,407 messages a second: call it 1.2 million, and evenings run hotter. 500 million open connections at 2 million a machine is 250 gateway machines just to hold the sockets. A day of messages is 10 TB, but little of it stays: a message waits only until the phone collects it, then the server can forget it.",
      },
      {
        id: "wa-sketch", kind: "sketch", title: "Draw WhatsApp",
        lede: "Draw the server side. Messages must reach an online phone at once, wait for an offline one, and photos are too big to travel inside a message. Drag parts in from the tray and wire them. Two of the parts don't belong.",
        q: {},
        tray: ["gateway", "chat", "sessions", "inbox", "push", "blob", "lb", "poller", "index"],
        design: { nodes: [P("ph", "phone", 95, 270)], wires: [] },
        reference: WA_REF,
        rubric: [
          { link: [["phone", "gateway"]], say: "Each phone keeps one connection open to a gateway (a WebSocket), so a message can be pushed the moment it arrives." },
          { link: [["gateway", "chat"]], say: "Gateways hand every message to the chat service, which decides where it goes." },
          { link: [["chat", "sessions"], ["gateway", "sessions"]], say: "A session registry records which gateway each phone is connected to, so chat knows where to send." },
          { link: [["chat", "inbox"]], say: "Every message waits in the receiver's inbox until their phone acknowledges it." },
          { link: [["inbox", "push"], ["chat", "push"]], say: "An offline phone gets a push notification (APNs or FCM) that wakes it to collect its messages." },
          { link: [["phone", "blob"], ["gateway", "blob"], ["chat", "blob"]], say: "Photos and videos go to a blob store; the message carries only a link and the key to decrypt it." },
        ],
        wrong: {
          poller: "Phones asking \"anything new?\" every 5 seconds: 500 million phones make 100 million requests a second, almost all answered \"no\", and batteries drain. Keep a connection open and push instead.",
          index: "Messages are end-to-end encrypted: the server only ever sees sealed envelopes, so there's nothing it can index. Search runs on the phone.",
        },
        why: "Phones hold one connection each to a gateway, so the server can push. The chat service looks up the receiver's gateway in the session registry and hands the message over. Every message also lands in the receiver's inbox until their phone acknowledges it, and a push notification wakes a phone that's away. Photos travel separately through a blob store, encrypted, and the message carries the link. The server never reads a message: it moves envelopes.",
      },
      {
        id: "wa-follow", kind: "follow", title: "Follow a message",
        lede: "Alice sends Bob <b>see you at 8?</b>. On the way, the chat service asks the sessions where Bob is connected. Tap the parts the message passes through, in order.",
        q: {}, item: "message",
        design: WA_FOLLOW,
        rounds: [
          { say: "Bob's phone is online.", path: ["A", "g1", "ch", "g2", "B"] },
          { say: "Bob's phone is switched off. Alice sends <b>hello??</b>. Where does it go, and what tells Bob?", path: ["A", "g1", "ch", "in", "pu", "B"] },
          { say: "Bob turns his phone on and it connects. Tap the way it collects what's waiting, starting with Bob.", path: ["B", "g2", "ch", "in"] },
        ],
        why: "Online, a message rides connections that are already open: into Alice's gateway, through chat, out of Bob's gateway. That's a fraction of a second. Offline, it waits in Bob's inbox, and a push notification wakes his phone. When Bob reconnects, his phone asks for what's waiting and acknowledges each message, and only then does the server forget it.",
      },
    ],
    s: [
      {
        id: "wa-conns", kind: "conns", title: "Hold 500 million phones",
        lede: "At the busiest hour <b>500 million</b> phones each hold a connection open to a gateway. A gateway machine has <b>64 GB</b> and <b>32 cores</b> and costs <b>$500 a month</b>. Pick how a machine holds its connections and how often phones send a heartbeat, then size the fleet. Goals: notice a dropped phone within <b>60 s</b>, keep every machine under <b>80%</b> of its RAM and CPU, and use at most <b>260</b> machines.",
        sim: { phones: 500e6 }, goals: { detect: 60, under: 0.8, boxes: 260 }, answer: { model: "loop", hb: 30 },
        why: "A thread per connection spends about 1 MB on each, so a machine fits 51,200 phones under 80% and you'd need 9,766 machines. An event loop spends about 25 KB, so a machine holds 2,040,816: 245 machines. Heartbeats set how fast you notice a dropped phone (two missed beats) and what it costs: every 10 s needs 391 machines just for the CPU, and every 60 s takes 2 minutes to notice. Every 30 s fits, and it's kinder to batteries, since each heartbeat wakes the phone's radio.",
      },
      {
        id: "wa-offline", kind: "offline", title: "Bob's patchy day",
        lede: "Bob's phone drops off a dozen times a day: lifts, tunnels, a flat battery. When his connection dies, the server only notices <b>a minute</b> later. Alice keeps writing all day. Choose what the server does, then run Bob's day. The goal: <b>no message lost</b> and <b>none shown twice</b>.",
        sim: { seed: 1 },
        why: "Throwing away what Bob can't take right now loses 22% of the day's messages. An inbox saves the ones sent while the server knows he's offline, but not the ones pushed into a dead socket in the minute before it notices: 11 lost. Acks fix that, since nothing is forgotten until Bob's phone says it has it. But 1 in 100 acks never makes it back, so the server resends messages Bob already has: 6 shown twice. Ids let his phone drop the copies. At-least-once delivery plus ids is the pair every reliable system uses.",
      },
      {
        id: "wa-order", kind: "order", title: "Keep the chat in order",
        lede: "Asha, Ben and Chen are planning dinner in a group. Every message reaches each phone with its own delay, Ben's phone clock runs <b>5 s slow</b>, and Chen's runs <b>3 s fast</b>. Pick how every phone orders the chat. The goal: <b>everyone sees the same chat</b>, with <b>no reply above the message it answers</b>.",
        sim: { seed: 1 }, answer: "seq",
        why: "In arrival order each phone tells its own story: messages sent close together land in a different order on different phones. The sender's clock gives everyone the same order, but a wrong one: Ben's clock is 5 s slow, so his replies jump above the questions they answer. A sequence number stamped by the one server that owns the group gives a single order, and a reply is always stamped after its question, because you can only answer what has already reached you.",
      },
    ],
  };


  // ------------------------------------------------------------------------------------------------- Uber --
  const UB_FOLLOW = {
    nodes: [P("R", "rider", 95, 140, { label: "Rina" }), P("D", "driver", 95, 400, { label: "Dev" }), P("g", "gateway", 285, 270), P("lo", "locsvc", 475, 400), P("ge", "geoidx", 665, 400),
      P("ma", "matcher", 475, 140), P("et", "eta", 665, 140), P("tr", "trips", 860, 140)],
    wires: [["R", "g"], ["D", "g"], ["g", "lo"], ["lo", "ge"], ["g", "ma"], ["ma", "ge"], ["ma", "et"], ["ma", "tr"]],
  };
  const UB_REF = {
    nodes: [P("ri", "rider", 95, 140), P("dr", "driver", 95, 400), P("gw", "gateway", 285, 270), P("lo", "locsvc", 475, 400), P("ge", "geoidx", 665, 400),
      P("ma", "matcher", 475, 140), P("et", "eta", 665, 140), P("tr", "trips", 860, 140)],
    wires: [["ri", "gw"], ["dr", "gw"], ["gw", "lo"], ["lo", "ge"], ["gw", "ma"], ["ma", "ge"], ["ma", "et"], ["ma", "tr"]],
  };
  const UBER_UNIT = {
    id: "uber", name: "Uber", sub: "rides, matched in seconds, in every city", floor: 7, group: "Location",
    w: [
      {
        id: "ub-scope", kind: "scope", title: "What is Uber?",
        lede: "You're designing a ride app the size of Uber. Before any boxes, pin down what it must do. Sort the cards: <b>what it does</b>, <b>how well</b>, <b>not now</b>.",
        cards: [
          { t: "Ask for a ride and see the price first", bin: "does", why: "The rider's side: where from, where to, how much." },
          { t: "Match the rider with a driver nearby", bin: "does", why: "The heart of it: dispatch." },
          { t: "Show the car moving on the map until pickup", bin: "does", why: "Every driver's phone sends where it is, and the rider's app is pushed the updates." },
          { t: "A driver found within seconds of asking", bin: "how", why: "A promise about speed. It's why the drivers' locations live in memory." },
          { t: "Never send one driver to two riders", bin: "how", why: "Correctness under concurrency: two matchers can reach for the same driver at the same moment." },
          { t: "Keep going when a driver's phone drops mid-offer", bin: "how", why: "Phones lose signal in tunnels and car parks. A rider must not wait forever on a dead phone." },
          { t: "Food delivery", bin: "not", why: "Three sides instead of two (eater, restaurant, courier): its own unit, DoorDash." },
          { t: "Turn-by-turn directions for the driver", bin: "not", why: "Routing is Google Maps' unit. Uber only needs an ETA: minutes from the driver to the rider." },
          { t: "Paying drivers into their bank accounts", bin: "not", why: "Payouts and ledgers belong to the Stripe unit." },
        ],
        why: "A ride app does three things: take a request with a price, find a driver, and show the car coming. The hard part is in \"how well\": a driver in seconds, never two riders for one driver, and no rider stuck on a phone that dropped. Food, directions and payouts are big systems of their own.",
      },
      {
        id: "ub-napkin", kind: "napkin", title: "Size Uber",
        lede: "At the busiest hour <b>3 million</b> drivers are online, and each driver's phone sends where it is every <b>4 seconds</b>. A location (driver id, latitude, longitude, time) is about <b>100 bytes</b>. Riders take <b>25 million</b> rides a day.",
        q: {},
        design: { nodes: [P("dr", "driver", 95, 330), P("lo", "locsvc", 420, 330), P("ge", "geoidx", 760, 330)], wires: [["dr", "lo"], ["lo", "ge"]] },
        notes: [
          { id: "u", on: "lo", dx: 0, dy: -190, label: "location updates a second", unit: "/s", calc: "3e6 / 4", hint: "drivers ÷ seconds between pings" },
          { id: "r", on: "ge", dx: -10, dy: -190, label: "every driver's latest spot", unit: "MB", calc: "3e6 * 100 / 1e6", hint: "drivers × bytes; 1 MB is 10⁶ bytes" },
          { id: "q", on: "lo", dx: 0, dy: 60, label: "ride requests a second", unit: "/s", calc: "25e6 / (24 * 3600)", hint: "a day is 86,400 seconds" },
        ],
        why: "3 million drivers pinging every 4 s is 750,000 location updates a second. Yet the live map is tiny: every driver's latest spot is 300 MB, which fits in one machine's memory. Ride requests are only 289 a second. So Uber is write-heavy in an unusual way: a flood of small updates that overwrite each other, and a trickle of questions about them.",
      },
      {
        id: "ub-sketch", kind: "sketch", title: "Draw Uber",
        lede: "Draw the server side. Drivers' phones stream where they are; a rider asks for a ride and must get the nearest driver who can reach her soonest, and that driver must be hers alone. Drag parts in from the tray and wire them. Two of the parts don't belong.",
        q: {},
        tray: ["gateway", "locsvc", "geoidx", "matcher", "eta", "trips", "lb", "pingdb", "scan"],
        design: { nodes: [P("ri", "rider", 95, 140), P("dr", "driver", 95, 400)], wires: [] },
        reference: UB_REF,
        rubric: [
          { link: [["driver", "gateway"]], say: "Driver apps keep a connection open to a gateway and send where they are every 4 s." },
          { link: [["rider", "gateway"]], say: "Rider apps connect the same way, so the car's position can be pushed to them as it moves." },
          { link: [["gateway", "locsvc"]], say: "Location pings go to a location service." },
          { link: [["locsvc", "geoidx"]], say: "Each ping overwrites the driver's spot in an in-memory geo index: the map cut into cells, each listing the drivers in it." },
          { link: [["gateway", "matcher"]], say: "Ride requests go to the matcher (dispatch)." },
          { link: [["matcher", "geoidx"]], say: "The matcher asks the geo index for drivers in the rider's cell and the cells around it." },
          { link: [["matcher", "eta"]], say: "It ranks them by minutes to reach her on real roads, not by distance as the crow flies." },
          { link: [["matcher", "trips"]], say: "It claims the driver in the trip store in one step, so no other rider can get them." },
        ],
        wrong: {
          pingdb: "750,000 pings a second as rows on disk, then a distance query over millions of rows for every request. Matching only needs each driver's latest spot: overwrite it in memory, and send the history to a log for later.",
          scan: "Measuring each rider against all 3 million drivers is 289 × 3 million = 867 million distance checks a second, and nearly every one of those drivers is in another city. Ask the geo index for the cells around her instead.",
        },
        why: "Both apps hold a connection to a gateway. Driver pings flow to the location service, which overwrites each driver's spot in a geo index kept in memory. A ride request goes to the matcher, which asks the geo index for drivers in nearby cells, ranks them by ETA on real roads, and claims one in the trip store so no one else can. The pings' history goes to a log for analytics; it's never on the matching path.",
      },
      {
        id: "ub-follow", kind: "follow", title: "Follow a ride",
        lede: "Rina wants a ride across town, and Dev is driving nearby. Tap the parts each request passes through, in order.",
        q: {}, item: "request",
        design: UB_FOLLOW,
        rounds: [
          { say: "Dev turns a corner. His app sends where he is now.", path: ["D", "g", "lo", "ge"] },
          { say: "Rina asks for a ride. Which drivers are near her?", path: ["R", "g", "ma", "ge"] },
          { say: "The matcher offered Rina's ride to Dev, and he taps accept. Make the ride his alone.", path: ["D", "g", "ma", "tr"] },
        ],
        why: "A location ping never touches the matcher: it just overwrites Dev's spot in the geo index, 750,000 times a second across the world. A ride request asks the index for nearby cells, so it looks at a few dozen drivers, not millions. The accept goes back through the matcher to the trip store, where the driver is claimed in one step, so a second rider can't get him too.",
      },
    ],
    s: [
      {
        id: "ub-nearby", kind: "nearby", title: "Find the nearest drivers",
        lede: "A city 20 km across with <b>3,000</b> drivers: crowded downtown, a busy airport, thin suburbs. <b>40</b> riders ask for a ride, and each needs her <b>5</b> nearest drivers. The geo index cuts the map into square cells. Pick the cell size and how far to look. The goal: the <b>true 5 nearest</b> for every rider, with at most <b>80</b> units of work a request on average (a cell opened or a driver measured is 1 each).",
        sim: { seed: 1 }, goals: { right: 40, work: 80 }, answer: { cell: 0.25, search: "widen" },
        why: "Checking every driver is always right and always 3,000 units of work. Her own cell alone misses drivers just over the line: a rider near a cell's edge has neighbours in the next cell. Her cell and the 8 around it is right with big cells, but downtown a 4 km cell holds hundreds of drivers, so it costs 1,700. With small cells the 8 around her can be empty in the suburbs, and then she gets fewer than 5. Widening ring by ring, until nothing further out could be closer than the 5th found, is always right. Its cost has a sweet spot: 250 m cells cost 54, while 100 m cells cost 108, because the suburbs need so many empty cells opened. Uber's index (H3) works the same way, with hexagons instead of squares.",
      },
      {
        id: "ub-batch", kind: "batch", title: "Match a busy evening",
        lede: "A busy hour downtown: <b>20</b> riders ask every minute, and <b>240</b> drivers take them. Matching each rider the moment she asks gives her the nearest free driver, even when that driver is the only one near the next rider. A matcher can instead collect riders for a few seconds and pair the whole batch so the total drive is shortest. Pick the window. The goal: the car reaches riders in <b>4.4 minutes</b> or less on average, counting the wait to be matched.",
        sim: { seed: 1 }, goals: { wait: 4.4 }, answer: 60,
        why: "Matching at once takes the car 5.4 minutes on average: first come, first served hands out nearby drivers that a later rider needed more. A batch can swap them so the total drive is shortest. Every minute meets the goal: the drive falls to 3.6 minutes, and riders wait 39 s to be matched, 4.2 in all. Every 30 s gets to 4.5. Every 2 minutes drives shortest of all, 3.2, but riders wait 81 s first, so the total climbs back to 4.6. Batching trades a little waiting for much better matches, and real dispatchers tune the window city by city and hour by hour.",
      },
      {
        id: "ub-dispatch", kind: "dispatch", title: "One driver, one rider",
        lede: "Two matcher servers hand out drivers at the same time, so two riders on the same corner can reach for the same driver. And now and then a driver's phone drops just as an offer arrives. Drivers take <b>3 to 12 s</b> to tap accept. Choose how a matcher claims a driver and how long an offer stays open, then run the evening. The goal: <b>no driver sent to two riders</b>, <b>no rider stuck</b>, <b>no accept thrown away</b>, and every rider has a driver within <b>a minute</b>.",
        sim: { seed: 1 }, goals: { worst: 60 }, answer: { claim: "cas", expiry: 15 },
        why: "Checking that a driver is free and marking them busy only when they accept leaves a gap of several seconds: twin requests on the same corner both read \"free\", both offer, and the driver accepts both. 27 drivers got two riders. Claiming the driver in one step (compare-and-set: free → offered to this ride) closes the gap: the second matcher sees the claim and offers the next driver. An offer that never expires strands a rider on a dead phone. 5 s throws away accepts from drivers who needed longer, and 60 s keeps the rider waiting over a minute whenever a phone drops. 15 s fits everyone who answers, so the worst wait is 38 s. A claim with an expiry is a lease.",
      },
    ],
  };

  // ---------------------------------------------------------------------------------------------- the ladder --
  // Every unit planned, floor by floor. Built ones carry their questions; the rest are the plan.
  const FLOORS = [
    ["One machine", "first principles"], ["Talking", "first principles"], ["Storing", "first principles"], ["Many machines", "first principles"],
    ["Moving work", "first principles"], ["Staying up", "first principles"], ["Building blocks", "design the tools themselves"],
    ["Real apps", "the designs interviews ask for"], ["Frontier", "AI systems"],
  ];
  // [floor, id, name, the hard part, group (real apps only)]
  const SOON = [
    [0, "numbers", "Latency numbers", "From an L1 hit to a cross-ocean round trip"], [0, "capacity", "Throughput vs latency", "Capacity and Little's law"],
    [0, "knee", "The queueing knee", "Why 80% busy is full"], [0, "loops", "Threads and event loops", "10,000 slow clients"], [0, "disk", "Memory and disk", "Page cache and fsync"],
    [1, "trip", "A request's trip", "DNS, TCP, TLS, HTTP"], [1, "http", "HTTP, REST and gRPC", "Verbs and idempotency"], [1, "push", "Polling, SSE, WebSockets", "Who opens the connection"],
    [1, "lbs", "Load balancers", "L4 vs L7, health checks"], [1, "cdn", "Proxies and CDNs", "Edge caches and TTLs"],
    [2, "models", "Data models", "Relational, document, graph…"], [2, "indexes", "Indexes", "B-trees and query plans"], [2, "engines", "Storage engines", "B-tree vs LSM"],
    [2, "tx", "Transactions", "Isolation and lost updates"], [2, "blobs", "Blobs and search", "S3 vs a database"], [2, "geo", "Geo data", "Geohash and quadtrees"],
    [3, "copies", "Copies and lag", "Leaders, followers, quorums"], [3, "split", "Splitting data", "Consistent hashing"], [3, "agree", "Agreeing", "Raft"],
    [3, "time", "Time and order", "Clock skew, vector clocks"], [3, "cap", "Consistency", "CAP and PACELC"], [3, "sagas", "Transactions across services", "2PC, sagas, outbox"], [3, "ids", "Unique IDs", "Snowflake"],
    [4, "caching", "Caching, properly", "The stampede"], [4, "queues", "Queues", "Backpressure, dead letters"], [4, "streams", "Logs and streams", "Offsets and replay"],
    [4, "stream", "Stream processing", "Windows and late events"], [4, "batch", "Batch processing", "MapReduce and skew"], [4, "limits", "Rate limiting", "Token buckets"], [4, "flows", "Workflows", "Leases and retries"],
    [5, "failure", "Failure", "Timeouts, retries, breakers"], [5, "shed", "Load shedding", "Drop the right requests"], [5, "failover", "Failover", "RPO and RTO"],
    [5, "global", "Going global", "The speed of light"], [5, "deploys", "Deploys", "Canary and flags"], [5, "observe", "Observability", "Metrics, logs, traces"],
    [5, "security", "Security", "Tokens and encryption"], [5, "cost", "Cost", "$ per request"],
    [6, "limiter", "A rate limiter", "A shared counter"], [6, "dcache", "A distributed cache", "Consistent hashing"], [6, "kafka", "Kafka", "Partitions and offsets"],
    [6, "s3", "S3", "Erasure coding"], [6, "elastic", "Elasticsearch", "Scatter-gather"], [6, "etcd", "etcd / ZooKeeper", "Leases and fencing"],
    [6, "lb", "A load balancer", "Draining"], [6, "tsdb", "A time-series DB", "Cardinality"], [6, "gateway", "An API gateway", "Quotas and fan-out"], [6, "vectordb", "A vector database", "HNSW"],
[7, "slack", "Slack / Discord", "Fan-out to big channels", "Talk in real time"], [7, "zoom", "Zoom", "WebRTC and SFUs", "Talk in real time"],
    [7, "twitter", "Twitter / X", "The celebrity problem", "Feeds and social"], [7, "instagram", "Instagram", "Photos and a feed", "Feeds and social"], [7, "tiktok", "TikTok", "A feed a model makes", "Feeds and social"],
    [7, "reddit", "Reddit", "Votes and hot ranking", "Feeds and social"], [7, "linkedin", "LinkedIn", "Degrees of connection", "Feeds and social"],
[7, "yelp", "Yelp", "Nearby search", "Location"], [7, "doordash", "DoorDash", "Dispatch at dinner rush", "Location"], [7, "maps", "Google Maps", "Tiles and routing", "Location"],
    [7, "youtube", "YouTube", "Upload, transcode, stream", "Media"], [7, "netflix", "Netflix", "A CDN inside ISPs", "Media"], [7, "spotify", "Spotify", "Offline caching", "Media"],
    [7, "dropbox", "Dropbox", "Chunks, dedupe, sync", "Files and documents"], [7, "gdocs", "Google Docs", "OT vs CRDT", "Files and documents"], [7, "pastebin", "Pastebin", "Blobs and expiry", "Files and documents"],
    [7, "amazon", "Amazon checkout", "Inventory and sagas", "Money and commerce"], [7, "ticketmaster", "Ticketmaster", "100k people, 1k seats", "Money and commerce"],
    [7, "airbnb", "Airbnb", "No double booking", "Money and commerce"], [7, "stripe", "Stripe", "Idempotency, a ledger", "Money and commerce"],
    [7, "exchange", "A stock exchange", "An order book", "Money and commerce"], [7, "wallet", "A digital wallet", "Exactly-once transfers", "Money and commerce"],
    [7, "google", "Google Search", "Crawl, index, rank", "Search and discovery"], [7, "typeahead", "Typeahead", "Top-k in a trie", "Search and discovery"], [7, "crawler", "A web crawler", "Politeness and traps", "Search and discovery"],
    [7, "gmail", "Gmail", "Mailboxes and spam", "Everyday apps"], [7, "calendar", "Google Calendar", "Recurrence and time zones", "Everyday apps"], [7, "github", "GitHub", "Git at scale", "Everyday apps"],
    [7, "judge", "LeetCode", "Sandboxed runs", "Everyday apps"], [7, "notify", "Notifications", "Providers and retries", "Everyday apps"], [7, "adclicks", "Ad click counting", "Exactly-once streams", "Everyday apps"], [7, "topk", "Top-K", "Heavy hitters", "Everyday apps"],
    [8, "llm", "LLM serving", "Batching and the KV cache"], [8, "rag", "RAG", "Embeddings and recall"], [8, "recs", "A recommender", "Millions to 10 in 100 ms"],
    [8, "train", "A training cluster", "Parallelism, checkpoints"], [8, "agents", "An agent platform", "Tools and sandboxes"], [8, "copilot", "An AI coding assistant", "Context under 200 ms"],
  ].map(([floor, id, name, sub, group]) => ({ id, name, sub, floor, group, soon: true }));
  const UNITS = [SNIP_UNIT, REDIS_UNIT, WA_UNIT, UBER_UNIT];
  const LADDER = [...UNITS, ...SOON].sort((a, b) => a.floor - b.floor);
  // the first real app is the beginner's door: Snip, before the tools
  // the cover drawing for a unit's card: its fullest design
  REDIS_UNIT.cover = REDIS_REF;
  WA_UNIT.cover = WA_REF;
  UBER_UNIT.cover = UB_REF;
  SNIP_UNIT.cover = byId(SNIPQ, "sd06").reference;
  // every built question, flat, knowing its unit and mode
  const BOARDS = [];
  for (const u of UNITS) for (const m of ["w", "s"]) u[m].forEach((b, i) => BOARDS.push(Object.assign(b, { unit: u.id, mode: m, n: i + 1 })));
  // the old links: board.html#1 … #6 were Snip's six questions in this order
  const OLD = ["sd01", "sd02", "sd03", "sd04", "sd05", "sd06"];

  const API = { BOARDS, UNITS, LADDER, FLOORS, PARTS, OLD, grade };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SD = API;
})(typeof self !== "undefined" ? self : this);
