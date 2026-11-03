/* Build your own X, chapter 38: a bank ledger.
   Four accounts hold 1000 between them. Five transfers run, and the server crashes halfway
   through the third one.
   The "why": a bank that just edits balances ("take 80 from Cara, then add 80 to Alice") loses
   money when it crashes between the two edits, and nothing tells it so: there's no history, only
   numbers that are now wrong. Double-entry bookkeeping writes every transfer as one journal entry
   whose lines add up to zero, posted all at once or not at all. Balances are just sums of the
   journal, so the total never moves and any mistake shows up as a non-zero sum. */
VIZ.register("bx-ledger", async (api) => {
  const W = await api.world3d();
  const NAMES = ["Alice", "Bob", "Cara", "Shop"], START = [400, 300, 200, 100];
  const MOVES = [[0, 1, 100], [1, 3, 150], [2, 0, 80], [3, 2, 50], [0, 3, 120]];
  const CRASH = 2;
  let mode = "edit", gen = null, bal = [], journal = [], running = false, ran = {}, reached = false, line = "", crashed = false;
  const total = () => bal.reduce((a, b) => a + b, 0);
  function* edit() {
    for (let i = 0; i < MOVES.length; i++) {
      const [f, t, amt] = MOVES[i];
      bal[f] -= amt; yield `transfer ${i + 1}: take ${amt} from ${NAMES[f]}`;
      if (i === CRASH) { crashed = true; yield `the server crashes before adding ${amt} to ${NAMES[t]}. It restarts, and carries on with transfer ${i + 2}`; crashed = false; continue; }
      bal[t] += amt; yield `transfer ${i + 1}: add ${amt} to ${NAMES[t]}`;
    }
    yield `done. The bank now holds ${total()}, not 1000, and there's no record of where ${1000 - total()} went`;
  }
  function* ledger() {
    for (let i = 0; i < MOVES.length; i++) {
      const [f, t, amt] = MOVES[i];
      if (i === CRASH) {
        crashed = true; yield `transfer ${i + 1}: the server crashes while writing the entry. The entry was never committed, so nothing changed`;
        crashed = false;
      }
      journal.push([i + 1, NAMES[f], -amt], [i + 1, NAMES[t], amt]);
      bal[f] -= amt; bal[t] += amt;
      yield `entry ${i + 1}: ${NAMES[f]} −${amt}, ${NAMES[t]} +${amt}. The lines sum to 0, posted together${i === CRASH ? " (the retry after the restart)" : ""}`;
    }
    yield `done. Total still 1000, and every balance is the sum of its lines in the journal`;
  }
  function draw() {
    NAMES.forEach((n, i) => {
      const x = -3.3 + i * 0.8, h = bal[i] * 0.004;
      W.box("acc" + i, { x, y: -1.2 + h / 2, z: 0, sx: 0.55, sy: Math.max(0.02, h), sz: 0.3, color: "c2", opacity: 0.9,
        info: { title: n, html: `<p>Balance ${bal[i]}.</p>` } });
      W.label("an" + i, n, [x, -1.5, 0.2], { color: "ink", size: 0.15 });
      W.label("av" + i, String(bal[i]), [x, -1.05 + h, 0.2], { color: "muted", size: 0.14 });
    });
    const th = total() * 0.0025, bad = total() !== 1000;
    W.box("tot", { x: 0.0, y: -1.2 + th / 2, z: 0, sx: 0.6, sy: th, sz: 0.3, color: bad ? "c1" : "c3", opacity: 0.9,
      info: { title: "All money in the bank", html: `<p>${total()} (should be 1000).</p>` } });
    W.box("totline", { x: 0.0, y: -1.2 + 2.5, z: 0.17, sx: 0.8, sy: 0.03, sz: 0.03, color: "c4", opacity: 0.9 });
    W.label("tn", "total", [0.0, -1.5, 0.2], { color: "ink", size: 0.15 });
    W.label("tv", String(total()), [0.0, -1.05 + Math.max(th, 2.5) + 0.05, 0.2], { color: bad ? "c1" : "muted", size: 0.14 });
    W.box("crash", { x: -1.0, y: 1.95, z: 0.1, sx: 4.6, sy: 0.35, sz: 0.05, color: "c1", opacity: 0.85, visible: crashed, label: crashed ? "server crash" : "", labelSize: 0.17, labelUp: 0 });
    W.label("jh", mode === "ledger" ? "journal" : "no history kept", [2.2, 1.95, 0.2], { color: "ink", size: 0.15 });
    for (let k = 0; k < 10; k++) {
      const e = journal[k];
      W.label("j" + k, e ? `#${e[0]}  ${e[1].padEnd(5)}  ${e[2] > 0 ? "+" : "−"}${Math.abs(e[2])}` : "", [2.4, 1.6 - k * 0.32, 0.2], { color: e && e[2] < 0 ? "c1" : "c3", size: 0.14 });
    }
  }
  function show() { api.status(`${mode === "edit" ? "edit balances" : "double-entry ledger"} · total ${total()}\n${line}`); }
  function reset() { bal = START.slice(); journal = []; line = ""; crashed = false; gen = mode === "edit" ? edit() : ledger(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = true;
    if (mode === "edit") api.explain(`${1000 - total()} vanished`, `<p>The crash landed between the two edits, so money left Cara and never arrived anywhere. Nothing records what happened, so nobody can even tell which transfer broke.</p><p>Switch to <b>double-entry ledger</b> and run it.</p>`);
    else if (ran.edit && !reached) { reached = true; api.explain("Every entry sums to zero", `<p>Each transfer is one entry with a minus line and a plus line, written in one go. A crash leaves no half-entry, the total can't drift, and the journal is a full history you can add up again at any time.</p><p>Every bank, Stripe and every accounting package (QuickBooks, Xero) keeps money this way.</p>`); api.done("You kept the books balanced"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "edit balances", value: "edit" }, { label: "double-entry ledger", value: "ledger" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.4, 0.2, 0], dist: 10.2, theta: 0, phi: 1.5, instant: true });
  api.hud("blue bars = account balances · total bar: green = 1000, red = money missing · amber line = 1000 · right: the journal (red = money out, green = money in)");
  reset();
  api.explain("How to read this", `<p>Four accounts, five transfers, one crash. <b>Run all</b> with <b>edit balances</b>, then with <b>double-entry ledger</b>.</p>`);
});
