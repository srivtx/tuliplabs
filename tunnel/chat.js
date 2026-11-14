/* The WhatsApp unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   gateways(o)  500 million phones each keep one connection open to a gateway machine. A machine has 64 GB and 32 cores.
                A connection costs memory (a thread per connection: about 1 MB of stack; an event loop: about 25 KB),
                and each heartbeat (a tiny "still here?" every `hb` seconds) costs 200 µs of CPU. A phone that drops
                is noticed after 2 missed heartbeats. Pure arithmetic: capacity is a sum, not a queue.
   day(o)       one day of Alice writing to Bob, whose phone drops off now and then (lifts, tunnels, flat battery).
                When Bob's connection dies, the server only notices a minute later: messages pushed in that minute go
                into a dead socket. The server's design, three switches:
                  inbox   keep messages for a phone the server knows is offline, and deliver them when it's back
                  acks    keep every message in the inbox until Bob's phone acknowledges it, and resend what wasn't
                          (with no inbox there's nowhere to keep it, so acks alone change nothing)
                  ids     every message has an id, so a phone that gets one twice shows it once
                1 in 100 acks never makes it back (the phone got the message, the server never heard).
   group(o)     three friends planning dinner in a group. Each message reaches each phone with its own delay, and
                each phone's clock is a few seconds off. Three ways to order the chat on every phone:
                  arrival  the order this phone received them
                  clock    by the sender's clock, stamped on the message
                  seq      by a sequence number the group's chat server stamps as each message reaches it */
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

  // ------------------------------------------------------------------------------------------------ gateways --
  const GW = { ram: 64e9, cores: 32, price: 500, per: { threads: 1e6, loop: 25e3 }, hbCost: 200e-6, missed: 2 };
  const MODELS = ["threads", "loop"], HEARTBEATS = [10, 30, 60, 300];
  function gateways({ model = "threads", hb = 10, boxes = 100, phones = 500e6 } = {}) {
    const c = phones / boxes;
    return { perBox: c, ram: (c * GW.per[model]) / GW.ram, cpu: ((c / hb) * GW.hbCost) / GW.cores, detect: GW.missed * hb, cost: boxes * GW.price, boxes };
  }
  // the fewest machines that keep RAM and CPU under `under`
  const fewest = (model, hb, phones = 500e6, under = 0.8) => Math.ceil(Math.max((phones * GW.per[model]) / (GW.ram * under), (phones * GW.hbCost) / (hb * GW.cores * under)) - 1e-9);

  // ------------------------------------------------------------------------------------------------ Bob's day --
  function day({ inbox = false, acks = false, ids = false, seed = 1, minutes = 1440, rate = 0.5, upMean = 90, downMean = 20, detect = 1, ackLoss = 0.01 } = {}) {
    const R = rng(seed), A = rng(seed * 7919 + 13), ex = (m) => -Math.log(1 - R()) * m;
    // Bob's connection: online, then offline, and so on
    const periods = [];
    for (let t = 0, on = true; t < minutes; on = !on) { const len = Math.max(0.5, ex(on ? upMean : downMean)); periods.push({ a: t, b: Math.min(minutes, t + len), on }); t += len; }
    const at = (t) => { let lo = 0, hi = periods.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (periods[m].a <= t) lo = m; else hi = m - 1; } return lo; };
    const back = (t) => { for (let i = at(t) + 1; i < periods.length; i++) if (periods[i].on) return periods[i].a; return null; };
    const msgs = [];
    let lost = 0, twice = 0, waitMax = 0;
    for (let t = ex(1 / rate); t < minutes; t += ex(1 / rate)) {
      const p = periods[at(t)], m = { t, at: null, st: "now" };
      if (p.on) {
        m.at = t;
        if (acks && inbox && A() < ackLoss) { const r = back(t); if (r != null) { m.again = r; m.st = ids ? "dedup" : "twice"; } }
      } else {
        const dead = t < p.a + detect; // the socket is dead, but the server hasn't noticed yet
        const kept = inbox && (acks || !dead); // acks need somewhere to keep what isn't acked yet: the inbox
        if (kept) { const r = back(t); if (r == null) m.st = "waiting"; else { m.at = r; m.st = "later"; } }
        else m.st = "lost";
      }
      if (m.st === "lost") lost++;
      if (m.st === "twice") twice++;
      if (m.at != null) waitMax = Math.max(waitMax, m.at - t);
      msgs.push(m);
    }
    return { periods, msgs, lost, twice, waitMax, sent: msgs.length, drops: periods.filter((p) => !p.on).length };
  }

  // ------------------------------------------------------------------------------------------------ the group --
  const PEOPLE = ["Asha", "Ben", "Chen"];
  // who says what, and which message each one answers
  const SCRIPT = [
    { from: 0, text: "dinner tonight?" },
    { from: 1, text: "yes! where?", re: 0 },
    { from: 2, text: "I'm in", re: 0 },
    { from: 0, text: "the noodle place?", re: 1 },
    { from: 1, text: "perfect", re: 3 },
    { from: 2, text: "what time?", re: 3 },
    { from: 0, text: "7:30", re: 5 },
    { from: 2, text: "can we do 8?", re: 6 },
    { from: 1, text: "8 works for me", re: 7 },
    { from: 0, text: "8 it is 🍜", re: 8 },
  ];
  const RULES = ["arrival", "clock", "seq"];
  function group({ seed = 1, skew = [0, -5, 3], lat = 0.7, think = 1.6 } = {}) {
    const R = rng(seed), ex = (m) => -Math.log(1 - R()) * m, hop = () => 0.04 + ex(lat);
    const n = SCRIPT.length, sent = [], srv = [], got = [];
    for (let i = 0; i < n; i++) {
      const s = SCRIPT[i];
      // you answer after you've seen the message you're answering
      const seen = s.re == null ? 0 : got[s.re][s.from];
      sent[i] = seen + 0.3 + ex(think);
      srv[i] = sent[i] + hop();
      got[i] = PEOPLE.map((_, m) => (m === s.from ? sent[i] : srv[i] + hop()));
    }
    const key = { arrival: (i, m) => got[i][m], clock: (i) => sent[i] + skew[SCRIPT[i].from], seq: (i) => srv[i] };
    const out = {};
    for (const rule of RULES) {
      const orders = PEOPLE.map((_, m) => SCRIPT.map((_, i) => i).sort((a, b) => key[rule](a, m) - key[rule](b, m)));
      // on each phone, every reply shown above the message it answers
      const early = orders.map((o) => SCRIPT.map((s, i) => i).filter((i) => SCRIPT[i].re != null && o.indexOf(i) < o.indexOf(SCRIPT[i].re)));
      const agree = orders.every((o) => o.join() === orders[0].join());
      out[rule] = { orders, early, agree, flips: early.reduce((a, e) => a + e.length, 0) };
    }
    return { rules: out, sent, srv, got };
  }

  const API = { rng, GW, MODELS, HEARTBEATS, gateways, fewest, day, PEOPLE, SCRIPT, RULES, group };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.CHAT = API;
})(typeof self !== "undefined" ? self : this);
