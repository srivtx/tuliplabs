/* Probability & Stats, chapter 7: sampling and bias.
   A city of 900 people (voxels; height = weekly hours of exercise). Survey them three ways:
   a true random sample, "people near the gym", and "whoever answers the online poll" (keen people
   reply more). Each survey's estimate drops onto a ruler next to the truth.
   The "why": random sampling errors shrink with n; bias doesn't shrink at all. */
VIZ.register("ps-sampling", async (api) => {
  const W = await api.world3d();
  const G = 30, SP = 0.42;
  let people = [], mode = "random", n = 50, estimates = { random: [], gym: [], online: [] }, biggest = { gym: 0, online: 0 };
  // a seeded generator, so everyone sees the same city
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const gym = [22, 8];
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const d = Math.hypot(i - gym[0], j - gym[1]);
    const hours = Math.max(0, 2.2 + 3.2 * Math.exp(-d / 6) + 1.1 * gauss());
    people.push({ i, j, hours, d });
  }
  const truth = people.reduce((a, p) => a + p.hours, 0) / people.length;
  const MODES = {
    random: { label: "random sample", weight: () => 1, why: "Every person has the <b>same</b> chance of being picked, so on average the sample looks like the city. Each survey misses by a bit, in either direction." },
    gym: { label: "near the gym", weight: (p) => (p.d < 14 ? 1 : 0), why: "Only people within a short walk of the gym get asked. They exercise more than the city as a whole, so <b>every</b> survey like this overestimates, no matter how many people you ask." },
    online: { label: "online poll", weight: (p) => 0.05 + p.hours ** 2, why: "Anyone <i>can</i> answer, but keen exercisers are far more likely to bother. Who chooses to answer is related to the answer: that's <b>self-selection bias</b>." },
  };
  const key = (p) => `p${p.i}_${p.j}`;
  function drawCity() {
    for (const p of people) {
      const h = 0.1 + p.hours * 0.18;
      W.box(key(p), { x: (p.i - G / 2) * SP, y: h / 2, z: (p.j - G / 2) * SP, sx: 0.34, sy: h, sz: 0.34, color: "c5", instant: true,
        info: { title: `A resident: ${p.hours.toFixed(1)} h of exercise a week`, html: `<p>Height = hours of exercise per week. People living near the gym (the green block) tend to exercise more.</p><p>The <b>population</b> is all 900 residents. Their true average is <b>${truth.toFixed(2)} h</b>, which a real surveyor would never get to see.</p>` } });
    }
    W.box("gym", { x: (gym[0] - G / 2) * SP, y: 2.2, z: (gym[1] - G / 2) * SP, s: 0.8, color: "c3", label: "gym", instant: true,
      info: { title: "The gym", html: "<p>Asking people here is cheap and easy. That's exactly why convenience samples are so tempting, and so misleading.</p>" } });
    // the ruler where estimates land
    W.box("truth", { x: 8.5, y: 3, z: 0, sx: 0.08, sy: 0.08, sz: 9, color: "c3", instant: true,
      info: { title: `The truth: ${truth.toFixed(2)} h`, html: "<p>The real average of all 900 people. Estimates from good sampling scatter around this line; biased ones sit off to one side.</p>" } });
    W.label("rl", "estimates (zoomed)", [8.5, 6.6, 0], { color: "muted", size: 0.32 });
    W.label("tl", `truth ${truth.toFixed(2)} h`, [8.5, 3.45, 4.8], { color: "c3", size: 0.3 });
  }
  function weightedSample(k) {
    const w = people.map(MODES[mode].weight), out = new Set();
    const total = w.reduce((a, b) => a + b, 0);
    if (!total) return [];
    let guard = 0;
    while (out.size < Math.min(k, w.filter((x) => x > 0).length) && guard++ < 100000) {
      let r = rnd() * total, idx = 0;
      while (r > w[idx]) { r -= w[idx]; idx++; }
      out.add(Math.min(idx, people.length - 1));
    }
    return [...out].map((i) => people[i]);
  }
  function survey(times) {
    let last = null;
    for (let t = 0; t < times; t++) {
      const s = weightedSample(n);
      const est = s.reduce((a, p) => a + p.hours, 0) / s.length;
      estimates[mode].push(est);
      last = s;
    }
    for (const p of people) W.box(key(p), { color: "c5", y: (0.1 + p.hours * 0.18) / 2 });
    for (const p of last) W.box(key(p), { color: mode === "random" ? "c2" : mode === "gym" ? "c1" : "c4", y: (0.1 + p.hours * 0.18) / 2 + 0.5 });
    drawEstimates();
  }
  function drawEstimates() {
    const lanes = { random: -3, gym: 0, online: 3 };
    for (const [m, list] of Object.entries(estimates)) {
      list.slice(-60).forEach((e, k) => {
        W.box(`e${m}${k}`, { x: 8.5 + (k % 12) * 0.14 - 0.8, y: Math.max(0.2, Math.min(6.4, 3 + (e - truth) * 4)), z: lanes[m], s: 0.2, color: m === "random" ? "c2" : m === "gym" ? "c1" : "c4", fromY: 7,
          info: { title: `${MODES[m].label}: estimate ${e.toFixed(2)} h`, html: `<p>One survey's answer. The truth is ${truth.toFixed(2)} h, so this one is off by <b>${(e - truth).toFixed(2)}</b>.</p><p>${MODES[m].why}</p>` } });
      });
      W.label("lane" + m, MODES[m].label, [8.5, 0.3, lanes[m]], { color: "muted", size: 0.26 });
    }
    const list = estimates[mode];
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    const sd = Math.sqrt(list.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, list.length - 1));
    api.status(`${MODES[mode].label}, n = ${n}, ${list.length} surveys\ntruth:               ${truth.toFixed(2)} h\naverage estimate:    ${avg.toFixed(2)} h   (bias ${(avg - truth >= 0 ? "+" : "") + (avg - truth).toFixed(2)})\nscatter of estimates: ${sd.toFixed(2)} h`);
    api.explain(MODES[mode].label, `<p>${MODES[mode].why}</p>`);
    if (mode !== "random" && n >= 300 && list.length >= 10 && Math.abs(avg - truth) > 3 * sd + 0.05) {
      biggest[mode] = 1;
      api.explain("More data didn't fix it", `<p>You asked <b>${n}</b> people, ${list.length} times. The estimates barely scatter (±${sd.toFixed(2)} h) and yet they're all about <b>${Math.abs(avg - truth).toFixed(2)} h</b> ${avg > truth ? "too high" : "too low"}.</p><p>Random error shrinks as n grows. <b>Bias doesn't</b>: a bigger biased sample just gives you the wrong answer more confidently.</p>`);
      api.done("You showed that a huge biased sample still misses");
    }
  }
  api.seg(Object.entries(MODES).map(([k, v]) => ({ label: v.label, value: k })), mode, (v) => { mode = v; api.explain(MODES[v].label, `<p>${MODES[v].why}</p>`); });
  api.slider("People asked per survey n", { min: 10, max: 500, step: 10, value: n }, (v) => { n = v; });
  api.button("Run 1 survey", () => survey(1), { primary: true });
  api.button("Run 10 surveys", () => survey(10));
  api.button("Clear estimates", () => { for (const m in estimates) estimates[m] = []; W.clear(); drawCity(); api.status(""); });
  W.camera({ target: [3.2, 1.6, 0], dist: 22, theta: 0.3, phi: 1.12, instant: true });
  api.hud(`900 residents · true average ${truth.toFixed(2)} h/week (you'd never really know this)`);
  drawCity();
  api.explain("How to read this", "<p>Each block is a resident; height = hours of exercise a week. Run a survey and the people asked light up. Each survey's estimate lands on the ruler on the right, next to the green truth line, in its own lane.</p><p>Compare the three ways of sampling. Click anything to ask why.</p>");
});
