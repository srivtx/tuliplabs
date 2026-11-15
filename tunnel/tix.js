/* The Ticketmaster unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   onsale(o)   10:00, a big show goes on sale: 100,000 fans for 20,000 seats, and the booking servers can hold 2,000
               shoppers at once. The waiting room opened at 9:30; bots join the moment it opens, people over the half
               hour, and more keep coming after 10:00. `door` is how the waiting room lets people through (everyone at
               once, a fixed rate, or one in each time a shopper leaves) and `line` is the order of everyone already
               waiting at 10:00 (the order they came, or shuffled). Reports error pages, when it sells out, and the
               share of seats the bots got.
   hold(o)     the same onsale through a well-run waiting room. A shopper picks two seats; they're kept for them for
               `mins` minutes while they pay. `keep` is how: a hold with an expiry, or a database lock held until they
               pay (a transaction open the whole time, one of the database's 400 connections). Reports buyers whose
               seats ran out mid-payment, error pages, and when it sells out.
   seatmap(o)  ten minutes in the middle of the onsale: 1,000 shoppers picking seats from the seat map. The map is
               read from the database on every refresh (`map` "live") or from a copy refreshed every 1 or 30 s, and a
               shopper either clicks two seats (`pick` "click") or chooses a section and the server finds the best two
               free seats in it ("best"). Reports how many tries clash ("sorry, those seats were just taken") and how
               many seat-map reads a second reach the database. */
(function (root) {
  "use strict";
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (R) => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const logn = (R, med, sig) => med * Math.exp(sig * gauss(R));
  function shuffle(R, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // The crowd, the same whatever the design: who joins when, who buys, and how long they shop
  const FANS = 100000, BOTS = 1500, SEATS = 20000, CAP = 2000;
  function crowd(seed, fans = FANS, bots = BOTS) {
    const R = rng(seed), F = [];
    for (let i = 0; i < bots; i++) F.push({ bot: true, join: -1800 + R() * 2, buy: true, shop: 50 + 30 * R(), pay: 30 + 20 * R() });
    for (let i = 0; i < fans - bots; i++) {
      // most are waiting by 10:00, crowding in towards it; the rest come in the minutes after
      const early = R() < 0.72, join = early ? -1800 * (1 - Math.sqrt(R())) : -180 * Math.log(1 - R());
      F.push({ bot: false, join, buy: R() < 0.65, shop: logn(R, 180, 0.4), pick: 20 + 40 * R(), pay: logn(R, 150, 0.55) });
    }
    return F;
  }

  // ------------------------------------------------------------------------------------------------ onsale --
  const DOORS = ["all", 50, 3, "swap"], LINES = ["came", "shuffle"];
  function onsale({ door = "all", line = "came", seed = 1, keep = 600, end = 7200, seats = SEATS, cap = CAP } = {}) {
    const F = crowd(seed), R = rng(seed * 31 + 7);
    const before = F.map((_, i) => i).filter((i) => F[i].join < 0), after = F.map((_, i) => i).filter((i) => F[i].join >= 0).sort((a, b) => F[a].join - F[b].join);
    if (line === "came") before.sort((a, b) => F[a].join - F[b].join); else shuffle(R, before);
    // the line: a queue of fan indices; late arrivals join the back as they come, and error pages send people back
    const Q = new Int32Array(F.length * 6);
    let qh = 0, qt = 0, ai = 0;
    for (const i of before) Q[qt++] = i;
    const leave = Array.from({ length: end + 2000 }, () => []), retry = Array.from({ length: end + 200 }, () => []);
    const errs = new Uint8Array(F.length), firstIn = new Float64Array(F.length).fill(-1);
    let inside = 0, sold = 0, botSeats = 0, errors = 0, gaveUp = 0, soldOut = null, admitted = 0, peakErr = 0;
    const series = []; // [t, inside, waiting, sold, errors so far]
    const order = before.slice(0, 400).map((i) => (F[i].bot ? 1 : 0)); // the front of the line at 10:00, for the page
    for (let t = 0; t <= end; t++) {
      while (ai < after.length && F[after[ai]].join < t) Q[qt++] = after[ai++];
      for (const i of retry[t] || []) Q[qt++] = i;
      for (const i of leave[t]) {
        inside--;
        if (F[i].buy && sold + 2 <= seats) { sold += 2; if (F[i].bot) botSeats += 2; if (sold === seats && soldOut === null) soldOut = t; }
      }
      const waiting = qt - qh;
      let n = door === "all" ? waiting : door === "swap" ? Math.max(0, cap - inside) : Math.min(door, waiting);
      n = Math.min(n, waiting);
      let errNow = 0;
      for (let k = 0; k < n; k++) {
        const i = Q[qh++];
        if (inside >= cap) {
          errors++; errNow++;
          if (++errs[i] < 5 && t + 60 <= end) retry[t + 60].push(i); else gaveUp++;
          continue;
        }
        inside++; admitted++;
        if (firstIn[i] < 0) firstIn[i] = t;
        const stay = Math.round(F[i].buy ? F[i].shop : keep);
        leave[Math.min(end + 1999, t + Math.max(1, stay))].push(i);
      }
      peakErr = Math.max(peakErr, errNow);
      if (t % 10 === 0) series.push([t, inside, qt - qh, sold, errors]);
      if (soldOut !== null && t >= soldOut + 30) break;
    }
    return { door, line, errors, gaveUp, peakErr, soldOut, sold, botShare: sold ? botSeats / sold : 0, botSeats, admitted, series, order, cap, seats, fans: F.length, bots: F.filter((f) => f.bot).length };
  }

  // -------------------------------------------------------------------------------------------------- hold --
  const KEEPS = ["lock", "hold"], MINS = [2, 5, 10, 30];
  function hold({ keep = "hold", mins = 10, seed = 1, end = 7200, seats = SEATS, cap = CAP, conns = 400 } = {}) {
    const F = crowd(seed), R = rng(seed * 31 + 7), lim = mins * 60;
    const before = shuffle(R, F.map((_, i) => i).filter((i) => F[i].join < 0)), after = F.map((_, i) => i).filter((i) => F[i].join >= 0).sort((a, b) => F[a].join - F[b].join);
    const Q = [...before];
    let qh = 0, ai = 0;
    const ev = Array.from({ length: end + 4000 }, () => []); // things that happen at second t: [kind, fan]
    let inside = 0, sold = 0, held = 0, heldIdle = 0, errors = 0, kicked = 0, payers = 0, paid = 0, soldOut = null, sold99 = null, empty = 0, open = 0, peakOpen = 0, peakIdle = 0;
    const series = []; // [t, sold, held by payers, held by people who left, open transactions]
    const pays = []; // every buyer's time to pay, for the page
    const tries = new Uint8Array(F.length);
    const at = (t, x) => ev[Math.min(end + 3999, Math.max(0, Math.round(t)))].push(x);
    for (let t = 0; t <= end; t++) {
      while (ai < after.length && F[after[ai]].join < t) Q.push(after[ai++]);
      for (const [k, i] of ev[t]) {
        const f = F[i];
        if (k === "pick") {
          // the shopper picks two seats: are any free right now (not sold, not held)?
          // nothing free (every seat is sold or held): "seats may come back, hold on", and look again in 30 s, ten times
          if (sold + held + 2 > seats) { if (++tries[i] <= 10 && sold < seats) { empty++; at(t + 30, ["pick", i]); } else inside--; continue; }
          if (keep === "lock" && open >= conns) { errors++; at(t + 20, ["pick", i]); continue; } // no connection: an error page, try again
          held += 2; if (keep === "lock") { open++; peakOpen = Math.max(peakOpen, open); }
          if (f.buy) { payers++; pays.push(f.pay); if (f.pay <= lim) at(t + f.pay, ["paid", i]); else at(t + lim, ["kick", i]); }
          else { heldIdle += 2; peakIdle = Math.max(peakIdle, heldIdle); at(t + lim, ["lapse", i]); }
        } else if (k === "paid") {
          held -= 2; sold += 2; paid++; inside--; if (keep === "lock") open--;
          if (sold >= seats && soldOut === null) soldOut = t;
          if (sold >= 0.99 * seats && sold99 === null) sold99 = t;
        } else if (k === "kick") { held -= 2; kicked++; inside--; if (keep === "lock") open--; }
        else if (k === "lapse") { held -= 2; heldIdle -= 2; inside--; if (keep === "lock") open--; }
      }
      // the waiting room lets one in for each one out
      while (inside < cap && qh < Q.length) { const i = Q[qh++]; inside++; at(t + (F[i].bot ? 2 : F[i].pick), ["pick", i]); }
      if (t % 10 === 0) series.push([t, sold, held - heldIdle, heldIdle, open]);
      if (soldOut !== null && t >= soldOut + 30) break;
    }
    return { keep, mins, errors, kicked, payers, paid, kickShare: payers ? kicked / payers : 0, soldOut, sold99, sold, empty, peakOpen, peakIdle, conns, series, pays, seats, cap };
  }

  // ----------------------------------------------------------------------------------------------- seatmap --
  // The venue: 1,000 blocks of 20 seats, 40 across and 25 deep; the front and the middle are the seats everyone wants
  const COLS = 40, ROWS = 25, PER = 20, SEC_W = 8, SEC_H = 5;
  const MAPS = ["live", 1, 30], PICKS = ["click", "best"];
  function venue(seed) {
    const R = rng(seed * 13 + 5), want = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) want.push(-r - 0.32 * Math.abs(c - (COLS - 1) / 2) + 0.6 * gauss(R));
    return want;
  }
  const secOf = (b) => Math.floor(Math.floor(b / COLS) / SEC_H) * (COLS / SEC_W) + Math.floor((b % COLS) / SEC_W);
  function seatmap({ map = "live", pick = "click", seed = 1, secs = 600, shoppers = 1000, poll = 2, dbCap = 200 } = {}) {
    const R = rng(seed), want = venue(seed), B = COLS * ROWS, NSEC = (COLS / SEC_W) * (ROWS / SEC_H);
    // by now the best third of the house has gone
    const rank = want.map((_, b) => b).sort((a, b) => want[b] - want[a]), free = new Array(B).fill(PER);
    rank.forEach((b, i) => { if (i < B * 0.3) free[b] = R() < 0.9 ? 0 : 2 * Math.floor(R() * 3); else if (i < B * 0.45) free[b] = 2 * Math.floor(R() * 8); });
    const start = free.slice();
    // each section's blocks, best first; the sections, by their best block
    const secBlocks = Array.from({ length: NSEC }, () => []);
    for (const b of rank) secBlocks[secOf(b)].push(b);
    const secRank = [...Array(NSEC).keys()].sort((a, b) => want[secBlocks[b][0]] - want[secBlocks[a][0]]);
    // what a shopper's screen showed: the map as it was when it last refreshed (every `poll` s), and, from a copy,
    // as it was when the copy was last made
    const snaps = [start.slice()];
    const seenAt = (tt) => { tt = Math.max(0, tt); if (map !== "live") tt = Math.floor(tt / map) * map; return snaps[Math.min(snaps.length - 1, Math.floor(tt))]; };
    // each shopper: look at the map, think, try; a clash sends them back to look again
    const ev = Array.from({ length: secs * 10 + 4000 }, () => []), at = (t, x) => ev[Math.min(ev.length - 1, Math.round(t * 10))].push(x);
    const think = () => (pick === "click" ? logn(R, 9, 0.35) : logn(R, 4, 0.35));
    let tries = 0, clashes = 0, got = 0, picking = 0, reads = 0;
    const takes = [], misses = [], perSec = []; // [t, block]
    const look = (t, s) => { picking++; at(t + think(), ["try", s]); };
    for (let s = 0; s < shoppers; s++) {
      // some are mid-way through paying when the ten minutes start; the rest are about to look at the map
      if (R() < 0.85) at(R() * 180, ["leave", s]); else look(R() * 4, s);
    }
    for (let k = 0; k < ev.length && k <= secs * 10; k++) {
      const t = k / 10;
      if (k % 10 === 0) {
        // the map is open on every picking shopper's screen and refreshes every `poll` seconds
        const r = map === "live" ? picking / poll : 1 / map;
        reads += r; perSec.push([t, tries, clashes, r]);
        snaps[t] = free.slice();
      }
      for (const [kind, s] of ev[k]) {
        if (kind === "leave") { look(t, s); continue; } // a shopper finished paying; a new one takes their place
        // try: what did the map show them, and is it still true?
        tries++;
        // they chose from the screen as it was a moment ago (3 s to find two seats and click, 1 s to tap a section),
        // and the screen itself was up to `poll` s old
        const seen = seenAt(t - (pick === "click" ? 3 : 1) - poll * R());
        let b = -1;
        if (pick === "click") {
          const vis = [];
          // the best few dozen pairs they can see, most often one near the top
          for (const x of rank) { if (seen[x] >= 2) vis.push(x); if (vis.length >= 60) break; }
          if (vis.length) { let i = 0; while (i < vis.length - 1 && R() < 0.6) i++; b = vis[i]; }
          if (b >= 0 && free[b] < 2) { misses.push([t, b]); b = -2; }
        } else {
          const vis = [];
          // the sections list how many seats each has left; people skip one showing only a few
          const left = (sc) => secBlocks[sc].reduce((a, x) => a + seen[x], 0);
          for (const sc of secRank) { if (left(sc) >= 20) vis.push(sc); if (vis.length >= 3) break; }
          if (!vis.length) for (const sc of secRank) if (left(sc) >= 2) { vis.push(sc); break; }
          if (vis.length) { let i = 0; while (i < vis.length - 1 && R() < 0.3) i++; const sc = vis[i]; b = secBlocks[sc].find((x) => free[x] >= 2); if (b === undefined) { misses.push([t, secBlocks[sc][0]]); b = -2; } }
        }
        if (b === -2) { clashes++; look(t, s); picking--; continue; }
        if (b < 0) { picking--; at(t + 30, ["leave", s]); continue; }
        free[b] -= 2; got++; takes.push([t, b]); picking--;
        at(t + 120 + 120 * R(), ["leave", s]);
      }
    }
    // clash blocks, for the page: which block the shopper wanted (the most wanted visible one, in click mode)
    return { map, pick, tries, clashes, clashShare: tries ? clashes / tries : 0, got, readsPerSec: reads / secs, dbCap, start, takes, misses, perSec, want, rank, secs };
  }

  const API = { rng, FANS, BOTS, SEATS, CAP, crowd, DOORS, LINES, onsale, KEEPS, MINS, hold, COLS, ROWS, PER, SEC_W, SEC_H, MAPS, PICKS, venue, secOf, seatmap };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.TIX = API;
})(typeof self !== "undefined" ? self : this);
