/* Shared pieces for the ModSim world-population sims (chapters 5 to 9).
   CENSUS: world population in billions (rounded US Census Bureau estimates, as in chapter 5).
   sim(update, p0, t0, t1): run a yearly update and return [[year, pop]…].
   rms(run): root-mean-square error against the census years. */
(function () {
  "use strict";
  const CENSUS = [[1950, 2.558], [1955, 2.782], [1960, 3.043], [1965, 3.35], [1970, 3.712], [1975, 4.089], [1980, 4.452], [1985, 4.855],
    [1990, 5.288], [1995, 5.7], [2000, 6.09], [2005, 6.474], [2010, 6.864], [2015, 7.256], [2016, 7.333]];
  function sim(update, p0 = CENSUS[0][1], t0 = 1950, t1 = 2016) {
    const out = [[t0, p0]]; let p = p0;
    for (let t = t0; t < t1; t++) { p = p + update(p, t); out.push([t + 1, p]); }
    return out;
  }
  function rms(run) {
    const at = new Map(run.map(([t, p]) => [t, p]));
    let s = 0; for (const [t, p] of CENSUS) s += (at.get(t) - p) ** 2;
    return Math.sqrt(s / CENSUS.length);
  }
  // Grey lines from each model point to the census point: the errors you're adding up.
  function residuals(run) {
    const at = new Map(run.map(([t, p]) => [t, p]));
    return CENSUS.map(([t, p]) => ({ pts: [[t, p], [t, at.get(t)]], col: "c4", width: 1, alpha: 0.7 }));
  }
  window.MSPOP = { CENSUS, sim, rms, residuals };
})();
