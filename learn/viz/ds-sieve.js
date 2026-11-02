/* DSA, chapter 38: the Sieve of Eratosthenes.
   Which of 1..100 are prime?
   The "why": trial division tests each number on its own, dividing by 2, 3, 4, … up to its square
   root: 236 divisions here, about 68 million for every number up to a million. The sieve turns it
   round: each prime p crosses off its own multiples, starting at p², and whatever is never crossed
   off is prime. 104 crossings here, about 2.1 million up to a million: O(n log log n). Starting at
   p² works because any smaller multiple k·p (k < p) was already crossed off by k's smallest prime. */
VIZ.register("ds-sieve", async (api) => {
  const W = await api.world3d();
  const N = 100;
  let mode = "trial", gen = null, ops = 0, state = [], cur = 0, tried = [], hit = 0, primes = 0, running = false, ran = {}, reached = false, line = "";
  function* trial() {
    for (let n = 2; n <= N; n++) {
      cur = n; tried = [];
      let d = 2, div = 0;
      for (; d * d <= n; d++) { ops++; tried.push(d); if (n % d === 0) { div = d; break; } }
      state[n] = div ? "comp" : "prime";
      if (!div) primes++;
      yield div ? `${n}: try ${tried.join(", ")}. ${div} divides it, not prime` : tried.length ? `${n}: try ${tried.join(", ")} (up to √${n}), none divide it: prime` : `${n}: nothing to try below √${n}: prime`;
    }
    cur = 0; tried = [];
    yield `${primes} primes, ${ops} divisions`;
  }
  function* sieve() {
    for (let p = 2; p * p <= N; p++) {
      cur = p; hit = 0;
      if (state[p] === "comp") { yield `${p} is already crossed off, so its multiples are too. Skip`; continue; }
      state[p] = "prime";
      yield `${p} is not crossed off, so it's prime. Cross off ${p * p}, ${p * p + p}, ${p * p + 2 * p}, …`;
      for (let m = p * p; m <= N; m += p) { ops++; hit = m; const was = state[m] === "comp"; state[m] = "comp"; yield `cross off ${m} = ${p} × ${m / p}${was ? " (already crossed)" : ""}`; }
      hit = 0;
    }
    cur = 0;
    for (let n = 2; n <= N; n++) if (state[n] !== "comp") { state[n] = "prime"; primes++; }
    yield `past √${N} = 10, so everything left is prime: ${primes} primes, ${ops} crossings`;
  }
  function draw() {
    for (let n = 1; n <= N; n++) {
      const r = Math.floor((n - 1) / 10), c = (n - 1) % 10, s = state[n], hot = n === cur, h = n === hit || tried.includes(n);
      W.box("n" + n, { x: -4.5 + c, y: 4.3 - r, z: 0, sx: 0.88, sy: 0.88, sz: s === "prime" ? 0.6 : 0.3, color: hot ? "c1" : h ? "c4" : s === "prime" ? "c3" : s === "comp" ? "c5" : "c2", glow: hot || h ? 0.35 : 0, opacity: s === "comp" && !h ? 0.35 : 0.92,
        label: String(n), labelSize: 0.24, labelUp: 0,
        info: { title: String(n), html: `<p>${n === 1 ? "1 is not prime: a prime has exactly two divisors." : s === "prime" ? "Prime." : s === "comp" ? "Crossed off: it has a smaller factor." : "Not decided yet."}</p>` } });
    }
  }
  function show() { api.status(`${mode === "trial" ? "trial division, one number at a time" : "sieve: primes cross off their multiples"} · ${ops} ${mode === "trial" ? "divisions" : "crossings"}${primes ? ` · ${primes} primes` : ""}\n${line}`); }
  function reset() { ops = 0; state = [, "comp"]; cur = 0; tried = []; hit = 0; primes = 0; line = ""; gen = mode === "trial" ? trial() : sieve(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "trial") api.explain(`${ops} divisions`, `<p>Every number was tested on its own, by dividing up to its square root. For all numbers up to a million that's about 68 million divisions.</p><p>Switch to <b>sieve</b> and run it.</p>`);
    else if (ran.trial && !reached) { reached = true; api.explain("Cross off multiples instead", `<p>The same 25 primes with ${ops} crossings against ${ran.trial} divisions. Each prime marks its multiples, starting at p² (smaller multiples were already crossed by a smaller prime), and stops once p² is past n.</p><p>Up to a million: about 2.1 million crossings, O(n log log n). That's 30 times less work, and the gap keeps growing.</p>`); api.done("You sieved the primes up to 100"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "trial" ? 120 : 110); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "trial division", value: "trial" }, { label: "sieve", value: "sieve" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.9, 0], dist: 18, theta: 0, phi: 1.5, instant: true });
  api.hud("the numbers 1 to 100 · red = the number (or prime) being worked on · amber = divisors tried, or the multiple being crossed off · green and raised = prime · grey = crossed off");
  reset();
  api.explain("How to read this", `<p>Which numbers up to ${N} are prime? <b>Run all</b> with <b>trial division</b>, then with <b>sieve</b>.</p>`);
});
