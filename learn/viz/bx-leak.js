/* Build your own X, chapter 51: Doormat, sign-up for a SaaS app.
   Twelve people have signed up. Then the database leaks, as databases do, and an attacker with a list
   of common passwords tries to read every account. How the server stored the passwords decides how
   much work that takes:
     plain text      nothing to do: every password is right there;
     SHA-256         hash each word on the list once, then look every account up (and two people with
                     the same password have the same hash, for everyone to see);
     SHA-256 + salt  every account has its own salt, so the list must be hashed again for each one;
     slow + salt     PBKDF2 with 600,000 rounds: every single guess costs 600,000 hashes.
   Every hash here is real (Web Crypto). The cheap attacks really run; the slow one is timed on one
   guess and multiplied by the exact number of guesses it needs, because it would take minutes.
   The honest lesson is at the end: slow hashing buys time, but "password1" is on every list, which
   is why a sign-up form refuses it. */
VIZ.register("bx-leak", async (api) => {
  const W = await api.world3d();
  api.wide();
  const ROUNDS = 600000;
  // the attacker's list: the most common passwords first, as real lists are ordered
  const WORDS = ("123456 password 123456789 12345678 12345 qwerty abc123 password1 111111 1234567 iloveyou 123123 dragon sunshine " +
    "princess letmein monkey football 654321 qwerty123 000000 baseball welcome shadow master superman 1q2w3e4r michael " +
    "trustno1 jordan23 hunter2 freedom whatever starwars charlie 666666 qazwsx batman zaq12wsx passw0rd login admin " +
    "solo 7777777 hello killer ashley bailey access flower mustang sunshine1 monkey123 letmein1 football1 iloveyou1 " +
    "dragon1 princess1 password123 admin123 welcome1 qwertyuiop asdfghjkl 987654321 1qaz2wsx michelle jessica pepper " +
    "daniel ginger joshua cheese amanda summer love hockey ranger thomas soccer tigger buster robert harley").split(" ");
  const PEOPLE = [
    ["ana", "password1"], ["ben", "sunshine1"], ["chloe", "sunshine1"], ["dev", "qwerty123"],
    ["eli", "iloveyou"], ["fay", "plum-otter-lantern-41"], ["gus", "letmein"], ["hana", "dragon"],
    ["ivo", "9fK#2qLm!x7Rv"], ["jun", "football"], ["kai", "monkey123"], ["lea", "cobalt fern harbour jam"],
  ];
  const MODES = {
    plain: { label: "plain text", why: "<p>The password itself goes in the table. Anyone who reads the table (an attacker, a backup in the wrong place, a curious employee) can sign in as anyone, and on every other site where that person used the same password.</p>" },
    sha: { label: "SHA-256", why: "<p>A <b>hash</b> turns a password into a fixed-size fingerprint, and there's no way back. To sign in, the server hashes what you typed and compares fingerprints.</p><p>But the attacker can hash too. Hash every word on the list <b>once</b>, and every account in the table is one lookup away. And look at ben and chloe: the same password gives the same hash, so one crack reads both.</p>" },
    salt: { label: "SHA-256 + salt", why: "<p>A <b>salt</b> is a random value made for each account at sign-up, stored next to its hash, and hashed together with the password. Ben's and chloe's hashes are now different, and the attacker can't hash the list once for everyone: every account needs the whole list hashed again with its own salt.</p><p>But SHA-256 is <i>fast</i>: it was made for checking files, and a computer does millions per second. So this only multiplies the work by the number of accounts.</p>" },
    slow: { label: "slow hash + salt", why: `<p><b>PBKDF2</b> hashes the password and salt, then hashes the result again, ${ROUNDS.toLocaleString("en")} times. Signing in costs the server one slow hash, which nobody notices. The attacker pays it for <b>every guess</b>, for every account.</p><p>This is how a password should be stored: a salt, and a deliberately slow hash (PBKDF2, scrypt, bcrypt or Argon2).</p>` },
  };
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const enc = new TextEncoder();
  const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  async function pbkdf2(pw, saltHex) {
    const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const salt = new Uint8Array(saltHex.match(/../g).map((x) => parseInt(x, 16)));
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ROUNDS, hash: "SHA-256" }, key, 256));
  }
  const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
  const short = (h) => h.slice(0, 10) + "…";

  let mode = "sha", rows = [], busy = false, leaked = new Set(api.wasDone ? ["sha", "slow"] : []), reached = api.wasDone, guessMs = null;

  // sign everyone up again, storing passwords the current way
  async function store() {
    rows = [];
    for (const [name, pw] of PEOPLE) {
      const r = { name, pw, salt: null, stored: pw, shown: pw };
      if (mode === "sha") { r.stored = await sha(pw); r.shown = short(r.stored); }
      if (mode === "salt") { r.salt = newSalt(); r.stored = await sha(r.salt + pw); r.shown = `${r.salt.slice(0, 4)}… ${short(r.stored)}`; }
      if (mode === "slow") { r.salt = newSalt(); r.stored = "(slow)"; r.shown = `${r.salt.slice(0, 4)}… ${ROUNDS / 1000}k rounds`; }
      rows.push(r);
    }
    draw();
  }
  const yOf = (i) => 3.0 - i * 0.52;
  function draw(result) {
    W.box("db", { x: -2.6, y: 0.15, z: -0.3, sx: 6.0, sy: 6.6, sz: 0.1, color: "c5", opacity: 0.25, instant: true, label: "users table", labelSize: 0.22, labelUp: 3.2,
      info: { title: "The users table", html: "<p>One row per account: the email, and whatever the server chose to keep for the password. Assume this table will leak one day. Companies far bigger than yours have leaked theirs, through a stolen backup, a bug, or a laptop left on a train.</p>" } });
    rows.forEach((r, i) => {
      const res = result && result[i];
      const twin = mode === "sha" && rows.some((o, j) => j !== i && o.stored === r.stored);
      W.box("n" + i, { x: -4.6, y: yOf(i), z: 0, sx: 1.4, sy: 0.4, sz: 0.4, color: "c2", opacity: 0.9, label: r.name, labelSize: 0.17, labelUp: -0.22, instant: true,
        info: { title: r.name, html: `<p>${r.name} signed up with the password <code>${r.pw.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code>. ${WORDS.includes(r.pw) ? "It's on the attacker's list of common passwords." : "It isn't on any list: it's long and random."}</p>` } });
      const label = res ? (res.found ? `cracked: ${r.pw}` : "not cracked") : r.shown;
      W.box("p" + i, { x: -1.6, y: yOf(i), z: 0, sx: 3.6, sy: 0.4, sz: 0.4, color: res ? (res.found ? "bad" : "ok") : twin ? "c4" : "c5", opacity: 0.85, label, labelSize: 0.15, labelUp: -0.22, instant: true,
        info: { title: twin ? "Two rows, one hash" : MODES[mode].label, html: twin ? "<p>Ben and chloe chose the same password, so with no salt they have the same hash. The attacker can see that without cracking anything, and cracking one cracks both.</p>" : MODES[mode].why } });
    });
    W.box("atk", { x: 4.2, y: 1.6, z: 0, sx: 1.8, sy: 1.4, sz: 1.0, color: "c1", opacity: 0.85, label: "attacker", labelSize: 0.22, instant: true,
      info: { title: "The attacker", html: "<p>They have a copy of the table and all the time in the world. They don't guess at random: they try a list of the passwords people really use, most common first. Lists built from earlier leaks hold millions.</p>" } });
    W.box("list", { x: 4.2, y: -1.0, z: 0, sx: 1.4, sy: 1.6, sz: 0.3, color: "c4", opacity: 0.8, label: `the list\n${WORDS.length} words`, labelSize: 0.18, labelUp: -1.1, instant: true,
      info: { title: "A list of common passwords", html: `<p>${WORDS.length} of the most used passwords, starting with <code>123456</code> and <code>password</code>. Real lists are far longer, but the cost works the same way: whatever the list, the way you stored the passwords multiplies the attacker's work.</p>` } });
  }

  async function leak() {
    if (busy) return;
    busy = true;
    for (let i = 0; i < rows.length; i++) W.box("c" + i, { x: -1.6, y: yOf(i), z: 0.45, sx: 3.0, sy: 0.3, sz: 0.1, color: "c4", glow: 0.4, instant: true });
    await api.sleep(150);
    rows.forEach((r, i) => W.box("c" + i, { x: 4.2, y: 1.6 + (i - 6) * 0.05, z: 0.6, sx: 0.8, sy: 0.2 }));
    await api.sleep(700);
    rows.forEach((r, i) => W.remove("c" + i));
    W.flash("atk");
    const t0 = performance.now();
    let hashes = 0, guesses = 0, result, timeText;
    if (mode === "plain") {
      result = rows.map(() => ({ found: true }));
      timeText = "no time at all: the passwords were sitting in the table";
    } else if (mode === "sha") {
      // hash the list once, then every account is a lookup
      const table = new Map();
      for (const w of WORDS) { table.set(await sha(w), w); hashes++; }
      result = rows.map((r) => ({ found: table.has(r.stored) }));
      guesses = hashes;
      timeText = `${(performance.now() - t0).toFixed(0)} ms, measured here`;
    } else if (mode === "salt") {
      result = [];
      for (const r of rows) {
        let found = false;
        for (const w of WORDS) { hashes++; if ((await sha(r.salt + w)) === r.stored) { found = true; break; } }
        result.push({ found });
      }
      guesses = hashes;
      timeText = `${(performance.now() - t0).toFixed(0)} ms, measured here`;
    } else {
      // one real guess, timed; the full attack would take minutes, so it is counted, not run
      if (guessMs == null) { const t = performance.now(); await pbkdf2("guess", newSalt()); guessMs = performance.now() - t; }
      result = rows.map((r) => { const k = WORDS.indexOf(r.pw); guesses += k < 0 ? WORDS.length : k + 1; return { found: k >= 0 }; });
      hashes = guesses * ROUNDS;
      const sec = (guesses * guessMs) / 1000;
      timeText = `about ${sec < 120 ? sec.toFixed(0) + " s" : (sec / 60).toFixed(0) + " min"} on this computer (one guess took ${guessMs.toFixed(0)} ms here, times ${guesses.toLocaleString("en")} guesses)`;
    }
    draw(result);
    const read = result.filter((x) => x.found).length;
    api.hud(`<b>${read} of ${rows.length}</b> read · <b>${hashes.toLocaleString("en")}</b> hashes`);
    api.status(`${MODES[mode].label}: the attacker read ${read} of ${rows.length} accounts.\nHashes computed: ${hashes.toLocaleString("en")}.\nTime: ${timeText}.`);
    leaked.add(mode);
    if (mode === "slow") api.explain("Slow, and still not enough on its own", `<p>${hashes.toLocaleString("en")} hashes for ${WORDS.length} words: that's what the slow hash bought. The same multiplier applies to a list of millions and a table of millions of users, and to whatever hardware the attacker owns.</p><p>But look at who was cracked anyway: everyone whose password is on the list. Fay, ivo and lea were safe in every mode but the first. So a sign-up form also <b>refuses</b> passwords that are short or common. That's the server's job, not the form's, and it's what you'll build.</p>`);
    else if (mode === "sha") api.explain("One list, every account", "<p>The attacker hashed the list once and looked every row up. Notice ben and chloe's identical hashes before the attack even ran. Now try <b>SHA-256 + salt</b> and <b>slow hash + salt</b>, and compare the hashes computed.</p>");
    if (!reached && leaked.has("sha") && leaked.has("slow")) { reached = true; api.done("You've seen why passwords are stored salted and slow, and why weak ones are refused at the door"); }
    busy = false;
  }

  api.seg(Object.entries(MODES).map(([value, m]) => ({ label: m.label, value })), mode, async (m) => {
    if (busy) return;
    mode = m;
    await store();
    api.hud(`<b>${MODES[mode].label}</b> · 12 people signed up`);
    api.status(`Stored as ${MODES[mode].label}. Click a row to see what's kept, or leak the table.`);
    api.explain(MODES[mode].label, MODES[mode].why);
  });
  api.button("Leak the database", leak, { primary: true });
  api.button("Sign everyone up again", () => { if (!busy) { store(); api.hud(`<b>${MODES[mode].label}</b> · 12 people signed up`); } });
  await store();
  // the whole table and the attacker in view, with room above it for the HUD; further back on a phone
  const wide = api.view.clientWidth || 640;
  W.camera({ target: [0, 0.6, 0], dist: 13 * Math.max(1, 640 / wide), theta: 0, phi: 1.5, instant: true });
  api.hud(`<b>${MODES[mode].label}</b> · 12 people signed up`);
  api.status("Twelve people have signed up. Pick how the server stores their passwords, then leak the table.");
  api.explain("How to read this", "<p>Left: the users table, as the server stored it. Right: an attacker who has stolen a copy, with a list of common passwords. Every hash here is real, computed in your browser. Click any block to see why.</p>");
});
