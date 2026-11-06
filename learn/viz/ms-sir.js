/* ModSim, chapter 11: the Freshman Plague, day by day.
   SIR for a class of 90 with one student sick on day 0. Each day new infections = β·i·s and
   recoveries = γ·i. Set β from "days between infecting contacts" and γ from "days to recover".
   Left: the class, coloured susceptible, sick, recovered. Right: s, i and r over 14 weeks.
   The naive comparison drops the s: infections = β·i. Then nothing ever slows the outbreak.
   The "why": the s·i product is what ends an epidemic, and when β < γ it never starts. */
VIZ.register("ms-sir", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-sirkit");
  const P = window.MSPLOT, M = window.MSSIR;
  let tc = 3, tr = 4, noS = false, day = 98, running = false, reached = api.wasDone, sawBig = false;
  const rows = () => M.run({ beta: 1 / tc, gamma: 1 / tr, noS });
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const R = rows(), now = R[Math.min(day, 98)], { scene, plot } = P.split(w, h, 0.32);
    M.drawClass(g, api, { ...scene, y0: scene.y0 + 6 }, now);
    P.title(g, api, `day ${day} · ${Math.round(now[2] * 90)} sick, ${Math.round(now[3] * 90)} recovered`);
    const upto = R.slice(0, day + 1);
    P.plot(g, api, plot, {
      xlim: [0, 98], ylim: [0, 1], xlabel: "day", ylabel: "fraction of the class", legend: "right",
      vlines: [{ v: day, col: "c5" }],
      series: [{ pts: upto.map((q) => [q[0], q[1]]), col: "c2", label: "S, susceptible" }, { pts: upto.map((q) => [q[0], q[2]]), col: "bad", label: "I, sick" }, { pts: upto.map((q) => [q[0], q[3]]), col: "c3", label: "R, recovered" }],
    });
  });
  function report() {
    const R = rows(), t = M.total(R) * 90, pk = M.peak(R);
    if (t > 40) sawBig = true;
    api.status(`β = 1/${tc} = ${(1 / tc).toFixed(3)} a day, γ = 1/${tr} = ${(1 / tr).toFixed(3)} a day${noS ? "  ·  infections ignore s" : ""}\npeak: ${Math.round(pk[2] * 90)} sick on day ${pk[0]}\nover 14 weeks ${Math.round(t)} of 90 students get sick`);
    if (!reached && !noS && sawBig && t < 5) {
      reached = true;
      api.explain("An outbreak that never starts", `<p>With β = ${(1 / tc).toFixed(2)} and γ = ${(1 / tr).toFixed(2)}, each sick student recovers faster than they infect anyone new, so the first case fizzles out: only ${Math.round(t)} students in all.</p><p>The outbreak takes off only when β is bigger than γ: more than one new infection per case. Chapter 14 calls β/γ the <b>contact number</b>.</p>`);
      api.done("Found settings where the plague dies out");
    }
  }
  async function play() {
    if (running) { running = false; return; }
    running = true;
    for (day = 0; day <= 98 && running; day++) { cv.redraw(); report(); await api.sleep(40); }
    day = 98; running = false; cv.redraw();
  }
  api.slider("Days between infecting contacts (1/β)", { min: 1, max: 10, step: 0.5, value: tc, format: (v) => v + " d" }, (v) => { tc = v; cv.redraw(); report(); });
  api.slider("Days to recover (1/γ)", { min: 1, max: 10, step: 0.5, value: tr, format: (v) => v + " d" }, (v) => { tr = v; cv.redraw(); report(); });
  api.seg([{ label: "Infections = β·i·s", value: "s" }, { label: "Infections = β·i (naive)", value: "nos" }], "s", (v) => {
    noS = v === "nos"; cv.redraw(); report();
    api.explain(noS ? "Forgetting s" : "Why s matters", noS
      ? "<p>Without s, each sick student keeps infecting at the same rate however few healthy students are left. The outbreak only stops when there's nobody left to catch it.</p>"
      : "<p>Only contacts with susceptible students spread it. As s falls, each sick student infects fewer people, and the outbreak turns over before everyone is sick.</p>");
  });
  api.button("Play 14 weeks", play, { primary: true });
  report();
  api.explain("How to read this", "<p>Each dot is a student: blue susceptible, red sick, green recovered. Press Play to watch the term unfold.</p><p>Then change the two sliders until the plague can't get going at all.</p>");
});
