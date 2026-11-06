/* Shared glucose minimal-model pieces for ModSim chapters 17 and 18.
   The data are the chapters' synthetic FSIGT measurements (glucose mg/dL, insulin µU/mL).
   run({G0, k1, k2, k3, dt, hold}) takes Euler steps of dt minutes from 0 to 182:
     dG/dt = −k1·(G − Gb) − X·G,   dX/dt = k3·(I(t) − Ib) − k2·X
   with I(t) interpolated between measurements, or held at the last one when hold is true. */
(function () {
  "use strict";
  const T = [0, 2, 4, 6, 8, 10, 12, 14, 16, 19, 22, 27, 32, 42, 52, 62, 72, 82, 92, 102, 122, 142, 162, 182];
  const GLU = [92, 278, 269, 254, 240, 232, 224, 212, 195, 178, 168, 153, 130, 118, 101, 95, 91, 89, 90, 92, 87, 94, 86, 91];
  const INS = [11.0, 109.9, 131.0, 120.2, 99.3, 77.9, 59.7, 45.5, 34.9, 24.4, 18.3, 13.6, 11.9, 11.1, 11.0, 11.0, 11, 11, 11, 11, 11, 11, 11, 11];
  const Gb = 92, Ib = 11;
  function insulin(t, hold) {
    if (t >= T[T.length - 1]) return INS[INS.length - 1];
    let k = 0; while (T[k + 1] <= t) k++;
    if (hold) return INS[k];
    const f = (t - T[k]) / (T[k + 1] - T[k]); return INS[k] + f * (INS[k + 1] - INS[k]);
  }
  function run({ G0 = 290, k1 = 0.03, k2 = 0.02, k3 = 1e-5, dt = 1, hold = false }) {
    let G = G0, X = 0, t = 0; const out = [[0, G, X]];
    const n = Math.round(182 / dt);
    for (let s = 0; s < n; s++) {
      const dG = -k1 * (G - Gb) - X * G, dX = k3 * (insulin(t, hold) - Ib) - k2 * X;
      G += dG * dt; X += dX * dt; t = (s + 1) * dt; out.push([t, G, X]);
    }
    return out;
  }
  // value of a run at time t, by linear interpolation between its steps
  function at(rows, t) {
    let k = 0; while (k + 1 < rows.length && rows[k + 1][0] <= t) k++;
    if (k + 1 >= rows.length) return rows[k][1];
    const f = (t - rows[k][0]) / (rows[k + 1][0] - rows[k][0]); return rows[k][1] + f * (rows[k + 1][1] - rows[k][1]);
  }
  // RMS error against the glucose data, skipping t = 0 (the injection hasn't mixed in yet)
  function rms(rows) { let s = 0; for (let i = 1; i < T.length; i++) s += (at(rows, T[i]) - GLU[i]) ** 2; return Math.sqrt(s / (T.length - 1)); }
  window.MSGLU = { T, GLU, INS, Gb, Ib, insulin, run, at, rms };
})();
