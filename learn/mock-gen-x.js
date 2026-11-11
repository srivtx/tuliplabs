/* Tulip Labs: fresh "trace it" questions for the mock tests of every track but DSA (that's learn/mock-gen.js).
   Same shape as there: each generator makes a short program from fresh random data, and works out what it
   prints here in JavaScript. A question may say lang "node" (checked in real Node, and with real Express),
   or lang "sql" with a Python "run" program that feeds the query to real SQLite. tools/mock-check.js runs
   every one, hundreds of times each. */
(function (root) {
  "use strict";
  const G = typeof module === "object" && module.exports ? require("./mock-gen.js") : root.MOCKGEN;

  const pyList = (a) => "[" + a.map((x) => (typeof x === "string" ? `'${x}'` : String(x))).join(", ") + "]";
  const ints = (r, n, lo, hi) => Array.from({ length: n }, () => r.int(lo, hi));
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  // Python's Fraction, printed the way Python prints it
  const frac = (p, q) => { if (q < 0) { p = -p; q = -q; } const g = gcd(p, q) || 1; p /= g; q /= g; return q === 1 ? String(p) : `${p}/${q}`; };
  const pyDict = (entries) => "{" + entries.map(([k, v]) => `'${k}': ${typeof v === "string" ? `'${v}'` : v}`).join(", ") + "}";
  const NAMES = ["ana", "bo", "cy", "di", "ed"];
  const comb = (n, k) => { let x = 1; for (let i = 1; i <= k; i++) x = (x * (n - k + i)) / i; return Math.round(x); };

  // ---------------------------------------------------------------- Build your own X --
  G.add("bx", {
    // ch 1: objects, classes and inheritance
    objects(r) {
      const v = r.int(0, 2);
      if (v === 0) {
        const s1 = r.pick(["woof", "arf", "yip"]), base = r.pick(["...", "hm", "?"]), bang = r.pick(["!", "!!"]), n1 = r.pick(["Rex", "Max", "Bo"]), n2 = r.pick(["Ivy", "Pip", "Dot"]);
        const override = r.next() < 0.5;
        const puppy = (override ? `${n1} says ${s1}` : `${n1} says ${s1}`) + bang;
        return {
          ch: 1, title: "Who answers?", prompt: "<p>What does it print?</p>",
          code: `class Animal:\n    sound = "${base}"\n    def __init__(self, name):\n        self.name = name\n    def speak(self):\n        return f"{self.name} says {self.sound}"\n\nclass Dog(Animal):\n    sound = "${s1}"\n\nclass Puppy(Dog):\n    def speak(self):\n        return super().speak() + "${bang}"\n\nprint(Puppy("${n1}").speak())\nprint(Animal("${n2}").speak())`,
          answer: `${puppy}\n${n2} says ${base}`,
          why: `<p>Python looks a name up on the object first, then its class, then each parent in turn. <code>Puppy</code> has no <code>sound</code>, so <code>self.sound</code> finds Dog's "${s1}", even inside Animal's method. <code>super().speak()</code> runs the parent's version, and Puppy adds "${bang}" to it.</p>`,
        };
      }
      if (v === 1) {
        const fixed = r.next() < 0.4, a = r.int(1, 3), b = r.int(1, 3);
        const la = fixed ? a : a + b, lb = fixed ? b : a + b;
        return {
          ch: 1, title: "Whose list is it?", prompt: "<p>What does it print?</p>",
          code: `class Cart:\n    items = []\n` + (fixed ? `    def __init__(self):\n        self.items = []\n` : "") + `    def add(self, x):\n        self.items.append(x)\n\nmine, yours = Cart(), Cart()\nfor i in range(${a}):\n    mine.add(i)\nfor i in range(${b}):\n    yours.add(i)\nprint(len(mine.items), len(yours.items))`,
          answer: `${la} ${lb}`,
          why: fixed ? "<p><code>__init__</code> gives every cart its own list, which hides the class's shared one. Each cart counts only its own items.</p>"
            : "<p><code>items = []</code> in the class body is one list, shared by every Cart. <code>append</code> changes that list in place, so both carts see all the items. Make it per object in <code>__init__</code>.</p>",
        };
      }
      const k = r.int(2, 4), viaSelf = r.next() < 0.5;
      return {
        ch: 1, title: "Counting instances", prompt: "<p>What does it print?</p>",
        code: `class Ticket:\n    made = 0\n    def __init__(self):\n        ${viaSelf ? "self.made += 1" : "Ticket.made += 1"}\n\ntickets = [Ticket() for _ in range(${k})]\nprint(Ticket.made, tickets[-1].made)`,
        answer: viaSelf ? "0 1" : `${k} ${k}`,
        why: viaSelf ? "<p><code>self.made += 1</code> reads the class's 0, then <i>writes</i> 1 onto the object, a new instance attribute. The class's counter never moves.</p>"
          : `<p><code>Ticket.made += 1</code> changes the class's own attribute, which every ticket reads through: ${k} and ${k}.</p>`,
      };
    },
    // ch 6: replaying an append-only log
    kvLog(r) {
      const keys = ["a", "b", "c"], log = [];
      const n = r.int(6, 8);
      for (let i = 0; i < n; i++) log.push(r.next() < 0.7 || !log.length ? `SET ${r.pick(keys)} ${r.int(1, 9)}` : `DEL ${r.pick(keys)}`);
      const db = new Map();
      for (const l of log) { const [op, k, v] = l.split(" "); if (op === "SET") db.set(k, v); else db.delete(k); }
      return {
        ch: 6, title: "Replay the log", prompt: "<p>The database restarts and rebuilds itself from its log. What does it print?</p>",
        code: `log = ${pyList(log)}\ndb = {}\nfor line in log:\n    op, key, *val = line.split()\n    if op == "SET":\n        db[key] = val[0]\n    else:\n        db.pop(key, None)\nprint(db, len(log) - len(db))`,
        answer: `${pyDict([...db.entries()])} ${log.length - db.size}`,
        why: `<p>Replaying every line in order rebuilds the latest value of each key; a <code>DEL</code> removes it (and a key set again after that comes back at the end of the dict). Compaction would keep only the ${db.size} live line${db.size === 1 ? "" : "s"}, dropping ${log.length - db.size}.</p>`,
      };
    },
    // ch 7: a query on a small table, run by real SQLite
    sql(r) {
      const drinks = ["latte", "mocha", "tea"];
      const rows = Array.from({ length: 7 }, (_, i) => [i + 1, r.pick(NAMES.slice(0, 4)), r.pick(drinks), r.int(2, 6)]);
      const cities = { ana: "Oslo", bo: "Pune", cy: "Oslo" };
      const v = r.int(0, 3);
      let sqlText, out;
      const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      if (v === 0) {
        const P = r.pick(rows)[3];
        sqlText = `SELECT name, price FROM orders\nWHERE price >= ${P}\nORDER BY price DESC, id\nLIMIT 3;`;
        out = rows.filter((x) => x[3] >= P).sort((a, b) => b[3] - a[3] || a[0] - b[0]).slice(0, 3).map((x) => `${x[1]} ${x[3]}`);
      } else if (v === 1) {
        sqlText = `SELECT name, SUM(price) FROM orders\nGROUP BY name\nORDER BY SUM(price) DESC, name;`;
        const s = {}; for (const x of rows) s[x[1]] = (s[x[1]] || 0) + x[3];
        out = Object.entries(s).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([k, t]) => `${k} ${t}`);
      } else if (v === 2) {
        sqlText = `SELECT drink, COUNT(*) FROM orders\nGROUP BY drink\nHAVING COUNT(*) >= 2\nORDER BY drink;`;
        const c = {}; for (const x of rows) c[x[2]] = (c[x[2]] || 0) + 1;
        out = Object.entries(c).filter(([, n]) => n >= 2).sort((a, b) => cmp(a[0], b[0])).map(([k, n]) => `${k} ${n}`);
      } else {
        sqlText = `SELECT c.city, COUNT(*) FROM orders o\nJOIN customers c ON o.name = c.name\nGROUP BY c.city\nORDER BY c.city;`;
        const c = {}; for (const x of rows) if (cities[x[1]]) c[cities[x[1]]] = (c[cities[x[1]]] || 0) + 1;
        out = Object.entries(c).sort((a, b) => cmp(a[0], b[0])).map(([k, n]) => `${k} ${n}`);
      }
      if (!out.length) return GENS_BX.sql(r);
      const table = `-- orders (id, name, drink, price)\n` + rows.map((x) => `--   ${x.join(" | ")}`).join("\n") + (v === 3 ? `\n-- customers (name, city)\n` + Object.entries(cities).map(([n, c]) => `--   ${n} | ${c}`).join("\n") : "");
      return {
        ch: 7, title: "What does the query return?", lang: "sql", prompt: "<p>What rows come back? Type each row's values, one row per line.</p>",
        code: table + "\n\n" + sqlText,
        run: `import sqlite3\ndb = sqlite3.connect(":memory:")\ndb.execute("CREATE TABLE orders (id INTEGER, name TEXT, drink TEXT, price INTEGER)")\ndb.execute("CREATE TABLE customers (name TEXT, city TEXT)")\ndb.executemany("INSERT INTO orders VALUES (?, ?, ?, ?)", ${JSON.stringify(rows)})\ndb.executemany("INSERT INTO customers VALUES (?, ?)", ${JSON.stringify(Object.entries(cities))})\nfor row in db.execute(${JSON.stringify(sqlText)}):\n    print(*row)`,
        answer: out.join("\n"),
        why: [
          "<p>WHERE keeps the rows first, ORDER BY sorts what's left (price high to low, then by id for a tie), and LIMIT cuts it to 3.</p>",
          "<p>GROUP BY makes one row per name; SUM adds the prices inside each group. Then the groups are sorted by their totals.</p>",
          "<p>HAVING is WHERE for groups: it runs after the counting, so it can test <code>COUNT(*)</code>. WHERE can't.</p>",
          `<p>An inner JOIN keeps only the orders whose name has a customers row: ${NAMES.slice(0, 4).filter((n) => !cities[n]).join(" and ")}'s orders drop out. Then each city is counted.</p>`,
        ][v],
      };
    },
    // ch 10: which route answers
    routes(r) {
      const meFirst = r.next() < 0.5;
      const routes = r.shuffle([["/users/<id>/posts", "posts"], ["/health", "health"]]);
      routes.splice(r.int(0, 2), 0, ...(meFirst ? [["/users/me", "me"], ["/users/<id>", "user"]] : [["/users/<id>", "user"], ["/users/me", "me"]]));
      const paths = r.shuffle(["/users/me", `/users/${r.int(2, 99)}`, `/users/${r.int(2, 99)}/posts`, "/users", "/health"]).slice(0, 3);
      const match = (p, path) => { const a = p.split("/"), b = path.split("/"); if (a.length !== b.length) return null; const params = []; for (let i = 0; i < a.length; i++) { if (a[i].startsWith("<")) params.push([a[i].slice(1, -1), b[i]]); else if (a[i] !== b[i]) return null; } return params; };
      const out = paths.map((path) => { for (const [p, name] of routes) { const m = match(p, path); if (m) return `${name} ${pyDict(m)}`; } return "404 {}"; });
      return {
        ch: 10, title: "Which route answers?", prompt: "<p>What does it print?</p>",
        code: `routes = [\n${routes.map(([p, n]) => `    ("${p}", "${n}"),`).join("\n")}\n]\ndef match(pattern, path):\n    p, q = pattern.split("/"), path.split("/")\n    if len(p) != len(q):\n        return None\n    params = {}\n    for a, b in zip(p, q):\n        if a.startswith("<"):\n            params[a[1:-1]] = b\n        elif a != b:\n            return None\n    return params\ndef route(path):\n    for pattern, name in routes:\n        params = match(pattern, path)\n        if params is not None:\n            return name, params\n    return "404", {}\nfor path in ${pyList(paths)}:\n    print(*route(path))`,
        answer: out.join("\n"),
        why: `<p>Routes are tried top to bottom and the first match wins, so order matters: ${meFirst ? "<code>/users/me</code> comes before <code>/users/&lt;id&gt;</code>, so \"me\" gets its own handler" : "<code>/users/&lt;id&gt;</code> comes first, so it swallows <code>/users/me</code> with id = \"me\". Put the fixed route first"}. A pattern only matches a path with the same number of parts.</p>`,
      };
    },
    // ch 25: an LRU cache
    lru(r) {
      const cap = r.int(2, 3), seq = Array.from({ length: 9 }, () => r.pick("abcde".split(""))).join("");
      const c = []; let hits = 0;
      for (const k of seq) { const i = c.indexOf(k); if (i >= 0) { hits++; c.splice(i, 1); c.push(k); } else { c.push(k); if (c.length > cap) c.shift(); } }
      return {
        ch: 25, title: "Least recently used", prompt: "<p>What does it print?</p>",
        code: `from collections import OrderedDict\ncache, cap, hits = OrderedDict(), ${cap}, 0\nfor k in "${seq}":\n    if k in cache:\n        hits += 1\n        cache.move_to_end(k)\n    else:\n        cache[k] = True\n        if len(cache) > cap:\n            cache.popitem(last=False)\nprint(hits, "".join(cache))`,
        answer: `${hits} ${c.join("")}`,
        why: `<p>The OrderedDict keeps keys from least to most recently used. A hit moves the key to the end; a miss adds it at the end and, past ${cap} keys, throws out the one at the front, the key unused for longest.</p>`,
      };
    },
    // ch 25: consistent hashing
    ring(r) {
      const pos = [...new Set(ints(r, 3, 5, 95))]; while (pos.length < 3) pos.push(pos[pos.length - 1] + 1);
      const nodes = pos.sort((a, b) => a - b).map((p, i) => [p, "ABC"[i]]);
      const keys = ints(r, 6, 0, 99), gone = r.pick(["A", "B", "C"]);
      const owner = (ring, k) => { for (const [p, n] of ring) if (p >= k) return n; return ring[0][1]; };
      const before = keys.map((k) => owner(nodes, k)), rest = nodes.filter((x) => x[1] !== gone), after = keys.map((k) => owner(rest, k));
      const moved = before.filter((b, i) => b !== after[i]).length;
      return {
        ch: 25, title: "Who owns each key?", prompt: `<p>Servers sit on a ring of positions 0 to 99; each key belongs to the first server at or after it, wrapping round. Then server ${gone} leaves. What does it print?</p>`,
        code: `ring = ${pyList(nodes.map((x) => `(${x[0]}, "${x[1]}")`)).replace(/'/g, "")}\ndef owner(k):\n    for pos, name in ring:\n        if pos >= k:\n            return name\n    return ring[0][1]\nkeys = ${pyList(keys)}\nbefore = [owner(k) for k in keys]\nring = [n for n in ring if n[1] != "${gone}"]\nafter = [owner(k) for k in keys]\nprint("".join(before), sum(a != b for a, b in zip(before, after)))`,
        answer: `${before.join("")} ${moved}`,
        why: `<p>Only ${gone}'s keys move when ${gone} leaves, and they go to the next server round the ring: ${moved} of ${keys.length}. With <code>hash % n</code> instead, changing n would move almost every key.</p>`,
      };
    },
    // ch 35: matching a buy order
    orderBook(r) {
      const asks = [...new Set(ints(r, 4, 100, 110))].sort((a, b) => a - b).map((p) => [p, r.int(1, 5)]);
      const Q = r.int(3, 10), L = r.int(asks[0][0], asks[asks.length - 1][0]);
      const fills = []; let want = Q;
      for (const [p, q] of asks) { if (p > L || !want) break; const t = Math.min(q, want); fills.push(`${p} ${t}`); want -= t; }
      return {
        ch: 35, title: "Fill the order", prompt: `<p>A buy order for ${Q} shares, paying at most ${L}, meets the sellers' side of the book. What does it print?</p>`,
        code: `asks = ${pyList(asks.map((a) => `(${a[0]}, ${a[1]})`)).replace(/'/g, "")}  # (price, shares), cheapest first\nwant, limit = ${Q}, ${L}\nfor price, shares in asks:\n    if price > limit or want == 0:\n        break\n    take = min(shares, want)\n    print(price, take)\n    want -= take\nprint("left", want)`,
        answer: fills.concat(`left ${want}`).join("\n"),
        why: "<p>Price priority: the cheapest seller fills first, then the next. The order stops at its limit price, and whatever isn't filled rests on the book as a bid.</p>",
      };
    },
    // ch 37: retries with exponential backoff
    backoff(r) {
      const base = r.pick([100, 200, 250]), cap = r.pick([1000, 2000, 3000]), n = r.int(4, 7);
      const d = Array.from({ length: n }, (_, i) => Math.min(cap, base * 2 ** i));
      return {
        ch: 37, title: "Backing off", prompt: "<p>A job keeps failing. What does it print?</p>",
        code: `base, cap = ${base}, ${cap}  # milliseconds\nwaits = [min(cap, base * 2 ** attempt) for attempt in range(${n})]\nprint(waits, sum(waits))`,
        answer: `${pyList(d)} ${d.reduce((a, b) => a + b, 0)}`,
        why: `<p>Each retry waits twice as long as the last, up to a cap, so a struggling service gets room to recover instead of a stampede. Real systems add random jitter too, so thousands of clients don't all retry at the same moment.</p>`,
      };
    },
    // ch 37: queues and workers, on the back of an envelope
    capacity(r) {
      const workers = r.int(2, 8), service = r.pick([20, 25, 40, 50, 100]), cap = (workers * 1000) / service;
      const lam = r.int(Math.round(cap * 0.4), Math.round(cap * 1.2)), latency = r.pick([100, 200, 300, 500]);
      const util = Math.floor((lam * 100) / cap), inflight = Math.floor((lam * latency) / 1000);
      return {
        ch: 37, title: "Will it keep up?", prompt: "<p>Back-of-the-envelope maths for a pool of workers. What does it print?</p>",
        code: `workers = ${workers}\nservice_ms = ${service}     # one job's work time\narrivals = ${lam}         # jobs a second\ncapacity = workers * 1000 // service_ms\nutilisation = arrivals * 100 // capacity\nlatency_ms = ${latency}\nin_flight = arrivals * latency_ms // 1000   # Little's law: L = λW\nprint(capacity, utilisation, in_flight)`,
        answer: `${cap} ${util} ${inflight}`,
        why: `<p>${workers} workers at ${service} ms a job finish ${cap} jobs a second. ${lam} arriving is ${util}% busy${util >= 100 ? ": more than it can do, so the queue grows without end" : util >= 80 ? ": past about 80% the queue, and the wait, climb steeply" : ""}. Little's law: jobs in the system = arrival rate × time each spends there = ${inflight}.</p>`,
      };
    },
    // ch 38: double-entry bookkeeping
    ledger(r) {
      const acct = ["cash", "ana", "bo"], bal = { cash: 0, ana: 0, bo: 0 };
      const moves = [["cash", "ana", r.int(5, 20)], ["cash", "bo", r.int(5, 20)]];
      for (let i = 0; i < 4; i++) { const a = r.pick(["ana", "bo"]); moves.push([a, a === "ana" ? "bo" : "ana", r.int(1, 15)]); }
      let rejected = 0;
      for (const [f, t, x] of moves) { if (f !== "cash" && bal[f] < x) { rejected++; continue; } bal[f] -= x; bal[t] += x; }
      return {
        ch: 38, title: "Balance the books", prompt: "<p>Every transfer is two entries: money leaves one account and lands in another. What does it print?</p>",
        code: `balance = {"cash": 0, "ana": 0, "bo": 0}\nrejected = 0\nfor frm, to, amount in ${pyList(moves.map((m) => `("${m[0]}", "${m[1]}", ${m[2]})`)).replace(/'/g, "")}:\n    if frm != "cash" and balance[frm] < amount:\n        rejected += 1\n        continue\n    balance[frm] -= amount\n    balance[to] += amount\nprint(balance["ana"], balance["bo"], rejected, sum(balance.values()))`,
        answer: `${bal.ana} ${bal.bo} ${rejected} 0`,
        why: `<p>Customers can't go below zero, so a transfer bigger than the balance is refused (${rejected} here). The money comes from the bank's own cash account, which goes negative. Because every transfer takes and gives the same amount, the accounts always add up to exactly 0: that's the check double-entry gives you for free.</p>`,
      };
    },
    // ch 39: never charge twice
    idempotency(r) {
      const reqs = [];
      for (let i = 0; i < 6; i++) {
        if (reqs.length && r.next() < 0.45) { const old = r.pick(reqs); reqs.push([old[0], r.next() < 0.75 ? old[1] : old[1] + 5]); }
        else reqs.push([`k${reqs.length + 1}`, r.int(5, 30)]);
      }
      const seen = {}, out = []; let charged = 0;
      for (const [k, a] of reqs) { if (!(k in seen)) { seen[k] = a; charged += a; out.push("charged"); } else out.push(seen[k] === a ? "replay" : "conflict"); }
      return {
        ch: 39, title: "Never charge twice", prompt: "<p>Phones retry when the network drops, so the server sees some payments twice. What does it print?</p>",
        code: `seen = {}\ncharged = 0\nfor key, amount in ${pyList(reqs.map((x) => `("${x[0]}", ${x[1]})`)).replace(/'/g, "")}:\n    if key not in seen:\n        seen[key] = amount\n        charged += amount\n        print("charged", end=" ")\n    elif seen[key] == amount:\n        print("replay", end=" ")\n    else:\n        print("conflict", end=" ")\nprint(charged)`,
        answer: `${out.join(" ")} ${charged}`,
        why: "<p>The client makes one idempotency key per payment and sends it with every retry. The first request with a key charges; a retry with the same key and amount just gets the saved result back; the same key with a different amount is a bug in the client, so it's refused (HTTP 409).</p>",
      };
    },
    // ch 20: quorums
    quorum(r) {
      const n = r.pick([3, 5, 7]), W = r.int(1, n), R = r.int(1, n);
      return {
        ch: 20, title: "Enough votes?", prompt: `<p>${n} replicas. A write waits for W of them to say yes, a read asks R of them. What does it print?</p>`,
        code: `n, W, R = ${n}, ${W}, ${R}\nmajority = n // 2 + 1\nsurvives = n - majority      # failures a majority still survives\nprint(majority, survives, W + R > n)`,
        answer: `${Math.floor(n / 2) + 1} ${n - Math.floor(n / 2) - 1} ${W + R > n ? "True" : "False"}`,
        why: `<p>A majority of ${n} is ${Math.floor(n / 2) + 1}, so the cluster keeps working with ${n - Math.floor(n / 2) - 1} down; that's why clusters have an odd size. Any two majorities overlap. In the same way, if W + R &gt; n, every read set shares at least one replica with every write set, so a read always reaches someone who has the latest write. Here ${W} + ${R} ${W + R > n ? "&gt;" : "≤"} ${n}.</p>`,
      };
    },
    // ch 51: the right status code
    status(r) {
      const CASES = [["A sign-up body is missing its email field", 400], ["The email is already taken by another account", 409], ["The password is wrong", 401], ["Signed in, but asking for the admin page without being an admin", 403],
        ["A new account was made", 201], ["There's no user with that id", 404], ["The 6th login try in a minute", 429], ["The database is down", 500]];
      const [text, code] = r.pick(CASES);
      const all = [400, 401, 403, 404, 409, 429, 201, 500];
      const opts = r.shuffle([code, ...r.shuffle(all.filter((c) => c !== code)).slice(0, 3)]).map((c) => ({ t: String(c), ok: c === code }));
      const NAME = { 400: "Bad Request: the body itself is wrong", 401: "Unauthorized, which really means not authenticated: we don't know who you are", 403: "Forbidden: we know who you are, and you can't", 404: "Not Found", 409: "Conflict with what's already there", 429: "Too Many Requests: slow down", 201: "Created", 500: "the server's fault, not the client's" };
      return {
        ch: 51, title: "Which status code?", match: "choice", opts,
        prompt: `<p>${text}. Which status should the API answer with?</p>`,
        code: `STATUS = {\n${CASES.map(([t, c]) => `    ${JSON.stringify(t)}: ${c},`).join("\n")}\n}\nprint(STATUS[${JSON.stringify(text)}])`, lang: "py", hide: true,
        answer: String(code),
        why: `<p><b>${code}</b> is ${NAME[code]}. 4xx means the client should change something before trying again; 5xx means the server failed.</p>`,
      };
    },
    // ch 50: the order Node runs things in
    eventLoop(r) {
      let L = 0;
      const next = () => "ABCDEFGHIJ"[L++];
      const lines = [], sync = [], micro = [], timers = [];
      let seq = 0;
      const kinds = r.shuffle(["S", "S", "T0", "P", "PP", "TP", "PT", "A", "T20"]).slice(0, 5);
      if (!kinds.includes("S")) kinds[0] = "S";
      for (const k of kinds) {
        if (k === "S") { const x = next(); lines.push(`console.log("${x}");`); sync.push({ log: x }); }
        else if (k === "T0" || k === "T20") { const x = next(); lines.push(`setTimeout(() => console.log("${x}"), ${k === "T0" ? 0 : 20});`); timers.push({ due: k === "T0" ? 1 : 20, seq: seq++, run: [{ log: x }] }); }
        else if (k === "P") { const x = next(); lines.push(`Promise.resolve().then(() => console.log("${x}"));`); micro.push([{ log: x }]); }
        else if (k === "PP") { const x = next(), y = next(); lines.push(`Promise.resolve()\n  .then(() => console.log("${x}"))\n  .then(() => console.log("${y}"));`); micro.push([{ log: x }, { micro: [{ log: y }] }]); }
        else if (k === "TP") { const x = next(), y = next(); lines.push(`setTimeout(() => {\n  console.log("${x}");\n  Promise.resolve().then(() => console.log("${y}"));\n}, 0);`); timers.push({ due: 1, seq: seq++, run: [{ log: x }, { micro: [{ log: y }] }] }); }
        else if (k === "PT") { const x = next(), y = next(); lines.push(`Promise.resolve().then(() => {\n  console.log("${x}");\n  setTimeout(() => console.log("${y}"), 0);\n});`); micro.push([{ log: x }, { timer: [{ log: y }] }]); }
        else if (k === "A") { const x = next(), y = next(); lines.push(`(async () => {\n  console.log("${x}");\n  await null;\n  console.log("${y}");\n})();`); sync.push({ log: x }); micro.push([{ log: y }]); }
      }
      // run it: sync code, then every microtask, then each timer in turn (draining microtasks after each one)
      const out = [];
      let now = 0;
      const exec = (steps, mq) => { for (const s of steps) { if (s.log) out.push(s.log); if (s.micro) mq.push(s.micro); if (s.timer) timers.push({ due: now + 1, seq: seq++, run: s.timer }); } };
      const drain = (mq) => { while (mq.length) exec(mq.shift(), mq); };
      for (const s of sync) out.push(s.log);
      const mq = micro.slice();
      drain(mq);
      while (timers.length) { timers.sort((a, b) => a.due - b.due || a.seq - b.seq); const t = timers.shift(); now = Math.max(now, t.due); const q2 = []; exec(t.run, q2); drain(q2); }
      return {
        ch: 50, title: "In what order does Node run it?", lang: "node", prompt: "<p>What does it print, in order?</p>",
        code: lines.join("\n"),
        answer: out.join("\n"),
        why: "<p>Node runs all the plain code first. Then it empties the <b>microtask</b> queue: promise callbacks, and the rest of an <code>async</code> function after an <code>await</code>, including any microtasks those add. Only then does it take the next <b>timer</b>, and after each timer it empties the microtasks again. <code>setTimeout(…, 0)</code> means \"after everything that's already queued\", never \"now\".</p>",
      };
    },
    // ch 50: Express middleware, in order
    middleware(r) {
      const pool = [
        { code: `app.use((req, res, next) => {\n  console.log("log");\n  next();\n});`, m: "*", p: "", act: "next", log: "log" },
        { code: `app.use("/orders", (req, res, next) => {\n  console.log("orders");\n  next();\n});`, m: "*", p: "/orders", prefix: true, act: "next", log: "orders" },
        { code: `app.use((req, res, next) => {\n  if (req.query.key !== "k1") {\n    console.log("locked");\n    return res.status(401).json({ error: "no key" });\n  }\n  next();\n});`, m: "*", p: "", act: "guard", log: "locked" },
        { code: `app.get("/orders/:id", (req, res, next) => {\n  console.log("look " + req.params.id);\n  next();\n});`, m: "GET", p: "/orders/:id", act: "next", log: "look", param: true },
        { code: `app.get("/orders/:id", (req, res) => {\n  console.log("found");\n  res.json({ id: req.params.id });\n});`, m: "GET", p: "/orders/:id", act: "end", status: 200, log: "found" },
        { code: `app.post("/orders", (req, res) => {\n  console.log("made");\n  res.status(201).json({ ok: true });\n});`, m: "POST", p: "/orders", act: "end", status: 201, log: "made" },
        { code: `app.get("/menu", (req, res) => {\n  console.log("menu");\n  res.json([]);\n});`, m: "GET", p: "/menu", act: "end", status: 200, log: "menu" },
      ];
      const stack = r.shuffle(pool).slice(0, 5);
      const tail = r.next() < 0.6;
      const id = r.int(2, 99);
      const reqs = [["GET", `/orders/${id}`], ["GET", `/orders/${id}?key=k1`], ["POST", "/orders?key=k1"], ["GET", "/menu"], ["POST", "/orders"]];
      const [method, url] = r.pick(reqs);
      const [path, qs] = url.split("?");
      const key = qs ? qs.split("=")[1] : undefined;
      const out = [];
      let status = 404;
      const matches = (l) => {
        if (l.m !== "*" && l.m !== method) return false;
        if (!l.p) return true;
        if (l.prefix) return path === l.p || path.startsWith(l.p + "/");
        const a = l.p.split("/"), b = path.split("/");
        return a.length === b.length && a.every((x, i) => x.startsWith(":") || x === b[i]);
      };
      let done = false;
      for (const l of stack) {
        if (!matches(l)) continue;
        if (l.act === "guard") { if (key !== "k1") { out.push(l.log); status = 401; done = true; break; } continue; }
        out.push(l.param ? `${l.log} ${id}` : l.log);
        if (l.act === "end") { status = l.status; done = true; break; }
      }
      if (!done && tail) { out.push("nothing here"); status = 404; }
      const code = `const express = require("express");\nconst app = express();\n\n${stack.map((l) => l.code).join("\n")}\n` + (tail ? `app.use((req, res) => {\n  console.log("nothing here");\n  res.status(404).json({ error: "not found" });\n});\n` : "") +
        `\nconst server = app.listen(0, async () => {\n  const url = "http://localhost:" + server.address().port + "${url}";\n  const res = await fetch(url, { method: "${method}" });\n  console.log(res.status);\n  server.close();\n});`;
      return {
        ch: 50, title: "Down the middleware", lang: "node", prompt: `<p>One request comes in: <code>${method} ${url}</code>. What does it print?</p>`,
        code, needs: "express",
        answer: out.concat(String(status)).join("\n"),
        why: `<p>Express walks its list top to bottom. A layer runs only if its method and path match (<code>app.use("/orders")</code> matches anything under /orders; a route's path must match exactly, with <code>:id</code> standing for one part). It hands on with <code>next()</code>; sending a response ends the walk. If nothing answers, Express sends its own 404${tail ? ", but here the last layer catches everything first" : ""}.</p>`,
      };
    },
    // ch 52: offset pages against cursor pages
    cursor(r) {
      const N = r.int(12, 20), k = r.int(3, 5), m = r.int(1, k - 1);
      const ids0 = Array.from({ length: N }, (_, i) => N - i);
      const page1 = ids0.slice(0, k);
      const ids1 = Array.from({ length: m }, (_, i) => N + m - i).concat(ids0);
      const off2 = ids1.slice(k, 2 * k), cur2 = ids1.filter((x) => x < page1[page1.length - 1]).slice(0, k);
      return {
        ch: 52, title: "Offsets or cursors?", lang: "node", prompt: `<p>Messages come newest first, ${k} to a page. Between reading page 1 and page 2, ${m} new message${m === 1 ? "" : "s"} arrive${m === 1 ? "s" : ""}. What does it print?</p>`,
        code: `let ids = [];\nfor (let i = ${N}; i >= 1; i--) ids.push(i);   // newest first\nconst page1 = ids.slice(0, ${k});\nfor (let i = ${N + 1}; i <= ${N + m}; i++) ids.unshift(i);   // new messages\nconst byOffset = ids.slice(${k}, ${2 * k});\nconst last = page1[page1.length - 1];\nconst byCursor = ids.filter((id) => id < last).slice(0, ${k});\nconsole.log(page1.join(" "));\nconsole.log(byOffset.join(" "));\nconsole.log(byCursor.join(" "));`,
        answer: [page1.join(" "), off2.join(" "), cur2.join(" ")].join("\n"),
        why: `<p>The offset page counts positions, and the ${m} new message${m === 1 ? "" : "s"} pushed everything down, so page 2 repeats ${m} message${m === 1 ? "" : "s"} you've already seen. The cursor page asks for "older than ${page1[page1.length - 1]}", the last id you saw, so new messages can't shift it.</p>`,
      };
    },
  });
  const GENS_BX = G.GENS;
  const tupList = (a) => "[" + a.map((t) => "(" + t.map((x) => (typeof x === "string" ? `"${x}"` : x)).join(", ") + ")").join(", ") + "]";
  const pyTup = (t) => "(" + t.map((x) => (typeof x === "string" ? `'${x}'` : x)).join(", ") + ")";
  const pyBool = (b) => (b ? "True" : "False");
  // Python's round(): halves go to the even neighbour. Exact for n / d with integers
  const roundEven = (n, d) => { if (d < 0) { n = -n; d = -d; } const f = Math.floor(n / d), rem = n - f * d; return 2 * rem > d ? f + 1 : 2 * rem < d ? f : f % 2 === 0 ? f : f + 1; };

  // Build X, round two: a question for most of the other chapters
  G.add("bx", {
    // ch 2: infix to postfix, the shunting-yard way
    rpn(r) {
      const n = () => String(r.int(1, 9)), op = () => r.pick(["+", "-", "*", "/"]);
      let toks = [n(), op(), n(), op(), n(), op(), n()];
      if (r.next() < 0.6) { const at = r.pick([0, 2, 4]); toks.splice(at + 3, 0, ")"); toks.splice(at, 0, "("); }
      const prec = { "+": 1, "-": 1, "*": 2, "/": 2 }, out = [], ops = [];
      for (const t of toks) {
        if (/\d/.test(t)) out.push(t);
        else if (t === "(") ops.push(t);
        else if (t === ")") { while (ops[ops.length - 1] !== "(") out.push(ops.pop()); ops.pop(); }
        else { while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()); ops.push(t); }
      }
      while (ops.length) out.push(ops.pop());
      return {
        ch: 2, title: "Into postfix", match: "text", prompt: "<p>What does it print? (Symbols count here: type them exactly.)</p>",
        code: `expr = "${toks.join(" ")}"\nprec = {"+": 1, "-": 1, "*": 2, "/": 2}\nout, ops = [], []\nfor t in expr.split():\n    if t.isdigit():\n        out.append(t)\n    elif t == "(":\n        ops.append(t)\n    elif t == ")":\n        while ops[-1] != "(":\n            out.append(ops.pop())\n        ops.pop()\n    else:\n        while ops and ops[-1] != "(" and prec[ops[-1]] >= prec[t]:\n            out.append(ops.pop())\n        ops.append(t)\nwhile ops:\n    out.append(ops.pop())\nprint(" ".join(out))`,
        answer: out.join(" "),
        why: "<p>Numbers go straight out; an operator first sends out every waiting operator that binds at least as tightly (that <code>&gt;=</code> is what makes <code>-</code> and <code>/</code> group left to right); brackets fence off what's inside. Postfix needs no brackets and no precedence: a stack evaluates it in one pass.</p>",
      };
    },
    // ch 3: differentiate a polynomial
    deriv(r) {
      const c = ints(r, 4, -4, 6), x = r.int(-2, 3);
      const d = [c[1], 2 * c[2], 3 * c[3]];
      return {
        ch: 3, title: "Differentiate it", prompt: "<p><code>c[k]</code> is the coefficient of x<sup>k</sup>. What does it print?</p>",
        code: `c = ${pyList(c)}\nd = [k * c[k] for k in range(1, len(c))]\nx = ${x}\nprint(d, sum(a * x ** k for k, a in enumerate(d)))`,
        answer: `${pyList(d)} ${d[0] + d[1] * x + d[2] * x * x}`,
        why: "<p>The power rule, term by term: the derivative of c·x<sup>k</sup> is k·c·x<sup>k−1</sup>, so every coefficient moves down one place, multiplied by its old power. The constant disappears.</p>",
      };
    },
    // ch 4: a stack machine
    stackVM(r) {
      const prog = [], st = [];
      while (prog.length < 7) {
        const can = ["push"]; if (st.length >= 2) can.push("add", "mul", "sub", "swap"); if (st.length >= 1) can.push("dup");
        const op = r.pick(can);
        if (op === "push") { const v = r.int(1, 9); prog.push(["push", v]); st.push(v); }
        else if (op === "dup") { prog.push(["dup"]); st.push(st[st.length - 1]); }
        else if (op === "swap") { prog.push(["swap"]); const b = st.pop(), a = st.pop(); st.push(b, a); }
        else { prog.push([op]); const b = st.pop(), a = st.pop(); st.push(op === "add" ? a + b : op === "mul" ? a * b : a - b); }
      }
      return {
        ch: 4, title: "Run the bytecode", prompt: "<p>What does it print?</p>",
        code: `program = [${prog.map((p) => (p.length > 1 ? `("${p[0]}", ${p[1]})` : `("${p[0]}",)`)).join(", ")}]\nstack = []\nfor op, *arg in program:\n    if op == "push":\n        stack.append(arg[0])\n    elif op == "dup":\n        stack.append(stack[-1])\n    elif op == "swap":\n        stack[-1], stack[-2] = stack[-2], stack[-1]\n    else:\n        b, a = stack.pop(), stack.pop()\n        stack.append(a + b if op == "add" else a * b if op == "mul" else a - b)\nprint(stack)`,
        answer: pyList(st),
        why: "<p>Every instruction works on the top of the stack: arithmetic pops two and pushes one. Note the order: <code>sub</code> pops b, then a, and pushes a − b. This is how a compiler's output, and the Python VM itself, runs.</p>",
      };
    },
    // ch 5: a tiny regex matcher
    regex(r) {
      const parts = [];
      const len = r.int(2, 4);
      for (let i = 0; i < len; i++) { parts.push(r.pick(["a", "b", "."])); if (r.next() < 0.35) parts.push("*"); }
      let pat = (r.next() < 0.5 ? "^" : "") + parts.join("") + (r.next() < 0.4 ? "$" : "");
      const strs = Array.from({ length: 4 }, () => Array.from({ length: r.int(1, 5) }, () => r.pick(["a", "b"])).join(""));
      const here = (re, t) => { if (!re) return true; if (re.length >= 2 && re[1] === "*") return star(re[0], re.slice(2), t); if (re === "$") return !t; if (t && (re[0] === "." || re[0] === t[0])) return here(re.slice(1), t.slice(1)); return false; };
      const star = (c, re, t) => { for (;;) { if (here(re, t)) return true; if (!(t && (t[0] === c || c === "."))) return false; t = t.slice(1); } };
      const match = (re, t) => { if (re[0] === "^") return here(re.slice(1), t); for (;;) { if (here(re, t)) return true; if (!t) return false; t = t.slice(1); } };
      return {
        ch: 5, title: "Does it match?", prompt: `<p><code>.</code> is any letter, <code>*</code> repeats the one before it, <code>^</code> and <code>$</code> pin the start and end. Without <code>^</code> the match may start anywhere. What does it print?</p>`,
        code: `def match(re, text):\n    if re.startswith("^"):\n        return here(re[1:], text)\n    while True:\n        if here(re, text):\n            return True\n        if not text:\n            return False\n        text = text[1:]\ndef here(re, text):\n    if not re:\n        return True\n    if len(re) >= 2 and re[1] == "*":\n        return star(re[0], re[2:], text)\n    if re == "$":\n        return not text\n    if text and (re[0] == "." or re[0] == text[0]):\n        return here(re[1:], text[1:])\n    return False\ndef star(c, re, text):\n    while True:\n        if here(re, text):\n            return True\n        if not (text and (text[0] == c or c == ".")):\n            return False\n        text = text[1:]\nfor s in ${pyList(strs)}:\n    print(s, match("${pat}", s))`,
        answer: strs.map((s) => `${s} ${pyBool(match(pat, s))}`).join("\n"),
        why: `<p>The pattern <code>${pat}</code>. <code>x*</code> means zero or more x, and it tries the shortest stretch first, growing it only when the rest won't match. A pattern without <code>$</code> only has to match a prefix of where it starts.</p>`,
      };
    },
    // ch 8: what changed between two snapshots
    gitStatus(r) {
      const files = ["app.py", "db.py", "readme", "test.py", "util.py"];
      const old = {}, nw = {};
      for (const f of files) { const p = r.next(); if (p < 0.8) old[f] = String(r.int(100, 999)); }
      for (const f of files) { if (old[f] && r.next() < 0.75) nw[f] = r.next() < 0.5 ? old[f] : String(r.int(100, 999)); else if (!old[f] && r.next() < 0.6) nw[f] = String(r.int(100, 999)); }
      const out = [];
      for (const f of [...new Set([...Object.keys(old), ...Object.keys(nw)])].sort()) { if (!(f in old)) out.push(`A ${f}`); else if (!(f in nw)) out.push(`D ${f}`); else if (old[f] !== nw[f]) out.push(`M ${f}`); }
      if (!out.length) return G.GENS.gitStatus(r);
      const d = (o) => "{" + Object.entries(o).map(([k, v]) => `"${k}": "${v}"`).join(", ") + "}";
      return {
        ch: 8, title: "What changed?", prompt: "<p>Each snapshot maps a file to the hash of its contents. What does it print?</p>",
        code: `old = ${d(old)}\nnew = ${d(nw)}\nfor f in sorted(set(old) | set(new)):\n    if f not in old:\n        print("A", f)\n    elif f not in new:\n        print("D", f)\n    elif old[f] != new[f]:\n        print("M", f)`,
        answer: out.join("\n"),
        why: "<p>Because git stores content by its hash, comparing two commits is cheap: a file whose hash didn't change is the same file, with no need to read it. Only names that appear, vanish or change hash are reported.</p>",
      };
    },
    // ch 9: the w motion
    wordMotion(r) {
      const words = Array.from({ length: r.int(4, 6) }, () => "abcdefgh".slice(0, r.int(1, 5)).split("").map(() => r.pick("xyz".split(""))).join(""));
      let line = ""; words.forEach((w, i) => { line += (i ? " ".repeat(r.int(1, 2)) : "") + w; });
      const K = r.int(3, 5); let cur = 0; const out = [];
      for (let k = 0; k < K; k++) { let i = cur + 1; while (i < line.length && !(line[i] !== " " && line[i - 1] === " ")) i++; cur = Math.min(i, line.length - 1); out.push(cur); }
      return {
        ch: 9, title: "Jump word by word", prompt: `<p>The cursor starts at column 0 and you press <code>w</code> ${K} times. What does it print?</p>`,
        code: `line = "${line}"\ncur = 0\nfor _ in range(${K}):\n    i = cur + 1\n    while i < len(line) and not (line[i] != " " and line[i - 1] == " "):\n        i += 1\n    cur = min(i, len(line) - 1)\n    print(cur, end=" ")`,
        answer: out.join(" "),
        why: "<p>A word starts wherever a non-space follows a space. <code>w</code> scans right for the next such start; with none left, the cursor stops on the last character. Every editor motion is a small search like this.</p>",
      };
    },
    // ch 11: perspective
    project(r) {
      const f = r.pick([2, 4]), pts = Array.from({ length: 3 }, () => { const z = r.pick([1, 2, 4]); return [r.int(-3, 3) * z, r.int(-3, 3) * z, z]; });
      const fl = (a, b) => Math.floor(a / b);
      return {
        ch: 11, title: "Far things look small", prompt: "<p>What does it print?</p>",
        code: `f = ${f}\npoints = ${tupList(pts)}\nprint([(f * x // z, f * y // z) for x, y, z in points])`,
        answer: "[" + pts.map(([x, y, z]) => pyTup([fl(f * x, z), fl(f * y, z)])).join(", ") + "]",
        why: "<p>Perspective divides by depth: a point twice as far away lands half as far from the centre of the screen. That one division is what makes a 3D scene look 3D.</p>",
      };
    },
    // ch 12: which boxes touch
    aabb(r) {
      const boxes = Array.from({ length: 4 }, () => [r.int(0, 7), r.int(0, 7), r.int(2, 5), r.int(2, 5)]);
      const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
      const out = []; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (hit(boxes[i], boxes[j])) out.push([i, j]);
      return {
        ch: 12, title: "Which boxes collide?", prompt: "<p>Each box is <code>(x, y, width, height)</code>. What does it print?</p>",
        code: `boxes = ${tupList(boxes)}\ndef hit(a, b):\n    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]\nprint([(i, j) for i in range(4) for j in range(i + 1, 4) if hit(boxes[i], boxes[j])])`,
        answer: "[" + out.map(pyTup).join(", ") + "]",
        why: "<p>Two boxes overlap exactly when they overlap on both axes. On one axis, two stretches overlap when each starts before the other ends. Boxes that only touch edges don't count, because of the strict <code>&lt;</code>.</p>",
      };
    },
    // ch 13: a forward pass
    forward(r) {
      const x = ints(r, 3, -1, 3), W = Array.from({ length: 2 }, () => ints(r, 3, -1, 2)), b = ints(r, 2, -1, 3), v = ints(r, 2, -2, 3);
      const hid = W.map((row, i) => Math.max(0, row.reduce((a, w, k) => a + w * x[k], 0) + b[i]));
      return {
        ch: 13, title: "Through the network", prompt: "<p>What does it print?</p>",
        code: `x = ${pyList(x)}\nW = ${"[" + W.map(pyList).join(", ") + "]"}\nb = ${pyList(b)}\nv = ${pyList(v)}\nhidden = [max(0, sum(w * xi for w, xi in zip(row, x)) + bi) for row, bi in zip(W, b)]\nprint(hidden, sum(a * h for a, h in zip(v, hidden)))`,
        answer: `${pyList(hid)} ${hid[0] * v[0] + hid[1] * v[1]}`,
        why: "<p>Each hidden unit takes a weighted sum of the inputs plus its bias, then ReLU keeps it only if it's positive. Without that bend, two layers would collapse into one straight-line function.</p>",
      };
    },
    // ch 14: adding with gates
    adder(r) {
      const a = r.int(0, 15), b = r.int(0, 15), s = a + b;
      return {
        ch: 14, title: "Four full adders", prompt: "<p>What does it print?</p>",
        code: `def full_add(a, b, c):\n    s = a ^ b ^ c\n    carry = (a & b) | (c & (a ^ b))\n    return s, carry\na, b = ${a}, ${b}\ncarry, bits = 0, []\nfor i in range(4):\n    s, carry = full_add((a >> i) & 1, (b >> i) & 1, carry)\n    bits.append(s)\nprint(bits[::-1], carry)`,
        answer: `${pyList([3, 2, 1, 0].map((i) => (s >> i) & 1))} ${s >> 4}`,
        why: `<p>Each full adder adds two bits and the carry from the column to its right, exactly like adding by hand. ${a} + ${b} = ${s}${s > 15 ? `, which doesn't fit in 4 bits: the final carry is the overflow` : ""}.</p>`,
      };
    },
    // ch 15: round-robin scheduling
    roundRobin(r) {
      const procs = ["A", "B", "C", "D"].slice(0, r.int(3, 4)).map((n) => [n, r.int(1, 7)]), Q = r.int(2, 3);
      const q = procs.map((p) => p.slice()), out = []; let t = 0;
      while (q.length) { const [n, left] = q.shift(), run = Math.min(Q, left); t += run; if (left > run) q.push([n, left - run]); else out.push(`${n} ${t}`); }
      return {
        ch: 15, title: "Take turns", prompt: `<p>Each process needs the CPU for the given time; the scheduler gives each a slice of at most ${Q}, then moves it to the back of the queue. What does it print?</p>`,
        code: `from collections import deque\nqueue = deque(${tupList(procs)})\nt = 0\nwhile queue:\n    name, left = queue.popleft()\n    run = min(${Q}, left)\n    t += run\n    if left > run:\n        queue.append((name, left - run))\n    else:\n        print(name, t)`,
        answer: out.join("\n"),
        why: "<p>Round robin keeps every process moving, so short jobs finish early instead of waiting behind a long one. A bigger slice means fewer switches but a longer wait for everyone's turn.</p>",
      };
    },
    // ch 16: mark and sweep
    markSweep(r) {
      const names = ["a", "b", "c", "d", "e", "f"], heap = {};
      for (const n of names) heap[n] = r.shuffle(names.filter((x) => x !== n)).slice(0, r.int(0, 2));
      const roots = r.shuffle(names).slice(0, r.int(1, 2));
      const seen = new Set(), go = (n) => { if (seen.has(n)) return; seen.add(n); heap[n].forEach(go); };
      roots.forEach(go);
      return {
        ch: 16, title: "What gets collected?", prompt: "<p><code>heap[x]</code> lists the objects x points to. What does it print?</p>",
        code: `heap = {${names.map((n) => `"${n}": ${pyList(heap[n]).replace(/'/g, '"')}`).join(", ")}}\nroots = ${pyList(roots).replace(/'/g, '"')}\nmarked = set()\ndef mark(x):\n    if x in marked:\n        return\n    marked.add(x)\n    for y in heap[x]:\n        mark(y)\nfor r in roots:\n    mark(r)\nprint(sorted(set(heap) - marked))`,
        answer: pyList(names.filter((n) => !seen.has(n))),
        why: "<p>Mark: everything reachable from a root (a variable the program can still use) is live. Sweep: the rest is garbage, even objects that point at each other in a cycle, which plain reference counting would never free.</p>",
      };
    },
    // ch 17: run-length encoding
    rle(r) {
      let s = ""; while (s.length < 10) s += r.pick("abc".split("")).repeat(r.int(1, 4));
      const runs = []; for (const c of s) { if (runs.length && runs[runs.length - 1][0] === c) runs[runs.length - 1][1]++; else runs.push([c, 1]); }
      const enc = runs.map(([c, n]) => c + n).join("");
      return {
        ch: 17, title: "Squash the runs", prompt: "<p>What does it print?</p>",
        code: `s = "${s}"\nout = []\nfor c in s:\n    if out and out[-1][0] == c:\n        out[-1][1] += 1\n    else:\n        out.append([c, 1])\nenc = "".join(c + str(n) for c, n in out)\nprint(enc, len(s), len(enc))`,
        answer: `${enc} ${s.length} ${enc.length}`,
        why: `<p>Each run of the same letter becomes the letter and a count. It only pays when runs are long: ${enc.length < s.length ? "here it saves " + (s.length - enc.length) : enc.length === s.length ? "here it saves nothing" : "here it's " + (enc.length - s.length) + " longer than the input"}. Every compressor wins on some inputs by losing on others.</p>`,
      };
    },
    // ch 18: an inverted index
    invIndex(r) {
      const vocab = ["cat", "dog", "fish", "bird"], docs = Array.from({ length: 5 }, () => r.shuffle(vocab).slice(0, r.int(1, 3)).join(" "));
      const [w1, w2] = r.shuffle(vocab);
      const idx = {}; docs.forEach((d, i) => d.split(" ").forEach((w) => (idx[w] = idx[w] || new Set()).add(i)));
      const A = idx[w1] || new Set(), B = idx[w2] || new Set();
      const both = [...A].filter((x) => B.has(x)).sort(), either = new Set([...A, ...B]).size;
      return {
        ch: 18, title: "Look it up backwards", prompt: "<p>What does it print?</p>",
        code: `docs = ${pyList(docs)}\nindex = {}\nfor i, d in enumerate(docs):\n    for w in d.split():\n        index.setdefault(w, set()).add(i)\na, b = index.get("${w1}", set()), index.get("${w2}", set())\nprint(sorted(a & b), len(a | b))`,
        answer: `${pyList(both)} ${either}`,
        why: `<p>The index maps each word to the documents that hold it, built once. A query then never reads a document: "${w1} AND ${w2}" is the intersection of two sets, OR is their union.</p>`,
      };
    },
    // ch 19: cumulative acks
    acks(r) {
      const arrive = []; let next = 0;
      // the sender sends in order; now and then one is lost, and later the receiver's missing one is sent again
      let want = 0;
      arrive.push(next++); want = 1;
      for (let k = 0; k < 6; k++) { const p = r.next(); if (p < 0.55) { const s = next++; arrive.push(s); if (s === want) want++; } else if (p < 0.8) next++; else { arrive.push(want); want++; } }
      let exp = 0; const out = [];
      for (const s of arrive) { if (s === exp) exp++; out.push(exp); }
      return {
        ch: 19, title: "What does the receiver ack?", prompt: "<p>Packets arrive with these sequence numbers (some lost, some repeated). The receiver only accepts the next one in order. What does it print?</p>",
        code: `expected = 0\nfor seq in ${pyList(arrive)}:\n    if seq == expected:\n        expected += 1\n    print("ack", expected, end=" ")`,
        answer: out.map((x) => `ack ${x}`).join(" "),
        why: "<p>Each ack says \"I have everything before this number\". A gap makes the receiver repeat the same ack, and the sender takes repeated acks as a sign that a packet was lost, so it sends it again.</p>",
      };
    },
    // ch 21: where attention looks
    attention(r) {
      const n = 5, vecs = Array.from({ length: n }, () => ints(r, 2, -3, 3));
      const out = vecs.map((q, i) => { let best = 0, bv = -Infinity; for (let j = 0; j <= i; j++) { const s = q[0] * vecs[j][0] + q[1] * vecs[j][1]; if (s > bv) { bv = s; best = j; } } return best; });
      return {
        ch: 21, title: "Who does each token look at?", prompt: "<p>Each token may only look at itself and the tokens before it. What does it print?</p>",
        code: `v = ${"[" + vecs.map(pyList).join(", ") + "]"}\nfor i, q in enumerate(v):\n    scores = [q[0] * k[0] + q[1] * k[1] for k in v[: i + 1]]\n    print(scores.index(max(scores)), end=" ")`,
        answer: out.join(" "),
        why: "<p>Attention scores every earlier token by a dot product with the current one; softmax then turns the scores into weights, and the biggest score gets the most. The mask (only <code>v[: i + 1]</code>) stops a token peeking at the future, which is what lets a GPT generate left to right.</p>",
      };
    },
    // ch 22: a chain of hashes
    hashChain(r) {
      const data = r.shuffle(["pay ana 5", "pay bo 2", "pay cy 7", "pay di 1", "pay ed 4"]).slice(0, 4), K = r.int(0, 3), rehash = r.next() < 0.5;
      const h = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 10007; return x; };
      const chain = []; let prev = 0;
      for (const d of data) { prev = h(String(prev) + d); chain.push([d, prev]); }
      chain[K][0] = "pay eve 99";
      if (rehash) chain[K][1] = h(String(K ? chain[K - 1][1] : 0) + chain[K][0]);
      let ans = "valid"; prev = 0;
      for (let i = 0; i < chain.length; i++) { if (h(String(prev) + chain[i][0]) !== chain[i][1]) { ans = `broken at ${i}`; break; } prev = chain[i][1]; }
      return {
        ch: 22, title: "Spot the tampering", prompt: `<p>Someone rewrites block ${K}${rehash ? " and recomputes its hash" : ""}. What does it print?</p>`,
        code: `def h(s):\n    x = 0\n    for c in s:\n        x = (x * 31 + ord(c)) % 10007\n    return x\nchain, prev = [], 0\nfor data in ${pyList(data)}:\n    prev = h(str(prev) + data)\n    chain.append([data, prev])\nchain[${K}][0] = "pay eve 99"\n` + (rehash ? `chain[${K}][1] = h(str(chain[${K - 1}][1] if ${K} else 0) + chain[${K}][0])\n` : "") + `prev = 0\nfor i, (data, stored) in enumerate(chain):\n    if h(str(prev) + data) != stored:\n        print("broken at", i)\n        break\n    prev = stored\nelse:\n    print("valid")`,
        answer: ans,
        why: rehash ? `<p>Recomputing block ${K}'s hash makes block ${K} look fine, but the next block was hashed with the <i>old</i> value${K === data.length - 1 ? ". Block " + K + " is the last one, so here nothing follows to catch it: that's why the newest blocks are the least safe, and why real chains wait for more blocks on top" : ", so the chain breaks one block later"}. To get away with it you'd have to redo every block after it, which proof of work makes too expensive.</p>`
          : `<p>Block ${K}'s stored hash no longer matches its contents, so the check fails right there.</p>`,
      };
    },
    // ch 23: recalculating a sheet
    sheet(r) {
      const cells = { A1: r.int(1, 9), A2: r.int(1, 9) }, k = [r.int(0, 3), r.int(0, 3), r.int(0, 3)];
      const f = { B1: [["A1", "A2"], k[0]], B2: [["B1", "A1"], k[1]], C1: [["B2", "B1"], k[2]] };
      const val = (c) => (c in cells ? cells[c] : f[c][0].reduce((a, x) => a + val(x), 0) + f[c][1]);
      const a1 = cells.A1, before = val("C1");
      let nu = r.int(1, 9); if (nu === a1) nu = (nu % 9) + 1;
      cells.A1 = nu;
      const after = val("C1");
      return {
        ch: 23, title: "Change one cell", prompt: "<p>Each formula adds up the cells it names, plus a constant. What does it print?</p>",
        code: `cells = {"A1": ${a1}, "A2": ${cells.A2}}\nformulas = {"B1": (["A1", "A2"], ${k[0]}), "B2": (["B1", "A1"], ${k[1]}), "C1": (["B2", "B1"], ${k[2]})}\ndef value(c):\n    if c in cells:\n        return cells[c]\n    refs, k = formulas[c]\n    return sum(value(x) for x in refs) + k\nbefore = value("C1")\ncells["A1"] = ${nu}\nprint(before, value("C1"))`,
        answer: `${before} ${after}`,
        why: `<p>A1 reaches C1 along three paths (A1 → B1 → C1, A1 → B1 → B2 → C1 and A1 → B2 → C1), so changing A1 by ${nu - a1} moves C1 by 3 × ${nu - a1} = ${after - before}. A real spreadsheet recalculates only the cells downstream of the change, in dependency order, each once.</p>`,
      };
    },
  });

  // Build X, round three
  G.add("bx", {
    // ch 26: a line diff from the longest common subsequence
    diff(r) {
      const a = Array.from({ length: r.int(4, 6) }, () => r.pick("abcd".split(""))), b = a.slice();
      for (let k = 0; k < 2; k++) { const p = r.next(), i = r.int(0, b.length - 1); if (p < 0.4) b.splice(i, 1); else if (p < 0.8) b.splice(i, 0, r.pick("abcde".split(""))); else b[i] = r.pick("abcde".split("")); }
      const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0; const out = [];
      while (i < n && j < m) { if (a[i] === b[j]) { out.push("=" + a[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { out.push("-" + a[i]); i++; } else { out.push("+" + b[j]); j++; } }
      out.push(...a.slice(i).map((x) => "-" + x), ...b.slice(j).map((x) => "+" + x));
      return {
        ch: 26, title: "What's the diff?", match: "text", prompt: "<p>Each letter stands for a line. <code>=</code> keeps a line, <code>-</code> deletes it, <code>+</code> adds one. What does it print?</p>",
        code: `a, b = ${pyList(a)}, ${pyList(b)}\nn, m = len(a), len(b)\nL = [[0] * (m + 1) for _ in range(n + 1)]\nfor i in range(n - 1, -1, -1):\n    for j in range(m - 1, -1, -1):\n        L[i][j] = L[i + 1][j + 1] + 1 if a[i] == b[j] else max(L[i + 1][j], L[i][j + 1])\ni = j = 0\nout = []\nwhile i < n and j < m:\n    if a[i] == b[j]:\n        out.append("=" + a[i]); i += 1; j += 1\n    elif L[i + 1][j] >= L[i][j + 1]:\n        out.append("-" + a[i]); i += 1\n    else:\n        out.append("+" + b[j]); j += 1\nout += ["-" + x for x in a[i:]] + ["+" + x for x in b[j:]]\nprint(" ".join(out))`,
        answer: out.join(" "),
        why: `<p>The lines both versions share, in order, are a longest common subsequence (${L[0][0]} lines here); everything else is a deletion or an addition. <code>L[i][j]</code> is the LCS of what's left of each, so at a mismatch the diff drops whichever line costs less of it.</p>`,
      };
    },
    // ch 27: what make rebuilds
    make(r) {
      const deps = { app: ["main.o", "util.o"], "main.o": ["main.c", "util.h"], "util.o": ["util.c", "util.h"], test: ["app", "test.c"] };
      const mt = { "main.c": r.int(1, 5), "util.c": r.int(1, 5), "util.h": r.int(1, 5), "test.c": r.int(1, 5), "main.o": 10, "util.o": 10, app: 20, test: 30 };
      const touched = r.pick(["main.c", "util.c", "util.h", "test.c"]);
      mt[touched] = 50;
      let clock = 100; const out = [];
      const build = (t) => { if (!deps[t]) return mt[t]; const newest = Math.max(...deps[t].map(build)); if (newest > mt[t]) { mt[t] = ++clock; out.push(`rebuild ${t}`); } return mt[t]; };
      build("test");
      return {
        ch: 27, title: "What gets rebuilt?", prompt: `<p>Everything was up to date, then you edit <code>${touched}</code>. What does it print?</p>`,
        code: `deps = {"app": ["main.o", "util.o"], "main.o": ["main.c", "util.h"], "util.o": ["util.c", "util.h"], "test": ["app", "test.c"]}\nmtime = {"main.c": ${mt["main.c"] === 50 ? "50" : mt["main.c"]}, "util.c": ${mt["util.c"]}, "util.h": ${mt["util.h"]}, "test.c": ${mt["test.c"]}, "main.o": 10, "util.o": 10, "app": 20, "test": 30}\nclock = 100\ndef build(t):\n    global clock\n    if t not in deps:\n        return mtime[t]\n    newest = max(build(d) for d in deps[t])\n    if newest > mtime[t]:\n        clock += 1\n        mtime[t] = clock\n        print("rebuild", t)\n    return mtime[t]\nbuild("test")`,
        answer: out.join("\n"),
        why: `<p>A target is rebuilt when any of its inputs is newer than it, and its own new timestamp then makes everything downstream stale too. Inputs are built before what needs them (depth first), and nothing upstream of the edit is touched. ${touched === "util.h" ? "A header shared by two files rebuilds both." : ""}</p>`,
      };
    },
    // ch 28: which version satisfies the range
    semver(r) {
      const vs = [...new Set(Array.from({ length: 6 }, () => `${r.int(1, 2)}.${r.int(0, 3)}.${r.int(0, 4)}`))];
      const near = r.pick(vs).split(".").map(Number);
      const C = r.pick(["^", "~"]) + (r.next() < 0.8 ? `${near[0]}.${near[1]}.${r.int(0, near[2])}` : `${r.int(1, 2)}.${r.int(0, 2)}.${r.int(0, 3)}`);
      const P = (v) => v.split(".").map(Number), lt = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      const base = P(C.slice(1)), top = C[0] === "^" ? [base[0] + 1, 0, 0] : [base[0], base[1] + 1, 0];
      const good = vs.filter((v) => lt(P(v), base) >= 0 && lt(P(v), top) < 0).sort((a, b) => lt(P(a), P(b)));
      return {
        ch: 28, title: "Which version gets installed?", prompt: `<p>The package asks for <code>${C}</code>. What does it print?</p>`,
        code: `def parse(v):\n    return tuple(map(int, v.split(".")))\ndef ok(v, c):\n    base, v = parse(c[1:]), parse(v)\n    if c[0] == "^":\n        return base <= v < (base[0] + 1, 0, 0)\n    return base <= v < (base[0], base[1] + 1, 0)\nversions = ${pyList(vs)}\ngood = [v for v in versions if ok(v, "${C}")]\nprint(max(good, key=parse) if good else None)`,
        answer: good.length ? good[good.length - 1] : "None",
        why: `<p><code>^</code> allows anything up to the next major version (new features, no breaking changes); <code>~</code> only up to the next minor (bug fixes). The resolver takes the newest version in range. Versions compare as numbers, part by part: 1.10.0 is newer than 1.9.0.</p>`,
      };
    },
    // ch 30: parsing command-line arguments
    argv(r) {
      const pieces = r.shuffle([["--verbose"], ["-n", String(r.int(1, 9))], ["--out=x.txt"], ["data.csv"], ["notes.md"], ["--dry-run"]]).slice(0, 4);
      const argv = pieces.flat();
      const opts = [], pos = [];
      for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--") && a.includes("=")) { const [k, ...v] = a.slice(2).split("="); opts.push([k, `'${v.join("=")}'`]); } else if (a.startsWith("--")) opts.push([a.slice(2), "True"]); else if (a.startsWith("-")) { opts.push([a.slice(1), `'${argv[i + 1]}'`]); i++; } else pos.push(a); }
      return {
        ch: 30, title: "Parse the arguments", prompt: "<p>What does it print?</p>",
        code: `argv = ${pyList(argv)}\nopts, pos, i = {}, [], 0\nwhile i < len(argv):\n    a = argv[i]\n    if a.startswith("--") and "=" in a:\n        k, v = a[2:].split("=", 1)\n        opts[k] = v\n    elif a.startswith("--"):\n        opts[a[2:]] = True\n    elif a.startswith("-"):\n        opts[a[1:]] = argv[i + 1]\n        i += 1\n    else:\n        pos.append(a)\n    i += 1\nprint(opts, pos)`,
        answer: "{" + opts.map(([k, v]) => `'${k}': ${v}`).join(", ") + "} " + pyList(pos),
        why: "<p>Long options either carry their value after <code>=</code> or are switches (True); a short option takes the next word as its value, which is why that word never shows up as a positional argument.</p>",
      };
    },
    // ch 31: how the shell splits a line
    shellSplit(r) {
      const opts = [() => { const w = r.pick(["echo", "ls", "cat", "grep"]); return [w, w]; }, () => { const w = r.pick(["a b", "my file", "x  y"]); return [`'${w}'`, w]; }, () => { const w = r.pick(["hi there", "one two"]); return [`"${w}"`, w]; }, () => { const a = r.pick(["pre", "x"]), b = r.pick(["fix me", "y z"]); return [`${a}"${b}"`, a + b]; }];
      const parts = [opts[0](), ...Array.from({ length: 3 }, () => r.pick(opts)())];
      const line = parts.map((p) => p[0]).join(" ");
      return {
        ch: 31, title: "How many arguments?", match: "text", prompt: "<p>What does it print?</p>",
        code: `import shlex\nline = ${JSON.stringify(line)}\nargs = shlex.split(line)\nprint(len(args), "|".join(args))`,
        answer: `${parts.length} ${parts.map((p) => p[1]).join("|")}`,
        why: "<p>Spaces split words, except inside quotes; the quotes themselves are removed. A quoted piece glued to a plain one (<code>x\"y z\"</code>) is still one word. That's why <code>rm my file</code> and <code>rm 'my file'</code> do very different things.</p>",
      };
    },
    // ch 34: nearest free driver
    rideShare(r) {
      const drivers = Array.from({ length: 4 }, () => [r.int(0, 9), r.int(0, 9)]), riders = Array.from({ length: 3 }, () => [r.int(0, 9), r.int(0, 9)]);
      const free = new Set([0, 1, 2, 3]), out = [];
      for (const [x, y] of riders) { let best = null, bd = Infinity; for (const d of [...free].sort()) { const dist = Math.abs(drivers[d][0] - x) + Math.abs(drivers[d][1] - y); if (dist < bd) { bd = dist; best = d; } } free.delete(best); out.push(best); }
      return {
        ch: 34, title: "Who picks you up?", prompt: "<p>Riders arrive one at a time; each gets the closest free driver (blocks walked, ties to the lower id). What does it print?</p>",
        code: `drivers = ${tupList(drivers)}\nriders = ${tupList(riders)}\nfree = set(range(len(drivers)))\nfor rx, ry in riders:\n    best = min(free, key=lambda d: (abs(drivers[d][0] - rx) + abs(drivers[d][1] - ry), d))\n    free.remove(best)\n    print(best, end=" ")`,
        answer: out.join(" "),
        why: "<p>Greedy matching: fast, and fair to whoever asked first, but not always best overall. A later rider can be stuck with a far driver because an earlier one took the near one; batching a few seconds of requests and matching them together does better.</p>",
      };
    },
    // ch 36: a grow-only counter
    gcounter(r) {
      const X = r.int(1, 5), Y = r.int(1, 5), Z = r.int(1, 5);
      return {
        ch: 36, title: "Merge the counters", prompt: "<p>Two phones count likes offline, then sync. What does it print?</p>",
        code: `a = {"a": 0, "b": 0}\nb = {"a": 0, "b": 0}\na["a"] += ${X}       # likes on phone a\nb["b"] += ${Y}       # likes on phone b\nmerge = lambda p, q: {k: max(p[k], q[k]) for k in p}\na = merge(a, b)\na["a"] += ${Z}\nb = merge(b, a)\nb = merge(b, a)     # syncing twice changes nothing\nprint(sum(a.values()), sum(b.values()))`,
        answer: `${X + Y + Z} ${X + Y + Z}`,
        why: `<p>Each phone only ever adds to its own slot, and merging takes the bigger value per slot. So merges can happen in any order, any number of times, and every replica ends up with the same total, ${X + Y + Z}. A single shared number with "last write wins" would have lost someone's likes.</p>`,
      };
    },
    // ch 40: a second-price auction
    auction(r) {
      const names = r.shuffle(["ana", "bo", "cy", "di"]).slice(0, r.int(2, 4)), bids = names.map((n) => [n, r.int(5, 30)]), R = r.int(5, 20);
      const s = bids.map((b, i) => [b, i]).sort((x, y) => y[0][1] - x[0][1] || x[1] - y[1]).map((x) => x[0]);
      const ans = s[0][1] < R ? "no sale" : `${s[0][0]} ${s.length > 1 ? Math.max(R, s[1][1]) : R}`;
      return {
        ch: 40, title: "Who wins, and what do they pay?", prompt: `<p>A sealed-bid auction with a reserve price of ${R}. What does it print?</p>`,
        code: `bids = ${tupList(bids)}\nreserve = ${R}\nbids = sorted(bids, key=lambda b: -b[1])\nif bids[0][1] < reserve:\n    print("no sale")\nelse:\n    price = max(reserve, bids[1][1]) if len(bids) > 1 else reserve\n    print(bids[0][0], price)`,
        answer: ans,
        why: "<p>The highest bidder wins but pays the second-highest bid (or the reserve, if that's more). That makes bidding what it's truly worth to you the best plan: bidding lower can only lose you the item, never lower your price. Ties go to the earlier bid, since Python's sort is stable.</p>",
      };
    },
    // ch 41: fraud rules
    fraud(r) {
      let t = 0; const tx = Array.from({ length: 7 }, () => { t += r.int(5, 40); return [t, r.pick(["c1", "c2"]), r.next() < 0.15 ? r.int(501, 900) : r.int(5, 120)]; });
      const recent = {}, flags = [];
      tx.forEach(([tt, card, amt], i) => { const times = (recent[card] || []).filter((s) => s > tt - 60).concat(tt); recent[card] = times; if (amt > 500 || times.length >= 3) flags.push(i); });
      return {
        ch: 41, title: "Which payments look wrong?", prompt: "<p>Each payment is <code>(second, card, amount)</code>. Flag it if it's over 500, or if it's that card's third payment within a minute. What does it print?</p>",
        code: `tx = ${tupList(tx)}\nrecent, flags = {}, []\nfor i, (t, card, amount) in enumerate(tx):\n    times = [s for s in recent.get(card, []) if s > t - 60] + [t]\n    recent[card] = times\n    if amount > 500 or len(times) >= 3:\n        flags.append(i)\nprint(flags)`,
        answer: pyList(flags),
        why: "<p>Per-card sliding windows catch \"velocity\": many small charges in a burst, typical of a stolen card being tested. Only the last minute's times are kept per card, so memory stays small however long the stream runs.</p>",
      };
    },
    // ch 42: falling sand, one tick
    sand(r) {
      const R = 4, C = 5, g = Array.from({ length: R }, () => Array.from({ length: C }, () => (r.next() < 0.35 ? "#" : ".")));
      const h = g.map((row) => row.slice());
      for (let i = R - 2; i >= 0; i--) for (let j = 0; j < C; j++) if (h[i][j] === "#" && h[i + 1][j] === ".") { h[i][j] = "."; h[i + 1][j] = "#"; }
      return {
        ch: 42, title: "One tick of sand", match: "text", prompt: "<p><code>#</code> is sand, <code>.</code> is air. What does it print?</p>",
        code: `g = [list(row) for row in ${pyList(g.map((x) => x.join("")))}]\nfor i in range(len(g) - 2, -1, -1):\n    for j in range(len(g[0])):\n        if g[i][j] == "#" and g[i + 1][j] == ".":\n            g[i][j], g[i + 1][j] = ".", "#"\nfor row in g:\n    print("".join(row))`,
        answer: h.map((x) => x.join("")).join("\n"),
        why: "<p>Updating from the bottom row up lets each grain fall exactly one cell per tick: a grain lands in a space freed this same tick only if that space is below it. Scanning top-down instead, one grain could fall all the way in a single tick.</p>",
      };
    },
    // ch 44: a traffic step, no randomness
    traffic(r) {
      const L = 15, pos = [...new Set(ints(r, 5, 0, 14))].sort((a, b) => a - b), cars = pos.map((x) => [x, r.int(0, 3)]);
      const nu = cars.map(([x, v], i) => { const ahead = cars[(i + 1) % cars.length][0], gap = (((ahead - x - 1) % L) + L) % L; const nv = Math.min(v + 1, 3, gap); return [(x + nv) % L, nv]; });
      return {
        ch: 44, title: "One step of traffic", prompt: "<p>Cars drive round a ring road of 15 cells; each is <code>[position, speed]</code>. What does it print?</p>",
        code: `L = 15\ncars = ${"[" + cars.map(pyList).join(", ") + "]"}\nnew = []\nfor i, (x, v) in enumerate(cars):\n    ahead = cars[(i + 1) % len(cars)][0]\n    gap = (ahead - x - 1) % L\n    v = min(v + 1, 3, gap)\n    new.append([(x + v) % L, v])\nprint(new)`,
        answer: "[" + nu.map(pyList).join(", ") + "]",
        why: "<p>Every car speeds up by one (to at most 3), but never further than the empty cells in front of it, so nobody crashes. Python's <code>%</code> never goes negative, which wraps the gap round the ring. Add a little random braking and jams appear from nowhere.</p>",
      };
    },
    // ch 47: a box blur
    blur(r) {
      const img = Array.from({ length: 4 }, () => ints(r, 4, 0, 9));
      const out = [1, 2].map((i) => [1, 2].map((j) => { let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += img[i + a][j + b]; return Math.floor(s / 9); }));
      return {
        ch: 47, title: "Blur the middle", prompt: "<p>What does it print?</p>",
        code: `img = ${"[" + img.map(pyList).join(", ") + "]"}\nout = [[sum(img[i + a][j + b] for a in (-1, 0, 1) for b in (-1, 0, 1)) // 9 for j in (1, 2)] for i in (1, 2)]\nprint(out)`,
        answer: "[" + out.map(pyList).join(", ") + "]",
        why: "<p>Each output pixel is the average of the 3 × 3 block around it, which softens sharp edges. Only the middle pixels have a full block; real editors decide what to do at the borders, like repeating the edge pixels.</p>",
      };
    },
    // ch 48: quantising
    quantise(r) {
      const Q = [16, 11, 10, 16, 24, 40], c = Q.map((q) => (r.next() < 0.3 ? q * r.int(-3, 3) + (r.next() < 0.5 ? q / 2 : 0) : r.int(-60, 60))).map((x) => Math.round(x));
      const qv = c.map((x, i) => roundEven(x, Q[i]));
      return {
        ch: 48, title: "Throw away detail", prompt: "<p>What does it print?</p>",
        code: `Q = ${pyList(Q)}\ncoef = ${pyList(c)}\nq = [round(c / s) for c, s in zip(coef, Q)]\nprint(q, [x * s for x, s in zip(q, Q)])`,
        answer: `${pyList(qv)} ${pyList(qv.map((x, i) => x * Q[i]))}`,
        why: "<p>Dividing by the step and rounding keeps only a coarse version of each coefficient: lots of them become 0, which compresses very well. Multiplying back can't restore what was rounded off: that's the \"lossy\" part. (Python rounds an exact half to the even neighbour.)</p>",
      };
    },
    // ch 49: filling a triangle
    raster(r) {
      let A, B, C;
      do { A = [r.int(0, 6), r.int(0, 6)]; B = [r.int(0, 6), r.int(0, 6)]; C = [r.int(0, 6), r.int(0, 6)]; } while ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) === 0);
      const edge = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      let count = 0;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const w = [edge(A, B, x + 0.5, y + 0.5), edge(B, C, x + 0.5, y + 0.5), edge(C, A, x + 0.5, y + 0.5)]; if (w.every((e) => e >= 0) || w.every((e) => e <= 0)) count++; }
      return {
        ch: 49, title: "How many pixels?", prompt: "<p>A pixel is filled when its centre is inside the triangle. What does it print?</p>",
        code: `A, B, C = ${pyTup(A)}, ${pyTup(B)}, ${pyTup(C)}\ndef edge(p, q, x, y):\n    return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])\ncount = 0\nfor y in range(7):\n    for x in range(7):\n        w = [edge(A, B, x + 0.5, y + 0.5), edge(B, C, x + 0.5, y + 0.5), edge(C, A, x + 0.5, y + 0.5)]\n        if all(e >= 0 for e in w) or all(e <= 0 for e in w):\n            count += 1\nprint(count)`,
        answer: String(count),
        why: "<p>Each edge function says which side of that edge a point is on. Inside means the same side of all three, whichever way round the corners are listed. GPUs and font rasterisers test millions of pixel centres like this, in parallel.</p>",
      };
    },
    // ch 53: which intent
    intents(r) {
      const INT = { track: ["where", "track", "shipped"], refund: ["refund", "money", "back"], hours: ["open", "hours", "close"] };
      const filler = ["is", "my", "the", "when", "please", "you", "order", "today"];
      const msgs = Array.from({ length: 3 }, () => r.shuffle([...r.shuffle(filler).slice(0, 3), ...Array.from({ length: r.int(0, 3) }, () => r.pick(Object.values(INT).flat()))]).join(" "));
      const classify = (m) => { const w = m.toLowerCase().split(/\W+/); let best = null, top = 0; for (const [n, keys] of Object.entries(INT)) { const c = w.filter((x) => keys.includes(x)).length; if (c > top) { best = n; top = c; } } return best || "unknown"; };
      return {
        ch: 53, title: "What does the customer want?", lang: "node", prompt: "<p>What does it print?</p>",
        code: `const INTENTS = {\n  track: ["where", "track", "shipped"],\n  refund: ["refund", "money", "back"],\n  hours: ["open", "hours", "close"],\n};\nfunction classify(msg) {\n  const words = msg.toLowerCase().split(/\\W+/);\n  let best = null, top = 0;\n  for (const [name, keys] of Object.entries(INTENTS)) {\n    const n = words.filter((w) => keys.includes(w)).length;\n    if (n > top) { best = name; top = n; }\n  }\n  return best ?? "unknown";\n}\nfor (const m of ${JSON.stringify(msgs)}) console.log(classify(m));`,
        answer: msgs.map(classify).join("\n"),
        why: "<p>Count each intent's keywords in the message and take the biggest count; a tie goes to the intent listed first, because only a strictly bigger count replaces the leader. No keywords at all means the bot doesn't understand, which is when it should ask, or hand over to a person.</p>",
      };
    },
  });

  // --------------------------------------------------------------- Probability & Stats --
  G.add("ps", {
    // ch 1: two dice
    dice(r) {
      const s = r.int(2, 12), c = 6 - Math.abs(7 - s);
      return {
        ch: 1, title: "Two dice", prompt: "<p>What does it print?</p>",
        code: `from fractions import Fraction\nways = sum(1 for a in range(1, 7) for b in range(1, 7) if a + b == ${s})\nprint(ways, Fraction(ways, 36))`,
        answer: `${c} ${frac(c, 36)}`,
        why: `<p>All 36 (a, b) pairs are equally likely, and ${c} of them add up to ${s}. 7 is the most likely total, with 6 ways; 2 and 12 have one way each.</p>`,
      };
    },
    // ch 2: drawing without putting back
    draws(r) {
      const red = r.int(2, 6), blue = r.int(2, 6), n = red + blue;
      return {
        ch: 2, title: "Two reds in a row", prompt: `<p>A bag holds ${red} red and ${blue} blue marbles. You draw two without putting the first back. What does it print?</p>`,
        code: `from fractions import Fraction\nred, blue = ${red}, ${blue}\nn = red + blue\nboth = Fraction(red, n) * Fraction(red - 1, n - 1)\nwith_replacement = Fraction(red, n) ** 2\nprint(both, with_replacement)`,
        answer: `${frac(red * (red - 1), n * (n - 1))} ${frac(red * red, n * n)}`,
        why: `<p>P(both red) = P(first red) × P(second red | first red) = ${red}/${n} × ${red - 1}/${n - 1}. The second draw depends on the first. Putting the marble back makes the draws independent, and the chance goes up.</p>`,
      };
    },
    // ch 3: a positive test for a rare disease
    bayes(r) {
      const N = 10000, sick = r.pick([10, 20, 50, 100, 200]), sens = r.pick([90, 95, 99]), fp = r.pick([1, 2, 5, 10]);
      const tp = (sick * sens) / 100, fpos = ((N - sick) * fp) / 100;
      return {
        ch: 3, title: "What a positive test means", prompt: `<p>${sick} in ${N.toLocaleString("en-US")} people have the disease. The test catches ${sens}% of them, and wrongly flags ${fp}% of healthy people. What does it print?</p>`,
        code: `from fractions import Fraction\npeople, sick = ${N}, ${sick}\ntrue_pos = sick * ${sens} // 100\nfalse_pos = (people - sick) * ${fp} // 100\nprint(true_pos, false_pos, Fraction(true_pos, true_pos + false_pos))`,
        answer: `${Math.floor(tp)} ${Math.floor(fpos)} ${frac(Math.floor(tp), Math.floor(tp) + Math.floor(fpos))}`,
        why: `<p>Count people rather than juggling percentages: of everyone who tests positive, only the true positives are ill. When the disease is rare, the healthy majority makes most of the positives, which is Bayes' rule doing its work: P(ill | +) is about ${Math.round((100 * Math.floor(tp)) / (Math.floor(tp) + Math.floor(fpos)))}%.</p>`,
      };
    },
    // ch 4: the binomial distribution
    binomial(r) {
      const n = r.int(3, 8), k = r.int(0, n), c = comb(n, k);
      return {
        ch: 4, title: "Exactly k heads", prompt: `<p>Flip a fair coin ${n} times. What does it print?</p>`,
        code: `from fractions import Fraction\nfrom math import comb\nn, k = ${n}, ${k}\nprint(comb(n, k), Fraction(comb(n, k), 2 ** n))`,
        answer: `${c} ${frac(c, 2 ** n)}`,
        why: `<p>There are 2<sup>${n}</sup> = ${2 ** n} equally likely sequences, and C(${n}, ${k}) = ${c} of them have exactly ${k} heads: choose which ${k} of the ${n} flips land heads.</p>`,
      };
    },
    // ch 5: what a game is worth
    expected(r) {
      const win = r.int(5, 30), cost = r.int(1, 6), sides = r.pick([6, 8, 10]), hits = r.int(1, 2);
      return {
        ch: 5, title: "Worth playing?", prompt: `<p>You pay ${cost} to roll a ${sides}-sided die; on ${hits === 1 ? `a ${sides}` : `${sides - 1} or ${sides}`} you win ${win}. What does it print?</p>`,
        code: `from fractions import Fraction\nwin, cost, sides, hits = ${win}, ${cost}, ${sides}, ${hits}\nvalue = Fraction(hits, sides) * win - cost\nprint(value, value > 0)`,
        answer: `${frac(hits * win - cost * sides, sides)} ${hits * win - cost * sides > 0 ? "True" : "False"}`,
        why: "<p>The expected value is the average result per game over a long run: each outcome's value times its chance, added up. The cost is paid every time, the prize only on a hit.</p>",
      };
    },
    // ch 10: the least-squares line
    slope(r) {
      const xs = [1, 2, 3, 4, 5], ys = ints(r, 5, 1, 12);
      const mx = 3, my = ys.reduce((a, b) => a + b, 0);
      const num = xs.reduce((a, x, i) => a + (x - mx) * (5 * ys[i] - my), 0), den = 5 * xs.reduce((a, x) => a + (x - mx) ** 2, 0);
      return {
        ch: 10, title: "The best straight line", prompt: "<p>What does it print?</p>",
        code: `from fractions import Fraction\nxs = ${pyList(xs)}\nys = ${pyList(ys)}\nmx, my = Fraction(sum(xs), 5), Fraction(sum(ys), 5)\nslope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)\nprint(slope, my - slope * mx)`,
        answer: `${frac(num, den)} ${frac(my * den - 15 * num, 5 * den)}`,
        why: "<p>The least-squares slope is how x and y vary together, divided by how x varies on its own. The line always passes through the point of means (x̄, ȳ), which gives the intercept: ȳ − slope × x̄.</p>",
      };
    },
  });

  // ----------------------------------------------------------------------------- ModSim --
  G.add("ms", {
    // ch 2: bike share
    bikes(r) {
      const olin = r.int(1, 4), well = r.int(1, 4), moves = Array.from({ length: 7 }, () => r.pick(["to_wellesley", "to_olin"]));
      let o = olin, w = well, unhappy = 0;
      for (const m of moves) { if (m === "to_wellesley") { if (o) { o--; w++; } else unhappy++; } else { if (w) { w--; o++; } else unhappy++; } }
      return {
        ch: 2, title: "Bikes on the move", prompt: "<p>What does it print?</p>",
        code: `state = {"olin": ${olin}, "wellesley": ${well}, "unhappy": 0}\ndef move(frm, to):\n    if state[frm] == 0:\n        state["unhappy"] += 1\n        return\n    state[frm] -= 1\n    state[to] += 1\nfor m in ${pyList(moves)}:\n    if m == "to_wellesley":\n        move("olin", "wellesley")\n    else:\n        move("wellesley", "olin")\nprint(state["olin"], state["wellesley"], state["unhappy"])`,
        answer: `${o} ${w} ${unhappy}`,
        why: `<p>The system's state is just the numbers it tracks. Bikes are conserved (${olin + well} in all), and a rider who finds an empty station adds to the unhappy count instead.</p>`,
      };
    },
    // ch 6: growth, step by step
    growth(r) {
      const p0 = r.pick([100, 200, 500]), birth = r.int(5, 15), death = r.int(2, 8), steps = r.int(3, 5);
      const ps = [p0]; for (let i = 0; i < steps; i++) { const p = ps[ps.length - 1]; ps.push(p + Math.floor((p * birth) / 100) - Math.floor((p * death) / 100)); }
      return {
        ch: 6, title: "Grow it a year at a time", prompt: "<p>What does it print?</p>",
        code: `p = ${p0}\nseries = [p]\nfor year in range(${steps}):\n    p = p + p * ${birth} // 100 - p * ${death} // 100\n    series.append(p)\nprint(series)`,
        answer: pyList(ps),
        why: `<p>Each year's change is proportional to the population itself, so the net rate (about ${birth - death}% a year) compounds: growth that feeds on itself is exponential.</p>`,
      };
    },
    // ch 11: a simple epidemic
    sir(r) {
      const N = 1000, i0 = r.int(1, 10), beta = r.pick([30, 40, 50]), gamma = r.pick([10, 20, 25]);
      let s = N - i0, i = i0, rr = 0, peakDay = 0, peak = i0;
      for (let d = 1; d <= 30; d++) { const inf = Math.floor((beta * s * i) / (100 * N)), rec = Math.floor((gamma * i) / 100); s -= inf; i += inf - rec; rr += rec; if (i > peak) { peak = i; peakDay = d; } }
      return {
        ch: 11, title: "When does it peak?", prompt: "<p>What does it print?</p>",
        code: `N = ${N}\ns, i, r = N - ${i0}, ${i0}, 0\npeak, peak_day = i, 0\nfor day in range(1, 31):\n    infected = ${beta} * s * i // (100 * N)\n    recovered = ${gamma} * i // 100\n    s, i, r = s - infected, i + infected - recovered, r + recovered\n    if i > peak:\n        peak, peak_day = i, day\nprint(peak, peak_day, s + i + r)`,
        answer: `${peak} ${peakDay} ${N}`,
        why: `<p>New infections need both susceptible and infected people (β·s·i/N), recoveries need only the infected (γ·i). The epidemic peaks once s has fallen far enough that infections no longer outpace recoveries. Everyone is in exactly one box, so s + i + r stays ${N}.</p>`,
      };
    },
    // ch 20: a falling ball, one second at a time
    projectile(r) {
      const v0 = r.pick([10, 20, 25, 30, 40]), h0 = r.pick([0, 5, 15]), g = 10;
      let y = h0, v = v0, t = 0, top = h0;
      while (y >= 0) { y += v; v -= g; t++; top = Math.max(top, y); }
      return {
        ch: 20, title: "Up and down, in steps", prompt: "<p>Euler's method with a 1-second step. What does it print?</p>",
        code: `y, v = ${h0}, ${v0}   # metres, metres a second\ng, t, top = 10, 0, y\nwhile y >= 0:\n    y += v\n    v -= g\n    t += 1\n    top = max(top, y)\nprint(t, top)`,
        answer: `${t} ${top}`,
        why: "<p>Each step moves at the current speed, then lets gravity change the speed. With steps this big, Euler's answer is off from the exact one (it moves at the start-of-step speed for the whole second); a smaller step gets closer.</p>",
      };
    },
  });

  // ------------------------------------------------------------------ Complexity in code --
  G.add("tc", {
    // ch 2: degrees and triangles
    triangles(r) {
      const n = 5, e = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (r.next() < 0.5) e.push([a, b]);
      if (!e.length) e.push([0, 1]);
      const adj = Array.from({ length: n }, () => new Set());
      for (const [a, b] of e) { adj[a].add(b); adj[b].add(a); }
      let t = 0; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) if (adj[a].has(b) && adj[b].has(c) && adj[a].has(c)) t++;
      return {
        ch: 2, title: "Degrees and triangles", prompt: "<p>What does it print?</p>",
        code: `from itertools import combinations\nedges = ${pyList(e.map((x) => `(${x[0]}, ${x[1]})`)).replace(/'/g, "")}\nadj = {u: set() for u in range(${n})}\nfor a, b in edges:\n    adj[a].add(b)\n    adj[b].add(a)\ndegrees = [len(adj[u]) for u in range(${n})]\ntriangles = sum(1 for a, b, c in combinations(range(${n}), 3) if b in adj[a] and c in adj[b] and c in adj[a])\nprint(degrees, triangles)`,
        answer: `${pyList(adj.map((s) => s.size))} ${t}`,
        why: `<p>A node's degree is its number of neighbours; the degrees add up to twice the edges (${2 * e.length}). Triangles, friends of friends who are also friends, are what clustering counts.</p>`,
      };
    },
    // ch 5: an elementary cellular automaton
    automaton(r) {
      const rule = r.pick([30, 90, 110, 184, 60, 102, 150]), w = 9, steps = 3;
      let row = Array(w).fill(0); row[4] = 1;
      const rows = [row.join("")];
      for (let s = 0; s < steps; s++) { row = row.map((_, i) => (rule >> ((row[(i - 1 + w) % w] << 2) | (row[i] << 1) | row[(i + 1) % w])) & 1); rows.push(row.join("")); }
      return {
        ch: 5, title: `Rule ${rule}`, prompt: "<p>The edges wrap round. What does it print?</p>",
        code: `rule, w = ${rule}, ${w}\nrow = [0] * w\nrow[4] = 1\nprint("".join(map(str, row)))\nfor step in range(${steps}):\n    row = [(rule >> (row[i - 1] * 4 + row[i] * 2 + row[(i + 1) % w])) & 1 for i in range(w)]\n    print("".join(map(str, row)))`,
        answer: rows.join("\n"),
        why: `<p>Each cell looks at itself and its two neighbours: three bits make a number 0 to 7, and bit number <i>that</i> of ${rule} (<code>${rule.toString(2).padStart(8, "0")}</code> in binary) is the cell's next state. Python's <code>row[-1]</code> is the last cell, which is what makes the left edge wrap.</p>`,
      };
    },
    // ch 6: one step of the Game of Life
    life(r) {
      const n = 5, g = Array.from({ length: n }, () => Array.from({ length: n }, () => (r.next() < 0.35 ? 1 : 0)));
      const nb = (i, j) => { let c = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && i + a >= 0 && i + a < n && j + b >= 0 && j + b < n) c += g[i + a][j + b]; return c; };
      const h = g.map((row, i) => row.map((x, j) => { const c = nb(i, j); return (x && (c === 2 || c === 3)) || (!x && c === 3) ? 1 : 0; }));
      const before = g.flat().reduce((a, b) => a + b, 0), after = h.flat().reduce((a, b) => a + b, 0);
      return {
        ch: 6, title: "One step of Life", prompt: "<p>Cells beyond the edge count as dead. What does it print?</p>",
        code: `${"g = [\n" + g.map((row) => "    " + pyList(row) + ",").join("\n") + "\n]"}\nn = ${n}\ndef neighbours(i, j):\n    return sum(g[a][b] for a in range(i - 1, i + 2) for b in range(j - 1, j + 2)\n               if (a, b) != (i, j) and 0 <= a < n and 0 <= b < n)\nnew = [[1 if (g[i][j] and neighbours(i, j) in (2, 3)) or (not g[i][j] and neighbours(i, j) == 3) else 0\n        for j in range(n)] for i in range(n)]\nprint(sum(map(sum, g)), sum(map(sum, new)))`,
        answer: `${before} ${after}`,
        why: "<p>A live cell survives with 2 or 3 live neighbours; a dead cell comes alive with exactly 3. Every cell's next state is worked out from the <i>old</i> grid, which is why the new one is built separately.</p>",
      };
    },
    // ch 8: a sandpile
    sandpile(r) {
      const n = 3, g0 = Array.from({ length: n }, () => ints(r, n, 0, 3)), grains = r.int(1, 4);
      const g = g0.map((row) => row.slice());
      g[1][1] += grains;
      let topples = 0;
      for (;;) { let any = false; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (g[i][j] >= 4) { any = true; topples++; g[i][j] -= 4; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && a < n && b >= 0 && b < n) g[a][b]++; } if (!any) break; }
      return {
        ch: 8, title: "Drop the sand", prompt: `<p>${grains} grain${grains === 1 ? " lands" : "s land"} on the middle. Any pile of 4 or more topples, sending one grain to each neighbour (grains off the edge are lost). What does it print?</p>`,
        code: "g = [\n" + g0.map((row) => "    " + pyList(row) + ",").join("\n") + `\n]\ng[1][1] += ${grains}\ntopples = 0\nwhile True:\n    unstable = [(i, j) for i in range(3) for j in range(3) if g[i][j] >= 4]\n    if not unstable:\n        break\n    for i, j in unstable:\n        if g[i][j] < 4:\n            continue\n        g[i][j] -= 4\n        topples += 1\n        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):\n            if 0 <= a < 3 and 0 <= b < 3:\n                g[a][b] += 1\nprint(g, topples)`,
        answer: "[" + g.map(pyList).join(", ") + "] " + topples,
        why: `<p>${topples ? `One topple can push a neighbour over 4, which topples in turn: an avalanche, ${topples} topple${topples === 1 ? "" : "s"} here.` : "Nothing reached 4, so nothing toppled."} The order the piles topple in doesn't change the end result: sandpiles are <i>abelian</i>. Most grains cause nothing; now and then one causes a big avalanche, which is self-organised criticality.</p>`,
      };
    },
  });

  // ------------------------------------------------- round two: Stats, ModSim, Complexity --
  const fl = (a, b) => Math.floor(a / b); // Python's //
  G.add("ps", {
    // ch 6: how unusual is it?
    zscore(r) {
      const mu = r.int(50, 100), sd = r.pick([4, 5, 8, 10, 12]), x = mu + r.int(-3, 3) * sd + r.pick([0, 0, r.int(-sd + 1, sd - 1)]);
      const z = frac(x - mu, sd), far = Math.abs(x - mu) > 2 * sd;
      return {
        ch: 6, title: "How many standard deviations?", prompt: `<p>Scores are roughly normal with mean ${mu} and standard deviation ${sd}. What does it print?</p>`,
        code: `from fractions import Fraction\nmu, sd, x = ${mu}, ${sd}, ${x}\nz = Fraction(x - mu, sd)\nprint(z, abs(z) > 2)`,
        answer: `${z} ${pyBool(far)}`,
        why: `<p>z = (x − μ) / σ says how many standard deviations x is from the mean. About 95% of a normal distribution is within 2 of them, so ${far ? "this score is rare: under 5% are that far out" : "this score isn't unusual"}.</p>`,
      };
    },
    // ch 7: who answers the survey
    surveyBias(r) {
      const pop = ints(r, 8, 1, 10), T = r.int(3, 7), resp = pop.filter((x) => x >= T);
      if (!resp.length) return G.GENS.surveyBias(r);
      const sum = (a) => a.reduce((s, x) => s + x, 0);
      return {
        ch: 7, title: "Who answers the survey?", prompt: `<p>Everyone rates a product from 1 to 10, but only people who rate it at least ${T} bother to reply. What does it print?</p>`,
        code: `from fractions import Fraction\nratings = ${pyList(pop)}\nreplies = [x for x in ratings if x >= ${T}]\nprint(Fraction(sum(ratings), len(ratings)), Fraction(sum(replies), len(replies)))`,
        answer: `${frac(sum(pop), pop.length)} ${frac(sum(resp), resp.length)}`,
        why: "<p>The replies' average is higher than the truth, and a bigger survey wouldn't help: it would just measure the wrong thing more precisely. Bias comes from <i>who</i> gets into the sample, not how many.</p>",
      };
    },
    // ch 8: a confidence interval for a mean
    interval(r) {
      const n = r.pick([4, 9, 16, 25, 36, 49]), sd = r.int(2, 12), mean = r.int(20, 80), se = frac(sd, Math.sqrt(n));
      return {
        ch: 8, title: "Plus or minus what?", prompt: `<p>A sample of ${n} has mean ${mean} and standard deviation ${sd}. What does it print?</p>`,
        code: `from fractions import Fraction\nfrom math import isqrt\nn, mean, sd = ${n}, ${mean}, ${sd}\nse = Fraction(sd, isqrt(n))\nprint(se, mean - 2 * se, mean + 2 * se)`,
        answer: `${se} ${frac(mean * Math.sqrt(n) - 2 * sd, Math.sqrt(n))} ${frac(mean * Math.sqrt(n) + 2 * sd, Math.sqrt(n))}`,
        why: `<p>The standard error, σ/√n, is how much the sample mean wobbles from sample to sample. Mean ± 2 standard errors is roughly a 95% interval. To halve its width you need four times the data.</p>`,
      };
    },
    // ch 9: an exact permutation test
    permTest(r) {
      const a = ints(r, 3, 1, 12), b = ints(r, 3, 4, 15), all = a.concat(b), obs = b.reduce((s, x) => s + x, 0) - a.reduce((s, x) => s + x, 0);
      let count = 0, total = 0;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) { total++; const g = [i, j, k], sB = g.reduce((s, x) => s + all[x], 0), sA = all.reduce((s, x) => s + x, 0) - sB; if (sB - sA >= obs) count++; }
      return {
        ch: 9, title: "Could it be chance?", prompt: "<p>What does it print?</p>",
        code: `from fractions import Fraction\nfrom itertools import combinations\na, b = ${pyList(a)}, ${pyList(b)}\nobserved = sum(b) - sum(a)\npool = a + b\ncount = total = 0\nfor idx in combinations(range(6), 3):\n    new_b = sum(pool[i] for i in idx)\n    total += 1\n    if new_b - (sum(pool) - new_b) >= observed:\n        count += 1\nprint(observed, count, total, Fraction(count, total))`,
        answer: `${obs} ${count} ${total} ${frac(count, total)}`,
        why: `<p>If the groups made no difference, any 3 of the 6 values were as likely to be "b" as the real ones. Trying all ${total} ways to split them, ${count} give a difference at least as big as the real one: that fraction is the p-value.</p>`,
      };
    },
    // ch 11: updating a Beta prior
    betaUpdate(r) {
      const a = r.int(1, 4), b = r.int(1, 4), n = r.int(3, 12), k = r.int(0, n);
      return {
        ch: 11, title: "Update your belief", prompt: `<p>Your belief about a coin's chance of heads is Beta(${a}, ${b}). Then you see ${k} heads in ${n} flips. What does it print?</p>`,
        code: `from fractions import Fraction\na, b = ${a}, ${b}\nn, k = ${n}, ${k}\na, b = a + k, b + (n - k)\nprint(a, b, Fraction(a, a + b))`,
        answer: `${a + k} ${b + n - k} ${frac(a + k, a + b + n)}`,
        why: "<p>With a Beta prior, Bayes' rule is just counting: add the heads to a and the tails to b. The posterior mean a/(a + b) sits between the prior's guess and the data's k/n, closer to the data the more of it there is.</p>",
      };
    },
    // ch 12: a two-state Markov chain
    markov(r) {
      const p = r.int(1, 9), q = r.int(1, 9); // P(sun -> rain) = p/10, P(rain -> sun) = q/10
      let s = 10, rn = 0; // start: sunny, in tenths
      const step = ([x, y]) => [x * (10 - p) + y * q, x * p + y * (10 - q)];
      const [s1, r1] = step([s, rn]), [s2, r2] = step([s1, r1]);
      return {
        ch: 12, title: "Sun or rain, two days on", prompt: "<p>Today is sunny. What does it print?</p>",
        code: `from fractions import Fraction\np = Fraction(${p}, 10)   # sunny today -> rain tomorrow\nq = Fraction(${q}, 10)   # rain today -> sun tomorrow\nsun, rain = Fraction(1), Fraction(0)\nfor day in range(2):\n    sun, rain = sun * (1 - p) + rain * q, sun * p + rain * (1 - q)\nprint(sun, rain, q / (p + q))`,
        answer: `${frac(s2, 1000)} ${frac(r2, 1000)} ${frac(q, p + q)}`,
        why: `<p>Tomorrow only depends on today. Each day the chances mix through the transition probabilities. Over many days they settle at the stationary distribution, sun = q/(p + q) = ${frac(q, p + q)}, whatever today was; MCMC is built on exactly that forgetting.</p>`,
      };
    },
    // ch 13: an A/B result
    abTest(r) {
      const na = r.pick([100, 200, 400]), nb = na, ca = r.int(5, na / 5), cb = r.int(5, na / 5);
      return {
        ch: 13, title: "Did B win?", prompt: `<p>${na} visitors saw each version of the page. What does it print?</p>`,
        code: `from fractions import Fraction\nna, ca = ${na}, ${ca}   # visitors, sign-ups on A\nnb, cb = ${nb}, ${cb}\nrate_a, rate_b = Fraction(ca, na), Fraction(cb, nb)\nprint(rate_a, rate_b, rate_b - rate_a)`,
        answer: `${frac(ca, na)} ${frac(cb, nb)} ${frac(cb - ca, na)}`,
        why: "<p>The raw difference in rates is only the start: with a few hundred visitors, differences this size often come from chance alone. An honest test fixes the sample size in advance, then asks how often a difference this big would show up if A and B were the same.</p>",
      };
    },
  });

  G.add("ms", {
    // ch 4: sweep one parameter
    sweep(r) {
      const a = r.int(60, 120), b = r.int(2, 4), lo = r.int(5, 10), hi = lo + r.int(8, 16);
      let best = null, bv = -Infinity;
      for (let p = lo; p <= hi; p += 2) { const v = p * (a - b * p); if (v > bv) { bv = v; best = p; } }
      return {
        ch: 4, title: "Find the best price", prompt: "<p>At price p you sell <code>a - b·p</code> cups. What does it print?</p>",
        code: `a, b = ${a}, ${b}\nbest = max(range(${lo}, ${hi + 1}, 2), key=lambda p: p * (a - b * p))\nprint(best, best * (a - b * best))`,
        answer: `${best} ${bv}`,
        why: `<p>Sweeping tries every value in the range and keeps the best. Revenue p(a − bp) rises, peaks near p = a/(2b) = ${(a / (2 * b)).toFixed(1).replace(/\.0$/, "")}, then falls; only even prices from ${lo} to ${hi} are tried here, so the sweep can only be as good as its grid.</p>`,
      };
    },
    // ch 5: a straight-line projection
    linear(r) {
      const p0 = r.int(20, 40) * 100, k = r.int(20, 90), y0 = 2000, y = y0 + r.int(5, 30);
      return {
        ch: 5, title: "Extend the line", prompt: `<p>A town had ${p0.toLocaleString("en-US")} people in ${y0} and has grown by ${k} a year since. What does it print?</p>`,
        code: `p = ${p0}\nfor year in range(${y0}, ${y}):\n    p += ${k}\nprint(${y}, p)`,
        answer: `${y} ${p0 + k * (y - y0)}`,
        why: `<p>Constant growth adds the same amount each year: ${p0} + ${k} × ${y - y0}. Note <code>range(${y0}, ${y})</code> runs ${y - y0} times. A straight line is the simplest model; real populations usually grow in proportion to their size.</p>`,
      };
    },
    // ch 7: growth that levels off
    logistic(r) {
      const p0 = r.int(50, 200), a = r.int(20, 50), K = r.pick([800, 1000, 1200]);
      const ps = [p0]; for (let i = 0; i < 4; i++) { const p = ps[ps.length - 1]; ps.push(p + fl(a * p * (K - p), 100 * K)); }
      return {
        ch: 7, title: "Growth that levels off", prompt: "<p>What does it print?</p>",
        code: `p, K = ${p0}, ${K}\nseries = [p]\nfor year in range(4):\n    p = p + ${a} * p * (K - p) // (100 * K)\n    series.append(p)\nprint(series)`,
        answer: pyList(ps),
        why: `<p>Each year's growth is ${a}% of p, scaled by the room left, (K − p)/K. Small populations grow almost exponentially; near the carrying capacity K = ${K} growth stalls. That's the logistic curve's S shape.</p>`,
      };
    },
    // ch 15: cooling
    cooling(r) {
      const T0 = r.int(70, 95), env = r.int(15, 25), k = r.pick([10, 20, 25]);
      const ts = [T0]; for (let i = 0; i < 4; i++) { const T = ts[ts.length - 1]; ts.push(T - fl(k * (T - env), 100)); }
      return {
        ch: 15, title: "Coffee cooling", prompt: `<p>The room is ${env}°. What does it print?</p>`,
        code: `T = ${T0}\ntemps = [T]\nfor minute in range(4):\n    T = T - ${k} * (T - ${env}) // 100\n    temps.append(T)\nprint(temps)`,
        answer: pyList(ts),
        why: `<p>Newton's law of cooling: the drop each minute is proportional to how much hotter than the room it is, so it cools fast at first and slower and slower as it nears ${env}°.</p>`,
      };
    },
    // ch 16: mixing
    mixing(r) {
      const v1 = r.int(1, 5) * 50, t1 = r.int(60, 90), v2 = r.int(1, 5) * 50, t2 = r.int(5, 25);
      return {
        ch: 16, title: "Mix two drinks", prompt: `<p>${v1} ml at ${t1}° and ${v2} ml at ${t2}°, mixed. What does it print?</p>`,
        code: `from fractions import Fraction\nv1, t1, v2, t2 = ${v1}, ${t1}, ${v2}, ${t2}\nprint(Fraction(v1 * t1 + v2 * t2, v1 + v2))`,
        answer: frac(v1 * t1 + v2 * t2, v1 + v2),
        why: "<p>Heat is conserved, so the mix's temperature is the average of the two, weighted by volume. It's always between them, and closer to the bigger one.</p>",
      };
    },
    // ch 17: a drug's half-life
    halfLife(r) {
      const D = r.pick([80, 100, 160, 200, 320]), h = r.pick([2, 4, 6]), doses = r.int(2, 4);
      let amt = 0; const out = [];
      for (let i = 0; i < doses; i++) { amt = amt / 2 + D; out.push(amt); }
      const fmt = (x) => (Number.isInteger(x) ? String(x) : frac(Math.round(x * 64), 64));
      return {
        ch: 17, title: "Dose after dose", prompt: `<p>A dose of ${D} mg every ${h} hours; the body clears half of it every ${h} hours. What does it print?</p>`,
        code: `from fractions import Fraction\namount = Fraction(0)\nfor dose in range(${doses}):\n    amount = amount / 2 + ${D}\n    print(amount, end=" ")`,
        answer: out.map(fmt).join(" "),
        why: `<p>Right after each dose, the body holds half the previous level plus the new dose. That climbs towards a steady state where what's cleared equals what's added: 2 × ${D} = ${2 * D} mg.</p>`,
      };
    },
    // ch 21: falling with drag
    drag(r) {
      const k = r.pick([2, 4, 5, 10]);
      const vs = [0]; for (let i = 0; i < 5; i++) { const v = vs[vs.length - 1]; vs.push(v + 10 - fl(k * v * v, 100)); }
      return {
        ch: 21, title: "Terminal velocity", prompt: "<p>What does it print?</p>",
        code: `v = 0\nspeeds = [v]\nfor second in range(5):\n    v = v + 10 - ${k} * v * v // 100\n    speeds.append(v)\nprint(speeds)`,
        answer: pyList(vs),
        why: `<p>Gravity adds 10 a second; drag takes away more the faster you go (it grows with v²). They balance at the terminal velocity, where k·v²/100 = 10, about ${Math.sqrt(1000 / k).toFixed(0)} here, and the speed stops growing.</p>`,
      };
    },
    // ch 22: a throw in two dimensions
    flight2d(r) {
      const vx = r.int(2, 6), vy0 = r.pick([10, 15, 20, 25, 30]);
      let x = 0, y = 0, vy = vy0, t = 0;
      do { x += vx; y += vy; vy -= 10; t++; } while (y > 0);
      return {
        ch: 22, title: "Where does it land?", prompt: "<p>Euler's method, one-second steps, from the ground. What does it print?</p>",
        code: `x, y = 0, 0\nvx, vy = ${vx}, ${vy0}\nt = 0\nwhile True:\n    x, y = x + vx, y + vy\n    vy -= 10\n    t += 1\n    if y <= 0:\n        break\nprint(t, x, y)`,
        answer: `${t} ${x} ${y}`,
        why: "<p>The two directions are independent: sideways it drifts at a constant speed, while gravity only changes the upward speed. The flight time comes from the vertical motion alone; the distance is that time × the sideways speed.</p>",
      };
    },
    // ch 24: spinning up
    spin(r) {
      const alpha = r.int(1, 4), w0 = r.int(0, 5), n = r.int(3, 6);
      let th = 0, w = w0; for (let i = 0; i < n; i++) { th += w; w += alpha; }
      return {
        ch: 24, title: "How far has it turned?", prompt: "<p>Angles in degrees, one-second steps. What does it print?</p>",
        code: `theta, omega = 0, ${w0}\nalpha = ${alpha}\nfor second in range(${n}):\n    theta += omega\n    omega += alpha\nprint(theta, omega)`,
        answer: `${th} ${w}`,
        why: "<p>Rotation follows the same rules as moving in a line: angle for position, angular velocity ω for velocity, angular acceleration α for acceleration. This Euler step moves at the start-of-step ω each second.</p>",
      };
    },
    // ch 25: torques on a lever
    torque(r) {
      const forces = Array.from({ length: 3 }, () => [r.int(-4, 4) || 1, r.int(-5, 5)]); // (distance from pivot, upward force)
      const taus = forces.map(([d, f]) => d * f), net = taus.reduce((a, b) => a + b, 0);
      return {
        ch: 25, title: "Which way does it tip?", prompt: "<p>A seesaw: each force is <code>(distance from the pivot, upward push)</code>; negative distances are left of the pivot. What does it print?</p>",
        code: `forces = ${tupList(forces)}\ntorques = [d * f for d, f in forces]\nnet = sum(torques)\nprint(torques, net, "left down" if net > 0 else "right down" if net < 0 else "balanced")`,
        answer: `${pyList(taus)} ${net} ${net > 0 ? "left down" : net < 0 ? "right down" : "balanced"}`,
        why: "<p>Torque is distance × force: a small push far from the pivot can beat a big one close in. Positive net torque turns it anticlockwise, which tips the left end down. Zero net torque means it balances.</p>",
      };
    },
    // ch 13: sweep two parameters
    sweep2(r) {
      const A = [1, 2, 3, 4], B = [1, 2, 3, 4], ta = r.int(1, 4), tb = r.int(1, 4), w = r.int(1, 3);
      let best = null, bv = -Infinity;
      for (const a of A) for (const b of B) { const v = 50 - w * (a - ta) ** 2 - (b - tb) ** 2 - a * b; if (v > bv) { bv = v; best = [a, b]; } }
      return {
        ch: 13, title: "The best pair", prompt: "<p>What does it print?</p>",
        code: `def score(a, b):\n    return 50 - ${w} * (a - ${ta}) ** 2 - (b - ${tb}) ** 2 - a * b\nbest = max(((a, b) for a in range(1, 5) for b in range(1, 5)), key=lambda p: score(*p))\nprint(best, score(*best))`,
        answer: `${pyTup(best)} ${bv}`,
        why: "<p>With two parameters, the sweep is a grid: every a with every b, 16 runs here. The <code>a * b</code> term ties them together, so the best a depends on b, and you can't find the best pair by tuning one at a time. <code>max</code> keeps the first best it meets.</p>",
      };
    },
  });

  G.add("tc", {
    // ch 3: a small world
    smallWorld(r) {
      const n = 8, adj = Array.from({ length: n }, () => new Set());
      const link = (a, b) => { if (a !== b) { adj[a].add(b); adj[b].add(a); } };
      for (let i = 0; i < n; i++) link(i, (i + 1) % n);
      const extra = r.int(1, 3), sc = [];
      for (let k = 0; k < extra; k++) { const a = r.int(0, n - 1), b = (a + r.int(2, 6)) % n; link(a, b); sc.push([a, b]); }
      let tot = 0, diam = 0;
      for (let s = 0; s < n; s++) { const d = Array(n).fill(-1); d[s] = 0; const q = [s]; while (q.length) { const u = q.shift(); for (const v of adj[u]) if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } } for (let t = 0; t < n; t++) { tot += d[t]; diam = Math.max(diam, d[t]); } }
      return {
        ch: 3, title: "How far apart?", prompt: `<p>8 people in a ring, each knowing their two neighbours${extra ? `, plus ${extra} shortcut${extra === 1 ? "" : "s"}` : ""}. What does it print?</p>`,
        code: `from collections import deque\nfrom fractions import Fraction\nn = 8\nadj = {i: {(i - 1) % n, (i + 1) % n} for i in range(n)}\nfor a, b in ${tupList(sc)}:\n    adj[a].add(b)\n    adj[b].add(a)\ntotal = diameter = 0\nfor s in range(n):\n    dist = {s: 0}\n    q = deque([s])\n    while q:\n        u = q.popleft()\n        for v in adj[u]:\n            if v not in dist:\n                dist[v] = dist[u] + 1\n                q.append(v)\n    total += sum(dist.values())\n    diameter = max(diameter, max(dist.values()))\nprint(Fraction(total, n * (n - 1)), diameter)`,
        answer: `${frac(tot, n * (n - 1))} ${diam}`,
        why: "<p>The average distance over every ordered pair, by BFS from each node, and the longest one. A plain ring averages 16/7; a single shortcut pulls many pairs closer at once. That's the small-world effect: a few long links make the whole network close.</p>",
      };
    },
    // ch 4: the rich get richer
    richer(r) {
      const n = r.int(6, 8), deg = [1, 1], edges = [[0, 1]];
      const tiePick = r.pick(["low", "high"]);
      for (let v = 2; v < n; v++) { let best = 0; for (let u = 1; u < v; u++) if (tiePick === "low" ? deg[u] > deg[best] : deg[u] >= deg[best]) best = u; edges.push([v, best]); deg[best]++; deg.push(1); }
      return {
        ch: 4, title: "Who gets the links?", prompt: "<p>Each new node links to the existing node with the most links. What does it print?</p>",
        code: `deg = [1, 1]   # nodes 0 and 1, joined\nfor v in range(2, ${n}):\n    best = ${tiePick === "low" ? "max(range(v), key=lambda u: (deg[u], -u))" : "max(range(v), key=lambda u: (deg[u], u))"}\n    deg[best] += 1\n    deg.append(1)\nprint(deg)`,
        answer: pyList(deg),
        why: `<p>Whoever leads keeps getting more, so one hub ends up with almost every link. Real preferential attachment picks in <i>proportion</i> to degree, randomly, which gives a few big hubs and many small nodes: a scale-free network. Ties go to the ${tiePick === "low" ? "lower" : "higher"} number here.</p>`,
      };
    },
    // ch 7: diffusion
    diffusion(r) {
      const c = [0, 0, 0, 0, 0, 0, 0]; c[r.int(2, 4)] = r.pick([40, 80, 100]);
      const step = (c) => c.map((x, i) => (i === 0 || i === c.length - 1 ? x : x + fl(c[i - 1] - 2 * x + c[i + 1], 4)));
      const c2 = step(step(c));
      return {
        ch: 7, title: "Let it spread", prompt: "<p>The two ends are held at 0. What does it print after two steps?</p>",
        code: `c = ${pyList(c)}\nfor step in range(2):\n    c = [c[i] if i in (0, len(c) - 1) else c[i] + (c[i - 1] - 2 * c[i] + c[i + 1]) // 4 for i in range(len(c))]\nprint(c, sum(c))`,
        answer: `${pyList(c2)} ${c2.reduce((a, b) => a + b, 0)}`,
        why: "<p>Each cell moves towards the average of its neighbours: the spike flattens and spreads, which is how heat and dye diffuse. (Floor division loses a little each step, so the total isn't exactly conserved, a real artefact of integer models.)</p>",
      };
    },
    // ch 9: who wants to move
    schelling(r) {
      const n = 10, ring = Array.from({ length: n }, () => r.pick(["x", "o"]));
      const unhappy = ring.map((a, i) => (ring[(i + n - 1) % n] !== a && ring[(i + 1) % n] !== a ? 1 : 0)), total = unhappy.reduce((s, x) => s + x, 0);
      return {
        ch: 9, title: "Who wants to move?", prompt: "<p>Agents live in a ring. One is unhappy if neither neighbour is its own kind. What does it print?</p>",
        code: `ring = "${ring.join("")}"\nn = len(ring)\nunhappy = [i for i in range(n) if ring[i - 1] != ring[i] and ring[(i + 1) % n] != ring[i]]\nprint(len(unhappy), unhappy)`,
        answer: `${total} ${pyList(unhappy.map((u, i) => (u ? i : -1)).filter((i) => i >= 0))}`,
        why: "<p>Each agent only asks for one neighbour like itself, a mild preference. Yet when unhappy agents move, the ring sorts itself into long runs of x and o: strong segregation from weak individual preferences. <code>ring[i - 1]</code> wraps round at i = 0.</p>",
      };
    },
    // ch 10: lining up with the neighbours
    align(r) {
      const n = 6, pos = distinctSorted2(r, n, 0, 20), head = ints(r, n, 0, 8), R = r.int(2, 5);
      const nh = pos.map((p, i) => { const nb = pos.map((q, j) => (Math.abs(q - p) <= R ? head[j] : null)).filter((x) => x != null); return fl(nb.reduce((a, b) => a + b, 0), nb.length); });
      return {
        ch: 10, title: "Follow the neighbours", prompt: `<p>Birds on a line; each turns to the average heading of every bird within ${R} (itself included). What does it print?</p>`,
        code: `pos = ${pyList(pos)}\nheading = ${pyList(head)}\nnew = []\nfor p in pos:\n    near = [h for q, h in zip(pos, heading) if abs(q - p) <= ${R}]\n    new.append(sum(near) // len(near))\nprint(new)`,
        answer: pyList(nh),
        why: "<p>Alignment, one of the three boid rules: each bird copies the average heading nearby. Repeat it and local groups agree on a direction, a flock with no leader. Birds with no neighbours in range keep their own heading.</p>",
      };
    },
    // ch 11: selection changes the mix
    replicator(r) {
      const x = [r.int(1, 5), r.int(1, 5), r.int(1, 5)], f = [r.int(1, 4), r.int(1, 4), r.int(1, 4)];
      let cur = x.slice();
      for (let g = 0; g < 2; g++) cur = cur.map((v, i) => v * f[i]);
      const tot = cur.reduce((a, b) => a + b, 0);
      return {
        ch: 11, title: "Two generations of selection", prompt: "<p>Three types with these starting counts and fitnesses (offspring each). What does it print?</p>",
        code: `from fractions import Fraction\ncount = ${pyList(x)}\nfitness = ${pyList(f)}\nfor gen in range(2):\n    count = [c * w for c, w in zip(count, fitness)]\ntotal = sum(count)\nprint([str(Fraction(c, total)) for c in count])`,
        answer: "[" + cur.map((c) => `'${frac(c, tot)}'`).join(", ") + "]",
        why: "<p>Each type grows by its fitness every generation, so after g generations its share is proportional to count × fitness<sup>g</sup>. A small advantage compounds: the fittest type takes over in the end, however few it started with.</p>",
      };
    },
    // ch 12: the iterated prisoner's dilemma
    dilemma(r) {
      const S = ["always_c", "always_d", "tit_for_tat", "grudger"], [s1, s2] = [r.pick(S), r.pick(S)], n = r.int(3, 6);
      const play = (s, mine, theirs) => (s === "always_c" ? "C" : s === "always_d" ? "D" : s === "tit_for_tat" ? (theirs.length ? theirs[theirs.length - 1] : "C") : theirs.includes("D") ? "D" : "C");
      const PAY = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
      const h1 = [], h2 = []; let p1 = 0, p2 = 0;
      for (let i = 0; i < n; i++) { const a = play(s1, h1, h2), b = play(s2, h2, h1); h1.push(a); h2.push(b); p1 += PAY[a + b][0]; p2 += PAY[a + b][1]; }
      return {
        ch: 12, title: "Who scores more?", prompt: `<p>${n} rounds of the prisoner's dilemma: both cooperate 3 each, both defect 1 each, a lone defector 5 and the sucker 0. What does it print?</p>`,
        code: `def always_c(mine, theirs): return "C"\ndef always_d(mine, theirs): return "D"\ndef tit_for_tat(mine, theirs): return theirs[-1] if theirs else "C"\ndef grudger(mine, theirs): return "D" if "D" in theirs else "C"\nPAY = {"CC": (3, 3), "CD": (0, 5), "DC": (5, 0), "DD": (1, 1)}\nh1, h2, p1, p2 = [], [], 0, 0\nfor _ in range(${n}):\n    a, b = ${s1}(h1, h2), ${s2}(h2, h1)\n    h1.append(a)\n    h2.append(b)\n    p1 += PAY[a + b][0]\n    p2 += PAY[a + b][1]\nprint("".join(h1), "".join(h2), p1, p2)`,
        answer: `${h1.join("")} ${h2.join("")} ${p1} ${p2}`,
        why: "<p>Defecting wins any single round, but strategies that cooperate and punish defection, like tit for tat, do well over many rounds: they never beat their partner, yet they rack up 3s with anyone willing to cooperate. That's how cooperation can evolve.</p>",
      };
    },
  });
  function distinctSorted2(r, n, lo, hi) { const s = new Set(); while (s.size < n) s.add(r.int(lo, hi)); return [...s].sort((a, b) => a - b); }

  if (typeof module === "object" && module.exports) module.exports = G;
})(this);
