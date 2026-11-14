/* The whiteboard's questions: one product, Snip (a link shortener), grown from one click to counting every click.
   Four kinds:
     follow      tap the parts one click passes through, in order (rounds: a cache hit, a miss, ...)
     napkin      fill the sticky notes on the sketch with back-of-the-envelope numbers (within 1.5x counts)
     bottleneck  traffic is about to climb: tap the part that gives out first, then watch the ramp
     draw        a brief, goals and a budget: change the drawing until 30 s of traffic meets every goal
   Every number here is checked by tools/board-check.js against tunnel/net.js, the simulator the page runs.
   A design: parts {id, kind, x, y, n (machines), size, batch} on a 960 × 540 board, and wires [from, to]. */
(function (root) {
  "use strict";
  const P = (id, kind, x, y, o = {}) => ({ id, kind, x, y, n: 1, ...o });
  const SNIP = { keys: 1000000, zipf: 1, timeout: 2 };

  const BOARDS = [
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

  const API = { BOARDS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SD = API;
})(typeof self !== "undefined" ? self : this);
