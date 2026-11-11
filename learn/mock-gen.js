/* Tulip Labs: fresh "trace it" questions for the DSA mock test.
   Each generator takes a random source and returns one question: a short Python program built from fresh
   random data, and the answer, worked out here in JavaScript. tools/mock-check.js runs every program with
   real Python, hundreds of times per generator, and checks it prints exactly the answer given here.
   A question looks like:
     { gen, ch, title, prompt (HTML), code (Python), answer (what Python prints), match: "tokens" | "choice",
       opts (for "choice"), why (HTML) }
   "tokens" answers are marked on their numbers and words, so "[1, 2]" and "1 2" both count; "text" answers,
   whose symbols matter, must match exactly apart from spacing. */
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

  // ------------------------------------------------- one more generator for every other chapter --
  const tup = (a) => "(" + a.join(", ") + ")";
  const tupList = (a) => "[" + a.map(tup).join(", ") + "]";
  const pyV = (x) => (Array.isArray(x) ? "[" + x.map(pyV).join(", ") + "]" : typeof x === "string" ? `'${x}'` : x === Infinity ? "inf" : typeof x === "boolean" ? (x ? "True" : "False") : String(x));
  const ints = (r, n, lo, hi) => Array.from({ length: n }, () => r.int(lo, hi));
  const word = (r, n, abc) => Array.from({ length: n }, () => r.pick(abc.split(""))).join("");
  const masks = (n) => Array.from({ length: 1 << n }, (_, m) => m);
  const bitsOf = (m, n) => Array.from({ length: n }, (_, i) => (m >> i) & 1);
  const pyMatrix = (name, g) => `${name} = [\n` + g.map((row) => "    " + pyV(row) + ",").join("\n") + "\n]";
  function perms(a) { if (a.length < 2) return [a]; const out = []; a.forEach((x, i) => { for (const p of perms(a.slice(0, i).concat(a.slice(i + 1)))) out.push([x, ...p]); }); return out; }
  function treeEdges(r, n) { const e = []; for (let v = 1; v < n; v++) e.push([r.int(0, v - 1), v]); return e; }
  function connected(n, edges) {
    const adj = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
    const seen = new Set([0]), st = [0];
    while (st.length) for (const v of adj[st.pop()]) if (!seen.has(v)) { seen.add(v); st.push(v); }
    return seen.size === n;
  }

  Object.assign(GENS, {
    // ch 3: a dict that remembers
    twoSum(r) {
      const a = ints(r, 8, 1, 20), i = r.int(0, 6), j = r.int(i + 1, 7), target = a[i] + a[j];
      const seen = new Map(); let ans;
      for (let k = 0; k < a.length; k++) { if (seen.has(target - a[k])) { ans = [seen.get(target - a[k]), k]; break; } seen.set(a[k], k); }
      return {
        ch: 3, title: "Two numbers that add up", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\ntarget = ${target}\nseen = {}\nfor i, x in enumerate(a):\n    if target - x in seen:\n        print(seen[target - x], i)\n        break\n    seen[x] = i`,
        answer: ans.join(" "),
        why: `<p>The dict maps each number to the latest index it was seen at. At every <code>x</code> the loop asks one question: have I already seen <code>${target} - x</code>? The first yes comes at index ${ans[1]}, and its partner is at index ${ans[0]}. One pass, no inner loop.</p>`,
      };
    },
    // ch 5: how many calls naive recursion makes
    fibCalls(r) {
      const n = r.int(4, 9);
      const fib = (k) => (k < 2 ? k : fib(k - 1) + fib(k - 2)), calls = (k) => (k < 2 ? 1 : 1 + calls(k - 1) + calls(k - 2));
      return {
        ch: 5, title: "Count the calls", prompt: `<p>What does it print?</p>`,
        code: `calls = 0\ndef fib(n):\n    global calls\n    calls += 1\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\nprint(fib(${n}), calls)`,
        answer: `${fib(n)} ${calls(n)}`,
        why: `<p>calls(n) = 1 + calls(n − 1) + calls(n − 2), with calls(0) = calls(1) = 1, so the count grows like the Fibonacci numbers themselves: exponentially. fib(${n}) = ${fib(n)} takes ${calls(n)} calls. With memoisation it would take ${n + 1}.</p>`,
      };
    },
    // ch 7: two pointers counting pairs
    pairsBelow(r) {
      const a = ints(r, 8, 1, 20).sort((x, y) => x - y), T = r.int(10, 32);
      let count = 0;
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] + a[j] < T) count++;
      return {
        ch: 7, title: "Pairs under a target", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nT = ${T}\nlo, hi, count = 0, len(a) - 1, 0\nwhile lo < hi:\n    if a[lo] + a[hi] < T:\n        count += hi - lo\n        lo += 1\n    else:\n        hi -= 1\nprint(count)`,
        answer: String(count),
        why: `<p>It counts the pairs i &lt; j with <code>a[i] + a[j] &lt; ${T}</code>. Because the list is sorted, when <code>a[lo] + a[hi]</code> is small enough, so is <code>a[lo]</code> with every index between lo and hi: that's <code>hi - lo</code> pairs at once. Otherwise <code>a[hi]</code> is too big for anything left, so hi moves in.</p>`,
      };
    },
    // ch 10: binary search on the answer
    shipDays(r) {
      const w = ints(r, 8, 1, 15), D = r.int(2, 5);
      const days = (cap) => { let n = 1, load = 0; for (const x of w) { if (load + x > cap) { n++; load = 0; } load += x; } return n; };
      let cap = Math.max(...w);
      while (days(cap) > D) cap++;
      return {
        ch: 10, title: "The smallest capacity that works", prompt: `<p>Parcels <code>w</code> ship in order, at most <code>cap</code> a day. What does it print?</p>`,
        code: `w = ${pyList(w)}\nD = ${D}\ndef days(cap):\n    n, load = 1, 0\n    for x in w:\n        if load + x > cap:\n            n += 1\n            load = 0\n        load += x\n    return n\nlo, hi = max(w), sum(w)\nwhile lo < hi:\n    mid = (lo + hi) // 2\n    if days(mid) <= D:\n        hi = mid\n    else:\n        lo = mid + 1\nprint(lo)`,
        answer: String(cap),
        why: `<p>The smallest daily capacity that ships everything within ${D} days: ${cap} (it takes ${days(cap)} day${days(cap) === 1 ? "" : "s"}; ${cap - 1} would take ${days(cap - 1)}). More capacity never needs more days, so "does this capacity work?" is false, then true, and binary search finds the switch.</p>`,
      };
    },
    // ch 12: the monotonic deque
    windowMax(r) {
      const a = ints(r, 9, 1, 9), k = r.int(2, 4);
      const out = [];
      for (let i = k - 1; i < a.length; i++) out.push(Math.max(...a.slice(i - k + 1, i + 1)));
      return {
        ch: 12, title: "The biggest in every window", prompt: `<p>What does it print?</p>`,
        code: `from collections import deque\na = ${pyList(a)}\nk = ${k}\ndq, out = deque(), []\nfor i, x in enumerate(a):\n    while dq and a[dq[-1]] <= x:\n        dq.pop()\n    dq.append(i)\n    if dq[0] <= i - k:\n        dq.popleft()\n    if i >= k - 1:\n        out.append(a[dq[0]])\nprint(out)`,
        answer: pyList(out),
        why: `<p>The maximum of every window of ${k}. The deque keeps indices whose values fall from front to back: a new value throws out everything smaller behind it, since those can never be a maximum again, and the front leaves when it slides out of the window.</p>`,
      };
    },
    // ch 13: slow and fast pointers
    middle(r) {
      const n = r.int(5, 8), vals = r.shuffle(distinctSorted(r, n, 1, 50));
      return {
        ch: 13, title: "Slow and fast", prompt: `<p>What does it print?</p>`,
        code: `class Node:\n    def __init__(self, val, nxt=None):\n        self.val, self.next = val, nxt\nhead = None\nfor v in reversed(${pyList(vals)}):\n    head = Node(v, head)\nslow = fast = head\nwhile fast and fast.next:\n    slow = slow.next\n    fast = fast.next.next\nprint(slow.val)`,
        answer: String(vals[n >> 1]),
        why: `<p>The list is ${vals.join(" → ")}. fast moves two steps for each one of slow, so when fast runs out, slow has gone half way: position ${n >> 1} (counting from 0)${n % 2 ? ", the middle" : ", the second of the two middles"}.</p>`,
      };
    },
    // ch 14: merging intervals
    mergeIntervals(r) {
      const iv = Array.from({ length: 6 }, () => { const s = r.int(0, 20); return [s, s + r.int(1, 6)]; });
      const out = [];
      for (const [s, e] of iv.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
        if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e); else out.push([s, e]);
      }
      return {
        ch: 14, title: "Merge the overlaps", prompt: `<p>What does it print?</p>`,
        code: `iv = ${pyV(iv)}\niv.sort()\nout = []\nfor s, e in iv:\n    if out and s <= out[-1][1]:\n        out[-1][1] = max(out[-1][1], e)\n    else:\n        out.append([s, e])\nprint(out)`,
        answer: pyV(out),
        why: `<p>Sorted by start, an interval overlaps the merged ones only if it starts before the last merged one ends, so one comparison with <code>out[-1]</code> is enough. Touching intervals (start = end) merge too, because the test is <code>&lt;=</code>.</p>`,
      };
    },
    // ch 16: earliest finish first
    activities(r) {
      const iv = Array.from({ length: 7 }, () => { const s = r.int(0, 15); return [s, s + r.int(1, 5)]; });
      let best = 0;
      for (const m of masks(7)) {
        const pick = iv.filter((_, i) => (m >> i) & 1).sort((x, y) => x[0] - y[0]);
        if (pick.every((p, i) => !i || p[0] >= pick[i - 1][1])) best = Math.max(best, pick.length);
      }
      return {
        ch: 16, title: "Earliest finish first", prompt: `<p>What does it print?</p>`,
        code: `iv = ${tupList(iv)}\niv.sort(key=lambda p: p[1])\nend, count = -1, 0\nfor s, e in iv:\n    if s >= end:\n        count += 1\n        end = e\nprint(count)`,
        answer: String(best),
        why: `<p>The most meetings with no two overlapping: ${best}. Taking whatever finishes first is safe: swapping it into any best answer never breaks that answer (the exchange argument), and it leaves the most room for the rest.</p>`,
      };
    },
    // ch 17: the three depth-first orders
    traversal(r) {
      const labels = r.shuffle([1, 2, 3, 4, 5, 6, 7]), left = {}, right = {}, slots = [[labels[0], "L"], [labels[0], "R"]];
      for (let k = 1; k < 7; k++) {
        const at = r.int(0, slots.length - 1), [p, side] = slots.splice(at, 1)[0];
        (side === "L" ? left : right)[p] = labels[k];
        slots.push([labels[k], "L"], [labels[k], "R"]);
      }
      const kind = r.pick(["pre", "in", "post"]), out = [];
      const walk = (u) => { if (u == null) return; if (kind === "pre") out.push(u); walk(left[u]); if (kind === "in") out.push(u); walk(right[u]); if (kind === "post") out.push(u); };
      walk(labels[0]);
      const dict = (o) => "{" + Object.keys(o).map((k) => `${k}: ${o[k]}`).join(", ") + "}";
      const p = `    print(u, end=" ")\n`;
      return {
        ch: 17, title: { pre: "Preorder", in: "Inorder", post: "Postorder" }[kind], prompt: `<p><code>left</code> and <code>right</code> give each node's children; a missing key means no child. What does it print?</p>`,
        code: `left = ${dict(left)}\nright = ${dict(right)}\ndef walk(u):\n    if u is None:\n        return\n` + (kind === "pre" ? p : "") + `    walk(left.get(u))\n` + (kind === "in" ? p : "") + `    walk(right.get(u))\n` + (kind === "post" ? p : "") + `walk(${labels[0]})`,
        answer: out.join(" "),
        why: `<p>Where the print sits decides the order. ${kind === "pre" ? "Before both calls: each node, then its whole left subtree, then its right one." : kind === "in" ? "Between the calls: the whole left subtree, then the node, then the right subtree." : "After both calls: both subtrees first, the node last, so the root comes out at the very end."}</p>`,
      };
    },
    // ch 18: the shape a BST takes
    bstPre(r) {
      const keys = r.shuffle(distinctSorted(r, 7, 1, 50));
      let root = null;
      const ins = (u, k) => { if (!u) return { k, l: null, r: null }; if (k < u.k) u.l = ins(u.l, k); else u.r = ins(u.r, k); return u; };
      for (const k of keys) root = ins(root, k);
      const out = [], pre = (u) => { if (u) { out.push(u.k); pre(u.l); pre(u.r); } };
      pre(root);
      return {
        ch: 18, title: "The shape a BST takes", prompt: `<p>What does it print?</p>`,
        code: `class Node:\n    def __init__(self, key):\n        self.key, self.left, self.right = key, None, None\ndef insert(root, key):\n    if root is None:\n        return Node(key)\n    if key < root.key:\n        root.left = insert(root.left, key)\n    else:\n        root.right = insert(root.right, key)\n    return root\nroot = None\nfor k in ${pyList(keys)}:\n    root = insert(root, k)\ndef pre(u):\n    if u:\n        print(u.key, end=" ")\n        pre(u.left)\n        pre(u.right)\npre(root)`,
        answer: out.join(" "),
        why: `<p>The first key, ${keys[0]}, becomes the root and stays there. Every later key walks down from it, left when smaller and right otherwise, and hangs where it falls off. Preorder prints a node, then its left subtree, then its right one.</p>`,
      };
    },
    // ch 24: one round of Bellman-Ford
    bellman(r) {
      const n = 5, edges = [[0, r.int(1, 4), r.int(-2, 8)]];
      while (edges.length < 7) { const u = r.int(0, n - 1), v = r.int(0, n - 1); if (u !== v) edges.push([u, v, r.int(-2, 8)]); }
      const E = r.shuffle(edges), dist = Array(n).fill(Infinity);
      dist[0] = 0;
      for (const [u, v, w] of E) if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
      return {
        ch: 24, title: "One round of relaxing", prompt: `<p>Edges are one-way <code>(from, to, weight)</code>. This is a single round of Bellman-Ford, in exactly this edge order. What does it print?</p>`,
        code: `edges = ${tupList(E)}\ndist = [float("inf")] * ${n}\ndist[0] = 0\nfor u, v, w in edges:\n    if dist[u] + w < dist[v]:\n        dist[v] = dist[u] + w\nprint(dist)`,
        answer: pyV(dist),
        why: `<p>Each edge is tried once, in list order. An edge out of a node that hasn't been reached yet (still <code>inf</code>) does nothing, even if a later edge in the same round reaches that node. That's why Bellman-Ford repeats the round n − 1 times.</p>`,
      };
    },
    // ch 25: Kruskal
    kruskal(r) {
      const n = 6, pairs = treeEdges(r, n), has = new Set(pairs.map((p) => p.join()));
      while (pairs.length < n + 3) { const u = r.int(0, n - 2), v = r.int(u + 1, n - 1); if (!has.has(u + "," + v)) { has.add(u + "," + v); pairs.push([u, v]); } }
      const ws = r.shuffle(Array.from({ length: 20 }, (_, i) => i + 1));
      const edges = r.shuffle(pairs.map((p, i) => [ws[i], p[0], p[1]]));
      const parent = Array.from({ length: n }, (_, i) => i), find = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
      let total = 0;
      const used = [];
      for (const [w, u, v] of edges.slice().sort((x, y) => x[0] - y[0])) { const a = find(u), b = find(v); if (a !== b) { parent[a] = b; total += w; used.push(w); } }
      return {
        ch: 25, title: "Kruskal's total", prompt: `<p>Each edge is <code>(weight, u, v)</code>. What does it print?</p>`,
        code: `edges = ${tupList(edges)}\nparent = list(range(${n}))\ndef find(x):\n    while parent[x] != x:\n        x = parent[x]\n    return x\ntotal = 0\nfor w, u, v in sorted(edges):\n    ru, rv = find(u), find(v)\n    if ru != rv:\n        parent[ru] = rv\n        total += w\nprint(total)`,
        answer: String(total),
        why: `<p>Cheapest edge first, skipping any edge whose ends are already joined. It keeps the weights ${used.join(" + ")} = ${total}: ${n - 1} edges, one fewer than the ${n} nodes, which is every spanning tree's size.</p>`,
      };
    },
    // ch 26: tries
    trie(r) {
      const abc = r.pick(["ab", "abc"]), words = Array.from({ length: 5 }, () => word(r, r.int(1, 4), abc)), p = word(r, r.int(1, 2), "ab");
      const prefixes = new Set();
      for (const w of words) for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
      const count = words.filter((w) => w.startsWith(p)).length;
      return {
        ch: 26, title: "Nodes and prefixes", prompt: `<p>What does it print?</p>`,
        code: `words = ${pyList(words)}\nroot, nodes = {}, 0\nfor w in words:\n    cur = root\n    for c in w:\n        if c not in cur:\n            cur[c] = {"#": 0}\n            nodes += 1\n        cur = cur[c]\n        cur["#"] += 1\ncur = root\nfor c in "${p}":\n    cur = cur.get(c, {"#": 0})\nprint(nodes, cur["#"])`,
        answer: `${prefixes.size} ${count}`,
        why: `<p>A trie has one node per distinct prefix, so ${prefixes.size} nodes: ${[...prefixes].sort().join(", ")}. Each node's <code>"#"</code> counts the words passing through it, so the node for <code>"${p}"</code> holds how many words start with it: ${count}.</p>`,
      };
    },
    // ch 27: backtracking
    subsetSum(r) {
      const a = r.shuffle(distinctSorted(r, 6, 1, 12));
      const T = a.filter((_, i) => (r.int(1, 63) >> i) & 1).reduce((s, x) => s + x, 0) || a[0];
      const count = masks(6).filter((m) => a.reduce((s, x, i) => s + ((m >> i) & 1 ? x : 0), 0) === T).length;
      return {
        ch: 27, title: "Subsets that hit the target", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nT = ${T}\ncount = 0\ndef go(i, total):\n    global count\n    if total == T:\n        count += 1\n        return\n    if i == len(a) or total > T:\n        return\n    go(i + 1, total + a[i])\n    go(i + 1, total)\ngo(0, 0)\nprint(count)`,
        answer: String(count),
        why: `<p>The number of subsets summing to ${T}: ${count}. Each call decides one item, take it or leave it, and a branch stops as soon as it hits the target or overshoots. Pruning <code>total &gt; T</code> works because every number is positive.</p>`,
      };
    },
    // ch 28: take it or skip it
    robber(r) {
      const a = ints(r, 8, 1, 15);
      let best = 0;
      for (const m of masks(8)) if (!(m & (m >> 1))) best = Math.max(best, a.reduce((s, x, i) => s + ((m >> i) & 1 ? x : 0), 0));
      return {
        ch: 28, title: "No two neighbours", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\ntake, skip = 0, 0\nfor x in a:\n    take, skip = skip + x, max(take, skip)\nprint(max(take, skip))`,
        answer: String(best),
        why: `<p>The biggest sum with no two neighbours both taken: ${best}. Two numbers carry the whole DP: the best ending with this item taken (so the previous one was skipped) and the best with it skipped (anything before).</p>`,
      };
    },
    // ch 29: 0/1 knapsack
    knapsack(r) {
      const items = Array.from({ length: 5 }, () => [r.int(1, 8), r.int(1, 20)]), C = r.int(8, 15);
      let best = 0;
      for (const m of masks(5)) { let w = 0, v = 0; items.forEach(([iw, iv], i) => { if ((m >> i) & 1) { w += iw; v += iv; } }); if (w <= C) best = Math.max(best, v); }
      return {
        ch: 29, title: "A bag of capacity " + C, prompt: `<p>Items are <code>(weight, value)</code>, each used at most once. What does it print?</p>`,
        code: `items = ${tupList(items)}\nC = ${C}\nbest = [0] * (C + 1)\nfor w, v in items:\n    for c in range(C, w - 1, -1):\n        best[c] = max(best[c], best[c - w] + v)\nprint(best[C])`,
        answer: String(best),
        why: `<p>The most value that fits in weight ${C}: ${best}. The capacity loop runs downwards so <code>best[c - w]</code> still means "without this item": running it upwards would let one item be taken twice.</p>`,
      };
    },
    // ch 30: the cheapest path through a grid
    gridPath(r) {
      const g = Array.from({ length: 3 }, () => ints(r, 4, 1, 9));
      const f = (i, j) => (i === 0 && j === 0 ? g[0][0] : g[i][j] + Math.min(i ? f(i - 1, j) : Infinity, j ? f(i, j - 1) : Infinity));
      const best = f(2, 3);
      return {
        ch: 30, title: "Cheapest way down", prompt: `<p>You may only move right or down. What does it print?</p>`,
        code: pyMatrix("g", g) + `\nR, C = len(g), len(g[0])\nfor r in range(R):\n    for c in range(C):\n        if r == 0 and c == 0:\n            continue\n        up = g[r - 1][c] if r else float("inf")\n        left = g[r][c - 1] if c else float("inf")\n        g[r][c] += min(up, left)\nprint(g[-1][-1])`,
        answer: String(best),
        why: `<p>The cheapest top-left to bottom-right sum: ${best}. Every cell can only be entered from above or from the left, so its cheapest cost is its own number plus the cheaper of those two, already worked out because of the row-by-row order.</p>`,
      };
    },
    // ch 31: edit distance or LCS
    strings(r) {
      const a = word(r, r.int(3, 5), "abcd"), b = word(r, r.int(3, 5), "abcd"), lcs = r.next() < 0.5;
      const memo = {};
      const f = (i, j) => {
        const key = i + "," + j;
        if (key in memo) return memo[key];
        let v;
        if (lcs) v = !i || !j ? 0 : a[i - 1] === b[j - 1] ? f(i - 1, j - 1) + 1 : Math.max(f(i - 1, j), f(i, j - 1));
        else v = !i || !j ? i + j : a[i - 1] === b[j - 1] ? f(i - 1, j - 1) : 1 + Math.min(f(i - 1, j), f(i, j - 1), f(i - 1, j - 1));
        return (memo[key] = v);
      };
      const ans = f(a.length, b.length);
      return {
        ch: 31, title: lcs ? "Longest common subsequence" : "Edit distance", prompt: `<p>What does it print?</p>`,
        code: lcs
          ? `a, b = "${a}", "${b}"\nL = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]\nfor i in range(1, len(a) + 1):\n    for j in range(1, len(b) + 1):\n        if a[i - 1] == b[j - 1]:\n            L[i][j] = L[i - 1][j - 1] + 1\n        else:\n            L[i][j] = max(L[i - 1][j], L[i][j - 1])\nprint(L[-1][-1])`
          : `a, b = "${a}", "${b}"\nd = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]\nfor i in range(len(a) + 1):\n    for j in range(len(b) + 1):\n        if i == 0 or j == 0:\n            d[i][j] = i + j\n        elif a[i - 1] == b[j - 1]:\n            d[i][j] = d[i - 1][j - 1]\n        else:\n            d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])\nprint(d[-1][-1])`,
        answer: String(ans),
        why: lcs
          ? `<p>The longest sequence of letters appearing in order in both "${a}" and "${b}" has length ${ans}. Matching last letters extend the answer for both prefixes; otherwise one of the two last letters isn't used.</p>`
          : `<p>The fewest single-letter inserts, deletes and replacements turning "${a}" into "${b}": ${ans}. The three neighbours in the table are the three edits; equal last letters cost nothing.</p>`,
      };
    },
    // ch 32: interval DP
    mergeStones(r) {
      const a = ints(r, r.int(4, 5), 1, 9), n = a.length, memo = {};
      const sum = (i, j) => a.slice(i, j + 1).reduce((s, x) => s + x, 0);
      const f = (i, j) => { if (i === j) return 0; const k0 = i + "," + j; if (k0 in memo) return memo[k0]; let b = Infinity; for (let k = i; k < j; k++) b = Math.min(b, f(i, k) + f(k + 1, j)); return (memo[k0] = b + sum(i, j)); };
      return {
        ch: 32, title: "Merge the piles", prompt: `<p>Merging two neighbouring piles costs their total size. What does it print?</p>`,
        code: `a = ${pyList(a)}\nn = len(a)\nP = [0]\nfor x in a:\n    P.append(P[-1] + x)\ncost = [[0] * n for _ in range(n)]\nfor length in range(2, n + 1):\n    for i in range(n - length + 1):\n        j = i + length - 1\n        cost[i][j] = min(cost[i][k] + cost[k + 1][j] for k in range(i, j)) + P[j + 1] - P[i]\nprint(cost[0][n - 1])`,
        answer: String(f(0, n - 1)),
        why: `<p>The cheapest way to merge all of them into one: ${f(0, n - 1)}. The last merge joins some left part with the right part, and always costs the whole total (${sum(0, n - 1)}); the DP tries every split point, shortest ranges first.</p>`,
      };
    },
    // ch 33: bitmask DP
    tsp(r) {
      const n = 5, d = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d[i][j] = d[j][i] = r.int(1, 9);
      let best = Infinity;
      for (const p of perms([1, 2, 3, 4])) { const t = [0, ...p, 0]; best = Math.min(best, t.slice(1).reduce((s, v, i) => s + d[t[i]][v], 0)); }
      return {
        ch: 33, title: "The shortest round trip", prompt: `<p>Start at 0, visit every place once, come back. What does it print?</p>`,
        code: pyMatrix("d", d) + `\nn = ${n}\nINF = float("inf")\ndp = [[INF] * n for _ in range(1 << n)]\ndp[1][0] = 0\nfor mask in range(1 << n):\n    for u in range(n):\n        if dp[mask][u] == INF:\n            continue\n        for v in range(n):\n            if not mask >> v & 1:\n                nm = mask | 1 << v\n                dp[nm][v] = min(dp[nm][v], dp[mask][u] + d[u][v])\nprint(min(dp[-1][u] + d[u][0] for u in range(1, n)))`,
        answer: String(best),
        why: `<p>The shortest tour is ${best}. <code>dp[mask][u]</code> is the cheapest way to have visited exactly the places in <code>mask</code>, standing at u. The order inside the mask doesn't matter any more, which is what cuts n! orders down to 2ⁿ · n states.</p>`,
      };
    },
    // ch 34: DP on a tree
    treeIS(r) {
      const n = 7, par = [-1, ...Array.from({ length: n - 1 }, (_, i) => r.int(0, i))], w = ints(r, n, 1, 9);
      let best = 0;
      for (const m of masks(n)) if (par.every((p, v) => p < 0 || !((m >> v) & 1 && (m >> p) & 1))) best = Math.max(best, w.reduce((s, x, i) => s + ((m >> i) & 1 ? x : 0), 0));
      return {
        ch: 34, title: "No parent with its child", prompt: `<p><code>par[v]</code> is v's parent; 0 is the root. Pick nodes, never a node together with its parent, for the biggest total weight. What does it print?</p>`,
        code: `par = ${pyList(par)}\nw = ${pyList(w)}\nn = len(w)\ntake, skip = w[:], [0] * n\nfor v in range(n - 1, 0, -1):\n    p = par[v]\n    take[p] += skip[v]\n    skip[p] += max(take[v], skip[v])\nprint(max(take[0], skip[0]))`,
        answer: String(best),
        why: `<p>Each node keeps two answers for its subtree: with itself taken (then its children must be skipped) and without (then each child does whatever is best). Every parent has a smaller number than its children, so walking from n − 1 down to 1 finishes each child before its parent. The best is ${best}.</p>`,
      };
    },
    // ch 35: digit DP
    digitSum(r) {
      const N = r.int(100, 3000), S = r.int(3, 15);
      let count = 0;
      for (let x = 1; x <= N; x++) if (String(x).split("").reduce((s, c) => s + +c, 0) === S) count++;
      return {
        ch: 35, title: "Numbers with a digit sum", prompt: `<p>What does it print?</p>`,
        code: `from functools import lru_cache\nN, S = ${N}, ${S}\nD = [int(c) for c in str(N)]\n@lru_cache(None)\ndef go(i, s, tight):\n    if s < 0:\n        return 0\n    if i == len(D):\n        return 1 if s == 0 else 0\n    top = D[i] if tight else 9\n    return sum(go(i + 1, s - d, tight and d == top) for d in range(top + 1))\nprint(go(0, S, True))`,
        answer: String(count),
        why: `<p>How many numbers from 1 to ${N} have digits adding up to ${S}: ${count}. The state is (position, sum still needed, tight): while tight, the digit can't go above ${N}'s own digit there; once a smaller digit is chosen, every later digit is free.</p>`,
      };
    },
    // ch 36: DP with a sliding-window maximum
    jumpDP(r) {
      const a = ints(r, 9, -9, 9), k = r.int(2, 3), dp = [];
      a.forEach((x, i) => { dp.push(x + (i ? Math.max(...dp.slice(Math.max(0, i - k), i)) : 0)); });
      return {
        ch: 36, title: "Jump at most " + k, prompt: `<p>Start on the first square, end on the last, jumping 1 to ${k} squares at a time, and collect every square you land on. What does it print?</p>`,
        code: `from collections import deque\na = ${pyList(a)}\nk = ${k}\ndp = [0] * len(a)\ndq = deque()\nfor i, x in enumerate(a):\n    while dq and dq[0] < i - k:\n        dq.popleft()\n    dp[i] = x + (dp[dq[0]] if dq else 0)\n    while dq and dp[dq[-1]] <= dp[i]:\n        dq.pop()\n    dq.append(i)\nprint(dp[-1])`,
        answer: String(dp[dp.length - 1]),
        why: `<p><code>dp[i] = a[i] + max(dp[i-${k}..i-1])</code>. The deque holds that window's maximum at its front, so each step is O(1) instead of O(k). The best total is ${dp[dp.length - 1]}.</p>`,
      };
    },
    // ch 38: smallest prime factors
    factorize(r) {
      let x = 1;
      for (let t = 0; t < 4; t++) { const p = r.pick([2, 2, 3, 3, 5, 7, 11, 13]); if (x * p <= 200) x *= p; }
      if (x < 4) x *= 6;
      const fs = []; let y = x;
      for (let p = 2; y > 1; p++) while (y % p === 0) { fs.push(p); y /= p; }
      return {
        ch: 38, title: "Factor with a sieve", prompt: `<p>What does it print?</p>`,
        code: `N = 200\nspf = list(range(N + 1))\nfor i in range(2, int(N ** 0.5) + 1):\n    if spf[i] == i:\n        for j in range(i * i, N + 1, i):\n            if spf[j] == j:\n                spf[j] = i\nx = ${x}\nfs = []\nwhile x > 1:\n    fs.append(spf[x])\n    x //= spf[x]\nprint(fs)`,
        answer: pyList(fs),
        why: `<p><code>spf[x]</code> is x's smallest prime factor, filled in by the sieve. Dividing it out over and over gives ${x} = ${fs.join(" × ")} in about log x steps, smallest factors first.</p>`,
      };
    },
    // ch 39: fast power and the inverse
    modPow(r) {
      const M = r.pick([7, 11, 13, 17, 19, 23, 29, 31, 97, 101]), inverse = r.next() < 0.4;
      const pw = (b, e, m) => { let res = 1; b %= m; while (e) { if (e & 1) res = (res * b) % m; b = (b * b) % m; e >>= 1; } return res; };
      const A = inverse ? r.int(2, M - 1) : r.int(2, 60), E = inverse ? M - 2 : r.int(5, 60), ans = pw(A, E, M);
      return {
        ch: 39, title: inverse ? "The inverse, by Fermat" : "Power by squaring", prompt: `<p>What does it print?</p>`,
        code: `def power(b, e, m):\n    r = 1\n    b %= m\n    while e:\n        if e & 1:\n            r = r * b % m\n        b = b * b % m\n        e >>= 1\n    return r\n` + (inverse ? `M = ${M}\nprint(power(${A}, M - 2, M))` : `print(power(${A}, ${E}, ${M}))`),
        answer: String(ans),
        why: inverse
          ? `<p>${M} is prime, so a<sup>${M}−1</sup> ≡ 1 and a<sup>${M}−2</sup> is a's inverse: ${A} × ${ans} = ${A * ans} = ${Math.floor((A * ans) / M)} × ${M} + 1.</p>`
          : `<p>${A}<sup>${E}</sup> mod ${M} = ${ans}. The exponent ${E} is ${E.toString(2)} in binary: <code>b</code> squares once per bit, and <code>r</code> picks up the squares where a bit is 1. That's about log₂ ${E} steps, not ${E}.</p>`,
      };
    },
    // ch 40: Pascal's triangle
    pascal(r) {
      const N = r.int(4, 9);
      let row = [1];
      for (let k = 0; k < N; k++) row = [0, ...row].map((x, i) => x + (row[i] || 0));
      return {
        ch: 40, title: "A row of Pascal's triangle", prompt: `<p>What does it print?</p>`,
        code: `row = [1]\nfor _ in range(${N}):\n    row = [a + b for a, b in zip([0] + row, row + [0])]\nprint(row)`,
        answer: pyList(row),
        why: `<p>Each number is the sum of the two above it, so row ${N} holds C(${N}, 0) … C(${N}, ${N}): the ways to choose k things from ${N}. They add up to 2<sup>${N}</sup> = ${2 ** N}.</p>`,
      };
    },
    // ch 41: bit tricks
    bits(r) {
      const x = r.int(1, 255), y = r.int(1, 255), b = (v) => v.toString(2).padStart(8, "0");
      const ans = [x & (x - 1), x & -x, x.toString(2).split("1").length - 1, x ^ y];
      return {
        ch: 41, title: "Four bit tricks", prompt: `<p>What does it print?</p>`,
        code: `x, y = ${x}, ${y}\nprint(x & (x - 1), x & -x, bin(x).count("1"), x ^ y)`,
        answer: ans.join(" "),
        why: `<p>x = <code>${b(x)}</code>. <code>x &amp; (x - 1)</code> clears the lowest set bit; <code>x &amp; -x</code> keeps only that bit; the count is the number of 1s; and with y = <code>${b(y)}</code>, xor keeps the bits where they differ: <code>${b(x ^ y)}</code>.</p>`,
      };
    },
    // ch 42: matrix power
    matPow(r) {
      const fib = r.next() < 0.5, M = fib ? [[1, 1], [1, 0]] : [[r.int(0, 3), r.int(0, 3)], [r.int(0, 3), r.int(0, 3)]], N = fib ? r.int(5, 25) : r.int(2, 6);
      const mul = (A, B) => [0, 1].map((i) => [0, 1].map((j) => (A[i][0] * B[0][j] + A[i][1] * B[1][j]) % 100));
      let R = [[1, 0], [0, 1]], P = M, e = N;
      while (e) { if (e & 1) R = mul(R, P); P = mul(P, P); e >>= 1; }
      return {
        ch: 42, title: fib ? "Fibonacci by matrix" : "A matrix to a power", prompt: `<p>Every entry is kept mod 100. What does it print?</p>`,
        code: `def mul(A, B):\n    return [[sum(A[i][k] * B[k][j] for k in range(2)) % 100 for j in range(2)] for i in range(2)]\nM = ${pyV(M)}\nR = [[1, 0], [0, 1]]\nn = ${N}\nwhile n:\n    if n & 1:\n        R = mul(R, M)\n    M = mul(M, M)\n    n >>= 1\nprint(${fib ? "R[0][1]" : "R"})`,
        answer: fib ? String(R[0][1]) : pyV(R),
        why: fib
          ? `<p>[[1, 1], [1, 0]]<sup>n</sup> = [[F(n+1), F(n)], [F(n), F(n−1)]], so <code>R[0][1]</code> is F(${N}) mod 100 = ${R[0][1]}, after only about log₂ ${N} multiplications.</p>`
          : `<p>The same square-and-multiply loop as fast power, with matrices in place of numbers: M<sup>${N}</sup> mod 100 = ${pyV(R)}.</p>`,
      };
    },
    // ch 43: the segment tree's array
    segTree(r) {
      const a = ints(r, 8, 1, 9), op = r.pick(["sum", "min"]), t = Array(8).fill(0).concat(a);
      for (let i = 7; i > 0; i--) t[i] = op === "sum" ? t[2 * i] + t[2 * i + 1] : Math.min(t[2 * i], t[2 * i + 1]);
      return {
        ch: 43, title: "Inside a segment tree", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nn = len(a)\nt = [0] * n + a\nfor i in range(n - 1, 0, -1):\n    t[i] = ${op === "sum" ? "t[2 * i] + t[2 * i + 1]" : "min(t[2 * i], t[2 * i + 1])"}\nprint(t[1:n])`,
        answer: pyList(t.slice(1, 8)),
        why: `<p>The leaves sit at <code>t[8..15]</code>, and node i combines its children 2i and 2i + 1. So <code>t[1]</code> is the ${op} of everything, <code>t[2]</code> and <code>t[3]</code> of each half, <code>t[4..7]</code> of each quarter.</p>`,
      };
    },
    // ch 44: range add, range sum
    lazy(r) {
      const n = 8, ups = Array.from({ length: 3 }, () => { const l = r.int(0, 7); return [l, r.int(l, 7), r.int(1, 5)]; });
      const L = r.int(0, 6), R = r.int(L, 7), arr = Array(n).fill(0);
      for (const [l, rr, v] of ups) for (let i = l; i <= rr; i++) arr[i] += v;
      const q = arr.slice(L, R + 1).reduce((s, x) => s + x, 0), all = arr.reduce((s, x) => s + x, 0);
      return {
        ch: 44, title: "Add to ranges, sum a range", prompt: `<p>What does it print?</p>`,
        code: `n = 8\nt, lz = [0] * (4 * n), [0] * (4 * n)\ndef add(node, lo, hi, l, r, v):\n    if r < lo or hi < l:\n        return\n    if l <= lo and hi <= r:\n        t[node] += v * (hi - lo + 1)\n        lz[node] += v\n        return\n    mid = (lo + hi) // 2\n    add(2 * node, lo, mid, l, r, v)\n    add(2 * node + 1, mid + 1, hi, l, r, v)\n    t[node] = t[2 * node] + t[2 * node + 1] + lz[node] * (hi - lo + 1)\ndef total(node, lo, hi, l, r):\n    if r < lo or hi < l:\n        return 0\n    if l <= lo and hi <= r:\n        return t[node]\n    mid = (lo + hi) // 2\n    return total(2 * node, lo, mid, l, r) + total(2 * node + 1, mid + 1, hi, l, r) + lz[node] * (min(hi, r) - max(lo, l) + 1)\nfor l, r, v in ${tupList(ups)}:\n    add(1, 0, n - 1, l, r, v)\nprint(total(1, 0, n - 1, ${L}, ${R}), t[1])`,
        answer: `${q} ${all}`,
        why: `<p>After the adds the array is ${pyList(arr)}: positions ${L}..${R} sum to ${q} and everything to ${all}. A node fully inside an update takes it whole and remembers it in <code>lz</code> instead of telling its children, and a query adds that remembered amount for the part it overlaps.</p>`,
      };
    },
    // ch 45: Fenwick
    fenwick(r) {
      const a = ints(r, 8, 1, 9), tree = [];
      for (let i = 1; i <= 8; i++) tree.push(a.slice(i - (i & -i), i).reduce((s, x) => s + x, 0));
      return {
        ch: 45, title: "Inside a Fenwick tree", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nn = len(a)\ntree = [0] * (n + 1)\nfor i, x in enumerate(a, 1):\n    while i <= n:\n        tree[i] += x\n        i += i & -i\nprint(tree[1:])`,
        answer: pyList(tree),
        why: `<p><code>tree[i]</code> holds the sum of the last <code>i &amp; -i</code> items up to i: one item at odd i, two at 2 and 6, four at 4, all eight at 8. So <code>tree[8]</code> = ${tree[7]} is the total.</p>`,
      };
    },
    // ch 46: sparse table query
    sparse(r) {
      const a = ints(r, 10, 1, 50), l = r.int(0, 7), rr = r.int(l + 1, 9), k = 31 - Math.clz32(rr - l + 1);
      return {
        ch: 46, title: "Two overlapping blocks", prompt: `<p>What does it print?</p>`,
        code: `a = ${pyList(a)}\nsp = [a[:]]\nj = 1\nwhile 1 << j <= len(a):\n    prev = sp[-1]\n    h = 1 << (j - 1)\n    sp.append([min(prev[i], prev[i + h]) for i in range(len(a) - (1 << j) + 1)])\n    j += 1\nl, r = ${l}, ${rr}\nk = (r - l + 1).bit_length() - 1\nprint(k, min(sp[k][l], sp[k][r - (1 << k) + 1]))`,
        answer: `${k} ${Math.min(...a.slice(l, rr + 1))}`,
        why: `<p><code>sp[k][i]</code> is the minimum of the 2<sup>k</sup> items starting at i. The range ${l}..${rr} has ${rr - l + 1} items, so k = ${k} and two blocks of ${1 << k}, one from each end, cover it. They may overlap, which is fine for a minimum.</p>`,
      };
    },
    // ch 47: binary lifting
    lifting(r) {
      const n = 12, par = [-1, ...Array.from({ length: n - 1 }, (_, i) => r.int(Math.max(0, i - 2), i))], x = r.int(8, 11);
      const anc = (v, k) => { while (k-- && v !== -1) v = par[v]; return v; };
      return {
        ch: 47, title: "Jumping up the tree", prompt: `<p><code>par[v]</code> is v's parent, -1 above the root. What does it print?</p>`,
        code: `par = ${pyList(par)}\nn = len(par)\nup = [par[:]]\nfor j in range(1, 4):\n    up.append([up[j - 1][up[j - 1][v]] if up[j - 1][v] != -1 else -1 for v in range(n)])\nx = ${x}\nprint(up[1][x], up[2][x], up[3][x])`,
        answer: `${anc(x, 2)} ${anc(x, 4)} ${anc(x, 8)}`,
        why: `<p><code>up[j][v]</code> is v's 2<sup>j</sup>-th ancestor, built as the 2<sup>j−1</sup>-th ancestor of the 2<sup>j−1</sup>-th ancestor. So it prints the 2nd, 4th and 8th ancestors of ${x}; -1 means the jump goes past the root.</p>`,
      };
    },
    // ch 48: prefix function or Z-function
    kmp(r) {
      const s = word(r, 9, r.pick(["ab", "ab", "abc"])), z = r.next() < 0.5, n = s.length;
      const pi = Array.from({ length: n }, (_, i) => { for (let k = i; k > 0; k--) if (s.slice(0, k) === s.slice(i + 1 - k, i + 1)) return k; return 0; });
      const zs = Array.from({ length: n }, (_, i) => { if (!i) return 0; let k = 0; while (i + k < n && s[k] === s[i + k]) k++; return k; });
      return {
        ch: 48, title: z ? "The Z-function" : "The prefix function", prompt: `<p>What does it print?</p>`,
        code: z
          ? `s = "${s}"\nn = len(s)\nz = [0] * n\nl = r = 0\nfor i in range(1, n):\n    if i < r:\n        z[i] = min(r - i, z[i - l])\n    while i + z[i] < n and s[z[i]] == s[i + z[i]]:\n        z[i] += 1\n    if i + z[i] > r:\n        l, r = i, i + z[i]\nprint(z)`
          : `s = "${s}"\npi = [0] * len(s)\nfor i in range(1, len(s)):\n    k = pi[i - 1]\n    while k and s[i] != s[k]:\n        k = pi[k - 1]\n    if s[i] == s[k]:\n        k += 1\n    pi[i] = k\nprint(pi)`,
        answer: pyList(z ? zs : pi),
        why: z
          ? `<p><code>z[i]</code> is how long the text starting at i matches the start of "${s}". The box <code>[l, r)</code> remembers the furthest match so far, so known letters are never compared twice.</p>`
          : `<p><code>pi[i]</code> is the longest proper prefix of <code>s[:i+1]</code> that is also its suffix. When the next letter doesn't extend the match, <code>k = pi[k - 1]</code> falls back to the next-shorter border instead of starting over.</p>`,
      };
    },
    // ch 49: rolling hash
    rollHash(r) {
      const s = word(r, 7, "abcd"), out = [];
      for (let i = 0; i + 3 <= 7; i++) { let h = 0; for (const c of s.slice(i, i + 3)) h = (h * 31 + c.charCodeAt(0)) % 101; out.push(h); }
      const dup = out.some((h, i) => out.indexOf(h) !== i);
      return {
        ch: 49, title: "Rolling the hash along", prompt: `<p>What does it print? <code>ord("a")</code> is 97.</p>`,
        code: `s = "${s}"\nk, B, M = 3, 31, 101\nh = 0\nfor c in s[:k]:\n    h = (h * B + ord(c)) % M\nout = [h]\ntop = pow(B, k - 1, M)\nfor i in range(k, len(s)):\n    h = ((h - ord(s[i - k]) * top) * B + ord(s[i])) % M\n    out.append(h)\nprint(out)`,
        answer: pyList(out),
        why: `<p>The hash of every 3-letter window, each found from the one before in O(1): take away the leaving letter's share (<code>ord × B²</code>), shift by B, add the new letter. Python's <code>%</code> keeps it non-negative.${dup ? " Two windows share a hash: equal windows always do, and with M = 101 different ones sometimes collide too." : ""}</p>`,
      };
    },
    // ch 50: suffix array and LCP
    suffixArr(r) {
      const s = word(r, 7, r.pick(["ab", "abc"])), n = s.length;
      const sa = Array.from({ length: n }, (_, i) => i).sort((x, y) => (s.slice(x) < s.slice(y) ? -1 : 1));
      const lcp = sa.slice(1).map((b, i) => { const a = sa[i]; let k = 0; while (a + k < n && b + k < n && s[a + k] === s[b + k]) k++; return k; });
      return {
        ch: 50, title: "Sorted suffixes", prompt: `<p>What does it print?</p>`,
        code: `s = "${s}"\nsa = sorted(range(len(s)), key=lambda i: s[i:])\nprint(sa)\nlcp = []\nfor a, b in zip(sa, sa[1:]):\n    k = 0\n    while a + k < len(s) and b + k < len(s) and s[a + k] == s[b + k]:\n        k += 1\n    lcp.append(k)\nprint(lcp)`,
        answer: pyList(sa) + "\n" + pyList(lcp),
        why: `<p>The suffixes in order: ${sa.map((i) => `<code>${s.slice(i)}</code>`).join(", ")}. A shorter suffix comes before any longer one it starts. The LCP list is how many letters each one shares with the one before; the biggest, ${Math.max(...lcp)}, is the longest repeated substring.</p>`,
      };
    },
    // ch 51: strongly connected components
    scc(r) {
      const n = 6, edges = [], has = new Set();
      while (edges.length < 8) { const u = r.int(0, n - 1), v = r.int(0, n - 1); if (u !== v && !has.has(u + "," + v)) { has.add(u + "," + v); edges.push([u, v]); } }
      const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j || has.has(i + "," + j)));
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (reach[i][k] && reach[k][j]) reach[i][j] = true;
      const groups = new Set(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(reach[i][j] && reach[j][i])).join("")));
      return {
        ch: 51, title: "How many strong components?", prompt: `<p>Each pair is a one-way edge. What does it print?</p>`,
        code: `n = ${n}\nedges = ${tupList(edges)}\ng = [[] for _ in range(n)]\nrg = [[] for _ in range(n)]\nfor u, v in edges:\n    g[u].append(v)\n    rg[v].append(u)\norder, seen = [], [False] * n\ndef dfs1(u):\n    seen[u] = True\n    for v in g[u]:\n        if not seen[v]:\n            dfs1(v)\n    order.append(u)\nfor u in range(n):\n    if not seen[u]:\n        dfs1(u)\ncomp = [-1] * n\ndef dfs2(u, c):\n    comp[u] = c\n    for v in rg[u]:\n        if comp[v] == -1:\n            dfs2(v, c)\nc = 0\nfor u in reversed(order):\n    if comp[u] == -1:\n        dfs2(u, c)\n        c += 1\nprint(c)`,
        answer: String(groups.size),
        why: `<p>Kosaraju counts the groups of nodes that can all reach each other: ${groups.size}. A node on no cycle is a group on its own. The first pass orders nodes by finish time; the second walks the reversed edges from the latest finisher, and each walk collects exactly one group.</p>`,
      };
    },
    // ch 52: bridges
    bridges(r) {
      const n = 6;
      let edges, out;
      for (let t = 0; t < 30; t++) {
        edges = treeEdges(r, n);
        const has = new Set(edges.map((e) => e.join()));
        for (let k = 0; k < 2; k++) { const u = r.int(0, n - 2), v = r.int(u + 1, n - 1); if (!has.has(u + "," + v)) { has.add(u + "," + v); edges.push([u, v]); } }
        out = edges.filter((_, i) => !connected(n, edges.filter((_, j) => j !== i)));
        if (out.length && out.length < edges.length) break;
      }
      edges = r.shuffle(edges);
      out = out.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      return {
        ch: 52, title: "Edges you can't lose", prompt: `<p>The edges go both ways. What does it print?</p>`,
        code: `n = ${n}\nedges = ${tupList(edges)}\ng = [[] for _ in range(n)]\nfor i, (u, v) in enumerate(edges):\n    g[u].append((v, i))\n    g[v].append((u, i))\ntin, low, t = [-1] * n, [0] * n, 0\nbridges = []\ndef dfs(u, pe):\n    global t\n    tin[u] = low[u] = t\n    t += 1\n    for v, i in g[u]:\n        if i == pe:\n            continue\n        if tin[v] == -1:\n            dfs(v, i)\n            low[u] = min(low[u], low[v])\n            if low[v] > tin[u]:\n                bridges.append(edges[i])\n        else:\n            low[u] = min(low[u], tin[v])\ndfs(0, -1)\nprint(sorted(bridges))`,
        answer: tupList(out),
        why: `<p>A bridge is an edge on no cycle: removing it cuts the graph in two. Here: ${tupList(out)}. In the DFS, <code>low[v]</code> is the earliest node v's subtree can reach by a back edge; if even that is below u (<code>low[v] &gt; tin[u]</code>), the edge u–v is the only way in.</p>`,
      };
    },
    // ch 53: maximum flow
    maxflow(r) {
      const n = 5, cap = Array.from({ length: n }, () => Array(n).fill(0));
      for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) if (r.next() < 0.55) cap[u][v] = r.int(1, 9);
      const mid = r.int(1, 3);
      cap[0][mid] = cap[0][mid] || r.int(1, 9); cap[mid][4] = cap[mid][4] || r.int(1, 9);
      let best = Infinity;
      for (let m = 0; m < 8; m++) { const S = new Set([0, ...[1, 2, 3].filter((_, i) => (m >> i) & 1)]); let c = 0; for (const u of S) for (let v = 0; v < n; v++) if (!S.has(v)) c += cap[u][v]; best = Math.min(best, c); }
      return {
        ch: 53, title: "How much can flow?", prompt: `<p><code>cap[u][v]</code> is the capacity from u to v. Source 0, sink 4. What does it print?</p>`,
        code: `from collections import deque\nn = ${n}\n` + pyMatrix("cap", cap) + `\nflow = 0\nwhile True:\n    prev = [-1] * n\n    prev[0] = 0\n    q = deque([0])\n    while q and prev[n - 1] == -1:\n        u = q.popleft()\n        for v in range(n):\n            if prev[v] == -1 and cap[u][v] > 0:\n                prev[v] = u\n                q.append(v)\n    if prev[n - 1] == -1:\n        break\n    v, push = n - 1, float("inf")\n    while v != 0:\n        push = min(push, cap[prev[v]][v])\n        v = prev[v]\n    v = n - 1\n    while v != 0:\n        cap[prev[v]][v] -= push\n        cap[v][prev[v]] += push\n        v = prev[v]\n    flow += push\nprint(flow)`,
        answer: String(best),
        why: `<p>The maximum flow is ${best}, the same as the smallest cut: the cheapest set of edges whose removal separates 0 from 4. Each round finds a shortest path with room left, pushes its bottleneck, and adds the reverse capacity so later rounds can undo a bad choice.</p>`,
      };
    },
    // ch 54: bipartite matching
    matching(r) {
      const adj = Array.from({ length: 5 }, () => [...new Set(ints(r, r.int(1, 2), 0, 4))].sort((x, y) => x - y));
      const best = (i, used) => (i === 5 ? 0 : Math.max(best(i + 1, used), ...adj[i].filter((v) => !used.has(v)).map((v) => 1 + best(i + 1, new Set([...used, v])))));
      const size = best(0, new Set());
      return {
        ch: 54, title: "Pair them up", prompt: `<p><code>adj[i]</code> lists the jobs worker i can do; each job takes one worker. What does it print?</p>`,
        code: `adj = ${pyV(adj)}\nmatch = [-1] * 5\ndef try_kuhn(u, seen):\n    for v in adj[u]:\n        if v not in seen:\n            seen.add(v)\n            if match[v] == -1 or try_kuhn(match[v], seen):\n                match[v] = u\n                return True\n    return False\nprint(sum(try_kuhn(u, set()) for u in range(5)))`,
        answer: String(size),
        why: `<p>At most ${size} workers can get a job. Kuhn's algorithm gives each worker a job, and when the job is taken it asks the current holder to move to another one, recursively: an augmenting path. A worker it can't place stays unmatched.</p>`,
      };
    },
    // ch 55: 2-SAT
    twoSat(r) {
      const lit = (v) => (v < 0 ? "not " : "") + "x" + Math.abs(v), sgn = () => (r.next() < 0.5 ? -1 : 1);
      if (r.next() < 0.5) {
        const va = r.int(1, 3), vb = (va % 3) + 1, a = sgn() * va, b = sgn() * vb, first = r.next() < 0.5;
        const right = first ? [-a, b] : [-b, a];
        const wrong = r.shuffle([[a, b], [-a, -b], [b, a], [-b, -a], [a, -b], [b, -a]]).slice(0, 3);
        const t = (p) => `${lit(p[0])} -> ${lit(p[1])}`;
        return {
          ch: 55, title: "From a clause to edges", match: "choice", opts: r.shuffle([right, ...wrong]).map((p) => ({ t: t(p), ok: p === right })),
          prompt: `<p>The clause <b>(${lit(a)} or ${lit(b)})</b> goes into the implication graph as two edges. Which is one of them?</p>`,
          code: `def lit(v):\n    return ("not " if v < 0 else "") + "x" + str(abs(v))\na, b = ${a}, ${b}\n` + (first ? `print(lit(-a), "->", lit(b))` : `print(lit(-b), "->", lit(a))`),
          answer: t(right),
          why: `<p>"a or b" means: if a is false, b must be true, and if b is false, a must be true. So the edges are <code>${t([-a, b])}</code> and <code>${t([-b, a])}</code>. The formula can be satisfied unless some x and not x end up in the same strong component.</p>`,
        };
      }
      const holds = (v, x) => (v > 0 ? x[v - 1] : !x[-v - 1]);
      // aim for yes or no evenly: random clauses are satisfiable about 4 times in 5
      const want = r.next() < 0.5;
      let clauses, ok;
      for (let t = 0; t < 60; t++) {
        clauses = Array.from({ length: 6 }, () => { const va = r.int(1, 3); let vb = r.int(1, 3); if (vb === va) vb = (va % 3) + 1; return [sgn() * va, sgn() * vb]; });
        ok = masks(3).some((m) => { const x = bitsOf(m, 3).map(Boolean); return clauses.every(([a, b]) => holds(a, x) || holds(b, x)); });
        if (ok === want) break;
      }
      return {
        ch: 55, title: "Can all six hold?", match: "choice", opts: [{ t: "yes", ok }, { t: "no", ok: !ok }],
        prompt: `<p>Each pair <code>(a, b)</code> is a clause "a or b", where -2 means not x2. What does it print?</p>`,
        code: `from itertools import product\nclauses = ${tupList(clauses)}\ndef holds(v, x):\n    return x[abs(v) - 1] if v > 0 else not x[abs(v) - 1]\nok = any(all(holds(a, x) or holds(b, x) for a, b in clauses) for x in product([False, True], repeat=3))\nprint("yes" if ok else "no")`,
        answer: ok ? "yes" : "no",
        why: ok
          ? `<p>Yes: some setting of x1, x2 and x3 makes every clause true. Trying all 8 works for 3 variables; 2-SAT does it in linear time for any number, through the implication graph.</p>`
          : `<p>No: every one of the 8 settings breaks some clause. In the implication graph, some x and not x end up reachable from each other, which is exactly what 2-SAT checks.</p>`,
      };
    },
    // ch 56: Euler paths
    euler(r) {
      const n = 5, edges = treeEdges(r, n), has = new Set(edges.map((e) => e.join()));
      for (let k = r.int(1, 3); k > 0; k--) { const u = r.int(0, n - 2), v = r.int(u + 1, n - 1); if (!has.has(u + "," + v)) { has.add(u + "," + v); edges.push([u, v]); } }
      const deg = Array(n).fill(0);
      for (const [u, v] of edges) { deg[u]++; deg[v]++; }
      const odd = deg.map((d, v) => (d % 2 ? v : -1)).filter((v) => v >= 0), kind = !odd.length ? "circuit" : odd.length === 2 ? "path" : "none";
      return {
        ch: 56, title: "Can you draw it in one stroke?", prompt: `<p>The graph is connected and its edges go both ways. What does it print?</p>`,
        code: `edges = ${tupList(r.shuffle(edges))}\ndeg = [0] * ${n}\nfor u, v in edges:\n    deg[u] += 1\n    deg[v] += 1\nodd = [v for v in range(${n}) if deg[v] % 2]\nprint(odd, "circuit" if not odd else "path" if len(odd) == 2 else "none")`,
        answer: `${pyList(odd)} ${kind}`,
        why: `<p>The degrees are ${pyList(deg)}. A connected graph can be drawn in one stroke ending where it started when every degree is even, from one odd node to the other when exactly two are odd, and not at all otherwise.</p>`,
      };
    },
    // ch 57: a constructive greedy
    split(r) {
      const n = r.pick([3, 4, 7, 8, 11, 12, 15, 16]);
      let target = (n * (n + 1)) / 4;
      const picked = [];
      for (let x = n; x > 0; x--) if (x <= target) { picked.push(x); target -= x; }
      return {
        ch: 57, title: "Two halves of 1 to " + n, prompt: `<p>This splits 1, 2, …, ${n} into two groups with equal sums. What does it print?</p>`,
        code: `n = ${n}\ntarget = n * (n + 1) // 4\npicked = []\nfor x in range(n, 0, -1):\n    if x <= target:\n        picked.append(x)\n        target -= x\nprint(picked)`,
        answer: pyList(picked),
        why: `<p>The total is ${(n * (n + 1)) / 2}, so each half needs ${(n * (n + 1)) / 4}. Taking the biggest number that still fits never gets stuck, because every amount up to what's left can still be made from the smaller numbers. It only works when n mod 4 is 0 or 3; otherwise the total is odd.</p>`,
      };
    },
    // ch 58: Grundy numbers or Nim
    grundy(r) {
      if (r.next() < 0.4) {
        const piles = ints(r, 3, 1, 15), x = piles[0] ^ piles[1] ^ piles[2];
        return {
          ch: 58, title: "Who wins at Nim?", prompt: `<p>What does it print?</p>`,
          code: `piles = ${pyList(piles)}\nx = 0\nfor p in piles:\n    x ^= p\nprint(x, "first" if x else "second")`,
          answer: `${x} ${x ? "first" : "second"}`,
          why: `<p>${piles.join(" xor ")} = ${x}. The player to move wins exactly when the xor isn't 0: there's always a move making it 0, and from 0 every move makes it non-zero again.</p>`,
        };
      }
      const moves = [1, ...r.shuffle([2, 3, 4, 5]).slice(0, r.int(1, 2))].sort((a, b) => a - b), N = r.int(8, 11), g = [];
      for (let n = 0; n <= N; n++) { const seen = new Set(moves.filter((m) => m <= n).map((m) => g[n - m])); let x = 0; while (seen.has(x)) x++; g.push(x); }
      return {
        ch: 58, title: "Grundy numbers", prompt: `<p>A move takes ${moves.join(", ")} stones from the pile. What does it print?</p>`,
        code: `moves = ${pyList(moves)}\ng = []\nfor n in range(${N + 1}):\n    seen = {g[n - m] for m in moves if m <= n}\n    x = 0\n    while x in seen:\n        x += 1\n    g.append(x)\nprint(g)`,
        answer: pyList(g),
        why: `<p>A pile's Grundy number is the smallest number not among the piles it can move to (the mex). 0 means the player to move loses. Here the losing sizes are ${g.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0).join(", ")}.</p>`,
      };
    },
    // ch 59: meet in the middle
    mitm(r) {
      const a = ints(r, 8, 1, 20);
      const T = a.filter((_, i) => (r.int(1, 255) >> i) & 1).reduce((s, x) => s + x, 0) || a[0];
      const count = masks(8).filter((m) => a.reduce((s, x, i) => s + ((m >> i) & 1 ? x : 0), 0) === T).length;
      return {
        ch: 59, title: "Meet in the middle", prompt: `<p>What does it print?</p>`,
        code: `from bisect import bisect_left, bisect_right\na = ${pyList(a)}\nT = ${T}\ndef sums(part):\n    out = [0]\n    for x in part:\n        out += [s + x for s in out]\n    return out\nleft, right = sums(a[:4]), sorted(sums(a[4:]))\nprint(sum(bisect_right(right, T - s) - bisect_left(right, T - s) for s in left))`,
        answer: String(count),
        why: `<p>The number of subsets summing to ${T}: ${count}. Each half has only 2⁴ = 16 subset sums; for every left sum s, binary search counts the right sums equal to ${T} − s. That's 2<sup>n/2</sup> work on each side instead of 2<sup>n</sup>.</p>`,
      };
    },
    // ch 60: a stress test catching a bug
    stress(r) {
      const a = distinctSorted(r, 5, 2, 14), bug = r.pick(["hi", "gt"]);
      const slow = (x) => { const i = a.findIndex((y) => y >= x); return i < 0 ? a.length : i; };
      const fast = (x) => {
        let lo = 0, hi = bug === "hi" ? a.length - 1 : a.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (bug === "hi" ? a[mid] >= x : a[mid] > x) hi = mid; else lo = mid + 1; }
        return lo;
      };
      let ans = "no difference";
      for (let x = 0; x < 16; x++) if (slow(x) !== fast(x)) { ans = `${x} ${slow(x)} ${fast(x)}`; break; }
      return {
        ch: 60, title: "What the stress test catches", prompt: `<p><code>slow</code> is the obviously-correct version. What does it print?</p>`,
        code: `a = ${pyList(a)}\ndef slow(x):\n    for i, y in enumerate(a):\n        if y >= x:\n            return i\n    return len(a)\ndef fast(x):\n    lo, hi = 0, len(a)${bug === "hi" ? " - 1" : ""}\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if a[mid] ${bug === "hi" ? ">=" : ">"} x:\n            hi = mid\n        else:\n            lo = mid + 1\n    return lo\nfor x in range(16):\n    if slow(x) != fast(x):\n        print(x, slow(x), fast(x))\n        break\nelse:\n    print("no difference")`,
        answer: ans,
        why: bug === "hi"
          ? `<p><code>fast</code> starts with <code>hi = len(a) - 1</code>, so it can never answer len(a): it's wrong exactly when x is bigger than everything, first at x = ${a[4] + 1}. Comparing against a slow version on many small inputs finds that edge without you having to think of it.</p>`
          : `<p><code>fast</code> tests <code>a[mid] &gt; x</code>, so it finds the first item <i>greater</i> than x, not greater or equal. The two only disagree when x is in the list, first at x = ${a[0]}. Comparing against a slow version on many small inputs finds it for you.</p>`,
      };
    },
  });

  // ---- a second round: another angle on the chapters the interviews lean on most ----
  const GROW = ["log n", "√n", "n", "n log n", "n^2", "n^3", "2^n"];
  // each one counts its own work; the checker runs it at growing n and measures the growth for real
  const BIGO = [
    ["n^2", "for i in range(n):\n    for j in range(i):\n        count += 1"],
    ["log n", "i = 1\nwhile i < n:\n    i *= M\n    count += 1"],
    ["n log n", "for i in range(n):\n    j = 1\n    while j < n:\n        j *= 2\n        count += 1"],
    ["n", "for i in range(n):\n    count += 1\nfor j in range(n):\n    count += 1"],
    ["n", "for i in range(n):\n    for j in range(C):\n        count += 1"],
    ["√n", "i = 1\nwhile i * i <= n:\n    count += 1\n    i += 1"],
    ["n^3", "for i in range(n):\n    for j in range(i):\n        for k in range(j):\n            count += 1"],
    ["n", "i = n\nwhile i > 0:\n    for j in range(i):\n        count += 1\n    i //= 2"],
    ["n log n", "for i in range(1, n + 1):\n    for j in range(0, n, i):\n        count += 1"],
  ];
  const BIGO_WHY = {
    "n^2": "The inner loop runs 0, 1, 2, … n − 1 times: n(n − 1)/2 in all. Halving the work still leaves n².",
    "log n": "The counter multiplies each time, so it reaches n after about log n steps, whatever the base.",
    "n log n": "n rounds, and each one does about log n work.",
    "n": "Add the work up rather than multiplying it: loops one after another add, a constant inner loop is a constant, and n + n/2 + n/4 + … is under 2n.",
    "√n": "It stops once i² passes n, so after about √n steps.",
    "n^3": "Three loops nested inside each other, each up to n: about n³/6 steps, still n³.",
    "2^n": "Every call makes two more until n hits 0, so the calls double with each level: 2ⁿ⁺¹ − 1 of them.",
  };
  const BIGO_CLASSIFY = `
import math
def growth():
    a, b, c = f(10), f(11), f(12)
    if c > 1000 and 1.8 < c / b < 2.2 and 1.8 < b / a < 2.2:
        return "2^n"
    k = math.log2(f(128) / f(64))
    for limit, name in ((0.4, "log n"), (0.75, "√n"), (1.1, "n"), (1.6, "n log n"), (2.5, "n^2")):
        if k < limit:
            return name
    return "n^3"
print("O(" + growth() + ")")`;
  const ROOMS = ["Ana", "Bo", "Cy", "Di", "Ed", "Flo", "Gus", "Hal"];
  const near = (all, answer, k) => { const at = all.indexOf(answer); return all.filter((x) => x !== answer).sort((x, y) => Math.abs(all.indexOf(x) - at) - Math.abs(all.indexOf(y) - at)).slice(0, k); };

  Object.assign(GENS, {
    // ch 1: how the work grows
    bigO(r) {
      const t = r.int(0, BIGO.length + 1);
      let answer, body;
      if (t >= BIGO.length) { answer = "2^n"; body = `def f(n):\n    if n == 0:\n        return 1\n    return 1 + f(n - 1) + f(n - 1)`; }
      else {
        [answer, body] = BIGO[t];
        body = body.replace("M", String(r.int(2, 3))).replace("C", String(r.int(3, 9)));
        body = "def f(n):\n    count = 0\n" + body.split("\n").map((l) => "    " + l).join("\n") + "\n    return count";
      }
      const opts = r.shuffle([answer, ...r.shuffle(near(GROW, answer, 4)).slice(0, 3)]).map((x) => ({ t: "O(" + x + ")", ok: x === answer }));
      return {
        ch: 1, title: "How does the work grow?", match: "choice", opts,
        prompt: "<p><code>f(n)</code> counts its own steps. As n grows, how does that count grow?</p>",
        code: body, run: body + BIGO_CLASSIFY, answer: "O(" + answer + ")",
        why: `<p>${BIGO_WHY[answer]}</p>`,
      };
    },
    // ch 2: compacting in place with a write pointer
    moveZeros(r) {
      const a = Array.from({ length: 9 }, () => (r.next() < 0.4 ? 0 : r.int(1, 9)));
      const keep = a.filter((x) => x !== 0);
      return {
        ch: 2, title: "Zeros to the back", prompt: "<p>What does it print?</p>",
        code: `a = ${pyList(a)}\nw = 0\nfor x in a:\n    if x != 0:\n        a[w] = x\n        w += 1\nfor i in range(w, len(a)):\n    a[i] = 0\nprint(a, w)`,
        answer: `${pyList(keep.concat(Array(a.length - keep.length).fill(0)))} ${keep.length}`,
        why: `<p><code>w</code> is where the next non-zero goes. It never overtakes the reading position, so nothing is overwritten before it's read. The non-zeros keep their order, and ${keep.length} of them fit before the zeros.</p>`,
      };
    },
    // ch 3: grouping by a key
    anagrams(r) {
      const bases = [];
      const nb = r.int(2, 4);
      while (bases.length < nb) { const w = r.shuffle("aeinrst".split("")).slice(0, 3).sort().join(""); if (!bases.includes(w)) bases.push(w); }
      const words = Array.from({ length: r.int(5, 8) }, () => r.shuffle(r.pick(bases).split("")).join(""));
      const g = {};
      for (const w of words) { const k = w.split("").sort().join(""); g[k] = (g[k] || 0) + 1; }
      return {
        ch: 3, title: "Group the anagrams", prompt: "<p>What does it print?</p>",
        code: `words = ${pyList(words)}\ngroups = {}\nfor w in words:\n    key = "".join(sorted(w))\n    groups.setdefault(key, []).append(w)\nprint(len(groups), max(len(g) for g in groups.values()))`,
        answer: `${Object.keys(g).length} ${Math.max(...Object.values(g))}`,
        why: `<p>Anagrams share their sorted letters, so the sorted word is the key: ${Object.entries(g).map(([k, n]) => `<code>${k}</code> × ${n}`).join(", ")}. A repeated word counts again.</p>`,
      };
    },
    // ch 4: many range updates with a difference array
    diffArray(r) {
      const n = 8, ups = Array.from({ length: 3 }, () => { const l = r.int(0, 6); return [l, r.int(l, 7), r.int(1, 5)]; });
      const a = Array(n).fill(0);
      for (const [l, rr, v] of ups) for (let i = l; i <= rr; i++) a[i] += v;
      return {
        ch: 4, title: "Many updates, one pass", prompt: "<p>Each <code>(l, r, v)</code> adds v to every position from l to r. What does it print?</p>",
        code: `n = ${n}\nd = [0] * (n + 1)\nfor l, r, v in ${tupList(ups)}:\n    d[l] += v\n    d[r + 1] -= v\na, run = [], 0\nfor i in range(n):\n    run += d[i]\n    a.append(run)\nprint(a)`,
        answer: pyList(a),
        why: "<p>Each update touches only its two ends: +v where it starts and −v just after it stops. The running total turns those marks back into the real values, so any number of updates costs one pass.</p>",
      };
    },
    // ch 5: the order recursive calls print in
    recOrder(r) {
      let n, A, B, out;
      for (let tries = 0; ; tries++) {
        n = r.int(3, 6); A = r.int(1, 3); B = r.int(1, 3); out = [];
        const f = (k) => { if (k <= 0) return; f(k - A); out.push(k); f(k - B); };
        f(n);
        if (out.length <= 14 || tries > 40) break;
      }
      return {
        ch: 5, title: "In what order?", prompt: "<p>What does it print?</p>",
        code: `def f(n):\n    if n <= 0:\n        return\n    f(n - ${A})\n    print(n, end=" ")\n    f(n - ${B})\nf(${n})`,
        answer: out.join(" "),
        why: `<p>Each call prints only after its whole first call, <code>f(n - ${A})</code>, has finished, and before its second one starts. Draw the call tree: the output reads it left, node, right.</p>`,
      };
    },
    // ch 6: sorting by a key, and stability
    sortKey(r) {
      const people = r.shuffle(ROOMS).slice(0, 6).map((n) => [n, r.int(1, 4)]);
      const v = r.int(0, 2);
      const idx = people.map((_, i) => i);
      let key, order;
      if (v === 0) { key = "key=lambda p: p[1]"; order = idx.sort((i, j) => people[i][1] - people[j][1]); }
      else if (v === 1) { key = "key=lambda p: (-p[1], p[0])"; order = idx.sort((i, j) => people[j][1] - people[i][1] || (people[i][0] < people[j][0] ? -1 : 1)); }
      else { key = "key=lambda p: p[1], reverse=True"; order = idx.sort((i, j) => people[j][1] - people[i][1]); }
      return {
        ch: 6, title: "Sorted by what?", prompt: "<p>What does it print?</p>",
        code: `people = ${pyV(people)}\nfor name, score in sorted(people, ${key}):\n    print(name, end=" ")`,
        answer: order.map((i) => people[i][0]).join(" "),
        why: v === 1 ? "<p>The key is a tuple: highest score first (the minus sign), then names A to Z for a tie.</p>"
          : `<p>Python's sort is <b>stable</b>: people with the same score stay in the order they started in${v === 2 ? ", even with <code>reverse=True</code>" : ""}. Only the score moves anyone.</p>`,
      };
    },
    // ch 7: removing duplicates in place
    dedupe(r) {
      const a = ints(r, 10, 1, 6).sort((x, y) => x - y);
      const u = [...new Set(a)];
      return {
        ch: 7, title: "Squash the repeats", prompt: "<p>What does it print?</p>",
        code: `a = ${pyList(a)}\nk = 1\nfor i in range(1, len(a)):\n    if a[i] != a[k - 1]:\n        a[k] = a[i]\n        k += 1\nprint(k, a[:k])`,
        answer: `${u.length} ${pyList(u)}`,
        why: "<p>A slow pointer <code>k</code> marks the end of the kept part; the fast one reads ahead and only copies a value that differs from the last one kept. Sorted input puts the repeats side by side, which is what makes one pass enough.</p>",
      };
    },
    // ch 8: the shortest window with a big enough sum
    minWindow(r) {
      const a = ints(r, 10, 1, 9), T = r.int(10, 32);
      let best = a.length + 1, left = 0, total = 0;
      a.forEach((x, right) => { total += x; while (total >= T) { best = Math.min(best, right - left + 1); total -= a[left]; left++; } });
      return {
        ch: 8, title: "The shortest stretch", prompt: "<p>What does it print?</p>",
        code: `a = ${pyList(a)}\nT = ${T}\nbest = len(a) + 1\nleft = total = 0\nfor right, x in enumerate(a):\n    total += x\n    while total >= T:\n        best = min(best, right - left + 1)\n        total -= a[left]\n        left += 1\nprint(best if best <= len(a) else 0)`,
        answer: String(best <= a.length ? best : 0),
        why: `<p>The shortest stretch summing to at least ${T}${best <= a.length ? ` has ${best} numbers` : ": there isn't one, so 0"}. The right edge grows the window; while it's big enough, the left edge shrinks it. All numbers are positive, so shrinking always lowers the sum: that's what makes it work.</p>`,
      };
    },
    // ch 9: bisect_left and bisect_right
    bisects(r) {
      const a = ints(r, 9, 1, 8).sort((x, y) => x - y), x = r.next() < 0.7 ? r.pick(a) : r.int(0, 9);
      const L = a.filter((y) => y < x).length, R = a.filter((y) => y <= x).length;
      return {
        ch: 9, title: "Left or right?", prompt: "<p>What does it print?</p>",
        code: `from bisect import bisect_left, bisect_right\na = ${pyList(a)}\nprint(bisect_left(a, ${x}), bisect_right(a, ${x}))`,
        answer: `${L} ${R}`,
        why: `<p><code>bisect_left</code> is the first place ${x} could go (the count of items smaller than ${x}); <code>bisect_right</code> is the place just after any copies of it (the count of items ≤ ${x}). Their difference, ${R - L}, is how many times ${x} appears.</p>`,
      };
    },
    // ch 10: binary search on the answer: the integer square root
    isqrt(r) {
      const n = r.int(20, 999);
      let lo = 0, hi = n, steps = 0;
      while (lo < hi) { const mid = Math.floor((lo + hi + 1) / 2); steps++; if (mid * mid <= n) lo = mid; else hi = mid - 1; }
      return {
        ch: 10, title: "Search the answer", prompt: "<p>What does it print?</p>",
        code: `n = ${n}\nlo, hi = 0, n\nsteps = 0\nwhile lo < hi:\n    mid = (lo + hi + 1) // 2\n    steps += 1\n    if mid * mid <= n:\n        lo = mid\n    else:\n        hi = mid - 1\nprint(lo, steps)`,
        answer: `${lo} ${steps}`,
        why: `<p>"Is mid² ≤ ${n}?" is yes up to some point and no after it, so binary search finds the last yes: ${lo}, since ${lo}² = ${lo * lo} and ${lo + 1}² = ${(lo + 1) ** 2}. The <code>+ 1</code> in mid stops it looping forever when lo and hi are neighbours.</p>`,
      };
    },
    // ch 11: matching brackets with a stack
    brackets(r) {
      const open = "([{", close = ")]}";
      let s = "";
      const st = [];
      while (s.length < 8) { if (st.length && (r.next() < 0.5 || s.length + st.length >= 8)) s += close[open.indexOf(st.pop())]; else { const c = r.pick(open.split("")); st.push(c); s += c; } }
      if (r.next() < 0.75) { const i = r.int(0, s.length - 1); s = s.slice(0, i) + r.pick("()[]{}".split("").filter((c) => c !== s[i])) + s.slice(i + 1); }
      const pairs = { ")": "(", "]": "[", "}": "{" }, stack = [];
      let ans = null;
      for (let i = 0; i < s.length; i++) { const c = s[i]; if (open.includes(c)) stack.push(c); else if (!stack.length || stack.pop() !== pairs[c]) { ans = `bad at ${i}`; break; } }
      if (ans == null) ans = stack.length ? `open ${stack.length}` : "ok";
      return {
        ch: 11, title: "Do the brackets match?", prompt: "<p>What does it print?</p>",
        code: `s = "${s}"\npairs = {")": "(", "]": "[", "}": "{"}\nstack = []\nfor i, c in enumerate(s):\n    if c in "([{":\n        stack.append(c)\n    elif not stack or stack.pop() != pairs[c]:\n        print("bad at", i)\n        break\nelse:\n    print("ok" if not stack else f"open {len(stack)}")`,
        answer: ans,
        why: "<p>Every closer must match the most recent opener that's still open: the top of the stack. A wrong one, or one with nothing open, fails on the spot; openers left over at the end were never closed. (The <code>else</code> on a <code>for</code> runs only if the loop didn't <code>break</code>.)</p>",
      };
    },
    // ch 12: a queue as a sliding time window
    recent(r) {
      const ts = distinctSorted(r, 8, 1, 40), W = r.int(5, 12);
      const out = ts.map((t) => ts.filter((u) => u <= t && u >= t - W).length);
      return {
        ch: 12, title: "Hits in the last few seconds", prompt: "<p>What does it print?</p>",
        code: `from collections import deque\nq = deque()\nfor t in ${pyList(ts)}:\n    q.append(t)\n    while q[0] < t - ${W}:\n        q.popleft()\n    print(len(q), end=" ")`,
        answer: out.join(" "),
        why: `<p>The queue holds the times from the last ${W} seconds. New times join at the back; times that are too old leave from the front. Each time enters and leaves once, so it's O(1) a hit on average.</p>`,
      };
    },
    // ch 13: reversing a linked list k at a time
    kGroup(r) {
      const n = r.int(7, 9), k = r.int(2, 4), out = [];
      for (let s = 1; s <= n; s += k) { const chunk = []; for (let v = s; v < s + k && v <= n; v++) chunk.push(v); out.push(...(chunk.length === k ? chunk.reverse() : chunk)); }
      return {
        ch: 13, title: "Reverse k at a time", prompt: "<p>What does it print?</p>",
        code: `class Node:\n    def __init__(self, val, nxt=None):\n        self.val, self.next = val, nxt\nhead = None\nfor v in reversed(range(1, ${n + 1})):\n    head = Node(v, head)\ndef reverse_k(head, k):\n    node, count = head, 0\n    while node and count < k:\n        node, count = node.next, count + 1\n    if count < k:\n        return head\n    prev, cur = reverse_k(node, k), head\n    for _ in range(k):\n        cur.next, prev, cur = prev, cur, cur.next\n    return prev\nhead = reverse_k(head, ${k})\nwhile head:\n    print(head.val, end=" ")\n    head = head.next`,
        answer: out.join(" "),
        why: `<p>Every full group of ${k} is flipped by pointing each node back at the one before it, and the group's old first node is joined to the already-reversed rest. A short last group (fewer than ${k}) is left as it is.</p>`,
      };
    },
    // ch 14: how many rooms
    rooms(r) {
      const len = r.int(4, 10), ms = Array.from({ length: r.int(4, 7) }, () => { const s = r.int(0, 20); return [s, s + r.int(1, len)]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const ends = [];
      for (const [s, e] of ms) { ends.sort((a, b) => a - b); if (ends.length && ends[0] <= s) ends[0] = e; else ends.push(e); }
      return {
        ch: 14, title: "How many rooms?", prompt: "<p>Each meeting is <code>(start, end)</code>. What does it print?</p>",
        code: `import heapq\nmeetings = ${tupList(ms)}\nends = []\nfor s, e in meetings:\n    if ends and ends[0] <= s:\n        heapq.heapreplace(ends, e)\n    else:\n        heapq.heappush(ends, e)\nprint(len(ends))`,
        answer: String(ends.length),
        why: "<p>In order of start time, each meeting reuses the room that frees up first, if it's free by then, or opens a new one. The heap of end times answers \"which room frees up first?\" in O(log n). The answer is the most meetings ever happening at once.</p>",
      };
    },
    // ch 15: the k-th largest so far
    kthLargest(r) {
      const xs = ints(r, 8, 1, 30), K = r.int(2, 3), keep = [], out = [];
      for (const x of xs) { keep.push(x); keep.sort((a, b) => a - b); if (keep.length > K) keep.shift(); if (keep.length === K) out.push(keep[0]); }
      return {
        ch: 15, title: "The k-th largest, live", prompt: "<p>What does it print?</p>",
        code: `import heapq\nh = []\nfor x in ${pyList(xs)}:\n    heapq.heappush(h, x)\n    if len(h) > ${K}:\n        heapq.heappop(h)\n    if len(h) == ${K}:\n        print(h[0], end=" ")`,
        answer: out.join(" "),
        why: `<p>A min-heap that only ever keeps the ${K} biggest numbers seen so far: its smallest, <code>h[0]</code>, is the ${K === 2 ? "2nd" : "3rd"} largest. Each new number costs O(log ${K}).</p>`,
      };
    },
    // ch 16: the fewest jumps, greedily
    jumps(r) {
      const a = ints(r, 8, 1, 3);
      let j = 0, end = 0, far = 0;
      for (let i = 0; i < a.length - 1; i++) { far = Math.max(far, i + a[i]); if (i === end) { j++; end = far; } }
      return {
        ch: 16, title: "The fewest jumps", prompt: "<p>From index i you may jump up to <code>a[i]</code> places forward. What does it print?</p>",
        code: `a = ${pyList(a)}\njumps = end = far = 0\nfor i in range(len(a) - 1):\n    far = max(far, i + a[i])\n    if i == end:\n        jumps += 1\n        end = far\nprint(jumps)`,
        answer: String(j),
        why: "<p>Think in rounds, like BFS: everything reachable with j jumps is a stretch ending at <code>end</code>. While walking that stretch, track the farthest the next jump could reach; at its end, take the jump. Greedy is safe because reaching farther never hurts.</p>",
      };
    },
    // ch 17: a tree's height and its leaves
    treeShape(r) {
      const n = r.int(7, 9), e = treeEdges(r, n), ch = Array.from({ length: n }, () => []);
      for (const [u, v] of e) ch[u].push(v);
      const depth = (u) => 1 + Math.max(0, ...ch[u].map(depth));
      return {
        ch: 17, title: "Tall and leafy", prompt: "<p>What does it print?</p>",
        code: `children = {${ch.map((c, i) => `${i}: ${pyList(c)}`).join(", ")}}\ndef depth(u):\n    return 1 + max((depth(v) for v in children[u]), default=0)\nleaves = sum(1 for u in children if not children[u])\nprint(depth(0), leaves)`,
        answer: `${depth(0)} ${ch.filter((c) => !c.length).length}`,
        why: "<p>The height of a node is 1 more than its tallest child's (a leaf counts 1). The leaves are the nodes with no children.</p>",
      };
    },
    // ch 18: the path a BST search takes
    bstPath(r) {
      const vals = r.shuffle(distinctSorted(r, 8, 1, 60)), x = r.next() < 0.6 ? r.pick(vals) : r.int(1, 60);
      const root = { v: vals[0] };
      for (const v of vals.slice(1)) { let n = root; for (;;) { const side = v < n.v ? "l" : "r"; if (!n[side]) { n[side] = { v }; break; } n = n[side]; } }
      const path = []; let n = root;
      while (n && n.v !== x) { path.push(n.v); n = x < n.v ? n.l : n.r; }
      return {
        ch: 18, title: "Where the search goes", prompt: `<p>The values go into an empty BST in this order. What does it print when it searches for ${x}?</p>`,
        code: `class Node:\n    def __init__(self, v):\n        self.v, self.left, self.right = v, None, None\ndef insert(root, v):\n    if root is None:\n        return Node(v)\n    if v < root.v:\n        root.left = insert(root.left, v)\n    else:\n        root.right = insert(root.right, v)\n    return root\nroot = None\nfor v in ${pyList(vals)}:\n    root = insert(root, v)\nx = ${x}\nnode = root\nwhile node and node.v != x:\n    print(node.v, end=" ")\n    node = node.left if x < node.v else node.right\nprint("found" if node else "missing")`,
        answer: path.concat(n ? "found" : "missing").join(" "),
        why: "<p>The first value inserted is the root. A search goes left when x is smaller and right when it's bigger, so it only visits one node per level: the path is as long as the tree is tall.</p>",
      };
    },
    // ch 19: shortest steps through a grid
    gridBFS(r) {
      const R = 5, C = 6, g = Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => ((i === 0 && j === 0) || r.next() > 0.32 ? "." : "#")));
      const dist = { "0,0": 0 }, q = [[0, 0]];
      while (q.length) { const [a, b] = q.shift(); for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = a + da, y = b + db; if (x >= 0 && x < R && y >= 0 && y < C && g[x][y] === "." && dist[x + "," + y] == null) { dist[x + "," + y] = dist[a + "," + b] + 1; q.push([x, y]); } } }
      // the target: usually a square it can reach (the farther the likelier), sometimes an open one it can't
      const open = []; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (g[i][j] === "." && (i || j)) open.push([i, j]);
      const reach = open.filter(([i, j]) => dist[i + "," + j] != null && dist[i + "," + j] >= 3), cut = open.filter(([i, j]) => dist[i + "," + j] == null);
      const [ti, tj] = (cut.length && r.next() < 0.15) || !reach.length ? r.pick(cut.length ? cut : open) : r.pick(reach);
      const ans = dist[ti + "," + tj];
      return {
        ch: 19, title: "Through the maze", prompt: `<p>Steps go up, down, left or right, never through <code>#</code>. How many steps from the top-left corner to row ${ti}, column ${tj} (counting from 0)?</p>`,
        code: `from collections import deque\ngrid = [\n${g.map((row) => `    "${row.join("")}",`).join("\n")}\n]\nR, C = len(grid), len(grid[0])\ndist = {(0, 0): 0}\nq = deque([(0, 0)])\nwhile q:\n    r, c = q.popleft()\n    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):\n        nr, nc = r + dr, c + dc\n        if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] == "." and (nr, nc) not in dist:\n            dist[(nr, nc)] = dist[(r, c)] + 1\n            q.append((nr, nc))\nprint(dist.get((${ti}, ${tj}), -1))`,
        answer: String(ans == null ? -1 : ans),
        why: `<p>BFS reaches every square in order of distance, so the first time it reaches (${ti}, ${tj}) is the shortest way: ${ans == null ? "here it never does, as walls cut it off, so −1" : ans + " steps"}. With no walls in the way it would be ${ti + tj}.</p>`,
      };
    },
    // ch 20: counting islands
    islands(r) {
      const g = Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => (r.next() < 0.45 ? "1" : "0")));
      const seen = g.map((row) => row.slice());
      let count = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) if (seen[i][j] === "1") { count++; const st = [[i, j]]; seen[i][j] = "0"; while (st.length) { const [a, b] = st.pop(); for (const [x, y] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) if (x >= 0 && x < 5 && y >= 0 && y < 6 && seen[x][y] === "1") { seen[x][y] = "0"; st.push([x, y]); } } }
      return {
        ch: 20, title: "Count the islands", prompt: "<p>Land is <code>1</code>; squares touching up, down, left or right are one island. What does it print?</p>",
        code: `grid = [list(row) for row in [\n${g.map((row) => `    "${row.join("")}",`).join("\n")}\n]]\ncount = 0\nfor r in range(5):\n    for c in range(6):\n        if grid[r][c] == "1":\n            count += 1\n            stack = [(r, c)]\n            grid[r][c] = "0"\n            while stack:\n                i, j = stack.pop()\n                for ni, nj in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):\n                    if 0 <= ni < 5 and 0 <= nj < 6 and grid[ni][nj] == "1":\n                        grid[ni][nj] = "0"\n                        stack.append((ni, nj))\nprint(count)`,
        answer: String(count),
        why: "<p>Each time the scan meets land it hasn't sunk yet, that's a new island; the DFS then sinks all of it so it isn't counted again. Diagonal neighbours don't join islands.</p>",
      };
    },
    // ch 21: is there a cycle?
    cycle(r) {
      const n = 6, order = r.shuffle([0, 1, 2, 3, 4, 5]), g = Array.from({ length: n }, () => []);
      for (let k = 0; k < 7; k++) { const i = r.int(0, n - 2), j = r.int(i + 1, n - 1); if (!g[order[i]].includes(order[j])) g[order[i]].push(order[j]); }
      if (r.next() < 0.5) {
        const from = r.pick(order.filter((u) => g[u].length)), reach = [], seen = new Set(), go = (u) => { for (const v of g[u]) if (!seen.has(v)) { seen.add(v); reach.push(v); go(v); } };
        go(from);
        const back = r.pick(reach);
        if (!g[back].includes(from)) g[back].push(from);
      }
      const st = Array(n).fill(0);
      const has = (u) => { st[u] = 1; for (const v of g[u]) if (st[v] === 1 || (st[v] === 0 && has(v))) return true; st[u] = 2; return false; };
      let cyc = false;
      for (let u = 0; u < n && !cyc; u++) if (st[u] === 0 && has(u)) cyc = true;
      return {
        ch: 21, title: "Can it be scheduled?", prompt: "<p><code>g[u]</code> lists the tasks that must wait for u. What does it print?</p>",
        code: `g = {${g.map((c, i) => `${i}: ${pyList(c)}`).join(", ")}}\nstate = {u: 0 for u in g}  # 0 new, 1 on the path, 2 done\ndef has_cycle(u):\n    state[u] = 1\n    for v in g[u]:\n        if state[v] == 1 or (state[v] == 0 and has_cycle(v)):\n            return True\n    state[u] = 2\n    return False\nprint(any(state[u] == 0 and has_cycle(u) for u in g))`,
        answer: cyc ? "True" : "False",
        why: `<p>${cyc ? "True: there's a cycle, so no order can satisfy every rule." : "False: no cycle, so a topological order exists."} An edge back to a node that's still on the current DFS path (state 1) closes a loop; an edge to a finished node (state 2) is harmless.</p>`,
      };
    },
    // ch 22: the edge that closes a loop
    redundant(r) {
      const n = r.int(5, 7), e = treeEdges(r, n).map(([u, v]) => [u + 1, v + 1]);
      let a, b; do { a = r.int(1, n); b = r.int(1, n); } while (a === b || e.some(([u, v]) => (u === a && v === b) || (u === b && v === a)));
      const edges = r.shuffle(e); edges.splice(r.int(1, edges.length), 0, [a, b]);
      const p = Array.from({ length: n + 1 }, (_, i) => i), find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
      let ans;
      for (const [u, v] of edges) { const ru = find(u), rv = find(v); if (ru === rv) { ans = `${u} ${v}`; break; } p[ru] = rv; }
      return {
        ch: 22, title: "The edge too many", prompt: "<p>What does it print?</p>",
        code: `edges = ${tupList(edges)}\nparent = list(range(${n + 1}))\ndef find(x):\n    while parent[x] != x:\n        parent[x] = parent[parent[x]]\n        x = parent[x]\n    return x\nfor a, b in edges:\n    ra, rb = find(a), find(b)\n    if ra == rb:\n        print(a, b)\n        break\n    parent[ra] = rb`,
        answer: ans,
        why: `<p>${n} nodes and ${n} edges: one edge must close a loop. Union-find spots it as the first edge whose two ends already share a root. It isn't always the edge that was added last: it's whichever loop-closer comes first in the list.</p>`,
      };
    },
    // ch 24: all pairs with Floyd-Warshall
    floyd(r) {
      const n = 4, w = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity))), edges = [];
      while (edges.length < 6) { const u = r.int(0, 3), v = r.int(0, 3); if (u !== v && !edges.some((x) => x[0] === u && x[1] === v)) { const c = r.int(1, 9); edges.push([u, v, c]); w[u][v] = c; } }
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (w[i][k] + w[k][j] < w[i][j]) w[i][j] = w[i][k] + w[k][j];
      return {
        ch: 24, title: "Every pair at once", prompt: "<p>Edges are one-way <code>(from, to, cost)</code>. What does it print?</p>",
        code: `INF = float("inf")\nd = [[0 if i == j else INF for j in range(4)] for i in range(4)]\nfor u, v, c in ${tupList(edges)}:\n    d[u][v] = c\nfor k in range(4):\n    for i in range(4):\n        for j in range(4):\n            if d[i][k] + d[k][j] < d[i][j]:\n                d[i][j] = d[i][k] + d[k][j]\nprint(d[0], d[3])`,
        answer: `${pyV(w[0])} ${pyV(w[3])}`,
        why: "<p>After round k, <code>d[i][j]</code> is the cheapest path that only stops at nodes 0…k on the way. Three loops, k outermost: O(n³) for every pair. <code>inf</code> means there's no path.</p>",
      };
    },
    // ch 27: backtracking over combinations
    combSum(r) {
      let a, T, out;
      for (let tries = 0; ; tries++) {
        a = distinctSorted(r, 5, 1, 9); T = r.int(8, 15); out = [];
        const go = (i, left, path) => { if (left === 0) { out.push(path); return; } for (let j = i; j < a.length; j++) { if (a[j] > left) break; go(j + 1, left - a[j], path.concat(a[j])); } };
        go(0, T, []);
        if ((out.length >= 1 && out.length <= 4) || tries > 60) break;
      }
      if (!out.length) { T = a[0] + a[1]; out = []; const go = (i, left, path) => { if (left === 0) { out.push(path); return; } for (let j = i; j < a.length; j++) { if (a[j] > left) break; go(j + 1, left - a[j], path.concat(a[j])); } }; go(0, T, []); }
      return {
        ch: 27, title: "Every way to make it", prompt: "<p>What does it print?</p>",
        code: `a = ${pyList(a)}\ndef go(i, left, path):\n    if left == 0:\n        print(path)\n        return\n    for j in range(i, len(a)):\n        if a[j] > left:\n            break\n        go(j + 1, left - a[j], path + [a[j]])\ngo(0, ${T}, [])`,
        answer: out.length ? out.map(pyList).join("\n") : "",
        why: `<p>Each number is used at most once (<code>j + 1</code>), and choices only move right, so no set comes out twice. Because <code>a</code> is sorted, the <code>break</code> prunes every branch where the next number is already too big. The sets come out in the order the search tree is walked.</p>`,
      };
    },
    // ch 28: the longest increasing subsequence
    lis(r) {
      const a = ints(r, 8, 1, 20), dp = Array(a.length).fill(1);
      for (let i = 0; i < a.length; i++) for (let j = 0; j < i; j++) if (a[j] < a[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
      return {
        ch: 28, title: "Rising, not necessarily together", prompt: "<p>What does it print?</p>",
        code: `a = ${pyList(a)}\ndp = [1] * len(a)\nfor i in range(len(a)):\n    for j in range(i):\n        if a[j] < a[i]:\n            dp[i] = max(dp[i], dp[j] + 1)\nprint(dp, max(dp))`,
        answer: `${pyList(dp)} ${Math.max(...dp)}`,
        why: "<p><code>dp[i]</code> is the longest strictly rising subsequence that <i>ends</i> at a[i]: one more than the best earlier ending on a smaller number. The answer is the best ending anywhere.</p>",
      };
    },
    // ch 29: the fewest coins
    coins(r) {
      const coins = distinctSorted(r, 3, 2, 9), amount = r.int(10, 30), dp = [0].concat(Array(amount).fill(Infinity));
      for (let x = 1; x <= amount; x++) for (const c of coins) if (c <= x && dp[x - c] + 1 < dp[x]) dp[x] = dp[x - c] + 1;
      return {
        ch: 29, title: "The fewest coins", prompt: "<p>What does it print?</p>",
        code: `coins = ${pyList(coins)}\namount = ${amount}\nINF = float("inf")\ndp = [0] + [INF] * amount\nfor x in range(1, amount + 1):\n    for c in coins:\n        if c <= x and dp[x - c] + 1 < dp[x]:\n            dp[x] = dp[x - c] + 1\nprint(dp[amount] if dp[amount] != INF else -1)`,
        answer: String(dp[amount] === Infinity ? -1 : dp[amount]),
        why: `<p><code>dp[x]</code> is the fewest coins making exactly x: try each coin as the last one. ${dp[amount] === Infinity ? `${amount} can't be made from these coins, so −1.` : `${amount} takes ${dp[amount]}.`} Always grabbing the biggest coin isn't safe for coin sets like these; the table is.</p>`,
      };
    },
    // ch 30: the cheapest path down a grid
    minPath(r) {
      const g = Array.from({ length: 4 }, () => ints(r, 4, 1, 9)), d = g.map((row) => row.slice());
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i || j) d[i][j] += Math.min(i ? d[i - 1][j] : Infinity, j ? d[i][j - 1] : Infinity);
      return {
        ch: 30, title: "Right and down, cheaply", prompt: "<p>Moving only right or down from the top-left to the bottom-right, what does it print?</p>",
        code: `${pyMatrix("g", g)}\nfor i in range(4):\n    for j in range(4):\n        if i or j:\n            up = g[i - 1][j] if i else float("inf")\n            left = g[i][j - 1] if j else float("inf")\n            g[i][j] += min(up, left)\nprint(g[3][3])`,
        answer: String(d[3][3]),
        why: "<p>Each square's cheapest arrival is its own cost plus the cheaper of the square above and the square to its left. The table fills top-left to bottom-right, in place.</p>",
      };
    },
    // ch 37: extended Euclid
    extgcd(r) {
      const A = r.int(20, 200), B = r.int(10, 150);
      const ext = (a, b) => { if (b === 0) return [a, 1, 0]; const [g, x, y] = ext(b, a % b); return [g, y, x - Math.floor(a / b) * y]; };
      const [g, x, y] = ext(A, B);
      return {
        ch: 37, title: "Extended Euclid", prompt: "<p>What does it print?</p>",
        code: `def ext(a, b):\n    if b == 0:\n        return a, 1, 0\n    g, x, y = ext(b, a % b)\n    return g, y, x - (a // b) * y\nprint(*ext(${A}, ${B}))`,
        answer: `${g} ${x} ${y}`,
        why: `<p>It returns g = gcd(${A}, ${B}) and x, y with ${A}·x + ${B}·y = g: ${A}·(${x}) + ${B}·(${y}) = ${g}. When g = 1, x is ${A}'s inverse mod ${B}.</p>`,
      };
    },
    // ch 38: the sieve
    sieve(r) {
      const n = r.int(20, 120), isP = Array(n + 1).fill(true); isP[0] = isP[1] = false;
      for (let i = 2; i * i <= n; i++) if (isP[i]) for (let j = i * i; j <= n; j += i) isP[j] = false;
      const ps = isP.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
      return {
        ch: 38, title: "Sieve it", prompt: "<p>What does it print?</p>",
        code: `n = ${n}\nis_p = [True] * (n + 1)\nis_p[0] = is_p[1] = False\nfor i in range(2, int(n ** 0.5) + 1):\n    if is_p[i]:\n        for j in range(i * i, n + 1, i):\n            is_p[j] = False\nprimes = [i for i in range(n + 1) if is_p[i]]\nprint(len(primes), primes[-1])`,
        answer: `${ps.length} ${ps[ps.length - 1]}`,
        why: `<p>There are ${ps.length} primes up to ${n}, the biggest being ${ps[ps.length - 1]}. Crossing off starts at i², because smaller multiples of i were already crossed off by smaller primes, and stops at √${n}: any composite has a factor that small.</p>`,
      };
    },
    // ch 41: xor cancels pairs
    single(r) {
      const vals = distinctSorted(r, 5, 1, 63), one = vals[4], a = r.shuffle(vals.slice(0, 4).flatMap((v) => [v, v]).concat(one));
      return {
        ch: 41, title: "The odd one out", prompt: "<p>What does it print?</p>",
        code: `a = ${pyList(a)}\nx = 0\nfor v in a:\n    x ^= v\nprint(x, bin(x).count("1"))`,
        answer: `${one} ${one.toString(2).split("").filter((c) => c === "1").length}`,
        why: `<p>v ^ v = 0 and xor doesn't care about order, so every pair cancels and only the number without a partner is left: ${one}, which is <code>${one.toString(2)}</code> in binary.</p>`,
      };
    },
  });

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

  // a question's track defaults to DSA and its language to Python; "run", when given, is the program the
  // checker runs instead of the one shown (for questions whose answer is a property of the code, like its growth)
  function make(gen, seed) {
    const q = GENS[gen](rng(seed));
    return Object.assign({ gen, seed, kind: "trace", match: "tokens", track: GENS[gen].track || "ds", lang: "py" }, q);
  }
  // marking: "tokens" compares the numbers, words and symbols like inf in order, ignoring brackets, commas and spaces
  const tokens = (s) => String(s).toLowerCase().match(/-?\d+|[a-z]+(?:\^\w+)?|[!]/g) || [];
  function correct(q, given) {
    if (q.match === "choice") return given != null && q.opts[given] && q.opts[given].ok;
    // "text" answers have symbols that matter (+, -, #, |): compared exactly, ignoring spacing and blank lines
    if (q.match === "text") { const t = (s) => String(s).trim().split(/\s+/).join(" "); return t(given) === t(q.answer); }
    return tokens(given).join(" ") === tokens(q.answer).join(" ");
  }

  // more generators (other tracks) register themselves with add(), from learn/mock-gen-x.js
  const API = { GENS, make, correct, tokens, names: Object.keys(GENS), rng,
    add(track, more) { for (const k in more) more[k].track = track; Object.assign(GENS, more); API.names = Object.keys(GENS); },
    of(track) { return API.names.filter((g) => (GENS[g].track || "ds") === track); } };
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.MOCKGEN = API;
})(this);
