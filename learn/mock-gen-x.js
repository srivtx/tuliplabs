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

  if (typeof module === "object" && module.exports) module.exports = G;
})(this);
