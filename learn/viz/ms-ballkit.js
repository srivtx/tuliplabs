/* Shared baseball model for the ModSim chapter 23 sims. Load with `await VIZ.lib("ms-ballkit")`.
   MSBALL.fly(speed, angle, drag, wallX) returns rows [t, x, y, vx, vy] from launch (1 m up) until
   the ball lands, or until it reaches x = wallX if one is given. Euler steps of 2 ms. */
(function () {
  "use strict";
  const m = 0.145, A = Math.PI * 0.0365 ** 2, k = (1.2 * 0.33 * A) / 2, g0 = 9.8;
  function fly(speed, angle, drag = true, wallX = null) {
    const c = drag ? k : 0, dt = 0.002, out = [];
    let x = 0, y = 1, vx = speed * Math.cos((angle * Math.PI) / 180), vy = speed * Math.sin((angle * Math.PI) / 180), t = 0;
    out.push([t, x, y, vx, vy]);
    while (t < 20) {
      const v = Math.hypot(vx, vy), nx = x + vx * dt, ny = y + vy * dt;
      if (wallX != null && nx >= wallX) { const f = (wallX - x) / (nx - x); out.push([t + f * dt, wallX, y + f * (ny - y), vx, vy]); break; }
      if (ny < 0) { const f = y / (y - ny); out.push([t + f * dt, x + f * (nx - x), 0, vx, vy]); break; }
      x = nx; y = ny; vx += ((-c * v * vx) / m) * dt; vy += (-g0 - (c * v * vy) / m) * dt; t += dt; out.push([t, x, y, vx, vy]);
    }
    return out;
  }
  const range = (speed, angle, drag) => { const R = fly(speed, angle, drag); return R[R.length - 1][1]; };
  window.MSBALL = { fly, range, m, k, g0 };
})();
