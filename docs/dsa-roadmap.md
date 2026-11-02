# DSA: from the ground floor to Codeforces

A section of its own (`dsa/`, lessons in `content/ds/`). It builds every data structure and
algorithm pattern from first principles, then drills it with many questions, from easy warm-ups to
the problems big companies ask in interviews and the ones Codeforces rates 1800+.

Every chapter has the same shape:

1. **A live simulation first.** You run the slow, obvious way and the pattern side by side and watch
   the work counter. The "why" is something you see, not something you're told.
2. **The template.** The pattern written once, cleanly, as a Parsons puzzle and a from-memory rebuild.
3. **A question ladder.** Warm-up → interview → contest. Each question says which family it comes
   from (an interview classic, a Codeforces-style problem), is written in our own words, and has
   tests that include a big input, so a slow solution fails.
4. **Spot the pattern.** Quizzes that give you a problem statement and ask which tool fits, because
   in a real interview nobody tells you the chapter.
5. **Spaced review.** Everything you solve comes back after 1, 3, 7, 16 and 35 days.

The book *Open Data Structures* has its own section (`ods/`, see `docs/ods-roadmap.md`). This one is
our own path.

| Part | Chapters | What you learn |
|---|---|---|
| **1 · Ground floor** | 1–6 | counting steps and reading constraints (what n allows in 1 second) · arrays in one pass (running best, Kadane, in-place swaps) · hash maps and sets (remember what you've seen) · prefix sums and difference arrays · recursion and the call stack · sorting and what it unlocks |
| **2 · Core patterns** | 7–16 | two pointers · sliding window · binary search on an index · binary search on the answer · stacks and the monotonic stack · queues, deques and the monotonic deque · linked-list tricks (fast/slow, reversing) · intervals and sweep lines · heaps and top-k · greedy and the exchange argument |
| **3 · Trees and graphs** | 17–26 | tree traversals · binary search trees · BFS on grids and shortest steps · DFS, components and cycles · topological sort · union-find · Dijkstra · Bellman-Ford and Floyd-Warshall · minimum spanning trees · tries |
| **4 · Backtracking and DP** | 27–36 | backtracking (subsets, permutations, pruning) · 1D DP (memo to table) · knapsack · grid DP · string DP (LIS, LCS, edit distance) · interval DP · bitmask DP · DP on trees · digit DP · DP speed-ups |
| **5 · Maths for contests** | 37–42 | gcd and modular arithmetic · primes and the sieve · fast power and modular inverse · counting (nCr, inclusion-exclusion) · bit tricks · matrix exponentiation |
| **6 · Advanced structures** | 43–50 | segment trees · lazy propagation · Fenwick trees · sparse tables · LCA with binary lifting · KMP and the Z-function · rolling hashes · suffix arrays |
| **7 · Advanced graphs** | 51–56 | strongly connected components · bridges and articulation points · max flow · bipartite matching · 2-SAT · Euler paths |
| **8 · Contest craft** | 57–60 | constructive and ad-hoc problems · game theory (Sprague-Grundy) · meet in the middle and square-root decomposition · stress testing your own solution |
