# Backend in the Workbench

Backend is taught as whole projects in the Workbench, Node first, then Python, then Go. Each project is one
real program, built ticket by ticket: every ticket's starting code fails its checks, its solution passes them
and every earlier ticket's, and its terminal session replays exactly.

## How it runs

- `learn/wb-node.js` is Node in a box: CommonJS modules, `http` (servers, and `fetch` to them), `fs` on an
  in-memory disk, `events`, `path`, `url`, `crypto` (SHA-256, HMAC, PBKDF2), `Buffer`, and **Express 5**
  built in. An exception nobody catches kills the program, as it does in Node.
- The page runs it in `learn/js-worker.js`. The build runs the same file in Node: `tools/wb-node-check.js`.
- The terminal is a client: `client.js` starts the server and sends each line as a real HTTP request
  (`GET /path`, `POST /path {json}`, `-i` for headers, `-H "Name: value"`).
- `tools/wb-express-parity.js` replays every session on the real Express 5 from npm and compares line by line.
  Learn-Express projects must be 100% identical; Trellis differs only where real Express adds its own headers.
- A downloaded project runs with `npm install` and `node run.js`.
- **⚡ pull the plug** in a Node project cuts the power halfway through the program's *next* write to disk, so a
  careful save (write a `.tmp`, then rename) really survives where a careless one leaves half a file. Tests can do
  the same with `plug()`; `tear(name)` damages a finished file instead.

## Learn Express by building (101…)

| # | Project | What it adds | Status |
|---|---|---|---|
| 1 | Greenhouse | routes, JSON, params, queries, CRUD, middleware, JSON errors | live |
| 2 | Taskflow | data in a JSON file on disk, atomic saves that survive a power cut, filters, paging in headers, sorting, an escaped HTML page | live |
| 3 | Shortlink | base-62 codes from a counter, 302 redirects, clicks by referrer, aliases that never clash with codes, one link per URL, expiry with 410, the counter saved with the links, tombstones | live |
| 4 | Inkwell | sign-up, PBKDF2 password hashing, sessions in cookies, ownership checks | next |
| 5 | Keyring | JWTs signed with HMAC, refresh tokens, roles and scopes | planned |
| 6 | Bookshelf | cursor pagination, sorting, ETags and 304s, API versions | planned |
| 7 | Market | a cart in a session, stock that can't go negative, idempotent checkout | planned |
| 8 | Chatroom | server-sent events, rooms, presence (needs streaming responses in the runtime) | planned |

## Under the hood (150…)

| # | Project | What it builds | Status |
|---|---|---|---|
| 1 | Trellis | Express itself, from a bare `http` server | live |
| 2 | Tollbooth | rate limits (token bucket), caching, timeouts, circuit breakers | planned |
| 3 | Courier | a durable job queue, retries with backoff and jitter, dead letters | planned |
| 4 | Relay | signed webhooks, delivery retries, receivers that handle each event once | planned |

## Adding a project

1. `content/wb/eNN.md` (or `uNN.md`) with `lang: js`, `series: express` (or `deep`), `main: client`, `prompt: api> `.
   Reuse Greenhouse's `client.js`. Write code in a brief with `~~~js` fences, never three backticks.
2. Tests are top-level `assert(cond, "message")` lines with `request("METHOD /path", body, {headers, port})`,
   `run(line)`, `source(file)`, `disk(name)` and `restart()`. Later tickets' solutions must keep passing them.
3. `python3 tools/build.py`, then `node tools/wb-node-check.js` until ALL GOOD.
4. `EXPRESS=…/node_modules/express node tools/wb-express-parity.js exNN`, then `node tools/e2e.js workbench NUM`.
5. Add its card to `EXPRESS` or `DEEP` in `workbench/shelf.js`.
