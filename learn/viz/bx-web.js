/* Build your own X, chapter 10: a web framework.
   A request is a packet that travels left to right: raw bytes → HTTP parser → middleware (logging, auth)
   → router → one handler. The response travels back through the same middleware in reverse.
   Every stage is a small function; the framework is just the order they're called in.
   The "why": middleware lets cross-cutting jobs (logs, auth, errors) live in one place, not in every handler. */
VIZ.register("bx-web", async (api) => {
  const W = await api.world3d();
  const STATIONS = [
    { key: "client", x: -6.4, label: "browser", color: "c5", why: "Sends plain text over a TCP connection: a request line, headers, a blank line, then an optional body. Everything a framework does starts from that text." },
    { key: "parse", x: -4.2, label: "parser", color: "c2", why: "Splits the raw text into method, path, headers and body, so nothing after it has to deal with bytes and line endings." },
    { key: "log", x: -2.2, label: "logging", title: "Logging middleware", color: "c4", why: "Middleware wraps the rest of the app: it sees every request on the way in and every response on the way out. Logging lives here once, instead of in every handler." },
    { key: "auth", x: -0.2, label: "auth", title: "Auth middleware", color: "c4", why: "Checks the token before any handler runs. If it's missing, it answers 401 itself and the request never reaches the router: handlers can assume the user is logged in." },
    { key: "router", x: 1.9, label: "router", color: "c1", why: "Matches method + path against a table of patterns like <code>/users/&lt;id&gt;</code>, pulls out parameters, and picks exactly one handler. No match: 404." },
  ];
  const HANDLERS = [
    { key: "home", y: 2.8, label: "GET /", route: "GET /" },
    { key: "user", y: 1.6, label: "GET /users/<id>", route: "GET /users/<id>" },
    { key: "create", y: 0.4, label: "POST /users", route: "POST /users" },
  ];
  const REQS = {
    home: { label: "GET /", raw: "GET / HTTP/1.1\nHost: shop.test", method: "GET", path: "/", token: true },
    user: { label: "GET /users/42", raw: "GET /users/42 HTTP/1.1\nHost: shop.test\nAuthorization: Bearer abc", method: "GET", path: "/users/42", token: true },
    noauth: { label: "POST, no token", raw: "POST /users HTTP/1.1\nHost: shop.test\nContent-Type: application/json\n\n{\"name\": \"Ida\"}", method: "POST", path: "/users", token: false },
    create: { label: "POST + token", raw: "POST /users HTTP/1.1\nAuthorization: Bearer abc\nContent-Type: application/json\n\n{\"name\": \"Ida\"}", method: "POST", path: "/users", token: true },
    missing: { label: "GET /cart", raw: "GET /cart HTTP/1.1\nHost: shop.test", method: "GET", path: "/cart", token: true },
  };
  let pick = "home", busy = false, seen = new Set(), log = [];
  function scene() {
    for (const s of STATIONS) W.box(s.key, { x: s.x, y: 0.6, z: 0, sx: 1.5, sy: 1.2, sz: 1.2, color: s.color, opacity: 0.85, label: s.label, labelSize: 0.26, instant: true, info: { title: s.title || s.label, html: `<p>${s.why}</p>` } });
    for (const h of HANDLERS) W.box("h" + h.key, { x: 4.3, y: h.y, z: 0, sx: 2.1, sy: 0.75, sz: 1.0, color: "c3", opacity: 0.85, label: h.label, labelSize: 0.22, labelUp: -0.375, instant: true,
      info: { title: `Handler for ${h.route}`, html: "<p>A plain function: it gets a parsed request (and any path parameters) and returns a response. It knows nothing about sockets, logging or tokens: the framework and middleware handle all that.</p>" } });
    for (let i = 0; i < STATIONS.length - 1; i++) W.line("e" + i, STATIONS[i].key, STATIONS[i + 1].key, { color: "muted" });
    for (const h of HANDLERS) W.line("eh" + h.key, "router", "h" + h.key, { color: "muted" });
  }
  async function travel(path, color, label) {
    for (const [x, z, y] of path) {
      W.box("pkt", { x, y: y ?? 1.75, z, s: 0.42, color, glow: true, label, labelSize: 0.22,
        info: { title: "The request (or response)", html: "<p>Follow it through the stages. Click a stage to ask what it's for.</p>" } });
      await api.sleep(430);
    }
  }
  function matchRoute(r) {
    if (r.method === "GET" && r.path === "/") return ["home", {}];
    const m = r.path.match(/^\/users\/(\d+)$/);
    if (r.method === "GET" && m) return ["user", { id: m[1] }];
    if (r.method === "POST" && r.path === "/users") return ["create", {}];
    return null;
  }
  async function send() {
    if (busy) return;
    busy = true;
    const r = REQS[pick];
    const at = (k) => STATIONS.find((s) => s.key === k).x;
    api.explain("Raw request", `<pre>${r.raw.replace(/</g, "&lt;")}</pre><p>This text is all the server receives.</p>`);
    await travel([[at("client"), 0], [at("parse"), 0]], "c2", "bytes");
    api.explain("Parsed", `<p>method <b>${r.method}</b>, path <b>${r.path}</b>, ${r.token ? "an Authorization header" : "<b>no</b> Authorization header"}${r.method === "POST" ? ", and a JSON body" : ""}.</p>`);
    await travel([[at("log"), 0]], "c2", r.method);
    let status, body, stop;
    const needsAuth = r.path.startsWith("/users");
    await travel([[at("auth"), 0]], "c2", r.method);
    if (needsAuth && !r.token) { status = 401; body = "{\"error\": \"login required\"}"; stop = "auth"; }
    else {
      await travel([[at("router"), 0]], "c2", r.path);
      const m = matchRoute(r);
      if (!m) { status = 404; body = "{\"error\": \"no such page\"}"; stop = "router"; }
      else {
        const h = HANDLERS.find((x) => x.key === m[0]);
        W.flash("h" + h.key);
        await travel([[4.3, -0.9, h.y]], "c3", m[1].id ? `id=${m[1].id}` : "handler");
        status = m[0] === "create" ? 201 : 200;
        body = m[0] === "home" ? "<h1>Shop</h1>" : m[0] === "user" ? `{"id": ${m[1].id}, "name": "Ida"}` : "{\"id\": 43, \"name\": \"Ida\"}";
        stop = "h" + h.key;
      }
    }
    const color = status < 300 ? "ok" : "bad";
    api.explain(`${status} on the way out`, `<p>${stop === "auth" ? "The auth middleware answered by itself: the router and handlers never saw this request." : stop === "router" ? "The router found no pattern for this path, so the framework answered 404. No handler code ran." : "The handler returned a response object."} Now it travels back <b>through the same middleware in reverse</b>, so the logger can record the status and timing.</p>`);
    const back = [[at("auth"), 1.4, 1.2], [at("log"), 1.4, 1.2], [at("parse"), 1.4, 1.2], [at("client"), 1.4, 1.2]].filter(([x]) => stop !== "auth" || x <= at("auth"));
    await travel(back, color, String(status));
    log.push(`${r.method} ${r.path} → ${status}`);
    seen.add(status);
    api.status(`response: HTTP/1.1 ${status}\nbody: ${body}\n\nlog middleware has recorded:\n${log.slice(-6).join("\n")}`);
    if (seen.has(200) && seen.has(401) && seen.has(404)) {
      api.explain("Three answers, three different stages", "<p>200 came from a handler, 401 from the auth middleware, 404 from the router. Each concern lives in exactly one place, and the logger saw all of them without any handler writing a log line.</p><p>That's what a framework is: a parser, a router, and a chain of wrappers around your functions.</p>");
      api.done("You saw a 200, a 401 and a 404 come from different stages");
    }
    busy = false;
  }
  api.seg(Object.entries(REQS).map(([k, v]) => ({ label: v.label, value: k })), pick, (v) => { pick = v; });
  api.button("Send request", send, { primary: true });
  W.camera({ target: [-0.9, 1.2, 0.3], dist: 16.5, theta: 0.0, phi: 1.12, instant: true });
  scene();
  api.hud("pick a request, then send it · click any stage to ask why it exists");
  api.explain("How to read this", "<p>A request travels left to right through the stages of a tiny web framework, and its response comes back along the front row. Pick a request and send it.</p><p>Try to get a <b>200</b>, a <b>401</b> and a <b>404</b>. Which stage produces each?</p>");
});
