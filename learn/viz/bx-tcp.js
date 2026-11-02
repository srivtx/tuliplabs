/* Build your own X, chapter 19: reliable delivery over an unreliable network (the core of TCP).
   Each row is one packet's sequence number. Data packets fly left to right; acknowledgements fly back.
   The link drops packets at random. Three protocols:
     send and hope (like UDP), stop-and-wait (one packet at a time, resend on timeout),
     and a sliding window (keep several packets in flight; go back and resend on timeout).
   The "why": you can't make the network reliable, but numbering, acks and timeouts make delivery
   reliable end to end; a window keeps the pipe full instead of waiting a round trip per packet. */
VIZ.register("bx-tcp", async (api) => {
  const W = await api.world3d();
  const MSG = "RELIABLE", N = MSG.length, D = 5, TO = 2 * D + 2;
  const SX = -4.0, RX = 4.0, Y = (k) => 4.6 - k * 0.78;
  let mode = "gbn", loss = 0.25, win = 4, busy = false, best = {};
  let seed, t, flights, uid, base, next, sentAt, expected, got, sent, dropped;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function reset() {
    seed = 77123457 + Math.round(loss * 1000); t = 0; flights = []; uid = 0;
    base = 0; next = 0; sentAt = []; expected = 0; got = Array(N).fill(null); sent = 0; dropped = 0;
    W.clear();
    W.label("sl", "sender", [SX - 0.6, Y(-1) + 0.1, 0], { color: "muted", size: 0.3 });
    W.label("rl", "receiver", [RX + 0.6, Y(-1) + 0.1, 0], { color: "muted", size: 0.3 });
    W.label("ll", "the network: drops packets at random", [0, Y(-1) + 0.1, 0], { color: "muted", size: 0.26 });
    drawEnds();
  }
  function drawEnds() {
    for (let k = 0; k < N; k++) {
      const acked = mode !== "udp" && k < base, inflight = k < next && !acked;
      W.box("s" + k, { x: SX - 0.6, y: Y(k), z: 0, sx: 0.9, sy: 0.5, sz: 0.5, color: acked ? "c3" : inflight ? "c4" : "c5", opacity: acked || inflight ? 1 : 0.5, label: `#${k} ${MSG[k]}`, labelSize: 0.26, labelUp: -0.25,
        info: { title: `Packet #${k} at the sender`, html: "<p>Grey: not sent yet. Amber: sent, no acknowledgement yet, so the sender must keep a copy in case it has to resend. Green: acknowledged, so the copy can be thrown away.</p><p>The <b>sequence number</b> is what makes everything else possible: the receiver can put packets in order, spot gaps, and say exactly what it has.</p>" } });
      W.box("r" + k, { x: RX + 0.6, y: Y(k), z: 0, sx: 0.9, sy: 0.5, sz: 0.5, color: got[k] ? "c3" : "c5", opacity: got[k] ? 1 : 0.4, label: got[k] ? `#${k} ${got[k]}` : `#${k} ?`, labelSize: 0.26, labelUp: -0.25,
        info: { title: `Slot #${k} at the receiver`, html: "<p>Where packet #k ends up. The application only gets data once every slot before it is filled: TCP delivers a <b>stream</b>, in order, with no gaps.</p>" } });
    }
    if (mode !== "udp") {
      const lo = Math.min(base, N - 1), hi = Math.min(base + (mode === "saw" ? 1 : win), N) - 1;
      if (base < N) W.box("window", { x: SX - 0.6, y: (Y(lo) + Y(hi)) / 2, z: -0.4, sx: 1.25, sy: (hi - lo) * 0.78 + 0.7, sz: 0.1, color: "c2", opacity: 0.25,
        info: { title: "The send window", html: `<p>The sender may have at most ${mode === "saw" ? 1 : win} unacknowledged packet${mode === "saw" ? "" : "s"} in flight. With a window of 1, the link sits idle for a whole round trip after every packet. A bigger window keeps the pipe full.</p>` } });
      else if (W.has("window")) W.remove("window");
    }
  }
  function send(kind, seq) {
    const id = "f" + uid++, lost = rnd() < loss;
    const f = { id, kind, seq, t0: t, lostAt: lost ? t + 1 + Math.floor(rnd() * (D - 1)) : null };
    flights.push(f);
    const data = kind === "data";
    W.box(id, { x: data ? SX + 0.4 : RX - 0.4, y: Y(seq) + (data ? 0.1 : -0.14), z: 0.3, sx: data ? 0.55 : 0.35, sy: data ? 0.36 : 0.22, sz: 0.3, color: data ? "c4" : "c3", glow: 0.4, instant: true,
      label: data ? `#${seq} ${MSG[seq]}` : `ack ${seq}`, labelSize: 0.2, labelUp: data ? -0.18 : -0.11,
      info: data ? { title: `Data packet #${seq}`, html: "<p>Carries one piece of the message plus its sequence number. It might arrive, or it might be dropped by a busy router along the way. The sender can't tell, except by <b>not</b> hearing back.</p>" }
        : { title: `Acknowledgement: "I've got everything before #${seq}"`, html: "<p>A <b>cumulative</b> ack: it names the next packet the receiver expects. Even if an earlier ack was lost, a later one confirms everything before it.</p>" } });
    if (data) sent++;
  }
  function move(f) {
    const p = Math.min(1, (t - f.t0) / D), data = f.kind === "data";
    W.box(f.id, { x: data ? SX + 0.4 + (RX - SX - 0.8) * p : RX - 0.4 - (RX - SX - 0.8) * p });
  }
  function tick() {
    t++;
    const arrived = [];
    flights = flights.filter((f) => {
      if (f.lostAt !== null && t >= f.lostAt) {
        dropped++;
        W.box(f.id, { color: "bad", y: Y(f.seq) - 0.5, opacity: 0.6, glow: 0 });
        const id = f.id; setTimeout(() => W.remove(id), 500);
        return false;
      }
      if (t - f.t0 >= D) { W.remove(f.id); arrived.push(f); return false; }
      move(f);
      return true;
    });
    for (const f of arrived) {
      if (f.kind === "data") {
        if (mode === "udp") got[f.seq] = MSG[f.seq];
        else {
          if (f.seq === expected) { got[f.seq] = MSG[f.seq]; expected++; }
          send("ack", expected);
        }
      } else base = Math.max(base, f.seq);
    }
    if (mode === "udp") { if (next < N) { send("data", next); next++; } }
    else {
      if (base < next && t - sentAt[base] >= TO) next = base; // timeout: go back and resend
      if (next < Math.min(N, base + (mode === "saw" ? 1 : win))) { send("data", next); sentAt[next] = t; next++; }
    }
    drawEnds();
    const done = mode === "udp" ? next >= N && !flights.length : base >= N;
    return done;
  }
  async function run() {
    if (busy) return;
    busy = true;
    reset();
    while (!tick() && t < 400) await api.sleep(90);
    const intact = got.every((c, k) => c === MSG[k]);
    const name = mode === "udp" ? "send and hope" : mode === "saw" ? "stop-and-wait" : `sliding window (${win})`;
    best[mode] = { t, loss };
    api.status(`${name}, loss ${Math.round(loss * 100)}%\nreceived: "${got.map((c) => c || "_").join("")}" ${intact ? "(intact)" : "(damaged)"}\ntime: ${t} ticks   one-way delay: ${D} ticks   packets sent: ${sent} for ${N} of data   dropped: ${dropped}${best.saw && mode === "gbn" ? `\nstop-and-wait took ${best.saw.t} ticks at ${Math.round(best.saw.loss * 100)}% loss` : ""}`);
    if (mode === "udp") api.explain("Sent and hoped", `<p>${intact ? "Lucky: nothing was lost this time. Raise the loss and try again." : `Holes where packets were dropped, and <b>nobody knows</b>: the sender never hears back, the receiver can't tell a packet is missing until it's too late.`}</p><p>That's UDP. Fine for a video call (a lost frame is gone anyway), useless for a file. Try <b>stop-and-wait</b>.</p>`);
    else if (mode === "saw") api.explain("Reliable, but slow", `<p>Every packet arrived, in order, because each one was resent until it was acknowledged. But it took <b>${t} ticks</b>: after each packet, the sender sat idle for a whole round trip (${2 * D} ticks) waiting for the ack.</p><p>On a real link across an ocean, a round trip is ~100 ms, so stop-and-wait could send only 10 packets a second. Try the <b>sliding window</b>.</p>`);
    else {
      const faster = best.saw && best.saw.loss >= 0.2 && t < best.saw.t;
      api.explain(intact ? "Reliable and fast" : "Not yet", intact ? `<p>Several packets are in flight at once, so the link is busy instead of idle. When one is lost, a <b>timeout</b> fires and the sender goes back to it (go-back-N), resending it and everything after.</p><p>${t} ticks${best.saw ? ` against ${best.saw.t} for stop-and-wait` : ""}. Real TCP also grows and shrinks its window to match what the network can carry (congestion control), and resends early when duplicate acks pile up.</p>` : "<p>Run it to the end.</p>");
      if (intact && loss >= 0.2 && faster) api.done("Reliable delivery over a lossy link, faster than stop-and-wait");
      else if (intact && !best.saw) api.explain("Reliable and fast", "<p>Now compare: run <b>stop-and-wait</b> at the same loss (20% or more), then the window again.</p>");
    }
    busy = false;
  }
  api.seg([{ label: "send and hope", value: "udp" }, { label: "stop-and-wait", value: "saw" }, { label: "sliding window", value: "gbn" }], mode, (v) => { if (!busy) { mode = v; reset(); } });
  api.slider("Packet loss", { min: 0, max: 0.5, step: 0.05, value: loss, format: (v) => `${Math.round(v * 100)}%` }, (v) => { if (!busy) { loss = v; reset(); } });
  api.slider("Window size", { min: 2, max: 8, step: 1, value: win }, (v) => { if (!busy) { win = v; reset(); } });
  api.button("Send the message", run, { primary: true });
  W.camera({ target: [0, 2.2, 0], dist: 16.5, theta: 0, phi: 1.45, instant: true });
  api.hud("one row per sequence number · amber = data · green = ack · red = dropped");
  reset();
  api.explain("How to read this", "<p>The sender (left) wants to deliver the word <b>RELIABLE</b>, one letter per packet. The network in the middle drops packets at random. Each row is one packet's sequence number.</p><p>Try the three protocols. Your goal: deliver it intact over a link losing 20% or more, using a window, faster than stop-and-wait.</p>");
});
