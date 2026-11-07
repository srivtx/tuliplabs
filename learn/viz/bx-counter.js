/* Build your own X, chapter 50: an order API for a coffee shop.
   A request is a slip of text the app sends: a method and a path ("which thing, and what to do with it"),
   maybe a body. The server matches method + path against its routes, runs one handler, and sends back
   a status line and a body. The slip travels app → server → route → back.
   The "why": the status code is the answer before the answer. The app's code reads it first
   (res.ok is true for 200–299) and only then the body. A server that always answers 200, with the
   error tucked in the body, makes the app announce orders that never happened. */
VIZ.register("bx-counter", async (api) => {
  const W = await api.world3d();
  api.wide();
  const MENU = [{ id: 1, name: "Espresso", price: 250 }, { id: 2, name: "Latte", price: 400 }, { id: 3, name: "Mocha", price: 450 }];
  const REASON = { 200: "OK", 201: "Created", 400: "Bad Request", 404: "Not Found" };
  const ROUTES = [
    { key: "menu", label: "GET /menu", y: 2.3, why: "Answers the whole menu. <code>GET</code> means \"give me\": it never changes anything, so an app (or a browser, or a cache) may send it as often as it likes." },
    { key: "drink", label: "GET /menu/:id", y: 1.45, why: "<code>:id</code> is a <b>path parameter</b>: <code>/menu/2</code> and <code>/menu/3</code> both match, and the handler gets <code>req.params.id</code>, as a string. No drink with that id: 404." },
    { key: "order", label: "POST /orders", y: 0.6, why: "<code>POST</code> means \"make a new one\". The body says what to make. The answer is <b>201 Created</b>, with the new order and its id, or <b>400 Bad Request</b> when the body makes no sense." },
    { key: "get", label: "GET /orders/:id", y: -0.25, why: "Looks up one order by its id: the id the 201 handed back. That's how an app shows \"your latte is being made\" later." },
  ];
  let mode = "real", busy = false, orders = [], seenReal = new Set(), naiveLie = false, reached = api.wasDone, appSays = 0;

  // The server: method + path pick a route; the handler answers a status and a body.
  function serve(method, path, bodyText) {
    let m;
    if (method === "GET" && path === "/menu") return ["menu", 200, MENU];
    if (method === "GET" && (m = /^\/menu\/([^/]+)$/.exec(path))) {
      const d = MENU.find((x) => x.id === Number(m[1]));
      return d ? ["drink", 200, d] : ["drink", 404, { error: `No drink with id ${m[1]}` }];
    }
    if (method === "POST" && path === "/orders") {
      let body;
      try { body = JSON.parse(bodyText || "null"); } catch (e) { return ["order", 400, { error: "That body isn't JSON" }]; }
      const d = body && MENU.find((x) => x.id === body.drinkId);
      if (!d) return ["order", 400, { error: "Unknown drink" }];
      const o = { id: orders.length + 1, drink: d.name, price: d.price, status: "queued" };
      orders.push(o);
      return ["order", 201, o];
    }
    if (method === "GET" && (m = /^\/orders\/([^/]+)$/.exec(path))) {
      const o = orders.find((x) => x.id === Number(m[1]));
      return o ? ["get", 200, o] : ["get", 404, { error: `No order ${m[1]}` }];
    }
    return [null, 404, { error: "Not found" }];
  }

  function scene() {
    W.box("app", { x: -5.2, y: 1.0, z: 0, sx: 1.1, sy: 2.0, sz: 0.25, color: "c5", opacity: 0.9, label: "the app", labelSize: 0.24, instant: true,
      info: { title: "The app", html: "<p>A phone app is a <b>client</b>: it sends requests and shows what comes back. Its code checks the status first: <code>if (res.ok)</code> is true for 200–299. Only then does it read the body.</p>" } });
    W.box("srv", { x: -1.2, y: 1.0, z: 0, sx: 1.6, sy: 1.6, sz: 1.2, color: "c1", opacity: 0.85, label: "server :3000", labelSize: 0.24, instant: true,
      info: { title: "The server", html: "<p>A program that waits on a <b>port</b> (3000 here) for requests. For each one it looks at the <b>method</b> and the <b>path</b> together, picks one route, and runs its handler. That's all a backend is, at heart.</p>" } });
    for (const r of ROUTES) W.box("r_" + r.key, { x: 3.0, y: r.y, z: 0, sx: 2.5, sy: 0.6, sz: 0.8, color: "c3", opacity: 0.85, label: r.label, labelSize: 0.2, labelUp: -0.3, instant: true, info: { title: r.label, html: `<p>${r.why}</p>` } });
    W.box("r_none", { x: 3.0, y: -1.2, z: 0, sx: 2.5, sy: 0.6, sz: 0.8, color: "c5", opacity: 0.6, label: "no route: 404", labelSize: 0.2, labelUp: -0.3, instant: true,
      info: { title: "No route matched", html: "<p>Nothing matched this method and path, so the answer is <b>404 Not Found</b>. <code>POST /menu</code> lands here too: the method is part of the address.</p>" } });
    W.line("wire", "app", "srv", { color: "line" });
  }

  function slipText(method, path, body) {
    return `${method} ${path} HTTP/1.1\nHost: localhost:3000` + (method === "POST" ? `\nContent-Type: application/json\n\n${body}` : "");
  }
  async function send(method, path, body) {
    if (busy) return;
    busy = true;
    const [route, real, payload] = serve(method, path, body);
    const status = mode === "real" ? real : 200;
    const ok = status >= 200 && status < 300;
    // what the app's code does with the answer: res.ok first, then the body
    let screen;
    if (method === "POST" && path === "/orders") {
      if (ok) { appSays++; screen = `"Order placed! Your ${payload.drink ? payload.drink.toLowerCase() : "drink"} is on its way"`; }
      else screen = `"Couldn't order: ${payload.error}"`;
    } else screen = ok ? `shows ${Array.isArray(payload) ? "the menu" : payload.error ? "an empty screen (the body was an error, but it said 200)" : "the details"}` : `"${payload.error}"`;
    api.status(`${slipText(method, path, body)}\n\nHTTP/1.1 ${status} ${REASON[status]}\nContent-Type: application/json\n\n${JSON.stringify(payload)}\n\nthe app ${screen.startsWith('"') ? "says " : ""}${screen}`);
    const target = route ? "r_" + route : "r_none";
    const t = W.pos(target);
    W.box("slip", { x: -5.2, y: 1.0, z: 0.4, sx: 0.5, sy: 0.32, sz: 0.08, color: "c2", glow: 0.4, label: `${method} ${path}`, labelSize: 0.17, instant: true });
    await api.sleep(250);
    W.box("slip", { x: -1.2, y: 1.0, z: 0.75 });
    await api.sleep(550);
    W.box("slip", { x: t[0] - 1.6, y: t[1], z: 0.5 });
    W.flash(target);
    await api.sleep(550);
    W.box("slip", { x: -1.2, y: 1.0, z: 0.75, color: ok ? "c3" : "c1", label: `${status} ${REASON[status]}` });
    await api.sleep(500);
    W.box("slip", { x: -5.2, y: 1.0, z: 0.4 });
    await api.sleep(450);
    track(method, path, real, status, payload);
    busy = false;
  }

  function track(method, path, real, status, payload) {
    api.hud(`orders the app announced: <b>${appSays}</b> · orders the server has: <b>${orders.length}</b>${appSays > orders.length ? " · <b>the app lied</b>" : ""}`);
    if (mode === "real") {
      seenReal.add(real);
      const need = [201, 400, 404].filter((s) => !seenReal.has(s));
      if (need.length && !naiveLie) return;
      if (!need.length && !naiveLie && !reached) api.explain("201, 400 and 404", "<p>Three different answers, and the app's code told them apart from the status line alone, before reading a word of the body.</p><p>Now switch to <b>always 200</b> and order something that isn't on the menu.</p>");
    } else if (method === "POST" && path === "/orders" && real === 400 && !naiveLie) {
      naiveLie = true;
      api.explain("The app announced an order that doesn't exist", `<p>The server refused it, but said <b>200 OK</b> with <code>{"error": "${payload.error}"}</code> in the body. The app's code checked <code>res.ok</code>, saw success, and told the customer their drink was coming.</p><p>Every client in the world (apps, browsers, retry libraries, monitoring) reads the status first. A wrong status is a lie to all of them at once.</p>`);
    }
    if (naiveLie && [201, 400, 404].every((s) => seenReal.has(s)) && !reached) { reached = true; api.done("You can read an HTTP exchange, and you know why the status comes first"); }
  }

  const method = api.seg([{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }], "GET", () => {});
  const path = api.text("path", "/menu", () => go());
  const body = api.text("body", '{"drinkId": 2}', () => go());
  const go = () => send(method.get(), path.get().trim() || "/", body.get());
  api.button("Send", go, { primary: true });
  const row = api.row();
  const preset = (label, m, p, b) => api.button(label, () => { if (busy) return; method.set(m); path.set(p); if (b) body.set(b); send(m, p, b || body.get()); }, { row });
  preset("the menu", "GET", "/menu");
  preset("a latte", "POST", "/orders", '{"drinkId": 2}');
  preset("a cake", "POST", "/orders", '{"drinkId": 9}');
  preset("order 1", "GET", "/orders/1");
  api.seg([{ label: "real status codes", value: "real" }, { label: "always 200", value: "naive" }], mode, (m) => { mode = m; });
  scene();
  W.camera({ target: [-1.0, 0.6, 0], dist: 11.5, theta: 0, phi: 1.45, instant: true });
  api.hud("orders the app announced: <b>0</b> · orders the server has: <b>0</b>");
  api.status(slipText("GET", "/menu", "") + "\n\nPress Send, or pick one of the requests below it.");
  api.explain("How to read this", "<p>The app on the left sends a request; the server matches its <b>method and path</b> to one route and answers with a <b>status</b> and a body. Click any block to see why it works that way.</p>");
});
