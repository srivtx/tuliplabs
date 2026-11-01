/* Build your own X, chapter 1: an elevator system as objects.
   A Building has Floors, an Elevator, a request queue and a swappable scheduling Policy.
   The "why": FIFO zig-zags past people it could have picked up; SCAN sweeps and wins. */
VIZ.register("bx-elevator", async (api) => {
  const W = await api.world3d();
  const N = 10, H = 1.3, CARX = -1.3;
  const fy = (f) => f * H;
  W.camera({ target: [0.2, 4.8, 0], dist: 24, theta: 0.32, phi: 1.3, instant: true });
  const BURST = [8, 1, 7, 2, 6, 3, 5];

  // ---------------------------------------------------------------- the model --
  // The same objects the chapter writes in Python. Sim is headless so we can also
  // run "the other policy" in the background and compare honestly.
  function makeSim(start) {
    return { floor: start, dir: 1, state: "IDLE", queue: [], t: 0, travelled: 0, waits: [], nextId: 0 };
  }
  function choose(sim, policy) {
    const q = sim.queue;
    if (!q.length) return null;
    if (policy === "fifo") return q[0].floor;           // whoever pressed first, no matter where
    let pool = q.filter((r) => (sim.dir > 0 ? r.floor >= sim.floor : r.floor <= sim.floor));
    if (!pool.length) { sim.dir = -sim.dir; pool = q; }  // nothing ahead: turn around
    let best = pool[0].floor;
    for (const r of pool) if (Math.abs(r.floor - sim.floor) < Math.abs(best - sim.floor)) best = r.floor;
    return best;
  }
  function call(sim, floor) { const r = { floor, arrive: sim.t, id: sim.nextId++ }; sim.queue.push(r); return r; }
  function tick(sim, policy) {
    sim.t++;
    const ev = { served: [], moved: false, target: null };
    if (sim.state === "DOORS_OPEN") { sim.state = "IDLE"; return ev; }  // doors close
    const target = choose(sim, policy);
    ev.target = target;
    if (target == null) { sim.state = "IDLE"; return ev; }
    if (target === sim.floor) {
      ev.served = sim.queue.filter((r) => r.floor === sim.floor);     // everyone here gets in
      sim.queue = sim.queue.filter((r) => r.floor !== sim.floor);
      for (const r of ev.served) sim.waits.push(sim.t - r.arrive);
      sim.state = "DOORS_OPEN";
      return ev;
    }
    const d = target > sim.floor ? 1 : -1;
    sim.floor += d; sim.travelled++; sim.dir = d; ev.moved = true;
    sim.state = d > 0 ? "MOVING_UP" : "MOVING_DOWN";
    return ev;
  }
  const busy = (sim) => sim.queue.length > 0 || sim.state === "DOORS_OPEN";
  function headless(policy, start, floors) {
    const s = makeSim(start);
    for (const f of floors) call(s, f);
    let guard = 0;
    while (busy(s) && guard++ < 500) tick(s, policy);
    return s;
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  // ------------------------------------------------------------------ drawing --
  const INFO = {
    building: { title: "Building (composition)", html: `<p>The <b>Building</b> object doesn't move anything itself. It <i>has</i> floors, an elevator, a request queue and a policy, and passes messages between them: <code>call(floor)</code> adds to the queue, <code>tick()</code> asks the policy where to go and tells the elevator.</p><p>Why compose instead of one giant class? Each piece can be understood, tested and replaced on its own. You'll swap the policy below without touching the elevator.</p>` },
    car: { title: "Elevator (an object: state + behaviour)", html: `<p><b>State:</b> its floor, direction and one of four states: IDLE, MOVING_UP, MOVING_DOWN, DOORS_OPEN. <b>Behaviour:</b> <code>tick()</code> moves at most one floor or opens the doors.</p><p>Why does the elevator own <code>floor</code>? If the Building could write <code>car.floor = 8</code>, the car would teleport: the travelled counter and the state machine would lie. One owner, one place to change it: that's <b>encapsulation</b>.</p>` },
    floor: (f) => ({ title: `Floor ${f}`, html: `<p>A <b>Floor</b> object knows its number and who is waiting on it.</p><p>Why do floors own the waiting people, not the elevator? People wait <i>before</i> any car has been chosen. With two elevators, either one might pick them up, so the people belong to the place, not the vehicle.</p>` }),
    person: (r) => ({ title: `Request: floor ${r.floor}, pressed at t=${r.arrive}`, html: `<p>A <b>request</b> remembers two things: where (floor ${r.floor}) and when (tick ${r.arrive}).</p><p>Why store the time? "Average wait" is what passengers feel. Without the arrival time you could only count floors, and a policy could look efficient while one person waits forever.</p>` }),
    queue: { title: "Request queue", html: `<p>The Building keeps every call in one list, in the order buttons were pressed.</p><p>Why does the building own it, not the elevator? The <b>policy</b> must see <i>all</i> calls to plan a good route. Orange = the one the policy picked next.</p>` },
    policy: () => ({ title: `Policy object: ${policy.toUpperCase()}`, html: policy === "fifo"
      ? `<p><b>FIFO</b>: serve requests strictly in the order they were pressed. Fair-sounding and dead simple, but the car zig-zags: 0→8→1→7… and drives <i>past</i> people it could have picked up.</p><p>This object has one method, <code>choose(car, queue)</code>. Swapping it is the <b>strategy pattern</b>: the elevator never changes.</p>`
      : `<p><b>SCAN</b> (the "elevator algorithm"): keep going in your current direction, stop at every requested floor on the way, turn around only when nothing is left ahead. Disks used it to move the read head too.</p><p>Same <code>choose(car, queue)</code> method as FIFO, so the Building can swap it in one line: the <b>strategy pattern</b>.</p>` }),
  };

  let policy = "fifo", sim = makeSim(0), burstStart = null, burstFloors = null, running = false;
  const results = {};
  const people = new Map(); // request id -> slot index on its floor

  W.box("base", { x: 1, y: -0.55, z: 0, sx: 8.6, sy: 0.3, sz: 3, color: "c5", label: "Building", labelSize: 0.42, info: INFO.building });
  W.box("shaft", { x: CARX, y: fy(N - 1) / 2 + 0.4, z: 0, sx: 1.3, sy: fy(N - 1) + 1.2, sz: 1.3, color: "c5", opacity: 0.12 });
  for (let f = 0; f < N; f++) {
    W.box("fl" + f, { x: 2.1, y: fy(f) - 0.08, z: 0, sx: 4.6, sy: 0.16, sz: 2.4, color: "c5", opacity: 0.75, info: INFO.floor(f) });
    W.label("fn" + f, "F" + f, [4.95, fy(f) + 0.25, 0], { color: "muted", size: 0.36 });
  }
  W.label("ql", "queue", [-4.9, -1.55, 1.6], { color: "muted", size: 0.36 });

  function drawCar() {
    const col = sim.state === "DOORS_OPEN" ? "c3" : sim.state === "IDLE" ? "c5" : "c1";
    W.box("car", { x: CARX, y: fy(sim.floor) + 0.45, z: 0, sx: 1, sy: 0.9, sz: 1, color: col, label: sim.state.replace("_", " "), labelSize: 0.32, info: INFO.car });
  }
  function drawPolicy() {
    W.box("policy", { x: -4.9, y: 0.5, z: 1.6, s: 1.1, color: "c3", label: policy === "fifo" ? "FIFO" : "SCAN", labelSize: 0.42, info: INFO.policy() });
  }
  function drawQueue(target) {
    for (const k of [...queueKeys]) if (!sim.queue.find((r) => "q" + r.id === k)) { W.remove(k); queueKeys.delete(k); }
    sim.queue.forEach((r, i) => {
      const k = "q" + r.id;
      queueKeys.add(k);
      W.box(k, { x: -3.6 + i * 0.85, y: -1.55, z: 1.6, s: 0.7, fromY: fy(r.floor), color: r.floor === target ? "c4" : "c2", label: String(r.floor), labelSize: 0.34, info: INFO.queue });
    });
  }
  const queueKeys = new Set();
  function addPerson(r) {
    const onFloor = [...people.entries()].filter(([id, v]) => v.floor === r.floor).map(([, v]) => v.slot);
    let slot = 0; while (onFloor.includes(slot)) slot++;
    people.set(r.id, { floor: r.floor, slot });
    W.box("p" + r.id, { x: 0.3 + slot * 0.5, y: fy(r.floor) + 0.27, z: 0.3 - (slot % 2) * 0.6, s: 0.38, color: "c2", info: INFO.person(r) });
  }
  async function board(rs) {
    for (const r of rs) W.box("p" + r.id, { x: CARX, y: fy(sim.floor) + 0.4, z: 0, s: 0.3, color: "c3" });
    await api.sleep(260);
    for (const r of rs) { W.remove("p" + r.id); people.delete(r.id); }
  }
  function report(extra) {
    const pl = policy.toUpperCase();
    let s = `t=${sim.t}  ${sim.state}  floor ${sim.floor}  policy ${pl}\nfloors travelled: ${sim.travelled}   served: ${sim.waits.length}   avg wait: ${avg(sim.waits).toFixed(1)} ticks`;
    const lines = Object.entries(results).map(([p, r]) => `  ${p.toUpperCase().padEnd(4)} ${String(r.travelled).padStart(3)} floors, avg wait ${r.wait.toFixed(1)}`);
    if (lines.length) s += "\n\nBurst results (same 7 calls from floor 0):\n" + lines.join("\n");
    if (extra) s += "\n" + extra;
    api.status(s);
    api.hud(`<b>${pl}</b> · travelled <b>${sim.travelled}</b> · avg wait <b>${avg(sim.waits).toFixed(1)}</b>`);
  }

  function reset(start) {
    for (const id of people.keys()) W.remove("p" + id);
    people.clear();
    sim = makeSim(start);
    burstStart = null; burstFloors = null;
    drawCar(); drawQueue(null);
  }
  function burst() {
    if (running) return;
    reset(0);
    burstFloors = BURST.slice(); burstStart = { policy, floor: 0 };
    for (const f of BURST) addPerson(call(sim, f));
    drawQueue(choose({ ...sim }, policy));
    report("Burst: 7 people pressed in this order: " + BURST.join(", ") + ". Press Run all.");
  }
  function finishBurst() {
    if (!burstFloors) return;
    const usedPolicy = burstStart.policy === policy ? policy : null; // switched mid-run: don't score it
    burstFloors = null;
    if (!usedPolicy) { report("You swapped policy mid-run (that works: strategy pattern!), but the race isn't scored. Press Burst again."); return; }
    results[usedPolicy] = { travelled: sim.travelled, wait: avg(sim.waits) };
    const other = usedPolicy === "fifo" ? "scan" : "fifo";
    const o = headless(other, 0, BURST);
    const msg = `Burst done with ${usedPolicy.toUpperCase()}: ${sim.travelled} floors, avg wait ${avg(sim.waits).toFixed(1)}.\nThe same burst with ${other.toUpperCase()} would be: ${o.travelled} floors, avg wait ${avg(o.waits).toFixed(1)}.`;
    report(msg);
    if (usedPolicy === "scan") {
      api.explain("SCAN wins", `<p>SCAN drove <b>${sim.travelled}</b> floors; FIFO needs <b>${o.travelled}</b> for the same people. Average wait: <b>${avg(sim.waits).toFixed(1)}</b> vs <b>${avg(o.waits).toFixed(1)}</b> ticks.</p><p>FIFO isn't wrong, it's <i>blind</i>: it ignores where the car already is. And because the policy was its own object, switching cost you one click, not a rewrite of the elevator.</p>`);
      api.done("SCAN served the burst with far less travel");
    } else {
      api.explain("FIFO zig-zags", `<p>${sim.travelled} floors for 7 people. Watch the car pass floor 1 on its way to 8 without stopping: FIFO only looks at the head of the queue.</p><p>Now switch the policy to <b>SCAN</b> and run the same burst.</p>`);
    }
  }
  async function doTick() {
    const ev = tick(sim, policy);
    drawCar();
    if (ev.served.length) { W.flash("car"); await board(ev.served); }
    drawQueue(sim.queue.length ? choose({ ...sim }, policy) : null);
    report();
    if (!busy(sim)) finishBurst();
    return busy(sim);
  }

  api.seg([{ label: "FIFO (first come)", value: "fifo" }, { label: "SCAN (sweep)", value: "scan" }], policy, (v) => {
    policy = v; drawPolicy(); api.explain(INFO.policy().title, INFO.policy().html);
    drawQueue(sim.queue.length ? choose({ ...sim }, policy) : null); report();
  });
  api.button("Burst of 7 calls", burst, { primary: true });
  api.button("Step", async () => { if (!running) await doTick(); });
  api.button("Run all", async () => {
    if (running) return;
    if (!busy(sim)) burst();
    running = true;
    try { let g = 0; while ((await doTick()) && g++ < 300) await api.sleep(230); } finally { running = false; }
  });
  const r = api.row();
  api.button("Random call", () => { const f = Math.floor(Math.random() * N); addPerson(call(sim, f)); drawQueue(choose({ ...sim }, policy)); report(`Someone on floor ${f} pressed the button.`); }, { row: r });
  api.button("Reset", () => { if (!running) { reset(0); report(); } }, { row: r });

  api.explain("How to read this", `<p>A building with floors <b>F0–F9</b>, one elevator car in the shaft, people (blue) waiting on floors, and the <b>request queue</b> along the front. The green block is the <b>policy</b> that decides where the car goes next.</p><p>Press <b>Burst</b>, then <b>Run all</b> with FIFO. Then switch to SCAN and do it again. Click any block to ask why it owns what it owns.</p>`);
  drawPolicy();
  burst();
});
