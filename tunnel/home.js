/* Wind Tunnel: "Take it home", the step after each experiment's task. The fix you found, written the ways you'd meet it
   outside the tunnel: as code (with the numbers from your own system.yaml), as the config a real server reads, what to
   watch in production, and where your language or stack changes the picture.
   Each experiment has:
     files   [{name, lang, src(c), run}] where c is the system as you finished it. lang is py, yaml or conf.
             A py file with run: true is executed by tools/tunnel-check.js, and every "# → text" line must be exactly
             what the print just above it prints. Files without run are only parsed.
     check   (optional) a printed number the sim must agree with: {line, metric, tol} (line counts printed lines).
     try     (optional) other designs the checks also render and run, so the code is right for any answer, not one.
     watch   what to graph and alert on in production (html, may use c).
     stack   [[where, what]]: the same idea in other languages and tools.
   Lines stay under 60 characters so the code reads in the brief without scrolling. */
(function (root) {
  "use strict";
  const n = (x) => Math.round(x).toLocaleString("en-US");
  const pct = (x) => `${Math.round(x * 100)}%`;
  const pad = (s, w) => s + " ".repeat(Math.max(1, w - s.length));
  // the ways a line of code can be commented, lined up in one column
  const col = (rows, w = 26) => rows.map(([code, note]) => (note ? pad(code, w) + "# " + note : code)).join("\n");

  const home = {
    wt01: {
      files: [
        {
          name: "capacity.py", lang: "py", run: true,
          src: (c) => {
            const cap = c.workers / c.service, busy = c.rate / cap, room = cap / c.rate - 1;
            return `# Launch day, as arithmetic you can run.
${col([[`WORKERS = ${c.workers}`, "your system.yaml"], [`PER_REQUEST = ${c.service}`, "seconds of a worker"], [`LOAD = ${c.rate}`, "requests a second"]])}

capacity = WORKERS / PER_REQUEST
busy = LOAD / capacity
headroom = capacity / LOAD - 1

print(f"capacity {capacity:.0f} req/s")
# → capacity ${n(cap)} req/s
print(f"busy {busy:.0%}")
# → busy ${pct(busy)}
print(f"room for {headroom:.0%} more traffic")
# → room for ${pct(room)} more traffic`;
          },
        },
        {
          name: "gunicorn.conf.py", lang: "py",
          src: (c) => `# gunicorn.conf.py: the same server, for real
${col([[`workers = ${c.workers}`, "processes; the default sync"], ["", "worker serves one at a time"], [`timeout = ${c.timeout}`, "restart a worker stuck"], ["", "on one request this long"], ["backlog = 2048", "connections waiting for"], ["", "a free worker: the queue"]])}`,
        },
      ],
      try: [{ workers: 8 }, { workers: 6 }],
      watch: (c) => `Graph <b>busy workers ÷ workers</b> next to p99, and alert on the first one. By the time p99 moves you're already at the knee. At ${pct(c.rate / (c.workers / c.service))} busy you have room for ${pct(c.workers / c.service / c.rate - 1)} more traffic before the queue stops draining.`,
      stack: [
        ["Python", "A sync worker is a process. Threads in one process share the GIL, so for CPU work they don't add workers; for waiting on a database they do."],
        ["Node.js", "One event loop per process: for CPU work, a process is one worker. Run one per core with the <code>cluster</code> module."],
        ["Go", "Each request gets a goroutine, so the real workers are your CPU cores (<code>GOMAXPROCS</code>) and whatever you wait on, like a database pool."],
        ["Java", "A thread pool's size is the worker count: <code>Executors.newFixedThreadPool(n)</code>."],
      ],
    },

    wt02: {
      files: [
        {
          name: "little.py", lang: "py", run: true,
          src: (c) => {
            const rps = c.users / (c.think + c.service), carry = (c.workers / c.service) * (c.think + c.service);
            return `# Little's law: people in the system =
#   arrival rate × time each one spends in it.
${col([[`THINK = ${c.think.toFixed(1)}`, "seconds reading, per click"], [`PER_REQUEST = ${c.service}`, "seconds to serve a click"], [`WORKERS = ${c.workers}`, "your system.yaml"]])}

def requests_per_second(people):
    return people / (THINK + PER_REQUEST)

def people_supported(workers):
    capacity = workers / PER_REQUEST
    return capacity * (THINK + PER_REQUEST)

print(round(requests_per_second(${c.users})))
# → ${Math.round(rps)}
print(round(people_supported(WORKERS)))
# → ${Math.round(carry)}

# The same law sizes a database connection pool:
# queries a second × seconds per query = busy at once.
print(500 * 0.01)
# → 5.0`;
          },
        },
        {
          name: "locustfile.py", lang: "py",
          src: (c) => `# locustfile.py: load-test with people who pause,
# not a fixed request rate.   locust -u ${c.users}
from locust import HttpUser, task, between


class Reader(HttpUser):
    wait_time = between(${c.think - 1}, ${c.think + 1})  # reading, ~${c.think} s

    @task
    def read_page(self):
        self.client.get("/")`,
        },
      ],
      try: [{ workers: 8 }],
      watch: (c) => `"Users online" is the number on the sales slide; requests per second is what the server feels. Take think time from your analytics (the time between page views), divide, and load-test with people who pause, as above. ${n(c.users)} requests fired at once is a test of a different system.`,
      stack: [
        ["Thread pools", "10 threads making 200 ms calls carry at most 10 ÷ 0.2 = 50 calls a second, in any language."],
        ["Java", "Size a JDBC pool (HikariCP's <code>maximumPoolSize</code>) with the same law: queries per second × seconds per query, plus headroom."],
        ["Go", "<code>database/sql</code> keeps a pool too: <code>SetMaxOpenConns</code>."],
        ["Node.js", "One thread, but in-flight requests still equal rate × latency: that's how many sockets and buffers you hold."],
      ],
    },

    wt03: {
      files: [
        {
          name: "balancer.py", lang: "py", run: true,
          src: (c) => {
            const names = Array.from({ length: c.servers }, (_, i) => `"s${i + 1}"`).join(", ");
            return `# Least connections: send each request to the
# server with the fewest requests in flight.
class LeastConnections:
    def __init__(self, servers):
        self.in_flight = {s: 0 for s in servers}

    def pick(self):
        s = min(self.in_flight, key=self.in_flight.get)
        self.in_flight[s] += 1
        return s

    def done(self, s):
        self.in_flight[s] -= 1


lb = LeastConnections([${names}])
lb.pick(), lb.pick()  # s1 and s2 get one each
lb.done("s2")         # s2 is quick; s1 is the old box
print(lb.pick(), lb.pick())
# → s2 s3`;
          },
        },
        {
          name: "nginx.conf", lang: "conf",
          src: (c) => {
            const pol = c.lb === "least" ? ["least_conn;", "your balancer"] : c.lb === "random" ? ["random;", "your balancer"] : ["", "round robin is the default"];
            const rows = [["upstream app {"], [`    ${pol[0]}`, pol[1]]];
            for (let i = 1; i <= c.servers; i++) rows.push([`    server 10.0.0.${i};`, i === 1 ? "the old box" : ""]);
            rows.push(["}"]);
            return `# nginx.conf: the balancer in front\n${col(rows, 28)}`;
          },
        },
      ],
      try: [{ servers: 3, lb: "rr" }, { servers: 4, lb: "random" }],
      watch: () => "Graph p99 <b>per server</b>, not for the fleet: the average hides one drowning box. If you're stuck with round robin, give the old box a smaller share, <code>server 10.0.0.1 weight=1;</code> against <code>weight=3</code> for the others, about the ratio of their speeds (27 to 80).",
      stack: [
        ["Envoy", "<code>lb_policy: LEAST_REQUEST</code> counts requests in flight, not connections."],
        ["HTTP/2", "One connection carries many requests, so a balancer that counts connections is fooled. Count requests where you can."],
        ["gRPC", "Clients pick servers themselves, and the built-in <code>round_robin</code> policy has round robin's blind spot."],
        ["Kubernetes", "A plain Service picks a pod at random per connection: no idea which pod is slow."],
      ],
    },

    wt04: {
      files: [
        {
          name: "cache.py", lang: "py", run: true,
          src: (c) => `# An LRU cache of your size, read the way the
# tunnel reads: the k-th key 1/k as often (Zipf).
import random
from functools import lru_cache

${col([[`KEYS, CACHE = ${c.keys}, ${c.cache}`, "your system.yaml"]], 28)}


@lru_cache(maxsize=CACHE)
def read(key):
    return f"row {key}"  # the 50 ms database read


random.seed(1)
weights = [1 / k for k in range(1, KEYS + 1)]
for key in random.choices(range(KEYS), weights, k=200_000):
    read(key)
hit = read.cache_info().hits / 200_000
print(f"hit rate {hit:.0%}")`,
        },
        {
          name: "redis.conf", lang: "conf",
          src: (c) => `# redis.conf: the cache machine
${col([[`maxmemory ${Math.max(1, Math.ceil((c.cache * 4) / 1000))}mb`, `${n(c.cache)} values of ~2 KB,`], ["", "with room to spare"], ["maxmemory-policy allkeys-lru", "full? drop the least"], ["", "recently read key"]], 30)}`,
        },
      ],
      check: { line: 0, metric: "hit", tol: 0.05 },
      try: [{ cache: 500 }],
      watch: () => "Graph the hit rate and evictions (in Redis, <code>INFO stats</code>: <code>keyspace_hits</code>, <code>keyspace_misses</code>, <code>evicted_keys</code>). After a deploy or a restart the cache is cold: warm it first, or let traffic back in slowly, or the database drowns before the cache can fill.",
      stack: [
        ["Python", "<code>functools.lru_cache</code> lives in one process: four gunicorn workers keep four separate caches, each a quarter as warm."],
        ["Java", "Caffeine evicts with W-TinyLFU, which won't let a key read once push out a hot one, the weakness of plain LRU."],
        ["Go", "<code>hashicorp/golang-lru</code> has plain LRU, and 2Q and ARC, which resist one-off reads the same way."],
        ["CDNs", "The same law at the edge: a few URLs get most of the hits, so a small edge cache saves most of the trips."],
      ],
    },

    wt05: {
      files: [
        {
          name: "server.py", lang: "py", run: true,
          src: (c) => {
            const wait = Math.round((c.queueMax * c.service * 1000) / c.workers);
            const base = c.backoff || 0.1;
            const sleep = c.jitter ? "random.uniform(0, delay)" : "delay";
            return `# A short queue: a fast no beats a slow yes.
import queue
import random
import time

${col([[`WORKERS, PER_REQUEST = ${c.workers}, ${c.service}`], [`QUEUE_LIMIT = ${c.queueMax}`, "your system.yaml"], [`TIMEOUT = ${c.timeout.toFixed(1)}`, "clients give up after"]])}
work = queue.Queue(maxsize=QUEUE_LIMIT)


def accept(request):
    try:
        work.put_nowait(request)
        return 202  # it'll be answered in time
    except queue.Full:
        return 503  # full: say no at once


def worker(serve, client_gone):
    while True:
        request = work.get()
        if client_gone(request):  # ${c.cancel ? "as in your design" : "yours served these"}
            continue  # nobody's waiting: skip it
        serve(request)


def call(send, retries=${c.retries}, base=${base}, cap=2.0):
    for attempt in range(retries + 1):
        if send() != 503:
            return True
        delay = min(cap, base * 2 ** attempt)${c.backoff ? "" : "  # yours: none"}
        time.sleep(${sleep})${c.jitter ? "  # full jitter" : ""}
    return False


wait = QUEUE_LIMIT * PER_REQUEST * 1000 / WORKERS
print(f"the back of the queue waits {wait:.0f} ms")
# → the back of the queue waits ${wait} ms
print("in time" if wait < TIMEOUT * 1000 else "too late")
# → ${wait < c.timeout * 1000 ? "in time" : "too late"}`;
          },
        },
        {
          name: "envoy.yaml", lang: "yaml",
          src: (c) => `# envoy.yaml (fragments): the same design as
# a proxy in front of the server would run it
cluster:
  circuit_breakers:
    thresholds:
      - max_pending_requests: ${c.queueMax}
route:
  timeout: ${c.timeout}s
  retry_policy:
    retry_on: "5xx"
    num_retries: ${c.retries}
    retry_back_off:
      base_interval: ${c.backoff || 0.1}s
      max_interval: 2s`,
        },
      ],
      try: [{ queueMax: 40, retries: 3, backoff: 0.25, jitter: true, cancel: true }, { queueMax: 1000, retries: 3, backoff: 0, jitter: false, cancel: false }],
      watch: () => "Graph <b>tries against answers</b>: the ratio is your retry amplification, and it should sit near 1. Alert on time spent queued, not queue length. And give clients a <b>retry budget</b>, a cap on retries as a share of requests (Envoy's <code>retry_budget</code>, gRPC's <code>retryThrottling</code>), so a storm can't feed itself.",
      stack: [
        ["Go", "<code>r.Context()</code> is cancelled when the client hangs up. Check <code>ctx.Err()</code> before the work: that's the tunnel's <i>drop it</i>."],
        ["Java", "<code>ThreadPoolExecutor</code> over an <code>ArrayBlockingQueue&lt;&gt;(60)</code> throws <code>RejectedExecutionException</code> when full: the fast no, built in."],
        ["Python", "<code>async with asyncio.timeout(1):</code> (3.11+) stops your own work at the client's deadline instead of finishing it for nobody."],
        ["Node.js", "<code>res.on(\"close\")</code> fires when a client hangs up before you answer: wire it to an <code>AbortController</code> to stop the work."],
      ],
    },
    wt06: {
      files: [
        {
          name: "mailer.py", lang: "py", run: true,
          src: (c) => {
            const B = c.batch, jw = c.jobWorkers, work = B.n * B.service;
            return `# The newsletter, off the website's line.
import queue
import threading
import time

${col([[`EMAILS = ${B.n}`, "a batch, all at once"], [`PER_EMAIL = ${B.service}`, "seconds of a worker"], [`EVERY = ${B.every}`, "a batch a minute"], [`JOB_WORKERS = ${jw}`, "your system.yaml"], ["FAST = 0.001", "1000x faster than life"]])}

# Bounded: room for two batches. Past that, put()
# waits, and the job that fills it slows down to
# the workers' pace. That's backpressure.
jobs = queue.Queue(maxsize=EMAILS * 2)
sent = []


def send(email):
    time.sleep(PER_EMAIL * FAST)  # the SMTP call
    sent.append(email)


def worker():
    while True:
        email = jobs.get()
        send(email)
        jobs.task_done()


for _ in range(JOB_WORKERS):
    threading.Thread(target=worker, daemon=True).start()

for email in range(EMAILS):  # the batch lands
    jobs.put(email)
jobs.join()  # until the last one is sent
print(f"sent {len(sent)} of {EMAILS}")
# → sent ${B.n} of ${B.n}

work = EMAILS * PER_EMAIL
print(f"a batch is {work:.0f} worker-seconds")
# → a batch is ${work.toFixed(0)} worker-seconds
drain = work / JOB_WORKERS
print(f"sent in {drain:.1f} s by {JOB_WORKERS}")
# → sent in ${(work / jw).toFixed(1)} s by ${jw}
print(f"the average needs {work / EVERY:.1f} workers")
# → the average needs ${(work / B.every).toFixed(1)} workers
print("keeps up" if drain < EVERY else "falls behind")
# → ${work / jw < B.every ? "keeps up" : "falls behind"}`;
          },
        },
        {
          name: "tasks.py", lang: "py",
          src: (c) => `# The same design with Celery over Redis.
from celery import Celery

app = Celery("mail", broker="redis://localhost:6379/0")
app.conf.task_acks_late = True  # redo a lost job
app.conf.worker_prefetch_multiplier = 1
app.conf.task_routes = {
    "tasks.send_email": {"queue": "email"},
}


@app.task
def send_email(address):
    deliver(address)  # the slow part: ${Math.round(c.batch.service * 1000)} ms


def newsletter():
    for address in due():  # enqueue; never send here
        send_email.delay(address)

# ${c.jobWorkers} workers of their own, apart from the website:
# celery -A tasks worker -Q email --concurrency=${c.jobWorkers}`,
        },
      ],
      check: { line: 2, metric: "jobAge", tol: 2.5 },
      try: [{ workers: 4, jobWorkers: 2, batch: { at: 5, every: 60, n: 900, service: 0.1 } }, { workers: 4, jobWorkers: 1 }],
      watch: (c) => `Graph the <b>age of the oldest job</b>, not the length of the queue. ${n(c.batch.n)} emails waiting is fine for a newsletter; a password-reset email that's a minute old is not. Alert when the age passes what you promise (here, 50 s). Graph jobs in against jobs done: if in stays above done, the queue is hiding an overload. And give each promise its own queue, so a newsletter can never hold up a password reset.`,
      stack: [
        ["Python", "Celery or RQ over Redis, with <code>acks_late</code> so a crashed worker's job is redone, not lost. In one process, <code>ThreadPoolExecutor</code> suits network calls like SMTP: the GIL is let go while a thread waits."],
        ["Go", "A buffered channel is a bounded queue: <code>jobs := make(chan Email, 3600)</code>, read by a few goroutines. A send on a full channel blocks, which is backpressure for free."],
        ["Java", "<code>Executors.newFixedThreadPool(4)</code> hides an <i>unbounded</i> queue. Build a <code>ThreadPoolExecutor</code> over an <code>ArrayBlockingQueue</code> with <code>CallerRunsPolicy</code>, so a full queue pushes back on whoever fills it."],
        ["Node.js", "One thread serves every request, so slow work in a handler is the shared line from the tunnel. Put it in a queue like BullMQ, run by a separate worker process with <code>concurrency: 4</code>."],
        ["Kubernetes", "Run the workers as their own deployment, and scale it on the oldest job's age or the queue's depth (KEDA does this), not on CPU."],
      ],
    },
  };

  root.WT = root.WT || {};
  root.WT.home = home;
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined") module.exports = (globalThis.WT || window.WT).home;
