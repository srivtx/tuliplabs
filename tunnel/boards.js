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
       fanout, likes, tlcache  Twitter's labs (tunnel/feed.js)
       transcode, abr, premiere  YouTube's labs (tunnel/video.js)
     The Latency numbers unit (tunnel/lat.js), first principles, so its questions are its own:
       ladder      drag each wait onto a ruler from 1 ns to 1 s (within 3x counts)
       race        two jobs, side by side: tap the one that finishes first, then watch them race
       waterfall   a slow page, loaded 2,000 times: move its work down the ladder until it's quick
       globe       a page used in ten cities: choose the datacenters and the round trips
     The Caching unit (tunnel/cache.js):
       tail        a million products on a Zipf curve: drag a pin to guess the hit rate a cache size buys, or the size a hit rate takes
       inval       two writers and a reader on one key: pick the order a writer updates the cache and the database, then see every interleaving
       stampede    a sale's hot keys run out: choose what a miss does and how long keys are kept
       fresh       product pages on 50 app servers: choose where they're cached, the TTL, and what an edit does
     The Splitting data unit (tunnel/split.js):
       pkey        10,000 vans' readings over 8 partitions: tap a partition key, watch the writes land and a question's reads
       ring        keys on a ring of servers: drag a pin to guess how many move when one is added, and how even they are
       grow        add a 5th cache server at the peak: choose how keys find their server and how the new one joins
       hotcell     a city's drivers in 16 partitions, and a concert ends: choose how to split them, and when to split again
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
    scan: { name: "full scan", say: "measure the rider to every driver", icon: '<circle cx="13" cy="13" r="10"/><circle cx="13" cy="13" r="5"/><path d="M13 13 20 6"/>' },
    people: { name: "people", fixed: true, say: "posting and scrolling", icon: '<circle cx="13" cy="8" r="4.5"/><path d="M4 24c0-5.5 4-9 9-9s9 3.5 9 9"/>' },
    tweets: { name: "tweet store", say: "every tweet, once, by id", icon: '<path d="M4 5h18v13H11l-5 4v-4H4z"/><path d="M8.5 10h9M8.5 13.5h6"/>' },
    graph: { name: "follow graph", say: "who follows whom", icon: '<circle cx="6" cy="6" r="3"/><circle cx="20" cy="6" r="3"/><circle cx="13" cy="20" r="3"/><path d="M8.5 7.8 11.3 17.5M17.5 7.8l-2.8 9.7M9 6h8"/>' },
    tlcache: { name: "timeline cache", say: "each person's latest tweet ids, in RAM", icon: '<rect x="4" y="3" width="18" height="20" rx="2"/><path d="M8 8h10M8 12h10M8 16h10"/><path d="M17 1.5 14 6h3l-2 4"/>' },
    sqljoin: { name: "timeline query", say: "join follows and tweets on every read", icon: '<circle cx="9.5" cy="13" r="6.5"/><circle cx="16.5" cy="13" r="6.5"/>' },
    inline: { name: "inline fan-out", say: "copy into every timeline, then reply", icon: '<path d="M3 13h7M10 13l5-7h8M10 13l5 7h8M10 13h13"/>' },
    upload: { name: "upload service", say: "takes a video in chunks that can resume", icon: '<path d="M13 17V4M8 9l5-5 5 5"/><path d="M4 15v6h18v-6"/>' },
    vstore: { name: "video store", say: "every quality, in pieces a few seconds long", icon: '<rect x="3" y="4" width="20" height="18" rx="2"/><path d="M8 4v18M18 4v18M3 9h5M3 13h5M3 17h5M18 9h5M18 13h5M18 17h5"/>' },
    appstream: { name: "video via app servers", say: "app servers send the video bytes", icon: '<rect x="3" y="3" width="20" height="8" rx="1.6"/><path d="M10 14.5v8.5l7-4.25z"/>' },
    onefile: { name: "one 1080p file", say: "a single MP4 for every screen", icon: '<path d="M6 3h10l4 4v16H6z"/><path d="M11 11.5v7l5.5-3.5z"/>' },
    waitroom: { name: "waiting room", say: "a line in front of the site, letting fans in as there's room", icon: '<rect x="17" y="3" width="7" height="20" rx="1"/><path d="M21.5 13h.1"/><circle cx="4.5" cy="10" r="2.2"/><circle cx="11" cy="10" r="2.2"/><path d="M1.5 19c0-3 1.3-5.5 3-5.5s3 2.5 3 5.5M8 19c0-3 1.3-5.5 3-5.5s3 2.5 3 5.5"/>' },
    holds: { name: "seat holds", say: "seats kept for a shopper, each with an expiry", icon: '<path d="M3 7h20v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><circle cx="13" cy="13" r="3.4"/><path d="M13 11.3V13l1.2.8"/>' },
    payment: { name: "payments", say: "a payment provider that charges the card", icon: '<rect x="2" y="6" width="22" height="15" rx="2"/><path d="M2 11h22M6 16.5h5"/>' },
    mapcache: { name: "seat-map copy", say: "the free seats, copied from the database every second", icon: '<path d="M6 3.5h14"/><path d="M4 9h3M9.5 9h3M15 9h3M20.5 9h1.5M4 14h3M9.5 14h3M15 14h3M20.5 14h1.5M4 19h3M9.5 19h3M15 19h3M20.5 19h1.5"/>' },
    paylock: { name: "lock until paid", say: "a database lock on the seats while they pay", icon: '<rect x="5" y="11" width="16" height="12" rx="2"/><path d="M9 11V7a4 4 0 0 1 8 0v4M13 15.5v3"/>' },
    localseats: { name: "seats in app memory", say: "each app server keeps its own list of free seats", icon: '<rect x="2" y="4" width="6" height="18" rx="1"/><rect x="10" y="4" width="6" height="18" rx="1"/><rect x="18" y="4" width="6" height="18" rx="1"/><path d="M4 9h2M12 9h2M20 9h2M4 13h2M12 13h2M20 13h2"/>' },
  };

  // what a part says on the board itself, where there's room for about 18 characters
  const TAGS = { users: "clicking links", lb: "one address", app: "your code", cache: "hot links", db: "every link", replica: "read copies", queue: "work for later",
    worker: "does queued work", idgen: "next short code", cdn: "near the users", client: "send commands", loop: "one thread", keyspace: "key → value, RAM",
    expiry: "keys with a TTL", evict: "frees RAM", aof: "every write", rdb: "a periodic copy", rreplica: "follows along", sql: "tables on disk", threads: "many threads",
    phone: "one open socket", gateway: "holds sockets", sessions: "who's where", chat: "routes messages", inbox: "waits for acks", push: "wakes a phone", blob: "photos, videos",
    poller: "asks every 5 s", index: "reads messages", rider: "wants a ride", driver: "pings every 4 s", locsvc: "takes pings", geoidx: "cells → drivers",
    matcher: "pairs them up", eta: "minutes by road", trips: "one ride each", pingdb: "a row a ping", scan: "checks them all",
    people: "post and scroll", tweets: "every tweet", graph: "who follows whom", tlcache: "ids, in RAM", sqljoin: "joins on read", inline: "copies, then replies",
    upload: "chunks, resumable", vstore: "every quality", appstream: "bytes via app", onefile: "one size for all",
    waitroom: "lets fans in", holds: "with an expiry", payment: "charges cards", mapcache: "copied every 1 s", paylock: "locks while paying", localseats: "own seat list" };
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
          pingdb: "750,000 pings a second as rows on disk, then a distance query over millions of rows per request. Matching needs only each driver's latest spot: keep it in memory, and log the history.",
          scan: "289 requests a second × 3 million drivers is 867 million distance checks a second, nearly all of them in other cities. Ask the geo index for the cells around her.",
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

  // --------------------------------------------------------------------------------------------- Twitter --
  const TW_FOLLOW = {
    nodes: [P("A", "people", 95, 140, { label: "Ada" }), P("B", "people", 95, 400, { label: "Bo" }), P("ap", "app", 285, 270), P("tw", "tweets", 475, 92), P("q", "queue", 475, 270),
      P("w", "worker", 665, 270), P("g", "graph", 860, 150), P("tl", "tlcache", 475, 440)],
    wires: [["A", "ap"], ["B", "ap"], ["ap", "tw"], ["ap", "q"], ["q", "w"], ["w", "g"], ["w", "tl"], ["ap", "tl"]],
  };
  const TW_REF = {
    nodes: [P("pe", "people", 95, 270), P("lb", "lb", 255, 270), P("ap", "app", 415, 270), P("tw", "tweets", 590, 100), P("q", "queue", 590, 270), P("w", "worker", 760, 270),
      P("g", "graph", 900, 120), P("tl", "tlcache", 590, 440)],
    wires: [["pe", "lb"], ["lb", "ap"], ["ap", "tw"], ["ap", "q"], ["q", "w"], ["w", "g"], ["w", "tl"], ["ap", "tl"]],
  };
  const TWITTER_UNIT = {
    id: "twitter", name: "Twitter / X", sub: "a home timeline for 250 million people a day", floor: 7, group: "Feeds and social",
    w: [
      {
        id: "tw-scope", kind: "scope", title: "What is Twitter?",
        lede: "You're designing Twitter / X. Before any boxes, pin down what it must do. Sort the cards: <b>what it does</b>, <b>how well</b>, <b>not now</b>.",
        cards: [
          { t: "Post a short message, with photos", bin: "does", why: "Writing: the tweet." },
          { t: "Follow people", bin: "does", why: "The follow graph decides whose tweets you see." },
          { t: "A home timeline: the latest from everyone you follow", bin: "does", why: "Reading: the page people open 20 times a day. Making it fast is the whole design." },
          { t: "Opening the timeline feels instant", bin: "how", why: "A promise about read speed, and reads outnumber writes ten to one." },
          { t: "A new tweet reaches followers within seconds", bin: "how", why: "A promise about write speed: how fast the fan-out finishes." },
          { t: "Keep working when someone with 100 million followers posts", bin: "how", why: "The celebrity problem: one tweet, 100 million timelines." },
          { t: "Direct messages", bin: "not", why: "Private chat is a different system: the WhatsApp unit." },
          { t: "Search every tweet ever posted", bin: "not", why: "Search is an inverted index over billions of tweets: its own unit." },
          { t: "The \"For you\" feed a model ranks", bin: "not", why: "Ranking by a model is the TikTok unit. This one is the timeline of people you follow, newest first." },
        ],
        why: "Twitter does three things: post, follow, and show a timeline. The hard parts are in \"how well\": timelines that open instantly, tweets that arrive within seconds, and a design that survives the celebrity problem, where one tweet has to reach 100 million timelines.",
      },
      {
        id: "tw-napkin", kind: "napkin", title: "Size Twitter",
        lede: "<b>500 million</b> tweets are posted a day. <b>250 million</b> people open the app each day, and open their home timeline about <b>20</b> times. An account has about <b>200</b> followers on average.",
        q: {},
        design: { nodes: [P("pe", "people", 95, 330), P("ap", "app", 420, 330), P("tl", "tlcache", 760, 330)], wires: [["pe", "ap"], ["ap", "tl"]] },
        notes: [
          { id: "w", on: "ap", dx: 0, dy: -190, label: "tweets posted a second", unit: "/s", calc: "500e6 / (24 * 3600)", hint: "a day is 86,400 seconds" },
          { id: "r", on: "ap", dx: 0, dy: 60, label: "timelines opened a second", unit: "/s", calc: "250e6 * 20 / (24 * 3600)", hint: "people × opens each ÷ seconds in a day" },
          { id: "f", on: "tl", dx: -10, dy: -190, label: "fan-out writes a second", unit: "/s", calc: "500e6 / (24 * 3600) * 200", hint: "tweets a second × followers each" },
        ],
        why: "500 million a day is 5,787 tweets a second. Timelines are opened 57,870 times a second, ten times as often. Copying every tweet into every follower's timeline is 1,157,407 writes a second: a lot, but each one is tiny, and it makes every one of those 57,870 reads a single lookup. That trade, more work on write for cheap reads, is the heart of Twitter.",
      },
      {
        id: "tw-sketch", kind: "sketch", title: "Draw Twitter",
        lede: "Draw the server side. A tweet is stored once and must reach every follower's home timeline within seconds; opening a timeline must be one quick read. Drag parts in from the tray and wire them. Two of the parts don't belong.",
        q: {},
        tray: ["lb", "app", "tweets", "graph", "queue", "worker", "tlcache", "sqljoin", "inline"],
        design: { nodes: [P("pe", "people", 95, 270)], wires: [] },
        reference: TW_REF,
        rubric: [
          { link: [["people", "lb"], ["people", "app"]], say: "People talk to app servers that hold no state, behind a load balancer." },
          { link: [["app", "tweets"]], say: "A new tweet is stored once, by id, in the tweet store." },
          { link: [["app", "queue"]], say: "Posting puts a fan-out job on a queue, so the poster hears \"posted\" at once." },
          { link: [["queue", "worker"]], say: "Fan-out workers take the jobs from the queue." },
          { link: [["worker", "graph"]], say: "A worker asks the follow graph who follows the poster." },
          { link: [["worker", "tlcache"]], say: "It pushes the tweet's id onto each follower's timeline in the timeline cache." },
          { link: [["app", "tlcache"]], say: "Opening a home timeline is one read: a list of ids from the cache, then the tweets by id." },
        ],
        wrong: {
          sqljoin: "Building each timeline on read joins ~200 accounts' tweets for every one of 57,870 opens a second: 11.6 million lookups a second, while people wait. Do that work once, on write.",
          inline: "Copying into every follower's timeline before replying makes the poster wait: for 100 million followers that's nearly a minute. Put the fan-out on a queue and reply at once.",
        },
        why: "A tweet is written once to the tweet store, and a fan-out job goes on a queue so the poster isn't kept waiting. Workers look up the poster's followers in the follow graph and push the tweet's id onto each follower's cached timeline. Opening a timeline is then a single read of a list of ids, plus the tweets by id. Reads outnumber writes ten to one, so the work is done on write.",
      },
      {
        id: "tw-follow", kind: "follow", title: "Follow a tweet",
        lede: "Ada posts, and Bo follows her. Tap the parts each request passes through, in order.",
        q: {}, item: "request",
        design: TW_FOLLOW,
        rounds: [
          { say: "Ada posts a tweet. Where is it kept?", path: ["A", "ap", "tw"] },
          { say: "Now her followers' timelines need it. Start at the app servers. (On the way, the worker asks the follow graph who follows Ada.)", path: ["ap", "q", "w", "tl"] },
          { say: "Bo opens the app. Where does his home timeline come from?", path: ["B", "ap", "tl"] },
        ],
        why: "The tweet itself is stored once. Its id is then copied, in the background, into every follower's timeline in the cache. Bo's home timeline is already built when he opens it: one read of a list of ids. Twitter spends writes to make reads cheap, because reads come ten times as often.",
      },
    ],
    s: [
      {
        id: "tw-fanout", kind: "fanout", title: "The celebrity problem",
        lede: "One minute of tweets, about <b>347,000</b> of them. Most come from accounts with a few dozen followers, but two of the biggest post this minute: <b>120 million</b> followers and <b>30 million</b>. Fan-out workers write <b>2 million</b> timeline entries a second. Draw the line: accounts at or over it are merged into each timeline when it's opened, and everyone else fans out on write. The goals: <b>99%</b> of tweets reach their followers within <b>5 s</b>, and <b>99%</b> of timelines open within <b>150 ms</b> (15 ms, plus 0.6 ms for each account merged at read time).",
        sim: { seed: 1 }, goals: { lag: 5, read: 150 }, answer: [10e6, 1e6],
        why: "Fanning everyone out on write, the 120-million-follower tweet alone is a minute of work for the workers, and every tweet behind it waits: 65 s at the 99th percentile. Merging everyone on read, someone who follows 2,000 accounts merges them all, and the 99th percentile timeline takes 1,027 ms. The hybrid draws a line. Above a million followers, accounts are merged on read: only 3 of this minute's tweets, yet 13% of all follows point at them, so a typical timeline merges 15 of them, and the 99th percentile opens in 133 ms. Draw the line at 100,000 and timelines take 199 ms. Twitter runs this hybrid.",
      },
      {
        id: "tw-likes", kind: "likes", title: "A viral tweet's likes",
        lede: "A tweet goes viral: likes climb to <b>40,000 a second</b>. The like count lives in database rows, and a row is locked for <b>1 ms</b> while it changes, so one row takes 1,000 likes a second. You can split the count over more rows (a like picks one; reading the count adds them up at <b>0.25 ms</b> a row), or batch likes in the <b>200</b> app servers' memory and write them now and then. The goals: a like is saved within <b>50 ms</b>, the count reads in <b>20 ms</b>, and a crashed app server loses <b>no likes</b>.",
        sim: {}, goals: { like: 50, read: 20 }, answer: { shards: 64, batch: 0 },
        why: "One row takes 1,000 likes a second, so at 40,000 the line of waiting likes grows to 11 million: hours behind. 16 rows take 16,000 a second, still not enough. 64 rows take 64,000, so a like is saved in 2.7 ms, and reading the count adds 64 rows: 16 ms. 256 rows make every read add 256: 64 ms. Batching in the app servers' memory spares the database, but a server that crashes loses likes it hasn't written: about 200 for every second of batch. A count split over rows is a sharded counter, the standard fix for one hot row.",
      },
      {
        id: "tw-cache", kind: "tlcache", title: "Timelines in memory",
        lede: "Home timelines are kept ready in memory: a list of tweet ids for each person, <b>16 bytes</b> an id, kept on <b>3</b> machines. There's room for <b>12 TB</b>. A timeline that isn't cached, or a scroll past its end, is rebuilt from scratch, which takes seconds. Choose who gets a cached timeline and how many ids it keeps. The goals: fit in <b>12 TB</b>, and at most <b>2%</b> of timeline opens are slow.",
        sim: {}, goals: { tb: 12, slow: 0.02 }, answer: { who: "week", keep: 800 },
        why: "Every account with 800 ids is 19.2 TB, over the budget. Only people active today is 9.6 TB, but 6% of opens come from people who weren't, so 6.5% are slow. People active this week, with 800 ids each, is 11.5 TB, and 1.5% of opens are slow. Keeping 400 ids would save memory, but 3% of opens scroll past 400; keeping 3,200 is 46 TB for a handful of deep scrollers. Twitter kept about 800 ids per timeline, only for active users, and rebuilt the rest on demand.",
      },
    ],
  };

  // --------------------------------------------------------------------------------------------- YouTube --
  const YT_FOLLOW = {
    nodes: [P("M", "people", 95, 110, { label: "Mia" }), P("L", "people", 95, 420, { label: "Leo" }), P("up", "upload", 290, 110), P("bl", "blob", 480, 50), P("q", "queue", 480, 190),
      P("w", "worker", 670, 190, { label: "transcoders" }), P("vs", "vstore", 860, 300), P("ap", "app", 290, 300), P("db", "sql", 480, 300, { label: "video info" }), P("cdn", "cdn", 480, 430)],
    wires: [["M", "up"], ["up", "bl"], ["up", "q"], ["q", "w"], ["w", "bl"], ["w", "vs"], ["L", "ap"], ["ap", "db"], ["L", "cdn"], ["cdn", "vs"]],
  };
  const YT_REF = {
    nodes: [P("pe", "people", 95, 270), P("up", "upload", 260, 110), P("bl", "blob", 450, 50), P("q", "queue", 450, 170), P("w", "worker", 640, 170, { label: "transcoders" }),
      P("vs", "vstore", 850, 280), P("lb", "lb", 260, 290), P("ap", "app", 450, 300), P("db", "sql", 640, 290, { label: "video info" }), P("cdn", "cdn", 450, 450)],
    wires: [["pe", "up"], ["up", "bl"], ["up", "q"], ["q", "w"], ["w", "bl"], ["w", "vs"], ["pe", "lb"], ["lb", "ap"], ["ap", "db"], ["pe", "cdn"], ["cdn", "vs"]],
  };
  const YOUTUBE_UNIT = {
    id: "youtube", name: "YouTube", sub: "500 hours uploaded a minute, a billion hours watched a day", floor: 7, group: "Media",
    w: [
      {
        id: "yt-scope", kind: "scope", title: "What is YouTube?",
        lede: "You're designing YouTube. Before any boxes, pin down what it must do. Sort the cards: <b>what it does</b>, <b>how well</b>, <b>not now</b>.",
        cards: [
          { t: "Upload a video of any length", bin: "does", why: "Writing: one big file, which has to become something every screen can play." },
          { t: "Watch it on a phone, a laptop or a TV", bin: "does", why: "Reading: the same video at many qualities, picked for each screen and each connection." },
          { t: "A video page: title, views, likes", bin: "does", why: "The small data around the video, kept in an ordinary database." },
          { t: "Playback starts fast and rarely stalls, even on a train", bin: "how", why: "A promise about the player and the network, and the reason video comes in pieces at several qualities." },
          { t: "A new upload is watchable within minutes", bin: "how", why: "A promise about the transcoding pipeline: how fast an hour of video becomes playable." },
          { t: "Survive a premiere: millions pressing play at once", bin: "how", why: "The thundering herd: every edge misses at the same moment." },
          { t: "Live streaming", bin: "not", why: "Live video has seconds, not minutes, to transcode and deliver: a pipeline of its own." },
          { t: "Recommendations: what to watch next", bin: "not", why: "Ranking millions of videos for one person is the recommender unit." },
          { t: "Search every video by its words", bin: "not", why: "An inverted index over titles and transcripts is the search unit." },
        ],
        why: "YouTube does three things: take an upload, play it anywhere, and show the page around it. The hard parts are in \"how well\": playback that starts fast and doesn't stall on a bad connection, uploads that become watchable within minutes, and a CDN that survives millions of people pressing play at the same moment.",
      },
      {
        id: "yt-napkin", kind: "napkin", title: "Size YouTube",
        lede: "<b>500 hours</b> of video are uploaded every minute. Every rendition of an hour of video, together, takes about <b>3 GB</b>. People watch <b>1 billion hours</b> a day, at about <b>2.5 megabits a second</b> on average.",
        q: {},
        design: { nodes: [P("pe", "people", 95, 330), P("up", "upload", 420, 200), P("vs", "vstore", 760, 330), P("cdn", "cdn", 420, 440)], wires: [["pe", "up"], ["up", "vs"], ["pe", "cdn"], ["cdn", "vs"]] },
        notes: [
          { id: "h", on: "up", dx: -40, dy: -160, label: "hours uploaded a day", unit: "hours", calc: "500 * 60 * 24", hint: "a day is 60 × 24 minutes" },
          { id: "s", on: "vs", dx: -10, dy: -200, label: "new storage a day", unit: "TB", calc: "500 * 60 * 24 * 3 / 1000", hint: "hours a day × 3 GB, then 1 TB = 1,000 GB" },
          { id: "e", on: "cdn", dx: 160, dy: -20, label: "video going out", unit: "Tbps", calc: "1e9 / 24 * 2.5e6 / 1e12", hint: "hours a day ÷ 24 is how many streams play at once; × 2.5 megabits; 1 Tbps = 10¹² bits a second" },
        ],
        why: "500 hours a minute is 720,000 hours of new video a day. At 3 GB an hour that's 2,160 TB, about 2 petabytes of new storage every day, so video lives in a blob store, never in a database. A billion hours a day means about 42 million streams playing at any moment; at 2.5 megabits each that's 104 terabits a second going out. No single data centre can send that: it has to come from caches near the viewers.",
      },
      {
        id: "yt-sketch", kind: "sketch", title: "Draw YouTube",
        lede: "Draw the server side. An upload must become every quality, in short pieces; a viewer must get those pieces from somewhere close; the video page needs its title and views. Drag parts in from the tray and wire them. Two of the parts don't belong.",
        q: {},
        tray: ["lb", "app", "sql", "upload", "blob", "queue", "worker", "vstore", "cdn", "appstream", "onefile"],
        design: { nodes: [P("pe", "people", 95, 270)], wires: [] },
        reference: YT_REF,
        rubric: [
          { link: [["people", "upload"]], say: "Uploads go to an upload service that takes the file in chunks, so a dropped connection picks up where it stopped." },
          { link: [["upload", "blob"]], say: "The raw file is kept, as it came, in a blob store." },
          { link: [["upload", "queue"]], say: "A finished upload puts a transcode job on a queue." },
          { link: [["queue", "worker"]], say: "Transcode workers take the job, piece by piece." },
          { link: [["worker", "vstore"]], say: "They write every quality, cut into pieces a few seconds long, to the video store." },
          { link: [["people", "cdn"]], say: "Viewers fetch the pieces from a CDN edge near them." },
          { link: [["cdn", "vstore"]], say: "An edge that doesn't have a piece fetches it from the video store, then keeps it." },
          { link: [["people", "lb"], ["people", "app"]], say: "The video page comes from app servers behind a load balancer." },
          { link: [["app", "sql"]], say: "Its title, views and list of pieces are in a database." },
        ],
        wrong: {
          appstream: "Sending the video itself through app servers puts 104 terabits a second through machines built to answer page requests, mostly far from the viewer. Video comes from a CDN edge nearby.",
          onefile: "One 1080p file stalls on a phone on a train and can't give a TV 4K. Keep every quality, in short pieces, so the player can switch quality piece by piece.",
        },
        why: "An upload lands in chunks at an upload service, and the raw file goes to a blob store. A job on a queue sends it to transcode workers, which write every quality, in pieces a few seconds long, to the video store. Viewers get those pieces from a CDN edge near them; the edge fetches from the video store only on a miss. The page around the video, its title, views and list of pieces, comes from app servers and a database. The video bytes never touch an app server.",
      },
      {
        id: "yt-follow", kind: "follow", title: "Follow a video",
        lede: "Mia uploads a video, and Leo watches it. Tap the parts each step passes through, in order.",
        q: {}, item: "step",
        design: YT_FOLLOW,
        rounds: [
          { say: "Mia uploads an hour-long video. Where does the raw file land?", path: ["M", "up", "bl"] },
          { say: "Now it has to become 360p to 4K, in pieces. Start at the upload service. (On the way, the transcoders read the raw file from the blob store.)", path: ["up", "q", "w", "vs"] },
          { say: "Leo opens the video page. Its title, views and list of pieces: where do they come from?", path: ["L", "ap", "db"] },
          { say: "He presses play, the first in his city to watch it. Where do the pieces come from?", path: ["L", "cdn", "vs"] },
        ],
        why: "The upload is a write that happens once: the raw file is kept, and transcoders turn it into every quality in short pieces. Watching is a read that happens millions of times: the page comes from app servers and a database, and the pieces come from a CDN edge. Only the first viewer near an edge makes it go to the video store; everyone after is served from the edge.",
      },
    ],
    s: [
      {
        id: "yt-transcode", kind: "transcode", title: "The upload",
        lede: "A creator uploads an <b>hour-long</b> video. It has to become four qualities, 360p, 720p, 1080p and 4K, and <b>200 workers</b> are free to encode it; 4K is 16 times the work of 360p. Cut the video into pieces: each piece in each quality is one task, but every task spends <b>4 s</b> starting up (fetch the piece, find a keyframe, warm up the encoder). The goals: the whole video can be watched in 360p within <b>30 s</b>, and start-up wastes at most <b>20%</b> of the work.",
        sim: { seed: 1 }, goals: { watch: 30, waste: 0.2 }, answer: { seg: 10, order: "low" },
        why: "As one piece, the 360p encode alone is half an hour of one worker's time: the video isn't watchable for 35 min, and 4K takes nearly 8 hours while 199 workers sit idle. 10-minute pieces still take 6 min. Cut into 10-second pieces there are 1,440 tasks, but done piece by piece, the 4K tasks hog the workers and the last of the 360p isn't done until 241 s. Do every piece's 360p first and the whole hour plays after 20 s, with start-up costing 12.3% of the work, and everything, 4K included, is done after 5.1 min. 1-minute pieces only get to 43 s, and 2-second pieces spend 61.5% of the work starting up. YouTube cuts uploads into short pieces at keyframes, encodes them in parallel, and does the low qualities first.",
      },
      {
        id: "yt-abr", kind: "abr", title: "The train ride",
        lede: "Leo watches on a train. The video comes in <b>2-second</b> pieces at five qualities, from 240p (0.4 megabits a second) to 1080p (6), and the signal swings: fast in the city, almost nothing in a tunnel, patchy in open country and at a crowded station. He watches <b>8 minutes</b>, then gets off. Choose how the player picks each piece's quality, and how far ahead it fetches. The goals: stalled under <b>1%</b> of the time, at least <b>3 megabits a second</b> on average (720p), and at most <b>25 MB</b> fetched and never watched.",
        sim: { seed: 1 }, goals: { stall: 0.01, avg: 3, waste: 25 }, answer: [{ rule: "rate", ahead: 30 }, { rule: "buffer", ahead: 30 }],
        why: "Always 1080p needs 6 megabits a second, which the tunnel, the country and the station can't give: stalled 19% of the time. Always 360p never stalls, but it looks it: 0.8 on average. Fetching only 10 s ahead, the tunnel empties the buffer before the player can react: stalled 3.2% of the time. 30 s ahead, both rules that adapt make it: matching the last download's speed averages 3.93 megabits a second, and picking by how full the buffer is averages 4.02, with 21 MB thrown away when Leo gets off. Two minutes ahead never stalls either, but throws away 55 MB or more of video nobody sees. This is adaptive bitrate streaming, as in HLS and DASH: every piece comes at several qualities, and the player picks, piece by piece.",
      },
      {
        id: "yt-premiere", kind: "premiere", title: "The premiere",
        lede: "A huge channel premieres a video: <b>3 million</b> people press play together, on <b>200</b> CDN edges in <b>10</b> regions. Every <b>4 s</b> a new piece goes live and everyone asks for it within about a second, so every edge misses at once. The origin can answer <b>120</b> requests a second, and a request that waits over <b>2 s</b> gives up. Choose what an edge does on a miss, and whom it asks. The goals: the origin is never asked more than <b>120</b> times in a second, and 99% of viewers get each piece within <b>1 s</b>.",
        sim: { seed: 1 }, goals: { peak: 120, wait: 1 }, answer: { collapse: true, shield: true },
        why: "When every miss goes on to the origin, it's asked 2.3 million times in a second and 99.6% of requests give up. Shields alone don't help: each one still passes on every miss, and 96% give up. Collapsing at the edges sends one request per edge for each piece, but that's 200 at once, more than the origin can answer in a second, so the last edges wait and the slowest 1% of viewers wait 1.63 s. Collapse at the edges and at the shields, and the origin hears 10 requests a piece, one per region, and 99% of viewers get each piece within 0.24 s. Request collapsing behind an origin shield is how a CDN survives a thundering herd.",
      },
    ],
  };

  // ----------------------------------------------------------------------------------------- Ticketmaster --
  const TM_FOLLOW = {
    nodes: [P("N", "people", 95, 270, { label: "Nia", tag: "wants two seats" }), P("wr", "waitroom", 270, 270), P("ap", "app", 460, 270, { label: "booking", tag: "picks and sells" }), P("mc", "mapcache", 460, 100),
      P("hd", "holds", 690, 140), P("db", "sql", 690, 300, { label: "seats & orders" }), P("pay", "payment", 690, 450)],
    wires: [["N", "wr"], ["wr", "ap"], ["ap", "mc"], ["mc", "db"], ["ap", "hd"], ["ap", "db"], ["ap", "pay"]],
  };
  const TM_REF = {
    nodes: [P("pe", "people", 95, 280, { tag: "a million fans" }), P("wr", "waitroom", 250, 280), P("lb", "lb", 400, 280), P("ap", "app", 560, 280, { label: "booking" }), P("mc", "mapcache", 560, 100),
      P("hd", "holds", 780, 150), P("db", "sql", 780, 300, { label: "seats & orders" }), P("pay", "payment", 780, 450)],
    wires: [["pe", "wr"], ["wr", "lb"], ["lb", "ap"], ["ap", "mc"], ["mc", "db"], ["ap", "hd"], ["ap", "db"], ["ap", "pay"]],
  };
  const TICKET_UNIT = {
    id: "ticketmaster", name: "Ticketmaster", sub: "100,000 fans, 20,000 seats, on sale at 10:00", floor: 7, group: "Money and commerce",
    w: [
      {
        id: "tm-scope", kind: "scope", title: "What is Ticketmaster?",
        lede: "You're designing Ticketmaster. Before any boxes, pin down what it must do. Sort the cards: <b>what it does</b>, <b>how well</b>, <b>not now</b>.",
        cards: [
          { t: "Show an event and a map of its seats", bin: "does", why: "Reading: the event page, and which seats are still free." },
          { t: "Hold the seats you picked while you pay", bin: "does", why: "Nobody else can take them for a few minutes, and then they go back." },
          { t: "Buy tickets and get them on your phone", bin: "does", why: "Writing: the seats become yours, once, and the card is charged." },
          { t: "Survive a million fans at exactly 10:00", bin: "how", why: "The onsale: every fan arrives in the same minute, for a site that can serve a few thousand at a time." },
          { t: "Never sell one seat twice", bin: "how", why: "Two fans clicking the same seat in the same second: exactly one gets it." },
          { t: "Fair to fans, not to bots", bin: "how", why: "Being first, or having a thousand tabs, mustn't be the way to get tickets." },
          { t: "Fans reselling tickets to each other", bin: "not", why: "Resale is a marketplace of its own, with its own prices and transfers." },
          { t: "Search events by artist and city", bin: "not", why: "Search is an index over every event: the search unit." },
          { t: "Recommend shows you might like", bin: "not", why: "Ranking events for one person is the recommender unit." },
        ],
        why: "Ticketmaster does three things: show the seats, hold some for you, and sell them to you. The hard parts are all in \"how well\": a sale where everyone arrives in the same minute, a seat that can only ever be sold once however many people click it, and a line that's fair to people rather than to whoever has the most tabs.",
      },
      {
        id: "tm-napkin", kind: "napkin", title: "Size an onsale",
        lede: "<b>2 million</b> fans want tickets for a stadium show with <b>50,000</b> seats, <b>2</b> each. Without a waiting room, each would refresh the page every <b>5 s</b>. The booking servers can hold <b>4,000</b> shoppers at once, and a shopper takes about <b>5 minutes</b> to pick seats and pay.",
        q: {},
        design: { nodes: [P("pe", "people", 95, 330, { tag: "2 million fans" }), P("wr", "waitroom", 420, 330), P("ap", "app", 760, 330, { label: "booking", tag: "4,000 at once" })], wires: [["pe", "wr"], ["wr", "ap"]] },
        notes: [
          { id: "r", on: "wr", dx: 0, dy: -190, label: "refreshes a second, with no waiting room", unit: "/s", calc: "2e6 / 5", hint: "fans ÷ seconds between refreshes" },
          { id: "b", on: "ap", dx: -10, dy: -190, label: "shoppers through a minute", unit: "/min", calc: "4000 / 5", hint: "shoppers at once ÷ minutes each" },
          { id: "m", on: "ap", dx: -10, dy: 60, label: "minutes to sell out", unit: "min", calc: "50000 / 2 / (4000 / 5)", hint: "buyers (seats ÷ 2) ÷ shoppers a minute" },
        ],
        why: "2 million fans refreshing every 5 s is 400,000 requests a second at a site that can hold 4,000 shoppers. Only 25,000 of them can buy, 2 seats each, and 4,000 shoppers taking 5 minutes is 800 a minute, so even if every shopper buys, it sells out in about 31 minutes. Everyone else is going to wait, and lose. The only question is whether they wait in an orderly line or by hammering the site: so the first part of the design is a waiting room that lets 800 a minute through and keeps everyone else off the booking servers.",
      },
      {
        id: "tm-sketch", kind: "sketch", title: "Draw Ticketmaster",
        lede: "Draw the server side. A million fans arrive at 10:00 for a few thousand places; a shopper's seats must be kept for them while they pay, and given back if they don't; a seat can only be sold once. Drag parts in from the tray and wire them. Two of the parts don't belong.",
        q: {},
        tray: ["waitroom", "lb", "app", "mapcache", "holds", "sql", "payment", "paylock", "localseats"],
        design: { nodes: [P("pe", "people", 95, 280, { tag: "a million fans" })], wires: [] },
        reference: TM_REF,
        rubric: [
          { link: [["people", "waitroom"]], say: "Fans line up in a waiting room in front of the site, not at the booking servers." },
          { link: [["waitroom", "lb"], ["waitroom", "app"]], say: "The waiting room lets a fan through each time a shopper leaves, so the booking servers never get more than they can hold." },
          { link: [["app", "holds"]], say: "Picking seats puts a hold on them that runs out after 10 minutes, so nobody else takes them while you pay." },
          { link: [["app", "sql"]], say: "Seats and orders live in one database, and a sale is one conditional write: these seats, to you, only if they're still yours." },
          { link: [["app", "payment"]], say: "A payment provider charges the card, with no database lock held while it does." },
          { link: [["app", "mapcache"]], say: "The seat map comes from a copy made every second, not from the database on every refresh." },
          { link: [["mapcache", "sql"]], say: "The copy reads the free seats from the database, once a second." },
        ],
        wrong: {
          paylock: "Locking the seats in the database until the card is charged keeps a transaction open for every shopper for minutes: 2,000 shoppers, a few hundred connections, and everyone else gets an error page. A shopper who walks away keeps the lock too. Hold the seats with an expiry instead.",
          localseats: "If each app server keeps its own list of free seats, forty servers have forty lists, and the same seat is sold twice. Seats live in one place, and a sale is one conditional write.",
        },
        why: "Fans wait in a waiting room in front of the site, which lets them through as fast as the booking servers can hold them. Picking seats puts a hold on them with an expiry, so they're yours while you pay and go back by themselves if you don't. The sale itself is one conditional write in the database that keeps seats and orders, after the payment provider charges the card. The seat map that everyone keeps refreshing is read from a copy made every second, so the database answers once a second instead of thousands of times.",
      },
      {
        id: "tm-follow", kind: "follow", title: "Follow a ticket",
        lede: "Nia wants two tickets. Tap the parts each step passes through, in order.",
        q: {}, item: "step",
        design: TM_FOLLOW,
        rounds: [
          { say: "Nia opens the sale at 9:50. Where does she wait?", path: ["N", "wr"] },
          { say: "At 10:12 it's her turn, and she taps two seats. Where are they kept for her? Start at the waiting room.", path: ["wr", "ap", "hd"] },
          { say: "She pays. Who charges her card?", path: ["ap", "pay"] },
          { say: "The charge goes through. Where is the sale written, for good?", path: ["ap", "db"] },
        ],
        why: "Nia spends most of her time in the waiting room, which is cheap: a page that says where she is in line. Once she's in, her seats are held with an expiry while she pays, so nobody can take them and nothing is locked in the database. The payment provider charges her card, and only then is the sale written, once, in the database of seats and orders.",
      },
    ],
    s: [
      {
        id: "tm-onsale", kind: "onsale", title: "10:00",
        lede: "A big show goes on sale at 10:00. <b>100,000</b> fans want <b>20,000</b> seats, two each. The booking servers can hold <b>2,000</b> shoppers at once; one more gets an error page, and tries again a minute later. The waiting room opened at 9:30: <b>1,500</b> bots joined in its first second, people over the half hour, and more keep arriving after 10:00. Choose how the waiting room lets people through, and in what order it puts everyone already waiting at 10:00. The goals: no error pages, sold out within <b>an hour</b>, and bots get at most <b>5%</b> of the seats.",
        sim: { seed: 1 }, goals: { errors: 0, sold: 3600, bots: 0.05 }, answer: { door: "swap", line: "shuffle" },
        why: "Let everyone in at once and 471,029 error pages go out; 93,584 fans give up after their fifth. 50 a second fills the booking servers in 40 s, and then 108,693 error pages. 3 a second never errors, but it's slower than people leave, and the show sells out after 87.5 min. Letting one in each time a shopper leaves keeps exactly 2,000 inside, and it sells out after 41.1 min. And the order: in the order they came, the bots are at the front, because they joined at 9:30:00, and they get 15.0% of the seats. Shuffle everyone who was waiting at 10:00 and the bots get 3.3%: being first is worth nothing, so there's no prize for camping. Ticketmaster's waiting room does this: a random place for everyone there before the sale, then in as fast as the site can hold them.",
      },
      {
        id: "tm-hold", kind: "hold", title: "While you pay",
        lede: "The same onsale, through a waiting room that works. A shopper picks two seats, and they're kept for them while they pay: most pay within 2 or 3 minutes, a few take much longer, and about a third walk away without paying. Choose how the seats are kept, and for how long. The database has <b>400</b> connections. The goals: no error pages, at most <b>1%</b> of buyers lose their seats while paying, and <b>19,000</b> of the 20,000 seats sold within <b>an hour</b>.",
        sim: { seed: 1 }, goals: { errors: 0, kick: 0.01, by: 3600 }, answer: { keep: "hold", mins: 10 },
        why: "A database lock keeps a transaction open for every shopper until they pay: 2,000 shoppers, 400 connections, and 556,215 error pages. A hold with an expiry costs the database nothing while it waits. 2 minutes is shorter than most people take to pay: 63.6% of buyers lose their seats mid-payment. 5 minutes still takes them from 10.0%. 10 minutes takes them from only 0.51%, and 19,000 seats are sold after 48.2 min. 30 minutes is safe for every buyer, but seats held by people who walked away pile up to 3,922, and an hour in only 14,548 are sold. Ticketmaster holds seats for a few minutes, with a countdown on the page, and the hold runs out on its own.",
      },
      {
        id: "tm-seatmap", kind: "seatmap", title: "Those seats were just taken",
        lede: "Ten minutes into the onsale, the best seats are going. <b>1,000</b> shoppers are inside, and the seat map on each one's screen refreshes every <b>2 s</b>. Reading the map from the database reads all 20,000 seats, and the database can afford <b>5</b> of those a second. Choose where the map comes from, and how a shopper picks. The goals: at most <b>5</b> seat-map reads a second reach the database, and at most <b>5%</b> of tries end in \"sorry, those seats were just taken\".",
        sim: { seed: 1 }, goals: { reads: 5, clash: 0.05 }, answer: { map: 1, pick: "best" },
        why: "Reading the map from the database on every refresh is 82 reads a second while people click seats, and 13 while they pick sections: more than it can afford. A copy made every second costs 1 read a second and shows nothing older than the screen already did. Clicking seats, 72.4% of tries clash even on a live map: everyone sees the same best seats, takes 9 s to choose, and someone gets there first. From a copy 30 s old, 97.1% clash. Choose a section and let the server find the best two free seats in it, and only 3.0% of tries clash; from a 30 s copy, 43.2% pick sections that have already gone. This is why Ticketmaster offers \"best available\": the server picks from the live seats, in one write.",
      },
    ],
  };


  // ------------------------------------------------------------------------------------- Latency numbers --
  // First principles: what a computer waits for. The numbers are tunnel/lat.js's NUMS; every time below is worked
  // out from them, and tools/board-check.js checks the text against them.
  const LN_PAGE = {
    nodes: [P("u", "people", 95, 300, { label: "Ana", tag: "opens her profile" }), P("ap", "app", 330, 300, { label: "app server", tag: "builds the page" }),
      P("rd", "cache", 600, 110, { label: "Redis", tag: "sessions" }), P("db", "sql", 600, 300, { label: "database", tag: "same datacenter" }), P("pay", "payment", 600, 470, { label: "payments API", tag: "across the Atlantic" })],
    wires: [["u", "ap"], ["ap", "rd"], ["ap", "db"], ["ap", "pay"]],
  };
  const NUMBERS_UNIT = {
    id: "numbers", name: "Latency numbers", sub: "From an L1 hit to a round trip across the ocean", floor: 0,
    w: [
      {
        id: "ln-ladder", kind: "ladder", title: "Put them in order",
        lede: "A computer spends its life waiting: for memory, for a disk, for another machine. Drag each card onto the ruler where you think it lands. The ruler goes up ten times at every mark, from <b>1 nanosecond</b> to <b>1 second</b>, and anywhere within 3× of the real number counts.",
        cards: ["l1", "mutex", "ram", "switch", "ssd", "dc", "seek", "ocean", "notice"],
        why: "From an L1 hit to a wait a person notices is eight steps of ten. Stretch it so a nanosecond lasts a second, and a read from RAM takes 1.7 minutes, a 4 KB read from an SSD 1.2 days, a round trip across the datacenter 5.8 days, a seek on a spinning disk 3.8 months, and a round trip across the Atlantic 2.5 years. Every fast design moves work down this ladder: memory before disk, the next machine before the next continent, one round trip instead of thirty.",
      },
      {
        id: "ln-race", kind: "race", title: "Which is faster?",
        lede: "Two jobs start at the same moment. Tap the one you think finishes first, then watch them race, slowed right down. Five races; every time comes from the numbers on the ruler.",
        why: "Five races, five rules of thumb. The network beats a disk seek. Your own RAM beats any network. Reading in order beats reading at random. Round trips add up, so a loop of queries can cost more than an ocean. And the CPU is cheap next to the wire, so compress before you send.",
      },
      {
        id: "ln-napkin", kind: "napkin", title: "Time a page",
        lede: "Ana opens her profile. The app server reads her session from Redis in the same datacenter: one round trip, <b>0.5 ms</b>. Then it runs <b>30</b> queries on the database, one after another, each a round trip plus 0.5 ms of work: <b>1 ms</b> each. Then it asks a payments API across the Atlantic for her plan, on a new connection: <b>2</b> round trips to connect (TCP, then TLS) and <b>1</b> to ask, <b>80 ms</b> each.",
        q: {},
        design: LN_PAGE,
        notes: [
          { id: "q", on: "db", dx: 140, dy: -10, label: "the 30 queries", unit: "ms", calc: "30 * (0.5 + 0.5)", hint: "30 × (a round trip + the work)" },
          { id: "a", on: "pay", dx: 140, dy: -40, label: "the payments call", unit: "ms", calc: "3 * 80", hint: "connect (2 round trips) + ask (1), each across the ocean" },
          { id: "t", on: "ap", dx: -90, dy: -230, label: "the whole page", unit: "ms", calc: "0.5 + 30 * (0.5 + 0.5) + 3 * 80", hint: "add the three up: they happen one after another" },
        ],
        why: "The session is 0.5 ms. The 30 queries, one after another, are 30 ms. The payments call is three round trips across the ocean: 240 ms. The page takes about 270 ms, and nearly all of it is the speed of light. So fix the big numbers first: keep one connection open to the payments API and that's 80 ms; keep its answer in Redis for a few minutes and it's 0.5 ms. Fold the 30 queries into one and they're about 1 ms. Look at where the time goes before you touch the code.",
      },
    ],
    s: [
      {
        id: "ln-waterfall", kind: "waterfall", title: "A slow page",
        lede: "Ana's profile page again, loaded <b>2,000</b> times. It reads her session, runs <b>30</b> queries, asks the payments API across the Atlantic for her plan, and resizes her <b>2 MB</b> photo. About one round trip in a thousand loses a packet, and a lost packet waits <b>200 ms</b> to be sent again. Choose how each part is done. The goals: half the pages within <b>20 ms</b>, and 99% within <b>100 ms</b>, the wait a person notices.",
        sim: { seed: 1 }, goals: { p50: 20, p99: 100 },
        answers: [{ queries: "one", pay: "cache", photo: "ssd" }, { queries: "one", pay: "cache", photo: "ram" }],
        why: "As it was, half the pages took 307 ms and the slowest 1% took 510 ms: three round trips across the ocean, 30 queries one after another, and a disk seek. Keeping the connection open cuts the ocean to one trip, and the middle page to 140 ms, but that one trip is still 80 ms. A copy of the plan in Redis, kept 5 minutes, turns it into half a millisecond. Running the 30 queries all at once is quick on a good day, 9 ms in the middle, but 30 round trips are 30 chances to lose a packet: 3.4% of pages wait the 200 ms, and the slowest 1% take 209 ms. One query is one chance. The photo from an SSD skips the seek. Together: half the pages in 6.9 ms and 99% in 8.4 ms.",
      },
      {
        id: "ln-globe", kind: "globe", title: "Around the world",
        lede: "A news site's front page, the same for everyone, so any datacenter can serve all of it. People open it in ten cities. Light in glass goes <b>200 km</b> a millisecond, and cables run about a third longer than a straight line. Tap squares on the map to choose up to <b>3</b> datacenters, and choose how many round trips a page load takes. The goal: the page loads within <b>120 ms</b> in every city.",
        goals: { ms: 120, sites: 3 }, start: { sites: ["va"], trips: 6 }, answer: { sites: ["va", "in", "si"], trips: 1 },
        why: "From Virginia alone, on new connections, Sydney waits 1,292 ms. One round trip from Virginia still takes 224 ms there, because Sydney is 15,700 km away and nothing travels faster than light. Two round trips can't make it from anywhere: even with all eight datacenters, Johannesburg waits 203 ms. So it takes both: one round trip, and datacenters near everyone. Virginia, Mumbai and Singapore put every city within 115 ms: São Paulo is the farthest, from Virginia, and Johannesburg, the city furthest from everywhere, is served from Mumbai. Big sites do exactly this: a CDN close to every city, and pages that need as few round trips as they can.",
      },
    ],
  };

  // --------------------------------------------------------------------------------------------- Caching --
  // First principles again: what a cache is worth, what it costs, and how it goes wrong. Every number is worked out by
  // tunnel/cache.js, and tools/board-check.js checks the text against it.
  const CC_SHOP = {
    nodes: [P("u", "people", 95, 300, { label: "shoppers", tag: "50,000 reads a second" }), P("ap", "app", 340, 300, { label: "app servers", tag: "cache-aside" }),
      P("rd", "cache", 620, 150, { label: "Redis", tag: "0.5 ms a read" }), P("db", "sql", 620, 420, { label: "database", tag: "10 ms a read" })],
    wires: [["u", "ap"], ["ap", "rd"], ["ap", "db"]],
  };
  const CACHE_UNIT = {
    id: "caching", name: "Caching, properly", sub: "Hit rates, stale prices and the stampede", floor: 4,
    w: [
      {
        id: "cc-napkin", kind: "napkin", title: "What a hit is worth",
        lede: "A shop's product pages: <b>50,000</b> reads a second. The app asks Redis first, <b>0.5 ms</b>; on a miss it reads the database, <b>10 ms</b> more, and puts the answer in Redis. Redis answers <b>90%</b> of reads.",
        q: {},
        design: CC_SHOP,
        notes: [
          { id: "d", on: "db", dx: 150, dy: -40, label: "reads reaching the database", unit: "/s", calc: "50000 * (1 - 0.9)", hint: "only the misses get past Redis" },
          { id: "a", on: "ap", dx: -90, dy: -230, label: "the average read", unit: "ms", calc: "0.9 * 0.5 + 0.1 * (0.5 + 10)", hint: "hits × 0.5 ms + misses × (0.5 + 10 ms): a miss asks Redis first" },
          { id: "e", on: "db", dx: 150, dy: 60, label: "reaching the database at 99% hits", unit: "/s", calc: "50000 * (1 - 0.99)", hint: "the misses are now 1 in 100" },
        ],
        why: "At 90% hits, 5,000 reads a second reach the database, and the average read takes 1.5 ms, 1.05 ms of it spent on the misses. At 99% hits the database sees 500 a second: ten times less work, from nine more points. So look at the misses, not the hits: 10% to 1% is a tenfold drop, and that's why the last few points are worth so much. The next question is what they cost.",
      },
      {
        id: "cc-tail", kind: "tail", title: "The long tail",
        lede: "The shop sells <b>a million</b> products, and views follow a Zipf curve: the 2nd most viewed gets half the views of the 1st, the 3rd a third, and so on. A product page is <b>20 KB</b>. The cache keeps the most viewed ones. Drag the pin to your guess, then check it.",
        rounds: [
          { ask: "hit", at: 0.01, say: "Keep the top <b>1%</b> of products. What share of views does the cache answer?" },
          { ask: "size", at: 0.9, say: "How much of the catalog does it take to answer <b>90%</b> of views?" },
          { ask: "size", at: 0.99, say: "And <b>99%</b>?" },
        ],
        why: "The top 1% of products, 200 MB, answers 68% of views: that's the head of the curve. 90% takes the top 24%, 4.7 GB. 99% takes 87% of the whole catalog, 17.3 GB, for nine more points. On a Zipf curve every ten times more memory buys the same 16 points of hit rate, so each point costs more than the one before, and a cache doesn't need everything: it needs the head, and the tail can go to the database. Pick the hit rate from the misses the database can take (the last question), then buy the memory for it.",
      },
      {
        id: "cc-inval", kind: "inval", title: "Which order?",
        lede: "A product's price is in the database and in the cache. Two people change it at the same moment, to <b>£1</b> and <b>£2</b>, while a shopper reads it. The shopper reads the usual way: ask the cache; on a miss, read the database and put what it read in the cache. Tap the order you think a writer should do its two steps in.",
        answer: "dbdel",
        why: "Update the cache, then the database: 176 of the 420 ways the steps can interleave leave the wrong price in the cache. Update the database, then the cache: 138, because two writers can finish in the opposite order to the one they started in. Delete the key, then update the database: 228, the worst, because a shopper slips in between and puts the old price back. Update the database, then delete the key: 26. It can still go wrong: a shopper misses and reads the price, another write lands and deletes the key, and then the shopper fills the cache with the price it read, which is now old. That needs a slow read exactly while a write lands, which is rare, so give every key a TTL too: when the race happens, the wrong price lasts until the TTL, not forever. Facebook's memcache does this order, with leases on top to close the last gap.",
      },
    ],
    s: [
      {
        id: "cc-stampede", kind: "stampede", title: "The stampede",
        lede: "A sale starts. <b>500</b> products are hot: <b>20,000</b> reads a second between them, and the top one alone gets <b>2,944</b> a second. A deploy put all 500 in the cache at once, each kept <b>60 s</b>. The database runs <b>10</b> queries at once, <b>50 ms</b> each, with room for <b>200</b> more to wait; past that it turns queries away. A shopper who waits <b>1 s</b> gets an error page. Choose what happens when a key runs out, and how long keys are kept. The goals: no error pages, and never more than <b>100</b> queries waiting for the database.",
        sim: { seed: 1 }, goals: { errors: 0, wait: 100 },
        answers: [{ guard: "lock", ttl: "jitter" }, { guard: "early", ttl: "jitter" }],
        why: "With no guard and every key kept exactly 60 s, all 500 run out in the same instant and every shopper asks the database: 45,598 error pages. A random TTL spreads the keys out, but each hot key still gets its own herd: the top product's 2,944 shoppers a second all miss in the 50 ms it takes to refill, and 28,405 error pages go out. A lock lets one shopper refill each key while the rest wait for it, but 500 keys still run out at once, the line fills, and 2,429 get error pages. Refreshing early, with everyone keeping the old copy, has the same problem: 500 refreshes at once, 2,245 error pages. It takes both. A lock, or an early refresh, so each key is filled by one query; and a TTL with a little randomness, so keys don't all run out together. Then there are no error pages and no queries ever wait: 1,000 queries in 150 s, two for each key.",
      },
      {
        id: "cc-fresh", kind: "fresh", title: "Fresh enough",
        lede: "A shop's <b>10,000</b> product pages: <b>50,000</b> reads a second on a Zipf curve, and each price is edited about <b>once an hour</b>. The shop runs on <b>50</b> app servers. Choose where the pages are cached, how long they're kept, and what editing a price does. The goals: at most <b>200</b> reads a second reach the database, and at most <b>0.1%</b> of reads show an old price.",
        goals: { db: 200, stale: 0.001 },
        answers: [{ where: "shared", ttl: 60, edit: "delete" }, { where: "shared", ttl: 600, edit: "delete" }],
        why: "In each app server's memory, every server fills its own copy: kept 10 minutes, that's still 773 reads a second, and deleting on an edit only reaches the server that took it, so 7.6% of reads show an old price. In one shared Redis with only a TTL, it's a trade: kept 10 s, 913 reads a second and 0.14% stale; 60 s, 164 and 0.83% stale; 10 minutes, 17 and 7.9% stale. Delete the key when the price is edited, and no read is older than the last edit, at any TTL. So the TTL can be long: 60 s is 165 reads a second, 10 minutes is 18. With a delete on every edit, the TTL is a safety net for the rare race from the last question, not the way prices get fresh.",
      },
    ],
  };

  // --------------------------------------------------------------------------------------- Splitting data --
  // First principles: when one machine can't hold it all, how to cut the data, how to add a machine without moving
  // everything, and what to do with the hot part. Every number is worked out by tunnel/split.js, and
  // tools/board-check.js checks the text against it.
  const SP_CHAT = {
    nodes: [P("u", "people", 95, 270, { label: "senders", tag: "150,000 a second" }), P("ap", "app", 330, 270, { label: "app servers", tag: "route by key" }),
      P("d1", "sql", 640, 90, { label: "partition 1", tag: "4 TB" }), P("d2", "sql", 640, 210, { label: "partition 2", tag: "4 TB" }),
      P("d3", "sql", 640, 330, { label: "partition 3", tag: "4 TB" }), P("d4", "sql", 640, 450, { label: "partition …", tag: "4 TB" })],
    wires: [["u", "ap"], ["ap", "d1"], ["ap", "d2"], ["ap", "d3"], ["ap", "d4"]],
  };
  const SPLIT_UNIT = {
    id: "split", name: "Splitting data", sub: "Range or hash, rings, and the hot partition", floor: 3,
    w: [
      {
        id: "sp-napkin", kind: "napkin", title: "How many pieces?",
        lede: "A chat app keeps every message: <b>40 TB</b> today, growing <b>2 TB</b> a month. At its peak it writes <b>150,000</b> messages a second. One database machine has <b>4 TB</b> of disk and takes <b>12,000</b> writes a second. Plan for a year from now. Then, when it's time to add a machine, its share of the data has to be copied onto it at <b>200 MB/s</b>.",
        q: {},
        design: SP_CHAT,
        notes: [
          { id: "d", on: "d1", dx: 190, dy: 10, label: "machines to hold a year's data", unit: "", calc: "(40 + 12 * 2) / 4", hint: "today's 40 TB plus 12 months of 2 TB, over 4 TB a machine" },
          { id: "w", on: "ap", dx: -90, dy: -200, label: "machines for the writes", unit: "", calc: "150000 / 12000", hint: "the peak writes over what one machine takes" },
          { id: "h", on: "d4", dx: 190, dy: -30, label: "hours to fill a 17th machine", unit: "h", calc: "(64e6 / 17) / 200 / 3600", hint: "its fair share is 64 TB ÷ 17 = 3.8 TB, which is 3.8 million MB, at 200 MB a second" },
        ],
        why: "A year from now it's 64 TB: 16 machines just to hold it. The writes need 12.5, so here the disk decides, not the writes. And adding a 17th is slow even if you move only its fair share, 64 ÷ 17 = 3.8 TB: 5.2 hours at 200 MB/s. So how you split the keys matters twice over. Hash % N, the obvious way, moves a key unless hash % 16 equals hash % 17, which is 1 time in 17: 60 TB, three and a half days of copying. The next questions are how to cut the data so no one machine gets the hot part, and how to add one without moving everything.",
      },
      {
        id: "sp-key", kind: "pkey", title: "Which key?",
        lede: "A delivery company's <b>10,000</b> vans each send where they are every second. The readings go in one table split over <b>8</b> partitions, and a partition takes at most <b>2,500</b> writes a second. Drivers' screens keep asking for <b>one van's last hour</b>. <b>4,000</b> of the vans belong to one big customer, whose van ids all start with <i>acme-</i>. Tap the partition key you'd pick.",
        answer: "hashvan",
        why: "By time, every van writes into the newest hour, so one partition takes all 10,000 writes a second and seven sit idle. By ranges of van id, Acme's 4,000 vans all land in a–c, with 850 others: 4,850 a second, nearly twice what it can take. A hash of each reading spreads the writes evenly (the busiest takes 1,291), but one van's hour is scattered over all 8, so every driver's screen asks every partition. A hash of the van id spreads the vans too (the busiest takes 1,296) and keeps each van's readings together, in time order, in one partition: its last hour is one read. The price is the other question: the whole fleet's last minute now asks all 8. Pick the key from the question that's asked most. Cassandra and DynamoDB call it a partition key, with a sort key inside it.",
      },
      {
        id: "sp-ring", kind: "ring", title: "Add a server",
        lede: "<b>100,000</b> keys are spread over <b>4</b> cache servers. Each key's hash is a point round a circle, drawn as dots in its server's colour. Drag the pin along the ruler to your guess, then check it.",
        rounds: [
          { ask: "move", scheme: "mod", v: 0, say: "The obvious way: a key goes to server <b>hash % 4</b>. Add a 5th server, so now it's hash % 5. What share of the keys move to a different server?" },
          { ask: "move", scheme: "ring", v: 200, say: "A ring instead: each server sits at <b>200</b> points round the circle, and a key goes to the next point clockwise. Add a 5th. What share of the keys move?" },
          { ask: "max", scheme: "ring", v: 1, say: "Now just <b>one</b> point per server, 5 servers. The fullest server holds what share of the keys?" },
        ],
        why: "With hash % N, a key stays only if hash % 4 equals hash % 5, which happens 1 time in 5: 80% of the keys move, and three quarters of those just shuffle between the old servers. On a ring, each of the new server's points takes the keys just before it, so only the keys it takes move: 20%, the least anything could. With one point each, the shares are as uneven as the points fall: here the fullest server holds 31% and the emptiest 3%. With 200 points each, they even out to between 19% and 21%. That's consistent hashing with virtual nodes, what Cassandra, DynamoDB and most distributed caches do. Redis Cluster gets the same effect another way: 16,384 slots, dealt out to servers and moved a slot at a time.",
      },
    ],
    s: [
      {
        id: "sp-grow", kind: "grow", title: "Grow at the peak",
        lede: "<b>1,000,000</b> logged-in sessions live in a cache on <b>4</b> servers. Every page asks for one: <b>200,000</b> reads a second, spread evenly. A server takes at most <b>60,000</b> a second, so you add a 5th at the peak. A key that moves is missing on its new server until a read fills it from the database, which takes <b>20,000</b> reads a second; past that, reads fail. Choose how keys find their server, and how the new one joins. The goals: no failed reads, and no server over <b>80%</b> busy afterwards.",
        goals: { errors: 0, busy: 0.8 },
        answers: [{ scheme: "ring200", how: "copy" }],
        why: "Hash % N moves 80% of the sessions: 160,000 reads a second miss, eight times what the database takes, and 2,446,990 reads fail. Copying the new server's keys first doesn't save it, because 60% just moved between the old servers: 1,249,750 still fail. A ring with one point per server moves only what the new server takes, but the servers are as uneven as their points: the fullest was doing 67,714 reads a second before you added anything, more than it can. With 200 points each, the load evens out and 20% of the keys move. Switched on at once, those 40,000 misses a second are twice what the database takes, and 49,650 reads fail. Copy its keys over first (2 seconds at 100,000 keys a second), then switch it on: nothing fails, and the busiest server does 41,124 reads a second, 69%.",
      },
      {
        id: "sp-hot", kind: "hotcell", title: "Friday night",
        lede: "A ride app keeps its drivers' locations in <b>16</b> partitions, and each takes at most <b>5,000</b> updates a second. The city is a grid of cells. To find drivers near a rider, the app asks for the rider's cell and the 8 around it. At 9 pm a concert ends, and over a minute <b>24,000</b> more updates a second pile into the streets around the stadium. A partition can split in two, which takes <b>10 s</b>. Choose how drivers are split, and when a partition splits. The goals: no updates dropped, and a nearby search asks at most <b>6</b> partitions.",
        goals: { dropped: 0, search: 6 },
        answers: [{ by: "area", split: 0.5 }],
        why: "Split by area and never split again, and the partition with the stadium in it takes 11,200 updates a second, over twice what it can: 1,776,800 updates are dropped. Split when a partition passes 90% busy, and each split starts too late: the crowd keeps growing for the 10 s a split takes, the halves pass 100%, and 7,135 updates are dropped. Split at 50%, and each half is still under its limit when the split lands: nothing is dropped, 18 splits leave 34 partitions, small ones round the stadium and big ones elsewhere, and a nearby search asks 4.2 partitions at worst. A hash of the driver id spreads the crowd over all 16 at 70% busy, but drivers on one street are now in every partition, so each nearby search asks all 16. Keep neighbours together, and split hot ranges early: Bigtable, HBase and DynamoDB all split by load like this.",
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
    [0, "capacity", "Throughput vs latency", "Capacity and Little's law"],
    [0, "knee", "The queueing knee", "Why 80% busy is full"], [0, "loops", "Threads and event loops", "10,000 slow clients"], [0, "disk", "Memory and disk", "Page cache and fsync"],
    [1, "trip", "A request's trip", "DNS, TCP, TLS, HTTP"], [1, "http", "HTTP, REST and gRPC", "Verbs and idempotency"], [1, "push", "Polling, SSE, WebSockets", "Who opens the connection"],
    [1, "lbs", "Load balancers", "L4 vs L7, health checks"], [1, "cdn", "Proxies and CDNs", "Edge caches and TTLs"],
    [2, "models", "Data models", "Relational, document, graph…"], [2, "indexes", "Indexes", "B-trees and query plans"], [2, "engines", "Storage engines", "B-tree vs LSM"],
    [2, "tx", "Transactions", "Isolation and lost updates"], [2, "blobs", "Blobs and search", "S3 vs a database"], [2, "geo", "Geo data", "Geohash and quadtrees"],
    [3, "copies", "Copies and lag", "Leaders, followers, quorums"], [3, "agree", "Agreeing", "Raft"],
    [3, "time", "Time and order", "Clock skew, vector clocks"], [3, "cap", "Consistency", "CAP and PACELC"], [3, "sagas", "Transactions across services", "2PC, sagas, outbox"], [3, "ids", "Unique IDs", "Snowflake"],
[4, "queues", "Queues", "Backpressure, dead letters"], [4, "streams", "Logs and streams", "Offsets and replay"],
    [4, "stream", "Stream processing", "Windows and late events"], [4, "batch", "Batch processing", "MapReduce and skew"], [4, "limits", "Rate limiting", "Token buckets"], [4, "flows", "Workflows", "Leases and retries"],
    [5, "failure", "Failure", "Timeouts, retries, breakers"], [5, "shed", "Load shedding", "Drop the right requests"], [5, "failover", "Failover", "RPO and RTO"],
    [5, "global", "Going global", "The speed of light"], [5, "deploys", "Deploys", "Canary and flags"], [5, "observe", "Observability", "Metrics, logs, traces"],
    [5, "security", "Security", "Tokens and encryption"], [5, "cost", "Cost", "$ per request"],
    [6, "limiter", "A rate limiter", "A shared counter"], [6, "dcache", "A distributed cache", "Consistent hashing"], [6, "kafka", "Kafka", "Partitions and offsets"],
    [6, "s3", "S3", "Erasure coding"], [6, "elastic", "Elasticsearch", "Scatter-gather"], [6, "etcd", "etcd / ZooKeeper", "Leases and fencing"],
    [6, "lb", "A load balancer", "Draining"], [6, "tsdb", "A time-series DB", "Cardinality"], [6, "gateway", "An API gateway", "Quotas and fan-out"], [6, "vectordb", "A vector database", "HNSW"],
[7, "slack", "Slack / Discord", "Fan-out to big channels", "Talk in real time"], [7, "zoom", "Zoom", "WebRTC and SFUs", "Talk in real time"],
[7, "instagram", "Instagram", "Photos and a feed", "Feeds and social"], [7, "tiktok", "TikTok", "A feed a model makes", "Feeds and social"],
    [7, "reddit", "Reddit", "Votes and hot ranking", "Feeds and social"], [7, "linkedin", "LinkedIn", "Degrees of connection", "Feeds and social"],
[7, "yelp", "Yelp", "Nearby search", "Location"], [7, "doordash", "DoorDash", "Dispatch at dinner rush", "Location"], [7, "maps", "Google Maps", "Tiles and routing", "Location"],
    [7, "netflix", "Netflix", "A CDN inside ISPs", "Media"], [7, "spotify", "Spotify", "Offline caching", "Media"],
    [7, "dropbox", "Dropbox", "Chunks, dedupe, sync", "Files and documents"], [7, "gdocs", "Google Docs", "OT vs CRDT", "Files and documents"], [7, "pastebin", "Pastebin", "Blobs and expiry", "Files and documents"],
    [7, "amazon", "Amazon checkout", "Inventory and sagas", "Money and commerce"],
    [7, "airbnb", "Airbnb", "No double booking", "Money and commerce"], [7, "stripe", "Stripe", "Idempotency, a ledger", "Money and commerce"],
    [7, "exchange", "A stock exchange", "An order book", "Money and commerce"], [7, "wallet", "A digital wallet", "Exactly-once transfers", "Money and commerce"],
    [7, "google", "Google Search", "Crawl, index, rank", "Search and discovery"], [7, "typeahead", "Typeahead", "Top-k in a trie", "Search and discovery"], [7, "crawler", "A web crawler", "Politeness and traps", "Search and discovery"],
    [7, "gmail", "Gmail", "Mailboxes and spam", "Everyday apps"], [7, "calendar", "Google Calendar", "Recurrence and time zones", "Everyday apps"], [7, "github", "GitHub", "Git at scale", "Everyday apps"],
    [7, "judge", "LeetCode", "Sandboxed runs", "Everyday apps"], [7, "notify", "Notifications", "Providers and retries", "Everyday apps"], [7, "adclicks", "Ad click counting", "Exactly-once streams", "Everyday apps"], [7, "topk", "Top-K", "Heavy hitters", "Everyday apps"],
    [8, "llm", "LLM serving", "Batching and the KV cache"], [8, "rag", "RAG", "Embeddings and recall"], [8, "recs", "A recommender", "Millions to 10 in 100 ms"],
    [8, "train", "A training cluster", "Parallelism, checkpoints"], [8, "agents", "An agent platform", "Tools and sandboxes"], [8, "copilot", "An AI coding assistant", "Context under 200 ms"],
  ].map(([floor, id, name, sub, group]) => ({ id, name, sub, floor, group, soon: true }));
  const UNITS = [SNIP_UNIT, REDIS_UNIT, WA_UNIT, UBER_UNIT, TWITTER_UNIT, YOUTUBE_UNIT, TICKET_UNIT, NUMBERS_UNIT, CACHE_UNIT, SPLIT_UNIT];
  const LADDER = [...UNITS, ...SOON].sort((a, b) => a.floor - b.floor);
  // the first real app is the beginner's door: Snip, before the tools
  // the cover drawing for a unit's card: its fullest design
  REDIS_UNIT.cover = REDIS_REF;
  WA_UNIT.cover = WA_REF;
  UBER_UNIT.cover = UB_REF;
  TWITTER_UNIT.cover = TW_REF;
  YOUTUBE_UNIT.cover = YT_REF;
  TICKET_UNIT.cover = TM_REF;
  NUMBERS_UNIT.cover = LN_PAGE;
  CACHE_UNIT.cover = CC_SHOP;
  SPLIT_UNIT.cover = SP_CHAT;
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
