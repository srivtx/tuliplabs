/* ModSim, chapter 16: milk first or last?
   Coffee: 300 mL at 90 °C, r = 0.0115. Milk: 50 mL at 5 °C from the fridge, warming toward the
   22 °C room with r = 0.13. You drink at 30 minutes. Choose the minute you pour the milk in:
   before it, both cool (or warm) on their own; at that moment they mix by volume; after it, the
   mixture cools. Every time you try leaves a dot on the right-hand chart.
   The "why": hot coffee loses heat fastest, so keeping it hot (unmixed) costs more, but the cold
   milk gains heat from the room while it waits, and here that gain wins. */
VIZ.register("ms-milk", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT;
  let tAdd = 0, reached = api.wasDone; const tried = new Map();
  function run(ta) {
    let c = 90, m = 5; const coffee = [[0, c]], milk = [[0, m]];
    for (let t = 0; t < ta; t++) { c -= 0.0115 * (c - 22); m -= 0.13 * (m - 22); coffee.push([t + 1, c]); milk.push([t + 1, m]); }
    let x = (300 * c + 50 * m) / 350; const mixed = [[ta, x]];
    for (let t = ta; t < 30; t++) { x -= 0.0115 * (x - 22); mixed.push([t + 1, x]); }
    return { coffee, milk, mixed, final: x };
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const R = run(tAdd), { scene, plot } = P.split(w, h, 0.55, 30);
    P.title(g, api, `milk in at minute ${tAdd} · drinking temperature ${R.final.toFixed(2)} °C`);
    P.plot(g, api, { ...scene, x0: scene.x0 + 40, y0: scene.y0 + 18, y1: scene.y1 - 26 }, {
      xlim: [0, 30], ylim: [0, 92], xlabel: "minutes", ylabel: "temperature (°C)", legend: "right",
      vlines: [{ v: tAdd, col: "c4" }], hlines: [{ v: 22, col: "muted" }],
      series: [{ pts: R.coffee, col: "c1", label: "coffee alone" }, { pts: R.milk, col: "c2", label: "milk alone" }, { pts: R.mixed, col: "c3", width: 3, label: "coffee with milk" }],
    });
    const best = tried.size ? Math.max(...tried.values()) : 0;
    P.plot(g, api, plot, {
      xlim: [0, 30], ylim: [61, 63.5], xlabel: "minute the milk goes in", ylabel: "temperature when you drink (°C)",
      series: [{ pts: [...tried].sort((a, b) => a[0] - b[0]), col: "c3", line: true, dots: true, r: 3.5 }, { pts: [...tried].filter(([, v]) => v === best), col: "c4", dots: true, r: 5 }],
    });
  });
  function update() {
    const R = run(tAdd); tried.set(tAdd, R.final); cv.redraw();
    api.status(`pour at minute ${tAdd}\ncoffee ${R.coffee[R.coffee.length - 1][1].toFixed(1)} °C + milk ${R.milk[R.milk.length - 1][1].toFixed(1)} °C → mix ${R.mixed[0][1].toFixed(1)} °C\nat 30 minutes: ${R.final.toFixed(2)} °C`);
    if (!reached && tried.size >= 4 && tried.has(0) && tAdd === 30) {
      reached = true;
      api.explain("Milk last", `<p>Pouring at the start gives <b>${tried.get(0).toFixed(2)} °C</b>; pouring at the end gives <b>${R.final.toFixed(2)} °C</b>. Every minute you wait helps a little, with diminishing returns.</p><p>Two effects compete. Unmixed coffee is hotter, so it loses heat faster. But the cold milk warms from 5 °C toward the room while it waits, and with these numbers that gain wins. Change the milk's starting temperature or the room, and the answer can change, which is why you model it instead of guessing.</p>`);
      api.done("Found the best moment to add the milk");
    }
  }
  api.slider("Pour the milk at minute", { min: 0, max: 30, step: 1, value: tAdd, format: (v) => v }, (v) => { tAdd = v; update(); });
  update();
  api.explain("How to read this", "<p>Left: the coffee and the milk on their own until you pour, then the mixture. Right: the drinking temperature for every pouring time you try.</p><p>Try pouring first, last and a few times between, then settle on the best.</p>");
});
