# System design, from first principles to WhatsApp, Uber and LLMs

The Whiteboard (`tunnel/board.html`) teaches system design as a ladder of **units**. Each unit is one idea or one system.
- The lower floors are **first principles**: what one machine can do, how machines talk, how data is stored, what changes with many machines, and so on. These are the parts every big design is built from.
- The upper floors use those parts to build the **tools**, such as Redis, Kafka and S3, and then the **apps** interviews ask about, such as WhatsApp, Uber, YouTube, Instagram and Stripe.
- Nothing on an upper floor uses an idea that a lower floor hasn't taught. The [principle map](#the-principle-map) at the end checks this.

## Two modes, in every unit
| Mode | What you do | How it's checked |
|---|---|---|
| **Whiteboard** | Do what a design interview asks for: scope it, size it, define the API and the data, draw it, walk a request through it, and defend a trade-off. | The checks are exact: cards in the right bins, numbers within 1.5×, and a rubric of the parts and links the design needs, including parts that would be wrong. |
| **Simulate** | The design runs. You predict, push traffic, pull the plug, cut the network, and fix the design on a budget. | Every number comes from a seeded simulator, and `tools/board-check.js` proves that each answer is right and each trap fails. |

**Whiteboard kinds**
- Built:
  - `scope` sorts cards into *what it does*, *how well* and *not now*;
  - `napkin` is back-of-the-envelope numbers on sticky notes;
  - `sketch` is a drawing graded by a rubric;
  - `follow` traces a request.
- To build:
  - `api`: pick the calls, their verbs, and what is idempotent;
  - `data`: pick the tables, keys and indexes, then see which queries they make fast;
  - `tradeoff`: two designs, and you say which breaks first and why.

**Simulate kinds**
- `bottleneck`;
- `draw` (meet the goals on a budget);
- labs built for one unit, such as eviction, pull the plug, hash slots, partition the network, or a celebrity posts.

Every unit has the same shape: Whiteboard first (3–5 questions), then Simulate (2–4 labs). The badge for a unit is earned in both modes.

---

## Part 1 · First principles

### Floor 0 · One machine
| Unit | You learn | Simulate |
|---|---|---|
| Latency numbers | L1/RAM/SSD/disk/datacenter/cross-ocean, and why it's 10⁰ to 10⁸ | Make a page fast by moving work down the ladder of numbers |
| Throughput vs latency | Capacity = workers ÷ service time; Little's law L = λW | *(already in the Wind Tunnel: experiments 1–2)* |
| The queueing knee | Why 80% busy is full; p99 vs p50 | Push utilisation to 70, 85, 95% and watch p99 |
| Processes, threads, event loops | Blocking vs non-blocking I/O, context switches, the C10k problem | 10,000 slow clients against thread-per-request vs an event loop |
| Memory and disk | Page cache, fsync, sequential vs random I/O | Append vs update-in-place on the same disk |

### Floor 1 · Talking
| Unit | You learn | Simulate |
|---|---|---|
| A request's trip | DNS → TCP handshake → TLS → HTTP → load balancer → app | A waterfall of the 300 ms; remove round trips one by one |
| HTTP, REST and gRPC | Verbs, status codes, idempotency, pagination, versioning | Retry a POST vs a PUT through a flaky network |
| Push: polling, SSE, WebSockets | Who opens the connection, and what each costs | 1M phones waiting for a message under each one |
| Load balancers | L4 vs L7, round-robin vs least-connections, health checks, sticky sessions | One slow server among ten *(Wind Tunnel 3)* |
| Proxies and CDNs | Reverse proxies, edge caches, TTLs, purging | Hit rate vs origin load across the world |

### Floor 2 · Storing
| Unit | You learn | Simulate |
|---|---|---|
| Data models | Relational, document, key-value, wide-column, graph, time-series: which fits which access pattern | The same app on each model: count the reads a page needs |
| Indexes | B-trees, a full scan vs an index, composite and covering indexes | A query plan: add the right index and watch reads drop |
| Storage engines | B-tree vs LSM tree, write amplification, compaction | A write-heavy load on both |
| Transactions | ACID, isolation levels, lost updates, write skew | Two people book the last seat at each isolation level |
| Blobs and search | Object storage vs a database; an inverted index | Store photos in the DB vs S3; search with LIKE vs an index |
| Geo data | Geohash, quadtree, S2 cells | "Drivers within 2 km": scan vs grid vs quadtree |

### Floor 3 · Many machines
| Unit | You learn | Simulate |
|---|---|---|
| Copies and lag | Leader–follower, multi-leader, leaderless quorums (R + W > N) | Replication lag, stale reads, read-your-writes |
| Splitting data | Range vs hash partitioning, consistent hashing, hot partitions | Add a node and count the keys that move |
| Agreeing | Raft: terms, votes, the log | Partition the cluster and watch a leader election |
| Time and order | Clock skew, Lamport and vector clocks, hybrid clocks | Two writes "at the same time" on two continents |
| Consistency | Linearizable … eventual; CAP and PACELC | Cut the network: pick consistency or availability, then live with it |
| Transactions across services | 2PC, sagas, the outbox pattern | A crash between "charge card" and "ship order" |
| Unique IDs | Auto-increment vs UUID vs Snowflake | Clock skew and colliding IDs |

### Floor 4 · Moving work
| Unit | You learn | Simulate |
|---|---|---|
| Caching, properly | Cache-aside, write-through, write-back, TTLs, invalidation | A stampede when a hot key expires; fix it with a lock or early refresh |
| Queues | Async work, backpressure, at-least-once delivery, dead letters | Bursts absorbed *(Wind Tunnel 6)*; a poison message |
| Logs and streams | Kafka-style logs, consumer groups, offsets, replay | Consumer lag; a partition that's too hot |
| Stream processing | Windows, watermarks, late events, exactly-once | Count clicks per minute when events arrive late |
| Batch processing | MapReduce, shuffles, skew | One reducer with 90% of the data |
| Rate limiting | Token bucket, leaky bucket, sliding window | A burst against each *(Wind Tunnel 8)* |
| Workflows and schedulers | Cron at scale, leases, retries, idempotent jobs | A worker dies mid-job |

### Floor 5 · Staying up
| Unit | You learn | Simulate |
|---|---|---|
| Failure | Timeouts, retries, backoff and jitter, circuit breakers, bulkheads | A retry storm *(Wind Tunnel 7)*, then a circuit breaker |
| Load shedding | Admission control, priorities, graceful degradation | A launch-day spike: drop the right requests |
| Redundancy and failover | Health checks, active-passive vs active-active, RPO and RTO | Kill the primary; measure data lost and time down |
| Going global | Multi-region, geo-DNS, data residency | The speed of light, and a region failing over |
| Deploys | Canary, blue-green, feature flags, schema migrations | A bad deploy caught at 1% vs at 100% |
| Observability | Metrics, logs, traces, SLOs and error budgets | Find the slow service in a trace |
| Security | Authn vs authz, OAuth and sessions, encryption in transit and at rest, secrets | Replay a stolen token; then add expiry and rotation |
| Cost | $ per request, reserved vs on-demand, storage tiers | Halve the bill without missing an SLO |

---

## Part 2 · Building blocks: design the tools themselves
| Unit | The hard part | Simulate |
|---|---|---|
| **Redis** ✓ | One thread, RAM, eviction, AOF/RDB, hash slots | Eviction race, pull the plug, hash slots and a hot key |
| A rate limiter | Where it lives; a shared counter across servers | A burst, then a race between two limiters |
| A distributed cache | Consistent hashing, replication, hot keys | Lose a node: misses and reshuffles |
| Kafka | Partitions, ISR, offsets, consumer groups | Lag, rebalancing, a key that makes one partition hot |
| S3 | Metadata vs data, chunks, erasure coding | Lose disks: 3 copies vs 6+3 erasure coding |
| Elasticsearch | Inverted index, shards, scatter-gather | The slowest shard sets the tail |
| ZooKeeper / etcd | Consensus, leases, watches, fencing tokens | A paused process that still thinks it holds the lock |
| A load balancer | L4 vs L7, connection draining, consistent hashing | Drain a server without dropping a request |
| A time-series database | Downsampling, retention, cardinality | A label that explodes the series count |
| An API gateway | Auth, routing, quotas, fan-out | One slow backend behind the gateway |
| A vector database | Embeddings, HNSW, recall vs latency | Turn ef and k; watch recall and p99 |

---

## Part 3 · Real apps: the designs interviews ask for
Grouped by the hard part, so similar apps teach each other.

### Talk in real time
| App | The hard part | Simulate |
|---|---|---|
| **WhatsApp** (chat) ✓ | WebSocket gateways, sent/delivered/read receipts, offline delivery, end-to-end encryption, ordering | 1M connections per gateway; a phone offline for a day; messages that arrive out of order |
| **Slack / Discord** (channels) | Fan-out to a 100k-member channel, presence, unread counts | A huge server pings @everyone |
| **Zoom** (video calls) | WebRTC, SFU vs MCU, jitter buffers | 50 people on a call: bandwidth per design |

### Feeds and social
| App | The hard part | Simulate |
|---|---|---|
| **Twitter / X** (timeline) ✓ | Fan-out on write vs read, the celebrity problem | Built: a minute when 120M- and 30M-follower accounts post (draw the line between write and read); a viral tweet's like count (a sharded counter); timelines in a 12 TB memory budget |
| **Instagram** (photos and feed) | Upload, resize, CDN, feed | Upload pipeline under a spike |
| **TikTok** (For You) | A feed made by a recommender, not by follows | Candidates → ranking inside 100 ms |
| **Reddit** (votes, hot ranking) | Vote counts at scale, a decaying hot score | A post going viral: counter contention |
| **LinkedIn** (connections) | Graph queries: 2nd- and 3rd-degree connections | BFS cost vs precomputed degrees |

### Location
| App | The hard part | Simulate |
|---|---|---|
| **Uber** (rides) ✓ | Live driver locations, geo index, matching, trip state | Built: the nearest drivers with a geo index (cell size and ring search); matching a busy evening (at once vs batched); two matchers and dropped phones (a claim with an expiry). Still to add: surge pricing and a dense city cell |
| **Yelp** (nearby) | Proximity search, read-heavy geo | Quadtree vs geohash on a city with hot spots |
| **DoorDash** (delivery) | Three sides (eater, restaurant, courier), dispatch, ETAs | Dispatch at dinner rush |
| **Google Maps** | Tiles, routing (Dijkstra, A*, contraction hierarchies), live traffic | Route across a country: precompute vs search |

### Media
| App | The hard part | Simulate |
|---|---|---|
| **YouTube** (upload and watch) | Chunked upload, transcode DAG, adaptive bitrate, view counts | Transcode queue on a busy day; bitrate on a bad network |
| **Netflix** (streaming) | Putting the CDN inside ISPs, prefetching, global failover | Evening peak: edge hit rate vs origin |
| **Spotify** (music) | Small files, offline caching, playlists | Cache hits on a phone with little space |

### Files and documents
| App | The hard part | Simulate |
|---|---|---|
| **Dropbox / Google Drive** | Chunking, dedupe, sync, conflicts | Two laptops edit the same file offline |
| **Google Docs** | OT vs CRDT, cursors, presence | Two people type in the same word at once |
| **Pastebin** | Blob vs DB, expiry | Hot pastes and a CDN |

### Money and commerce
| App | The hard part | Simulate |
|---|---|---|
| **Amazon** (cart and checkout) | Inventory, carts, a checkout saga | A flash sale: overselling vs locking |
| **Ticketmaster** | 100k people and 1k seats: holds, queues, fairness | A virtual waiting room vs a free-for-all |
| **Airbnb / hotel booking** | Availability calendars, double booking | Two guests book the same nights |
| **Stripe** (payments) | Idempotency keys, a double-entry ledger, reconciliation | A timeout mid-charge: charged twice or not at all |
| **Robinhood / a stock exchange** | A matching engine, an order book, low latency | Orders per second against one sequencer |
| A digital wallet | Balances, transfers, exactly-once, audit | Two transfers race on one balance |

### Search and discovery
| App | The hard part | Simulate |
|---|---|---|
| **Google Search** | Crawl, index, rank, serve | Index freshness vs size |
| **Typeahead** | A trie with the top-k at each node, offline updates | Prefix cache hit rate as you type |
| **A web crawler** | Frontier, politeness, dedupe, traps | Crawl rate vs per-site limits |

### Everyday infrastructure apps
| App | The hard part | Simulate |
|---|---|---|
| **Snip, a URL shortener** ✓ | Read-heavy, key generation, caching, counting | Bottleneck, 2,000 a second, a queue with batching |
| **Gmail** | Mailboxes, search, spam filtering | A spam wave |
| **Google Calendar** | Recurring events, time zones, invites | "Every 2nd Tuesday" across a DST change |
| **GitHub** | Git storage, forks, a PR's diff | A monorepo clone: packfiles vs objects |
| **LeetCode** (a code judge) | Sandboxed runs, queues, fairness | Contest start: 50k submissions in a minute |
| **Notifications** | Push, SMS and email providers, retries, dedupe, user preferences | A provider goes down |
| **Ad click counting** | Stream aggregation, exactly-once, reconciliation | Late and duplicate clicks |
| **Top-K / leaderboards** | Heavy hitters (count-min sketch), sorted sets | Top 10 songs right now, out of a billion plays |

---

## Part 4 · Frontier: AI systems
| Unit | The hard part | Simulate |
|---|---|---|
| **ChatGPT-style LLM serving** | Prefill vs decode, the KV cache, continuous batching, GPU memory | Tokens a second vs time to first token as the batch grows |
| **RAG** | Chunking, embeddings, a vector index, reranking | Recall vs latency; a stale index |
| **A recommender** | Candidate generation → ranking → re-ranking; a feature store | Millions to 10 inside 100 ms |
| **A training cluster** | Data, tensor and pipeline parallelism; checkpoints | A GPU dies: checkpoint interval vs lost work |
| **An agent platform** | Tool calls, sandboxes, long-running jobs, budgets | Retries, timeouts and cost per task |
| **An AI coding assistant** | Context retrieval over a repo, latency budgets, caching | Autocomplete under 200 ms |

---

## The principle map
Each principle is **taught** in one first-principles unit and **reused** in the apps below. If an app needs something, the unit that teaches it sits on a lower floor.

| Principle | Taught in | Reused in |
|---|---|---|
| Latency numbers, napkin math | Latency numbers | every unit's napkin |
| Capacity, Little's law, the knee | Throughput vs latency | every bottleneck lab |
| Event loops vs threads | Processes, threads, event loops | Redis, WhatsApp gateways, Node backends |
| fsync and durability | Memory and disk | Redis (pull the plug), Kafka, Stripe ledger |
| WebSockets, push | Push | WhatsApp, Slack, Uber driver app, Google Docs |
| Idempotency | HTTP, REST and gRPC | Stripe, Amazon checkout, notifications, queues |
| Indexes, B-tree vs LSM | Indexes, Storage engines | Twitter timeline store, metrics, Cassandra-style stores |
| Isolation, lost updates | Transactions | Ticketmaster, Airbnb, wallet |
| Geo indexes | Geo data | Uber, Yelp, DoorDash, Maps |
| Blob storage, CDN | Blobs and search, Proxies and CDNs | Instagram, YouTube, Netflix, Dropbox |
| Replication, lag | Copies and lag | Redis replica, every database tier |
| Partitioning, hot keys | Splitting data | Redis hash slots, Kafka, Twitter celebrities, Uber city cells |
| Consensus, leases | Agreeing | etcd, Kafka controller, schedulers, locks |
| Clocks, ordering | Time and order | WhatsApp ordering, Google Docs, Snowflake IDs |
| CAP, consistency models | Consistency | Airbnb (strong), feeds (eventual), Dynamo-style stores |
| Sagas, outbox | Transactions across services | Amazon checkout, DoorDash, Stripe |
| Caching patterns, stampedes | Caching, properly | Snip, Redis, Reddit, typeahead |
| Queues, logs, streams | Queues, Logs and streams, Stream processing | YouTube transcode, ad clicks, notifications, Uber trips |
| Fan-out | Queues + Splitting data | Twitter, Slack channels, notifications |
| Rate limiting, load shedding | Rate limiting, Load shedding | API gateway, Ticketmaster waiting room, LeetCode judge |
| Failover, multi-region | Redundancy, Going global | Netflix, WhatsApp, payments |
| Recommenders, ANN search | A vector database | TikTok, Spotify, RAG, LLM agents |

## Build order
1. **Now (this PR):**
   - two modes on the board;
   - units and the ladder on the shelf;
   - Snip gets scope and sketch;
   - the whole Redis unit.
2. **Floors 0–1:** the start of the beginner path. Each unit links to the Wind Tunnel experiment that already covers it.
3. **The apps people ask about most:** WhatsApp ✓ (scope, napkin, sketch, follow a message; then hold 500M connections, Bob's patchy day, keep a group chat in order), Uber ✓ (scope, napkin, sketch, follow a ride; then find the nearest drivers, match a busy evening, one driver for one rider), Twitter/X ✓ (scope, napkin, sketch, follow a tweet; then the celebrity problem, a viral tweet's likes, timelines in memory), then YouTube, Ticketmaster, Stripe. Their first-principles units on floors 2–4 come just before them.
4. **New whiteboard kinds** `api`, `data` and `tradeoff`, added to the units already built.
5. **A system design mock:** one unseen app, 45 minutes, whiteboard first and then simulate, with a scorecard. It follows the DSA interview mode.
6. **The rest of the apps**, then the frontier.

Each new unit adds its own simulator file and its proofs to `tools/board-check.js`. `net.js` stays the request-flow engine.
