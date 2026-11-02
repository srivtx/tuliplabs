/* Build your own X, chapter 29: a test framework.
   Five tests for a shopping cart, run one after another. Each test adds or removes items and then
   checks something. The cart in the middle shows what's in it while the tests run.
   The "why": if every test shares one cart, a test can pass only because of what earlier tests left
   behind (or didn't). In the written order everything passes by luck; shuffle the order and tests
   start failing for reasons that have nothing to do with the code. A test framework gives each test
   a fresh fixture (a new cart), so results don't depend on order, and runners like pytest-randomly
   shuffle on purpose to catch hidden dependencies. */
VIZ.register("bx-tests", async (api) => {
  const W = await api.world3d();
  const PRICE = { apple: 2, pear: 3, banana: 1, kiwi: 1 };
  const TESTS = [
    { name: "test_empty_cart", ops: [], check: (c) => c.length === 0, says: "assert len(cart) == 0" },
    { name: "test_total", ops: [["+", "pear"]], check: (c) => c.reduce((s, x) => s + PRICE[x], 0) === 3, says: "add pear; assert cart.total() == 3" },
    { name: "test_add_item", ops: [["+", "apple"]], check: (c) => c.includes("apple"), says: "add apple; assert 'apple' in cart" },
    { name: "test_remove", ops: [["+", "banana"], ["-", "banana"]], check: (c) => !c.includes("banana"), says: "add banana, remove it; assert 'banana' not in cart" },
    { name: "test_count", ops: [["+", "kiwi"], ["+", "kiwi"]], check: (c) => c.filter((x) => x === "kiwi").length === 2, says: "add kiwi twice; assert cart.count('kiwi') == 2" },
  ];
  let mode = "shared", order = TESTS.map((_, i) => i), result = {}, cart = [], running = false, sawFlaky = false, reached = false, runs = 0;
  const slot = (k) => ({ x: -5 + k * 2.5, y: 2.2 });
  function draw(active) {
    order.forEach((ti, k) => {
      const t = TESTS[ti], r = result[t.name], { x, y } = slot(k);
      W.box(t.name, { x, y, z: 0, sx: 2.25, sy: 0.9, sz: 0.5, color: ti === active ? "c4" : r === "pass" ? "c3" : r === "fail" ? "bad" : "c5", glow: ti === active ? 0.5 : 0,
        label: `${k + 1}. ${t.name.replace("test_", "")}`, labelSize: 0.3, labelUp: -0.78,
        info: { title: t.name, html: `<p><code>${t.says}</code></p><p>${r === "fail" ? "It <b>failed</b>, but the cart code is fine: the cart wasn't in the state this test assumed, because of what ran before it." : "It assumes it starts with an empty cart."}</p>` } });
    });
    for (let k = 0; k < 8; k++) W.remove("item" + k);
    cart.forEach((it, k) => W.box("item" + k, { x: -1.2 + (k % 4) * 0.8, y: -1.3 + Math.floor(k / 4) * 0.8, z: 0, s: 0.65, color: { apple: "c1", pear: "c3", banana: "c4", kiwi: "c2" }[it], label: it, labelSize: 0.24, fromY: 0.8,
      info: { title: it, html: `<p>Left in the cart by an earlier test${mode === "fixture" ? " in this one" : ""}.</p>` } }));
    W.box("cart", { x: 0, y: -2, z: -0.2, sx: 3.6, sy: 0.25, sz: 1.2, color: mode === "fixture" ? "c3" : "c5", opacity: 0.6,
      label: mode === "fixture" ? "a fresh cart for each test" : "one cart shared by every test", labelSize: 0.3, labelUp: -1.1,
      info: { title: mode === "fixture" ? "A fixture" : "Shared state", html: mode === "fixture" ? "<p>Before each test the framework builds a new, empty cart and hands it to the test (pytest: a <code>@pytest.fixture</code> named in the test's arguments). Nothing leaks between tests.</p>" : "<p>A module-level <code>cart = Cart()</code> used by every test. Whatever one test leaves behind, the next one sees.</p>" } });
  }
  function status(extra = "") {
    const vals = Object.values(result), p = vals.filter((v) => v === "pass").length, f = vals.filter((v) => v === "fail").length;
    api.status(`${mode === "shared" ? "one shared cart" : "fresh fixture per test"} · order: ${order.map((i) => TESTS[i].name.replace("test_", "")).join(", ")}\n` +
      (vals.length ? `${p} passed, ${f} failed` : "not run yet") + extra);
  }
  async function run(shuffle) {
    if (running) return;
    running = true; result = {}; cart = []; runs++;
    if (shuffle) {
      // A shuffle that's exactly the lucky written order teaches nothing, so draw again.
      do { order = TESTS.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } } while (order.indexOf(0) < 2 && order.indexOf(1) < 2);
    } else order = TESTS.map((_, i) => i);
    draw(); status();
    for (const ti of order) {
      const t = TESTS[ti];
      if (mode === "fixture") cart = [];
      draw(ti); await api.sleep(250);
      for (const [op, it] of t.ops) { if (op === "+") cart.push(it); else cart.splice(cart.indexOf(it), 1); draw(ti); await api.sleep(200); }
      result[t.name] = t.check(cart) ? "pass" : "fail";
      draw(); W.flash(t.name); await api.sleep(250);
    }
    const failed = Object.entries(result).filter(([, v]) => v === "fail").map(([k]) => k);
    status(failed.length ? `\nFAILED: ${failed.join(", ")}` : "");
    running = false;
    if (mode === "shared" && shuffle && failed.length) {
      sawFlaky = true;
      api.explain("Same code, different results", `<p>Nothing in the cart changed, only the order. <b>${failed.join("</b> and <b>")}</b> assumed an empty cart, but earlier tests had left items in it. In the written order they happened to run first, so the bug in the <i>tests</i> stayed hidden.</p><p>Switch to <b>fresh fixture per test</b> and shuffle again.</p>`);
    } else if (mode === "fixture" && shuffle && !failed.length && sawFlaky && !reached) {
      reached = true;
      api.explain("Isolated tests", "<p>Every test got its own empty cart, so any order gives the same results. That's what fixtures are for, and why test runners can safely run tests in parallel or in random order.</p>");
      api.done("You made the tests independent of order");
    } else if (mode === "shared" && !shuffle && !failed.length && runs === 1) {
      api.explain("All green… in this order", "<p>Every test passed. Now press <b>Run shuffled</b>: same tests, same cart code, random order.</p>");
    }
  }
  api.button("Run in order", () => run(false), { primary: true });
  api.button("Run shuffled", () => run(true));
  api.seg([{ label: "one shared cart", value: "shared" }, { label: "fresh fixture per test", value: "fixture" }], mode, (m) => { if (running) return; mode = m; result = {}; cart = []; draw(); status(); });
  W.camera({ target: [0, 0.3, 0], dist: 18.5, theta: 0, phi: 1.3, instant: true });
  api.hud("tests run left to right · green = passed · red = failed · click a test for its code");
  draw(); status();
  api.explain("How to read this", "<p>Five tests for a shopping cart, all correct if they start with an empty cart. The cart below shows what's in it as the tests run.</p><p>Press <b>Run in order</b>, then <b>Run shuffled</b>.</p>");
});
