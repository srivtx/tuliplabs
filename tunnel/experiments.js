/* Wind Tunnel's experiments, as data. Each live one has:
     system   the server and its load when the page opens (see tunnel/sim.js for every knob)
     crowd    which knob dragging the crowd changes (rate for open load, users for closed), and its range
     predict  a question answered by dragging a pin on that same axis; answer and tol say what counts as close
     task     a goal on the live numbers: the crowd is fixed at task.set, the learner changes the server (task.knobs).
              goal rows are [metric or knob, op, value]. start is what the page opens the task with; reference is one answer.
     quotes   every number the text states, with the setup that produces it, so tools/tunnel-check.js can prove it
              ({zipf: n} is the theoretical share of the hottest n keys; then/window replay a change mid-run)
   Optional: free (knobs you may change before the task; default workers), parts (ghosts you can drag onto the wire),
   names (what to call the server), scatter (the dot chart's axes, when it isn't load against p99), and
   predict.axis (when the guess isn't about the crowd) with predict.tolRatio for a log axis.
   The rest are planned, so the shelf can show what's coming. */
(function (root) {
  "use strict";
  const experiments = [
    {
      id: "wt01", live: true, title: "One server: where does it break?", curve: "knee", law: "capacity = workers ÷ time",
      teaser: "Push more requests at one server and find the point where waiting explodes.",
      system: { mode: "open", rate: 20, workers: 4, service: 0.05, timeout: 10, queueMax: 2000 },
      crowd: { knob: "rate", min: 0, max: 160, step: 1, unit: "requests/s", short: "req/s" },
      brief: "This server has <b>4 workers</b>. Each request takes a worker about <b>50 ms</b>. Requests arrive at random, like real traffic.",
      predict: {
        q: "How many requests per second can it take before waiting explodes?",
        answer: 80, tol: 10,
        reveal: "Each worker finishes about 20 requests a second (1 ÷ 0.05 s), so 4 workers can finish <b>80 a second</b>. That is the server's capacity.",
      },
      explore: "Drag the crowd up slowly. Every second, a dot lands on the chart: the load you sent and how long the slowest 1% waited (p99). Find the bend.",
      why: [
        "Below capacity, most requests find a free worker. Near capacity, a free worker is rare: at <b>60 req/s</b> p99 is about <b>0.35 s</b>, at <b>75</b> about <b>0.8 s</b>, and at <b>80</b> it is <b>seconds</b>. The queue grows faster the closer you get to 100% busy, because random arrivals bunch up and there's no slack to clear them.",
        "Past capacity it gets worse than slow. Clients give up after 10 s, but their requests still use a worker. At <b>90 req/s</b> only about <b>57</b> a second come back in time, fewer than at 80.",
        "Even at light load p99 is about <b>0.23 s</b>, because some requests simply take longer to serve. Only more speed per request moves that floor.",
      ],
      task: {
        title: "Launch day",
        brief: "Launch day brings <b>120 requests a second</b>. Keep p99 under <b>400 ms</b> with no errors. Each worker costs money: the budget is <b>8</b>. Click the server to change its workers.",
        set: { rate: 120 }, knobs: ["workers"], start: { workers: 4 }, reference: { workers: 7 },
        goal: [["p99", "<", 0.4, "p99 under 400 ms"], ["errors", "==", 0, "no errors"], ["workers", "<=", 8, "8 workers or fewer"]],
        done: "7 workers give 140 req/s of capacity for 120 of load: 86% busy. 6 would be exactly 120, 100% busy, and the queue never drains.",
      },
      quotes: [
        { cfg: { rate: 60 }, metric: "p99", value: 0.35, tol: 0.15 },
        { cfg: { rate: 75 }, metric: "p99", value: 0.8, tol: 0.25 },
        { cfg: { rate: 80 }, metric: "p99", min: 2 },
        { cfg: { rate: 90 }, metric: "tput", value: 57, tol: 0.12 },
        { cfg: { rate: 20 }, metric: "p99", value: 0.23, tol: 0.1 },
        { cfg: { rate: 120, workers: 7 }, metric: "util", value: 0.86, tol: 0.03 },
        { cfg: { rate: 120, workers: 6 }, metric: "p99", min: 1 },
      ],
    },
    {
      id: "wt02", live: true, title: "Users aren't requests", curve: "little", law: "Little's law",
      teaser: "Real people pause between clicks. How many of them can one server carry?",
      system: { mode: "closed", users: 100, think: 5, workers: 4, service: 0.05, timeout: 10, queueMax: 2000 },
      crowd: { knob: "users", min: 0, max: 800, step: 5, unit: "users", short: "users" },
      brief: "The same server: <b>4 workers</b>, <b>50 ms</b> a request, so <b>80 req/s</b> at most. But now the crowd is <b>people</b>. Each one reads for about <b>5 s</b>, clicks, waits for the page, and reads again.",
      predict: {
        q: "How many people can use it at once before pages get slow?",
        answer: 404, tol: 45,
        reveal: "Little's law: people = requests per second × time per cycle. A cycle is 5 s reading plus 0.05 s waiting, so 80 req/s carries <b>80 × 5.05 ≈ 404 people</b>.",
      },
      explore: "Drag the crowd up. Each dot is the number of people and their p99 wait. Watch the throughput chart too: it stops climbing at 80.",
      why: [
        "People aren't requests. 100 people reading for 5 s send only about <b>20 req/s</b>. That is why a site can have thousands of users online and a modest server.",
        "Past about 400 people, throughput can't grow. Little's law still holds, so the wait grows instead. At <b>600 people</b> the mean wait is about <b>2.5 s</b>: 600 ÷ 80 − 5 = 2.5.",
        "So size servers by requests per second, and turn users into requests with their think time: 600 people ÷ 5.05 s ≈ <b>119 req/s</b>.",
      ],
      task: {
        title: "Sold out",
        brief: "Sales sold <b>600 seats</b>. Keep p99 under <b>400 ms</b> with no errors, on a budget of <b>8 workers</b>. Click the server to change its workers.",
        set: { users: 600 }, knobs: ["workers"], start: { workers: 4 }, reference: { workers: 7 },
        goal: [["p99", "<", 0.4, "p99 under 400 ms"], ["errors", "==", 0, "no errors"], ["workers", "<=", 8, "8 workers or fewer"]],
        done: "600 people at 5 s each send about 119 req/s, almost exactly launch day's 120. The same 7 workers carry it, and that's no coincidence.",
      },
      quotes: [
        { cfg: { users: 100 }, metric: "tput", value: 20, tol: 0.05 },
        { cfg: { users: 600 }, metric: "mean", value: 2.5, tol: 0.1 },
        { cfg: { users: 600 }, metric: "tput", value: 80, tol: 0.03 },
        { cfg: { users: 600, workers: 7 }, metric: "tput", value: 119, tol: 0.03 },
        { cfg: { users: 600, workers: 7 }, metric: "p99", max: 0.4 },
        { cfg: { users: 600, workers: 6 }, metric: "p99", min: 0.4 },
      ],
    },
    {
      id: "wt03", live: true, title: "Scale out", curve: "split", law: "load balancing",
      teaser: "Three servers behind a load balancer, and one of them is slow. Round robin finds out the hard way.",
      system: { mode: "open", rate: 40, servers: 3, workers: 4, service: 0.05, slow: 3, lb: "rr", timeout: 10, queueMax: 2000 },
      crowd: { knob: "rate", min: 0, max: 300, step: 5, unit: "requests/s", short: "req/s" },
      free: ["servers", "lb"], parts: ["server"],
      brief: "One server tops out at <b>80 req/s</b>. You bought two more and put a <b>load balancer</b> in front that hands each request to the next server in turn: <b>round robin</b>. Server 1 is an older machine: each request takes it <b>3× longer</b>.",
      predict: {
        q: "Three servers now. How many requests per second before waiting explodes?",
        answer: 80, tol: 12, theory: "rr",
        reveal: "Round robin gives every server a third of the traffic, whatever its speed. Server 1 finishes only 4 ÷ 0.15 s ≈ <b>27 a second</b>, so it drowns once a third of the load passes 27: at <b>80 req/s</b>. Three servers, and the capacity of one.",
      },
      explore: "Push the crowd and watch server 1's queue grow while the others idle. Then click the balancer's policy to change it, or drag a spare server from the parts onto the wire.",
      why: [
        "With round robin, p99 is already about <b>0.6 s</b> at 60 req/s, and past <b>80</b> server 1's queue never drains while the other two still have room.",
        "<b>Least connections</b> sends each request to the server with the fewest in flight. Slow server 1 stays busy longer, so it simply gets fewer. At <b>120 req/s</b> p99 stays under half a second, and the ceiling becomes the sum of the speeds: 80 + 80 + 27 ≈ <b>187</b>. Push to <b>200</b> and even least connections drowns.",
        "Adding servers to round robin barely helps: with four, server 1 still gets a quarter of the traffic, and at <b>120 req/s</b> that's 30 a second, more than its 27. A balancer that can't see load is only as fast as its slowest machine.",
      ],
      task: {
        title: "Launch week",
        brief: "Launch week brings <b>180 requests a second</b>. Keep p99 under <b>500 ms</b> with no errors, on a budget of <b>4 servers</b>. Server 1 stays: it's paid for. Drag a server onto the wire to add one; click the balancer to change how it picks.",
        set: { rate: 180 }, knobs: ["servers", "lb"], start: { servers: 3, lb: "rr" }, reference: { servers: 4, lb: "least" },
        goal: [["p99", "<", 0.5, "p99 under 500 ms"], ["errors", "==", 0, "no errors"], ["servers", "<=", 4, "4 servers or fewer"]],
        done: "Least connections over four servers has 80 + 80 + 80 + 27 ≈ 267 req/s of capacity for 180. Round robin over the same four would still hand server 1 45 a second, and drown it.",
      },
      quotes: [
        { cfg: { rate: 60 }, metric: "p99", value: 0.6, tol: 0.15 },
        { cfg: { rate: 90 }, metric: "p99", min: 5 },
        { cfg: { rate: 70 }, metric: "p99", max: 1.2 },
        { cfg: { rate: 120, lb: "least" }, metric: "p99", max: 0.5 },
        { cfg: { rate: 200, lb: "least" }, metric: "p99", min: 2 },
        { cfg: { rate: 120, servers: 4 }, metric: "p99", min: 2 },
        { cfg: { rate: 180, servers: 4 }, metric: "p99", min: 2 },
        { cfg: { rate: 180, servers: 3, lb: "least" }, metric: "p99", min: 0.5 },
      ],
    },
    {
      id: "wt04", live: true, title: "Cache it", curve: "cache", law: "Zipf's law",
      teaser: "A few keys get most of the reads. How small can a cache be and still save the database?",
      system: { mode: "open", rate: 60, servers: 1, workers: 4, service: 0.05, timeout: 10, queueMax: 2000, cache: 0, keys: 10000, zipf: 1 },
      crowd: { knob: "rate", min: 0, max: 300, step: 5, unit: "reads/s", short: "reads/s" },
      names: { server: "database" }, free: ["cache"], parts: ["cache"],
      scatter: { x: "cache", log: true, min: 10, max: 10000, y: "hit", ymax: 1, label: "hit rate against cache size" },
      brief: "The <b>database</b> answers a read in <b>50 ms</b> with 4 workers: <b>80 reads a second</b> at most. It holds <b>10,000</b> keys, but reads aren't spread evenly: a few keys are hot, most are rarely read.",
      predict: {
        q: "Traffic will reach 150 reads a second. How many keys must a cache in front hold to keep the database afloat?",
        axis: { knob: "cache", min: 10, max: 10000, log: true, short: "keys" },
        answer: 250, tolRatio: 1.6, theory: "cache", atLoad: 150,
        reveal: "The database can take 80 of the 150 reads, so the cache must answer the other 70: <b>47%</b> of reads. A cache of about <b>250 keys</b>, just 2.5% of them, does it.",
      },
      explore: "Drag the cache from the parts onto the wire, click it to change its size, and push the crowd to 150. Each steady second puts a dot: cache size against hit rate. The dashed line is the hit rate the database needs at the load you're sending.",
      why: [
        "That's <b>Zipf's law</b>: the k-th most read key is read about 1/k as often as the hottest. So the hottest <b>1%</b> of keys get <b>53%</b> of all reads. An LRU cache of that size catches less, about <b>35%</b>, because a key read once still pushes a hot one out.",
        "Each doubling of the cache adds about the same few points: <b>500</b> keys catch about <b>59%</b>, <b>1,000</b> about <b>68%</b>, <b>2,000</b> about <b>77%</b>. Hit rate grows with the log of the size, so the first keys are worth the most.",
        "A cache only helps once it's warm, and it warms only as fast as the database answers. Add a small one to a database that's already drowning and the backlog may never drain. Turn the crowd down, let it recover, then push again.",
      ],
      task: {
        title: "Black Friday",
        brief: "Black Friday brings <b>250 reads a second</b>. The cache is warm but holds only <b>300 keys</b>. Keep p99 under <b>400 ms</b> with no errors. The cache machine has RAM for <b>2,000 keys</b>. Click the cache to resize it.",
        set: { rate: 250, warm: true }, knobs: ["cache"], start: { cache: 300 }, reference: { cache: 2000 },
        goal: [["p99", "<", 0.4, "p99 under 400 ms"], ["errors", "==", 0, "no errors"], ["cache", "<=", 2000, "2,000 keys or fewer"]],
        done: "A warm cache of 2,000 keys answers about 77% of reads, so the database sees about 58 a second of the 250 and is 72% busy. The database itself didn't change at all.",
      },
      quotes: [
        { zipf: 100, value: 0.53, tol: 0.02 },
        { cfg: { rate: 150, cache: 100 }, metric: "hit", value: 0.35, tol: 0.08 },
        { cfg: { rate: 150, cache: 500 }, metric: "hit", value: 0.59, tol: 0.04 },
        { cfg: { rate: 150, cache: 1000 }, metric: "hit", value: 0.68, tol: 0.04 },
        { cfg: { rate: 150, cache: 2000 }, metric: "hit", value: 0.77, tol: 0.04 },
        { cfg: { rate: 150, cache: 250, warm: true }, metric: "hit", min: 0.47 },
        { cfg: { rate: 250, cache: 2000, warm: true }, metric: "misses", value: 58, tol: 0.05 },
        { cfg: { rate: 250, cache: 2000, warm: true }, metric: "util", value: 0.72, tol: 0.05 },
        // the trap: drowning first, then a 250-key cache at 20 s, and two minutes later it still hasn't recovered
        { cfg: { rate: 150, cache: 0 }, then: { at: 20, set: { cache: 250 } }, window: [110, 140], metric: "p99", min: 2 },
      ],
    },
    { id: "wt05", title: "The database is the bottleneck", curve: "lag", law: "replication lag", teaser: "Read replicas take the reads. Writes still go to one place." },
    { id: "wt06", title: "Queues absorb bursts", curve: "burst", law: "backpressure", teaser: "Put a queue between the web and the workers and watch a spike flatten." },
    { id: "wt07", title: "Retry storms", curve: "storm", law: "metastable failure", teaser: "Retries turn a blip into an outage that won't end. Then fix it with backoff and jitter." },
    { id: "wt08", title: "Rate limits", curve: "bucket", law: "token bucket", teaser: "Say no early, so the requests you accept stay fast." },
    { id: "wt09", title: "Sharding and hot keys", curve: "hot", law: "skew", teaser: "Split the data across servers, then watch one celebrity melt a shard." },
    { id: "wt10", title: "Distance", curve: "far", law: "speed of light", teaser: "A round trip to the other side of the world costs time no server can win back." },
    { id: "wt11", title: "Split brain", curve: "cap", law: "CAP", teaser: "Cut the network between two data centres. Stay up, or stay correct?" },
    { id: "wt12", title: "Design review", curve: "review", law: "SLOs and budgets", teaser: "A URL shortener, a chat app and a feed, each with a target and a budget." },
  ];
  root.WT = { experiments };
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined") module.exports = globalThis.WT || window.WT;
