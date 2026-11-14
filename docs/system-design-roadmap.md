# System design, from the ground floor to the frontier

The Whiteboard (`tunnel/board.html`) teaches system design as a ladder of **units**. A unit is one system, such as Snip (a link shortener) or a Redis of your own. Every unit has two modes, which are two ways of looking at the same design:

| Mode | What you do | How it's checked |
|---|---|---|
| **Whiteboard** | You do what a design interview asks for: scope it, size it on a napkin, draw it, then walk a request through it. | Scope cards are sorted into the right bins. Napkin numbers come within 1.5× of the answer. The drawing is graded against a rubric of the parts and links the design needs, and it flags parts that would be wrong. |
| **Simulate** | The design runs. You predict, push traffic, pull the plug, and fix the design on a budget. | Every number comes from a seeded simulator (`tunnel/net.js`, `tunnel/kv.js`, and later others). `tools/board-check.js` proves that each answer is right and that each trap fails. |

The whiteboard questions come in these kinds:
- **scope:** sort sticky cards into *what it does*, *how well* and *not now*.
- **napkin:** back-of-the-envelope numbers on notes pinned to the sketch.
- **sketch:** draw the design from a tray of parts, then have it graded by the rubric.
- **follow:** tap the path a request takes.

The simulation questions come in these kinds:
- **bottleneck:** predict what gives out first, then watch the climb.
- **draw:** meet the goals on a budget, with 30 s of traffic.
- Labs made for one unit, such as eviction, pull the plug, or hash slots.

## The ladder

### Ground floor: what every engineer should know
| Unit | Whiteboard | Simulate |
|---|---|---|
| A request's trip | DNS → TCP → TLS → load balancer → app → cache → DB; follow it | Where the 300 ms go: a waterfall you can shorten |
| Latency numbers | Order them, from L1 cache to a cross-ocean round trip; napkin | Make a page fast by moving work across the numbers |
| Caching, properly | Cache-aside vs write-through; TTLs | A stampede when a hot key expires, then fix it with locks or early refresh |
| Copies and lag | Leader and followers; read-your-writes | Replication lag you can see; stale reads |
| Splitting data | Range vs hash vs consistent hashing | Add a node and count the keys that move |
| Queues and retries | At-least-once delivery, idempotency keys | A retry storm, then backoff and jitter |
| Agreeing | Raft: terms, votes, the log | Partition the cluster and watch a leader election |

### Building blocks: design the tools themselves
| Unit | Whiteboard | Simulate |
|---|---|---|
| **A Redis of your own** ✓ | Scope, napkin (keys per GB, ops per thread, machines), sketch the internals (event loop, keyspace, expiry, evictor, AOF, snapshot, replica) | **Eviction** (noeviction, random, LRU, LFU, then a trend shift), **pull the plug** (appendfsync), **hash slots** (CRC16, resharding, a hot key) |
| A rate limiter | Token bucket vs sliding window; where it lives | A burst against each algorithm; a distributed counter's race |
| Unique IDs | Auto-increment vs UUID vs Snowflake | Clock skew and ID collisions |
| A message log like Kafka | Partitions, offsets, consumer groups | Consumer lag; rebalancing; a key that makes one partition hot |
| Object storage like S3 | Metadata vs blobs, chunking | Erasure coding vs 3 copies: lose disks and see what survives |
| A search index | Inverted index, sharding by document | Query fan-out and the tail latency of the slowest shard |
| A lock service | Leases, fencing tokens | A paused process that still thinks it holds the lock |

### Classic designs: the interview standards
| Unit | Whiteboard | Simulate |
|---|---|---|
| **Snip, a link shortener** ✓ | Scope, napkin, sketch (with a key generator), follow a click | Bottleneck, serve 2,000 a second, count every click, a queue with batching |
| A news feed | Fan-out on write vs on read | A celebrity with 10M followers posts; a hybrid fixes it |
| A chat app | WebSocket gateways, presence, receipts | Connections per box; message ordering across servers |
| Notifications | Channels, retries, dedupe | A provider outage and a retry queue |
| Typeahead | Trie with top-k at each node | Cache the prefixes; update the counts offline |
| A web crawler | Frontier, politeness, dedupe | Crawl rate vs per-site limits |
| Ticket booking | Holds, contention, oversell | 100k people want 1k seats: locks vs a queue |
| Payments | Idempotency keys, a double-entry ledger | A timeout mid-charge: charge twice or not at all |

### Big scale
| Unit | Whiteboard | Simulate |
|---|---|---|
| Video streaming | Upload → transcode → CDN, adaptive bitrate | CDN hit rate vs origin load; bitrate under a bad network |
| Ride matching | Geohash or quadtree, live locations | Location updates per second; a dense city cell |
| Live docs | OT vs CRDT | Two people typing at once, merged |
| A job scheduler | Leases, at-most-once vs at-least-once | A worker dies mid-job |
| Metrics and logs | Time series, downsampling | Cardinality explosions |
| Going global | Active-active, conflict resolution | Speed of light across regions; a region fails over |

### Frontier
| Unit | Whiteboard | Simulate |
|---|---|---|
| Serving an LLM | Prefill vs decode, the KV cache, GPUs | Continuous batching: tokens a second vs time to first token; KV cache memory |
| Retrieval for an LLM | Chunking, embeddings, a vector index (HNSW) | Recall vs latency as you turn ef and k |
| A recommender | Candidate generation → ranking → re-ranking; a feature store | A funnel from millions to 10 items inside 100 ms |
| A training cluster | Data, tensor and pipeline parallelism; checkpoints | A GPU dies: checkpoint interval vs lost work |
| An agent platform | Tool calls, sandboxes, long-running jobs | Retries, timeouts and cost per task |

## Build order
1. **This PR:**
   - two modes on the board;
   - units and the ladder on the shelf;
   - Snip gets scope and sketch;
   - the whole Redis unit: three whiteboard questions and three labs, proved by the checker.
2. Next, a rate limiter, a news feed and a chat app. Each new unit adds its own simulator file (and its proofs to `tools/board-check.js`) instead of growing `net.js`.
3. Then the ground floor units, so a beginner can start at the bottom.
4. Then a **system design mock**: one unseen unit, 45 minutes, whiteboard first and then simulate, with a scorecard. It follows the DSA interview mode.
5. Then the frontier units.
