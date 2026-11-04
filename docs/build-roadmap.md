# Build your own X: what comes next

Chapters 1–49 are live. These are the parts chosen next, in the order they'll be built. On 2026-11-04 the order changed: the chapters that explain how reality works come first, and each of those has to answer a real "what is actually going on?" question. Each chapter
gets the usual shape: a live simulation with a naive-vs-real comparison and one goal, write / bug /
Parsons / predict exercises, a real-world project with graded exercises, a from-memory rebuild and a
recall question.

| Part | Chapters | What you build |
|---|---|---|
| **9 · Tools devs live in** ✅ live | 26–29 | a diff tool (longest common subsequence, how `git diff` finds changes) · a build system (like make: rebuild only what's stale) · a package manager (resolving versions and conflicts, like npm and pip) · a test framework (like pytest: discovery, assertions, fixtures) |
| **10 · Runtimes and CLIs** ✅ live | 30–33 | a command-line tool kit (flags, subcommands, help, exit codes) · a shell (parsing, pipes, redirects, jobs) · an async runtime (the event loop, timers and promises behind Node and asyncio) · a container runtime (isolated processes, layered filesystems, resource limits, like Docker) |
| **11 · Real-world systems** ✅ live | 34–37 | a ride-share matcher (drivers to riders) · a stock-exchange order book (matching buys and sells) · collaborative editing with offline sync (CRDTs) · a job scheduler (cron, queues, retries) |
| **12 · Money and markets** ✅ live | 38–41 | a bank ledger (double-entry bookkeeping) · a payments system (idempotency: never charge twice) · an auction engine · a fraud detector |
| **13 · Simulated worlds** ✅ live | 42–45 | a falling-sand planet (why the universe has a speed limit) · particles and fluids (why time only runs forward) · a traffic simulator (jams from nowhere, and how closing a road can help) · crowds and epidemics (lanes nobody planned, why your friends have more friends) |
| **14 · Waves: pictures and sound** ✅ live | 46–49 | a synthesizer (every sound is a stack of sine waves, and your ear unmixes them) · an image editor (convolution, and the filter your retina runs) · JPEG-style compression (a model of your eye) · a font rasterizer (curves to pixels) |
| **15 · Inside your phone** | 50–53 | GPS (your position from satellite timings, and why it needs relativity) · a touch keyboard with autocorrect · a step counter (filtering a noisy signal) · push notifications (pub/sub) |
| **16 · Security and trust** | 54–57 | encryption (from Caesar to Diffie-Hellman and RSA) · digital signatures and certificates · a login system (salted hashes, sessions) · a message queue (acks, retries, at-least-once) |
| **17 · AI and agents** | 58–61 | embeddings and vector search (meaning as geometry) · a decision tree and random forest · a RAG chatbot over your own notes · an AI agent that uses tools (the planning loop) |
| **18 · Games and maps** | 62–65 | a route finder (Dijkstra and A*) · a game AI that can't lose (minimax and pruning) · a recommendation engine · a 2D game engine (loop, sprites, collisions) |
| **19 · The web, end to end** | 66–69 | a DNS resolver · an HTTP server · a browser layout engine (HTML and CSS to boxes) · a rate limiter (token bucket) |
