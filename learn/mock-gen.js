/* Tulip Labs: fresh "trace it" questions for the DSA mock test.
   Each generator takes a random source and returns one question: a short Python program built from fresh
   random data, and the answer, worked out here in JavaScript. tools/mock-check.js runs every program with
   real Python, hundreds of times per generator, and checks it prints exactly the answer given here.
   A question looks like:
     { gen, ch, title, prompt (HTML), code (Python), answer (what Python prints), match: "tokens" | "choice",
       opts (for "choice"), why (HTML) }
   "tokens" answers are marked on their numbers and words, so "[1, 2]" and "1 2" both count. */
(function (root) {
  "use strict";

  function rng(seed) {
    let s = seed >>> 0 || 1;
    const next = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
    return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (a) => a[Math.floor(next() * a.length)], shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } };
  }
  const pyList = (a) => "[" + a.map((x) => (typeof x === "string" ? `'${x}'` : String(x))).join(", ") + "]";
  const distinctSorted = (r, n, lo, hi) => { const s = new Set(); while (s.size < n) s.add(r.int(lo, hi)); return [...s].sort((a, b) => a - b); };
  const LETTERS = "ABCDEFGH".split("");

  const GENS = {
    // ch 9: where binary search looks
    bsearch(r) {
      const a = distinctSorted(r, 15, 1, 99);
      const target = r.next() < 0.7 ? r.pick(a) : r.int(1, 99);
      const mids = [];
      let lo = 0, hi = a.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        mids.push(mid);
        if (a[mid] === target) break;
        if (a[mid] < target) lo = mid + 1; else hi = mid - 1;
      }
      return {
        ch: 9, title: "Where does binary search look?",
        prompt: `<p>Which indices does <code>mid</code> take, in order?</p>`,
        code: `a = ${pyList(a)}\ntarget = ${target}\nlo, hi = 0, len(a) - 1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    print(mid, end=" ")\n    if a[mid] == target:\n        break\n    if a[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1`,
        answer: mids.join(" "),
        why: `<p>Each look halves what's left: ${mids.map((m) => `<code>a[${m}] = ${a[m]}</code>`).join(", ")}. ${a.includes(target) ? "It stops when it finds " + target + "." : target + " isn't there, so it stops when <code>lo</code> passes <code>hi</code>."} At most ⌈log₂ 16⌉ = 4 looks for 15 items.</p>`,
      };
    },
    // ch 15: the heap's list after pushes
    heap(r) {
      const xs = Array.from({ length: 7 }, () => r.int(1, 30));
      const h = [];
      for (const x of xs) {
        h.push(x);
        let i = h.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (h[p] <= h[i]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
      }
      const pops = r.next() < 0.5 ? 0 : 2;
      const popped = [];
      for (let k = 0; k < pops; k++) {
        const last = h.pop();
        if (h.length) {
          // heapq.heappop: move the last item to the root, then sift it down to a leaf along smaller children and back up
          popped.push(h[0]);
          h[0] = last;
          siftUpPy(h, 0);
        } else popped.push(last);
      }
      return {
        ch: 15, title: "A heap, as a list",
        prompt: `<p>What does it print? A heap is a list where every parent at <code>i</code> is at most its children at <code>2i + 1</code> and <code>2i + 2</code>.</p>`,
        code: `import heapq\nh = []\nfor x in ${pyList(xs)}:\n    heapq.heappush(h, x)\n` + (pops ? `heapq.heappop(h)\nheapq.heappop(h)\n` : "") + `print(h)`,
        answer: pyList(h),
        why: `<p>Each push adds at the end and swaps upward while it's smaller than its parent.${pops ? ` Each pop takes the root (${popped.join(", then ")}), moves the last item to the top and lets it sink.` : ""} The list is <code>${pyList(h)}</code>: only the first item is guaranteed to be the smallest.</p>`,
      };
    },
    // ch 19: breadth-first order
    bfs(r) {
      const { adj, names } = graph(r, 7, 9);
      const seen = new Set(["A"]), q = ["A"], order = [];
      while (q.length) { const u = q.shift(); order.push(u); for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); } }
      return {
        ch: 19, title: "Breadth-first order",
        prompt: `<p>In what order does BFS visit the nodes?</p>`,
        code: `from collections import deque\ng = ${pyGraph(adj, names)}\nseen, q = {"A"}, deque(["A"])\nwhile q:\n    u = q.popleft()\n    print(u, end=" ")\n    for v in g[u]:\n        if v not in seen:\n            seen.add(v)\n            q.append(v)`,
        answer: order.join(" "),
        why: `<p>Level by level: everything one edge from A, in the order the lists give them, then everything two edges away. ${names.length - order.length ? `${names.filter((n) => !order.includes(n)).join(", ")} can't be reached from A.` : ""}</p>`,
      };
    },
    // ch 20: depth-first order
    dfs(r) {
      const { adj, names } = graph(r, 7, 8);
      const seen = new Set(), order = [];
      const go = (u) => { seen.add(u); order.push(u); for (const v of adj[u]) if (!seen.has(v)) go(v); };
      go("A");
      return {
        ch: 20, title: "Depth-first order",
        prompt: `<p>In what order does this DFS visit the nodes?</p>`,
        code: `g = ${pyGraph(adj, names)}\nseen = set()\ndef dfs(u):\n    seen.add(u)\n    print(u, end=" ")\n    for v in g[u]:\n        if v not in seen:\n            dfs(v)\ndfs("A")`,
        answer: order.join(" "),
        why: `<p>DFS follows the first unseen neighbour as deep as it goes, and only backs up when a node has nothing new left.</p>`,
      };
    },
    // ch 22: groups after unions
    dsu(r) {
      const n = r.int(7, 10), k = r.int(3, 6);
      const pairs = Array.from({ length: k }, () => { const a = r.int(0, n - 1); let b = r.int(0, n - 1); if (b === a) b = (a + 1) % n; return [a, b]; });
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      let groups = n;
      for (const [a, b] of pairs) { const ra = find(a), rb = find(b); if (ra !== rb) { parent[ra] = rb; groups--; } }
      return {
        ch: 22, title: "How many groups?",
        prompt: `<p>What does it print?</p>`,
        code: `parent = list(range(${n}))\ndef find(x):\n    if parent[x] != x:\n        parent[x] = find(parent[x])\n    return parent[x]\ngroups = ${n}\nfor a, b in ${pyList(pairs.map((p) => `(${p[0]}, ${p[1]})`)).replace(/'/g, "")}:\n    ra, rb = find(a), find(b)\n    if ra != rb:\n        parent[ra] = rb\n        groups -= 1\nprint(groups)`,
        answer: String(groups),
        why: `<p>Start with ${n} groups. Every union that joins two different groups removes one; a union inside a group (both already share a root) changes nothing. ${k - (n - groups)} of the ${k} unions changed nothing here.</p>`,
      };
    },
    // ch 23: shortest distances
    dijkstra(r) {
      const n = 5;
      const edges = [];
      const has = new Set();
      for (let v = 1; v < n; v++) { const u = r.int(0, v - 1); edges.push([u, v, r.int(1, 9)]); has.add(u + "," + v); }
      for (let k = 0; k < 4; k++) { const u = r.int(0, n - 1), v = r.int(0, n - 1); if (u !== v && !has.has(u + "," + v)) { has.add(u + "," + v); edges.push([u, v, r.int(1, 9)]); } }
      const dist = Array(n).fill(Infinity); dist[0] = 0;
      for (let it = 0; it < n; it++) for (const [u, v, w] of edges) if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
      const show = dist.map((d) => (d === Infinity ? "inf" : d));
      return {
        ch: 23, title: "Dijkstra's distances",
        prompt: `<p>Edges are one-way <code>(from, to, weight)</code>. What does it print?</p>`,
        code: `import heapq\nedges = ${pyList(edges.map((e) => `(${e.join(", ")})`)).replace(/'/g, "")}\ng = {u: [] for u in range(${n})}\nfor u, v, w in edges:\n    g[u].append((v, w))\ndist = [float("inf")] * ${n}\ndist[0] = 0\npq = [(0, 0)]\nwhile pq:\n    d, u = heapq.heappop(pq)\n    if d > dist[u]:\n        continue\n    for v, w in g[u]:\n        if d + w < dist[v]:\n            dist[v] = d + w\n            heapq.heappush(pq, (dist[v], v))\nprint(dist)`,
        answer: "[" + show.join(", ") + "]",
        why: `<p>The cheapest way from 0 to each node: ${show.map((d, i) => `${i}: ${d}`).join(", ")}. A longer path with smaller weights can beat a direct edge.</p>`,
      };
    },
    // ch 11: next greater element
    nextGreater(r) {
      const a = Array.from({ length: 8 }, () => r.int(1, 9));
      const res = Array(a.length).fill(-1), st = [];
      a.forEach((x, i) => { while (st.length && a[st[st.length - 1]] < x) res[st.pop()] = x; st.push(i); });
      return {
        ch: 11, title: "Next greater element",
        prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nres = [-1] * len(a)\nstack = []\nfor i, x in enumerate(a):\n    while stack and a[stack[-1]] < x:\n        res[stack.pop()] = x\n    stack.append(i)\nprint(res)`,
        answer: pyList(res),
        why: `<p>For each number, the first strictly bigger number to its right, or -1. The stack holds the indices still waiting for theirs, in falling order.</p>`,
      };
    },
    // ch 2: Kadane
    kadane(r) {
      const a = Array.from({ length: 9 }, () => r.int(-9, 9));
      let best = a[0], run = a[0];
      for (const x of a.slice(1)) { run = Math.max(x, run + x); best = Math.max(best, run); }
      return {
        ch: 2, title: "The best stretch",
        prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nbest = run = a[0]\nfor x in a[1:]:\n    run = max(x, run + x)\n    best = max(best, run)\nprint(best)`,
        answer: String(best),
        why: `<p>The largest sum of a non-empty stretch of neighbours. <code>run</code> starts over whenever carrying the old run would cost more than starting fresh at <code>x</code>.</p>`,
      };
    },
    // ch 4: a range sum from prefix sums
    prefix(r) {
      const a = Array.from({ length: 8 }, () => r.int(-5, 12));
      let i = r.int(0, 6), j = r.int(i + 1, 8);
      const P = [0]; for (const x of a) P.push(P[P.length - 1] + x);
      return {
        ch: 4, title: "One subtraction",
        prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nP = [0]\nfor x in a:\n    P.append(P[-1] + x)\nprint(P[${j}] - P[${i}])`,
        answer: String(P[j] - P[i]),
        why: `<p><code>P[k]</code> is the sum of the first k items, so <code>P[${j}] - P[${i}]</code> is <code>a[${i}] + … + a[${j - 1}]</code> = ${P[j] - P[i]}.</p>`,
      };
    },
    // ch 8: longest stretch with no repeated letter
    window(r) {
      const s = Array.from({ length: 12 }, () => r.pick("abcde".split(""))).join("");
      let best = 0, left = 0; const last = {};
      for (let i = 0; i < s.length; i++) { if (last[s[i]] !== undefined && last[s[i]] >= left) left = last[s[i]] + 1; last[s[i]] = i; best = Math.max(best, i - left + 1); }
      return {
        ch: 8, title: "A window with no repeats",
        prompt: `<p>What does it print?</p>`,
        code: `s = "${s}"\nlast, left, best = {}, 0, 0\nfor i, c in enumerate(s):\n    if c in last and last[c] >= left:\n        left = last[c] + 1\n    last[c] = i\n    best = max(best, i - left + 1)\nprint(best)`,
        answer: String(best),
        why: `<p>The length of the longest stretch of <code>"${s}"</code> with no letter twice. When a letter repeats inside the window, the left edge jumps just past its last copy.</p>`,
      };
    },
    // ch 6: insertion sort, part way
    insertion(r) {
      const a = Array.from({ length: 7 }, () => r.int(1, 20));
      const k = r.int(2, 4);
      const b = a.slice();
      for (let i = 1; i <= k; i++) { const x = b[i]; let j = i - 1; while (j >= 0 && b[j] > x) { b[j + 1] = b[j]; j--; } b[j + 1] = x; }
      return {
        ch: 6, title: "Insertion sort, part way",
        prompt: `<p>What does it print, after only ${k} rounds?</p>`,
        code: `a = ${pyList(a)}\nfor i in range(1, ${k + 1}):\n    x = a[i]\n    j = i - 1\n    while j >= 0 and a[j] > x:\n        a[j + 1] = a[j]\n        j -= 1\n    a[j + 1] = x\nprint(a)`,
        answer: pyList(b),
        why: `<p>After ${k} rounds the first ${k + 1} items are sorted among themselves, and the rest haven't moved.</p>`,
      };
    },
    // ch 21: topological order, smallest first
    topo(r) {
      const n = 6, edges = [], has = new Set();
      const order0 = r.shuffle([0, 1, 2, 3, 4, 5]);
      for (let k = 0; k < 7; k++) { const i = r.int(0, n - 2), j = r.int(i + 1, n - 1); const u = order0[i], v = order0[j]; if (!has.has(u + "," + v)) { has.add(u + "," + v); edges.push([u, v]); } }
      const indeg = Array(n).fill(0), g = Array.from({ length: n }, () => []);
      for (const [u, v] of edges) { g[u].push(v); indeg[v]++; }
      const ready = [], out = [];
      for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
      while (ready.length) { ready.sort((x, y) => x - y); const u = ready.shift(); out.push(u); for (const v of g[u]) if (!--indeg[v]) ready.push(v); }
      return {
        ch: 21, title: "Kahn's order",
        prompt: `<p>Each pair <code>(u, v)</code> means u must come before v. What does it print?</p>`,
        code: `import heapq\nedges = ${pyList(edges.map((e) => `(${e.join(", ")})`)).replace(/'/g, "")}\ng = [[] for _ in range(${n})]\nindeg = [0] * ${n}\nfor u, v in edges:\n    g[u].append(v)\n    indeg[v] += 1\nready = [u for u in range(${n}) if indeg[u] == 0]\nheapq.heapify(ready)\nwhile ready:\n    u = heapq.heappop(ready)\n    print(u, end=" ")\n    for v in g[u]:\n        indeg[v] -= 1\n        if indeg[v] == 0:\n            heapq.heappush(ready, v)`,
        answer: out.join(" "),
        why: `<p>Whenever several tasks are free to go, the heap picks the smallest number first, so the order is the unique smallest-first one.</p>`,
      };
    },
    // ch 37: Euclid's steps
    gcd(r) {
      let a = r.int(40, 400), b = r.int(10, 200);
      const steps = [];
      let x = a, y = b;
      while (y) { steps.push(`${x} ${y}`); [x, y] = [y, x % y]; }
      return {
        ch: 37, title: "Euclid, step by step",
        prompt: `<p>What does it print?</p>`,
        code: `a, b = ${a}, ${b}\nwhile b:\n    print(a, b)\n    a, b = b, a % b\nprint(a)`,
        answer: steps.join("\n") + "\n" + x,
        why: `<p>gcd(a, b) = gcd(b, a mod b), until the second number is 0. The gcd of ${a} and ${b} is ${x}.</p>`,
      };
    },
    // ch 1: what fits in the time limit
    limits(r) {
      const TABLE = [[10, "n!"], [20, "2^n"], [500, "n^3"], [5000, "n^2"], [1e6, "n log n"], [1e8, "n"]];
      const SAMPLES = [[6, 9], [13, 19], [60, 450], [700, 4500], [2e4, 9e5], [3e6, 9e7], [1e10, 1e18]];
      const band = r.int(0, SAMPLES.length - 1);
      const [lo, hi] = SAMPLES[band];
      const nice = (x) => { const e = Math.floor(Math.log10(x)); const m = Math.max(1, Math.round(x / 10 ** e)); return m * 10 ** e; };
      const n = nice(lo * Math.pow(hi / lo, r.next()));
      const answer = (TABLE.find(([lim]) => n <= lim) || [0, "log n"])[1];
      const all = ["n!", "2^n", "n^3", "n^2", "n log n", "n", "log n"];
      const at = all.indexOf(answer);
      const near = all.filter((k) => k !== answer).sort((x, y) => Math.abs(all.indexOf(x) - at) - Math.abs(all.indexOf(y) - at)).slice(0, 3);
      const opts = r.shuffle([answer, ...near]).map((t) => ({ t: "O(" + t + ")", ok: t === answer }));
      const show = n >= 1e5 ? fmtPow(n) : n.toLocaleString("en-US");
      return {
        ch: 1, title: "Will it pass in time?", match: "choice", opts,
        prompt: `<p>The input has up to <b>n = ${show}</b> items, and you have about one second. What's the most work your algorithm can afford?</p>`,
        code: `def allowed(n):\n    for limit, kind in ((10, "n!"), (20, "2^n"), (500, "n^3"), (5000, "n^2"), (10**6, "n log n"), (10**8, "n")):\n        if n <= limit:\n            return kind\n    return "log n"\nprint("O(" + allowed(${n}) + ")")`,
        answer: "O(" + answer + ")",
        why: `<p>A second buys roughly 10⁸ simple steps. n ≤ 10: n!; ≤ 20: 2ⁿ; ≤ 500: n³; ≤ 5,000: n²; ≤ 10⁶: n log n; ≤ 10⁸: n; beyond that, only log n.</p>`,
      };
    },
  };

  function fmtPow(n) {
    const e = Math.floor(Math.log10(n)), m = n / 10 ** e;
    const sup = String(e).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
    return (m === 1 ? "" : m + "·") + "10" + sup;
  }

  // heapq's _siftup: walk the hole at pos down along the smaller child to a leaf, put the item there, then sift it back up
  function siftUpPy(h, pos) {
    const end = h.length, start = pos, item = h[pos];
    let child = 2 * pos + 1;
    while (child < end) {
      const right = child + 1;
      if (right < end && !(h[child] < h[right])) child = right;
      h[pos] = h[child]; pos = child; child = 2 * pos + 1;
    }
    h[pos] = item;
    // _siftdown(heap, startpos, pos)
    while (pos > start) { const p = (pos - 1) >> 1; if (item < h[p]) { h[pos] = h[p]; pos = p; } else break; }
    h[pos] = item;
  }

  function graph(r, n, m) {
    const names = LETTERS.slice(0, n);
    const adj = Object.fromEntries(names.map((x) => [x, []]));
    const link = (a, b) => { if (a !== b && !adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); } };
    for (let i = 1; i < n - 1; i++) link(names[i], names[r.int(0, i - 1)]); // a tree on all but the last, which may be left alone
    for (let k = 0; k < m - (n - 2); k++) link(r.pick(names.slice(0, n - 1)), r.pick(names.slice(0, n - 1)));
    if (r.next() < 0.5) link(names[n - 1], r.pick(names.slice(1, n - 1)));
    for (const x of names) adj[x] = r.shuffle(adj[x]);
    return { adj, names };
  }
  const pyGraph = (adj, names) => "{" + names.map((x) => `"${x}": ${pyList(adj[x])}`).join(", ") + "}";

  function make(gen, seed) {
    const q = GENS[gen](rng(seed));
    return Object.assign({ gen, seed, kind: "trace", match: "tokens" }, q);
  }
  // marking: "tokens" compares the numbers, words and symbols like inf in order, ignoring brackets, commas and spaces
  const tokens = (s) => String(s).toLowerCase().match(/-?\d+|[a-z]+(?:\^\w+)?|[!]/g) || [];
  function correct(q, given) {
    if (q.match === "choice") return given != null && q.opts[given] && q.opts[given].ok;
    return tokens(given).join(" ") === tokens(q.answer).join(" ");
  }

  const API = { GENS, make, correct, tokens, names: Object.keys(GENS) };
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.MOCKGEN = API;
})(this);
