/* The design studio's courses and levels. Each level is a board (360×240 unless it says w/h), some fixed HTML, and the
   CSS that draws the target. In a level's css, lines starting with "+" are the ones you write: your start is the css
   without them, and the target is the css with them. (Older levels give start and answer separately.)
   The match meter compares your pixels with the target's.
   rules: [label, regex on your CSS (or a function that returns true when it's right), true when the regex must NOT match] */
(() => {
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif', SERIF = "Georgia, serif", MONO = "ui-monospace, Menlo, monospace", UI = "system-ui, sans-serif";
// the Tulip Labs mark, one class per cell: p pink, d deep pink, y yellow, g green, k dark green
const TULIP = [".p.p.p.", "ppdpdpp", "ppyyypp", ".ppypp.", "g..k..g", "gg.k.gg", ".ggkgg."]
  .map((r) => [...r].map((c) => (c === "." ? "<i></i>" : `<i class="${c}"></i>`)).join("")).join("");
window.DZ = {
  base: (w, h) => `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}body{font:16px/1.4 Georgia,serif}`,
  courses: [
    { title: "Foundations", blurb: "Boxes, space and shape: the four ideas every layout is made of.", ids: ["dz01", "dz02", "dz03", "dz04", "dz09"] },
    { title: "Type", blurb: "Leading, tracking, scale and alignment: how the best magazines set words.", ids: ["dz10", "dz11", "dz12", "dz13", "dz14"] },
    { title: "Colour and light", blurb: "Tokens, themes, glows and shadows that feel like real depth.", ids: ["dz07", "dz15", "dz16", "dz17", "dz18"] },
    { title: "Layout systems", blurb: "Grids that hold a whole page: tiles, bento, app shells, twelve columns.", ids: ["dz05", "dz19", "dz20", "dz21", "dz22"] },
    { title: "Posters and patterns", blurb: "Swiss, Bauhaus and op art, drawn with nothing but CSS.", ids: ["dz06", "dz08", "dz23", "dz24", "dz25", "dz26"] },
    { title: "Real interfaces", blurb: "The parts of today's best apps: pricing, a command menu, toasts, a player, stats, chat.", ids: ["dz27", "dz28", "dz29", "dz30", "dz31", "dz32"] },
  ],
  levels: [
    {
      id: "dz01", title: "One square",
      brief: "Put one pink square, <b>120 × 120</b>, in the middle of the board, with <b>18px</b> corners.",
      idea: "Centre anything from its parent: <code>display: grid</code> and <code>place-items: center</code>.",
      html: `<div class="sq"></div>`,
      start: `body {
  background: #1b1420;
}

.sq {

}
`,
      answer: `body {
  background: #1b1420;
  display: grid;
  place-items: center;
}

.sq {
  width: 120px;
  height: 120px;
  background: #ff6fb5;
  border-radius: 18px;
}
`,
      rules: [["Centred by the parent with grid or flex", /display\s*:\s*(grid|flex)/], ["No margin tricks to centre it", /margin/, true]],
      hints: ["Give <code>.sq</code> a <code>width</code>, a <code>height</code> and <code>background: #ff6fb5</code>.",
        "Centre it from <code>body</code>: <code>display: grid; place-items: center;</code>",
        "Corners: <code>border-radius: 18px</code>."],
    },
    {
      id: "dz02", title: "Breathing room",
      brief: "The words are pressed against the card's edges. Give it <b>24px</b> of padding, <b>8px</b> between the title and the line, and <b>14px</b> corners.",
      idea: "Padding is space inside a box. <code>gap</code> is space between the things in it.",
      html: `<div class="card"><h1>Tulips</h1><p>Plant the bulbs in autumn, a hand deep, pointy end up.</p></div>`,
      start: `body {
  background: #efe6d6;
  display: grid;
  place-items: center;
}

.card {
  width: 250px;
  background: #fffaf2;
}

h1 {
  margin: 0;
  font-size: 26px;
  color: #2a2018;
}

p {
  margin: 0;
  font-size: 14px;
  color: #6a5a48;
}
`,
      answer: `body {
  background: #efe6d6;
  display: grid;
  place-items: center;
}

.card {
  width: 250px;
  background: #fffaf2;
  display: grid;
  gap: 8px;
  padding: 24px;
  border-radius: 14px;
}

h1 {
  margin: 0;
  font-size: 26px;
  color: #2a2018;
}

p {
  margin: 0;
  font-size: 14px;
  color: #6a5a48;
}
`,
      rules: [["Space inside with padding", /padding\s*:/], ["Space between with gap", /gap\s*:/], ["No fixed height on the card", /height\s*:/, true]],
      hints: ["Inside the card: <code>padding: 24px</code>.", "Make the card a grid so you can use <code>gap: 8px</code> between its children.", "Corners: <code>border-radius: 14px</code>."],
    },
    {
      id: "dz03", title: "A stack",
      brief: "Stack the three bars in a column <b>220px</b> wide with <b>12px</b> between them. The second is <b>70%</b> wide, the third <b>45%</b>.",
      idea: "<code>flex-direction: column</code> stacks children; <code>gap</code> spaces them evenly, no margins needed.",
      html: `<div class="list"><i></i><i></i><i></i></div>`,
      start: `body {
  background: #14231a;
  display: grid;
  place-items: center;
}

.list {

}

.list i {
  height: 36px;
  border-radius: 8px;
  background: #3faa52;
}

.list i:nth-child(2) {
  background: #a3d65f;
}

.list i:nth-child(3) {
  background: #ffd21f;
}
`,
      answer: `body {
  background: #14231a;
  display: grid;
  place-items: center;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 220px;
}

.list i {
  height: 36px;
  border-radius: 8px;
  background: #3faa52;
}

.list i:nth-child(2) {
  background: #a3d65f;
  width: 70%;
}

.list i:nth-child(3) {
  background: #ffd21f;
  width: 45%;
}
`,
      rules: [["Stacked with flex", /flex-direction\s*:\s*column/], ["Spaced with gap, not margins", /margin/, true]],
      hints: ["The bars are <code>&lt;i&gt;</code> tags, which sit in a line and ignore height. A flex parent fixes that.",
        "<code>.list { display: flex; flex-direction: column; gap: 12px; width: 220px; }</code>",
        "Widths in % are a share of the parent: <code>width: 70%</code>."],
    },
    {
      id: "dz04", title: "A top bar",
      brief: "Line the bar up in a row, centred top to bottom, <b>18px</b> apart, with <b>14px 18px</b> padding. The name sits left, everything else is pushed right.",
      idea: "In a flex row, <code>margin-right: auto</code> on one item eats the spare space and pushes the rest away.",
      html: `<nav class="bar"><b>Tulip</b><span>Learn</span><span>Play</span><span class="go">Start</span></nav>`,
      start: `body {
  background: #f4efe6;
  padding: 24px;
}

.bar {
  background: #fff;
  border-radius: 12px;
  font: 15px system-ui, sans-serif;
  color: #3a3530;
}

.bar b {
  font: 700 20px Georgia, serif;
  color: #d23f87;
}

.go {
  background: #1d1b17;
  color: #fff;
  padding: 8px 14px;
  border-radius: 8px;
}
`,
      answer: `body {
  background: #f4efe6;
  padding: 24px;
}

.bar {
  background: #fff;
  border-radius: 12px;
  font: 15px system-ui, sans-serif;
  color: #3a3530;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 14px 18px;
}

.bar b {
  font: 700 20px Georgia, serif;
  color: #d23f87;
  margin-right: auto;
}

.go {
  background: #1d1b17;
  color: #fff;
  padding: 8px 14px;
  border-radius: 8px;
}
`,
      rules: [["A flex row", /display\s*:\s*flex/], ["Pushed with an auto margin", /margin(-right|-left)?\s*:[^;}]*auto/], ["No spacer widths", /width\s*:/, true]],
      hints: ["<code>.bar { display: flex; align-items: center; gap: 18px; padding: 14px 18px; }</code>",
        "Push: <code>.bar b { margin-right: auto; }</code>"],
    },
    {
      id: "dz05", title: "Tile grid",
      brief: "Make a grid of <b>3 equal columns</b> and <b>2 rows</b>, <b>10px</b> apart, filling the board inside its padding. The yellow tile is two rows tall.",
      idea: "<code>fr</code> is a share of the free space, so <code>repeat(3, 1fr)</code> is three equal columns at any width.",
      html: `<div class="tiles"><i></i><i></i><i></i><i></i><i></i></div>`,
      start: `body {
  background: #101418;
  padding: 20px;
}

.tiles {
  height: 100%;
}

.tiles i {
  display: block;
  height: 40px;
  background: #2fb38f;
  border-radius: 10px;
}

.tiles i:nth-child(1) {
  background: #ffd21f;
}

.tiles i:nth-child(5) {
  background: #ff6fb5;
}
`,
      answer: `body {
  background: #101418;
  padding: 20px;
}

.tiles {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 10px;
}

.tiles i {
  display: block;
  background: #2fb38f;
  border-radius: 10px;
}

.tiles i:nth-child(1) {
  background: #ffd21f;
  grid-row: span 2;
}

.tiles i:nth-child(5) {
  background: #ff6fb5;
}
`,
      rules: [["A grid", /display\s*:\s*grid/], ["Columns in fr", /grid-template-columns\s*:[^;}]*fr/], ["No fixed tile sizes", /(width|height)\s*:\s*\d+px/, true]],
      hints: ["<code>.tiles { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; gap: 10px; }</code>",
        "Delete the tiles' fixed <code>height</code>: the grid sizes them now.", "Tall tile: <code>grid-row: span 2</code>."],
    },
    {
      id: "dz06", title: "Swiss poster",
      brief: "Finish the poster: a red sun <b>130px</b> wide, <b>24px</b> from the top and <b>28px</b> from the right. The word sits <b>24px</b> from the left and <b>14px</b> from the bottom.",
      idea: "<code>position: absolute</code> pins a box to the nearest positioned parent; <code>border-radius: 50%</code> makes a circle.",
      html: `<div class="poster"><b class="sun"></b><i></i><i></i><h1>Bloom</h1></div>`,
      start: `body {
  background: #f1ebdd;
}

.poster {
  position: relative;
  height: 100%;
}

.poster i {
  position: absolute;
  left: 0;
  height: 14px;
  background: #1d1b17;
}

.poster i:nth-of-type(1) {
  top: 40px;
  width: 180px;
}

.poster i:nth-of-type(2) {
  top: 66px;
  width: 120px;
}

.sun {

}

h1 {
  margin: 0;
  font: 400 64px/1 Georgia, serif;
  color: #1d1b17;
}
`,
      answer: `body {
  background: #f1ebdd;
}

.poster {
  position: relative;
  height: 100%;
}

.poster i {
  position: absolute;
  left: 0;
  height: 14px;
  background: #1d1b17;
}

.poster i:nth-of-type(1) {
  top: 40px;
  width: 180px;
}

.poster i:nth-of-type(2) {
  top: 66px;
  width: 120px;
}

.sun {
  position: absolute;
  top: 24px;
  right: 28px;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: #e2532c;
}

h1 {
  margin: 0;
  font: 400 64px/1 Georgia, serif;
  color: #1d1b17;
  position: absolute;
  left: 24px;
  bottom: 14px;
}
`,
      rules: [["A circle", /border-radius\s*:\s*50%/], ["Pinned with position: absolute", /\.sun[^}]*position\s*:\s*absolute/]],
      hints: ["<code>.sun { position: absolute; top: 24px; right: 28px; width: 130px; height: 130px; }</code>",
        "Round it: <code>border-radius: 50%</code>, and colour it <code>#e2532c</code>.", "The word: <code>position: absolute; left: 24px; bottom: 14px;</code>"],
    },
    {
      id: "dz07", title: "Colour tokens",
      brief: "Every colour here reads a token, but none are defined yet. Define them on <code>:root</code>: <span class=\"sw\" style=\"--s:#1b1420\">--paper #1b1420</span> <span class=\"sw\" style=\"--s:#2a1f30\">--card #2a1f30</span> <span class=\"sw\" style=\"--s:#fff3fa\">--ink #fff3fa</span> <span class=\"sw\" style=\"--s:#ff6fb5\">--accent #ff6fb5</span>",
      idea: "A token names a colour once. Change it in one place and the whole design follows; that's how light and dark themes work.",
      html: `<div class="card"><h1>Night garden</h1><p>Name a colour once, use it everywhere.</p><span>Open</span></div>`,
      start: `:root {

}

body {
  background: var(--paper);
  display: grid;
  place-items: center;
}

.card {
  width: 260px;
  padding: 22px;
  border-radius: 14px;
  background: var(--card);
  color: var(--ink);
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

p {
  margin: 0 0 16px;
  font-size: 14px;
  opacity: .75;
}

span {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--paper);
  font: 600 14px system-ui, sans-serif;
}
`,
      answer: `:root {
  --paper: #1b1420;
  --card: #2a1f30;
  --ink: #fff3fa;
  --accent: #ff6fb5;
}

body {
  background: var(--paper);
  display: grid;
  place-items: center;
}

.card {
  width: 260px;
  padding: 22px;
  border-radius: 14px;
  background: var(--card);
  color: var(--ink);
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

p {
  margin: 0 0 16px;
  font-size: 14px;
  opacity: .75;
}

span {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--paper);
  font: 600 14px system-ui, sans-serif;
}
`,
      rules: [["All four tokens defined", (css) => ["paper", "card", "ink", "accent"].every((t) => new RegExp("--" + t + "\\s*:").test(css))],
        ["Colours only through tokens", (css) => !/#[0-9a-f]{3,8}\b/i.test(css.replace(/:root\s*\{[^}]*\}/, ""))]],
      hints: ["A token looks like <code>--paper: #1b1420;</code> and lives inside <code>:root { }</code>.",
        "Add all four: <code>--paper</code>, <code>--card</code>, <code>--ink</code>, <code>--accent</code>."],
    },
    {
      id: "dz08", title: "Wet paint",
      brief: "Give the sign a border of <b>45°</b> stripes: yellow <code>#ffd21f</code> then black <code>#1d1b17</code>, each <b>16px</b> wide.",
      idea: "<code>repeating-linear-gradient</code> repeats colour stops, so hard stops at the same spot draw clean stripes.",
      html: `<div class="sign"><b>WET PAINT</b></div>`,
      start: `body {
  background: #1d1b17;
  display: grid;
  place-items: center;
}

.sign {
  width: 280px;
  height: 150px;
  padding: 12px;
  border-radius: 14px;
  background: #ffd21f;
}

.sign b {
  display: grid;
  place-items: center;
  height: 100%;
  border-radius: 6px;
  background: #ffd21f;
  color: #1d1b17;
  font: 800 34px system-ui, sans-serif;
  letter-spacing: .04em;
}
`,
      answer: `body {
  background: #1d1b17;
  display: grid;
  place-items: center;
}

.sign {
  width: 280px;
  height: 150px;
  padding: 12px;
  border-radius: 14px;
  background: repeating-linear-gradient(45deg, #ffd21f 0 16px, #1d1b17 16px 32px);
}

.sign b {
  display: grid;
  place-items: center;
  height: 100%;
  border-radius: 6px;
  background: #ffd21f;
  color: #1d1b17;
  font: 800 34px system-ui, sans-serif;
  letter-spacing: .04em;
}
`,
      rules: [["Stripes from a repeating gradient", /repeating-linear-gradient/]],
      hints: ["The stripes go on <code>.sign</code>'s background; the padding is what shows them.",
        "<code>repeating-linear-gradient(45deg, #ffd21f 0 16px, #1d1b17 16px 32px)</code>"],
    },
    // ---- from here on, each level's css marks the lines you write with a leading "+" (they're missing from your start)
    {
      id: "dz09", title: "Status pill",
      brief: "Make the status pill: a row with <b>10px</b> between dot and words, padding <b>10px 18px 10px 14px</b>, fully round ends, a hairline ring <code>#2a4a37</code>, and a soft halo round the dot.",
      idea: "<code>border-radius: 999px</code> rounds any box into a pill. A <code>box-shadow</code> with a spread and no blur draws a ring that takes up no space.",
      html: `<span class="pill"><i></i>All systems normal</span>`,
      css: `body {
  background: #0e1512;
  display: grid;
  place-items: center;
}

.pill {
+  display: inline-flex;
+  align-items: center;
+  gap: 10px;
+  padding: 10px 18px 10px 14px;
+  border-radius: 999px;
+  box-shadow: inset 0 0 0 1px #2a4a37;
  background: #16231d;
  color: #c9f2dc;
  font: 500 15px ${UI};
}

.pill i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3ddc84;
+  box-shadow: 0 0 0 4px rgba(61, 220, 132, .2);
}
`,
      rules: [["Fully round ends", /border-radius\s*:\s*\d{3,}px/], ["Rings drawn with box-shadow", /box-shadow/], ["No borders", /border\s*:/, true]],
      hints: ["The dot is an <code>&lt;i&gt;</code>, which ignores width until its parent is flex: <code>display: inline-flex; align-items: center; gap: 10px;</code>",
        "Ring: <code>box-shadow: inset 0 0 0 1px #2a4a37</code>. Halo: <code>box-shadow: 0 0 0 4px rgba(61, 220, 132, .2)</code> on the dot."],
    },
    {
      id: "dz10", title: "Kicker and headline",
      brief: "Set it like a magazine: the kicker in capitals tracked out to <b>.16em</b>; the headline with leading of <b>.98</b> and tracking of <b>−.025em</b>.",
      idea: "Big type needs <i>less</i> line height and slightly tighter letters; small labels need <i>more</i> letter spacing. That contrast is most of editorial style.",
      html: `<p class="kicker">Field notes · No. 12</p><h1>The quiet art of white space</h1>`,
      css: `body {
  background: #f5f1ea;
  color: #16130f;
  padding: 30px;
}

.kicker {
  margin: 0 0 14px;
  font: 600 11px ${MONO};
  color: #b4442a;
+  text-transform: uppercase;
+  letter-spacing: .16em;
}

h1 {
  margin: 0;
  max-width: 300px;
  font: 400 46px ${SERIF};
+  line-height: .98;
+  letter-spacing: -.025em;
}
`,
      rules: [["Capitals by text-transform, not typed", /text-transform\s*:\s*uppercase/],
        ["Headline leading under 1.1", (css) => { const m = css.match(/h1\s*\{[^}]*line-height\s*:\s*([\d.]+)/); return !!m && +m[1] < 1.1; }],
        ["Headline tracked in", /letter-spacing\s*:\s*-/]],
      hints: ["Kicker: <code>text-transform: uppercase; letter-spacing: .16em;</code>", "Headline: <code>line-height: .98; letter-spacing: -.025em;</code> (after the <code>font</code> line, which resets line height)."],
    },
    {
      id: "dz11", title: "A type scale",
      brief: "Every size is the one below it times <code>--r</code> (1.333). Body is <b>1 step</b> (<code>--base</code>), the subtitle <b>3 steps</b> up, the title <b>5 steps</b> up.",
      idea: "A scale is a ratio, not a list of numbers. Pick one ratio and every size on the page agrees with every other.",
      html: `<h1>Bloom</h1><h2>A field guide to tulips</h2><p>Every size on this page is the one below it times 1.333, a perfect fourth.</p>`,
      css: `:root {
  --base: 15px;
  --r: 1.333;
}

body {
  background: #ffffff;
  color: #1b1d22;
  padding: 26px 30px;
  font-family: ${SANS};
}

h1 {
  margin: 0;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -.03em;
+  font-size: calc(var(--base) * var(--r) * var(--r) * var(--r) * var(--r));
}

h2 {
  margin: 8px 0 14px;
  font-weight: 500;
  line-height: 1.2;
  color: #5a5f6b;
+  font-size: calc(var(--base) * var(--r) * var(--r));
}

p {
  margin: 0;
  max-width: 34ch;
  line-height: 1.5;
+  font-size: var(--base);
}
`,
      rules: [["Sizes come from the ratio", (css) => (css.match(/var\(--r\)/g) || []).length >= 6], ["No hand-typed font sizes", /font-size\s*:\s*\d/, true]],
      hints: ["Body: <code>font-size: var(--base)</code>. Each step up multiplies by <code>var(--r)</code> once more.",
        "Subtitle: <code>calc(var(--base) * var(--r) * var(--r))</code>. The title has four <code>* var(--r)</code>."],
    },
    {
      id: "dz12", title: "Swiss headline",
      brief: "International style: leading of <b>.84</b> and tracking of <b>−.05em</b> on the headline, a red disc <b>64px</b> wide pinned <b>24px</b> from the top right, and the small print set right, <b>24px</b> and <b>20px</b> from the bottom corner.",
      idea: "Swiss posters lean on one big grotesque, flush left and tight, with a single geometric shape for tension. Nothing decorative.",
      html: `<div class="p"><h1>form<br>follows<br>feeling</h1><b></b><p>Zürich<br>1957 – now</p></div>`,
      css: `body {
  background: #f2efe8;
}

.p {
  position: relative;
  height: 100%;
  padding: 20px 24px;
}

h1 {
  margin: 0;
  color: #111111;
  font: 700 58px ${SANS};
+  line-height: .84;
+  letter-spacing: -.05em;
}

b {
  position: absolute;
  background: #e3261b;
+  top: 24px;
+  right: 24px;
+  width: 64px;
+  height: 64px;
+  border-radius: 50%;
}

p {
  position: absolute;
  margin: 0;
  font: 500 11px/1.35 ${SANS};
  color: #111111;
+  right: 24px;
+  bottom: 20px;
+  text-align: right;
}
`,
      rules: [["Leading under 1", (css) => { const m = css.match(/h1\s*\{[^}]*line-height\s*:\s*([\d.]+)/); return !!m && +m[1] < 1; }], ["Tracked in", /letter-spacing\s*:\s*-/], ["A true circle", /border-radius\s*:\s*50%/]],
      hints: ["Headline: <code>line-height: .84; letter-spacing: -.05em;</code>", "Disc: <code>top: 24px; right: 24px; width: 64px; height: 64px; border-radius: 50%;</code>"],
    },
    {
      id: "dz13", title: "Hanging quote", pass: 98,
      brief: "Hang a big amber quote mark <code>#ffb547</code> outside the text: <b>3em</b> Georgia, upright, <b>.62em</b> to the left and <b>.22em</b> up, so the words keep a clean left edge. Set the citation upright too.",
      idea: "Hanging punctuation keeps the left edge of the text optically straight. A <code>::before</code> with <code>position: absolute</code> takes the mark out of the flow.",
      html: `<blockquote><p>Good design is quiet. You notice it the way you notice good air.</p><cite>Studio notebook, page 4</cite></blockquote>`,
      css: `body {
  background: #111111;
  color: #f4efe6;
  padding: 40px 36px 0 66px;
}

blockquote {
  margin: 0;
}

p {
  position: relative;
  margin: 0 0 16px;
  font: italic 400 25px/1.25 ${SERIF};
}

+p::before {
+  content: "“";
+  position: absolute;
+  left: -.62em;
+  top: -.22em;
+  font: 400 3em/1 ${SERIF};
+  color: #ffb547;
+}

cite {
  font: 600 11px ${MONO};
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #ffb547;
+  font-style: normal;
}
`,
      rules: [["The mark hangs outside the flow", /::before[^}]*position\s*:\s*absolute/], ["Citation set upright", /font-style\s*:\s*normal/]],
      hints: ["A new rule: <code>p::before { content: \"“\"; position: absolute; left: -.62em; top: -.22em; }</code>", "Size and colour it: <code>font: 400 3em/1 Georgia, serif; color: #ffb547;</code> (the <code>font</code> line also stands it upright).", "<code>&lt;cite&gt;</code> is italic by default; <code>font-style: normal</code> stands it up."],
    },
    {
      id: "dz14", title: "Numbers in columns",
      brief: "Right-align every column after the first, headers too, and give the numbers <b>tabular figures</b> so the digits line up.",
      idea: "Text aligns left, numbers align right. <code>font-variant-numeric: tabular-nums</code> gives every digit the same width, so prices stack like a ledger.",
      html: `<table><tr><th>Bulb</th><th>Qty</th><th>Price</th></tr><tr><td>Queen of Night</td><td>12</td><td>$18.40</td></tr><tr><td>Angélique</td><td>110</td><td>$4.05</td></tr><tr><td>Black Parrot</td><td>7</td><td>$111.90</td></tr></table>`,
      css: `body {
  background: #fbfaf7;
  color: #22201c;
  padding: 22px 28px;
  font: 14px ${UI};
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  padding: 0 0 10px;
  text-align: left;
  font: 600 10.5px ${MONO};
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #8a8478;
}

td {
  padding: 11px 0;
  border-top: 1px solid #e7e2d8;
}

+td + td,
+th + th {
+  text-align: right;
+  font-variant-numeric: tabular-nums;
+}
`,
      rules: [["Tabular figures", /tabular-nums/], ["Numbers aligned right", /text-align\s*:\s*right/]],
      hints: ["<code>td + td</code> picks every cell that has a cell before it, so every column but the first.",
        "<code>td + td, th + th { text-align: right; font-variant-numeric: tabular-nums; }</code>"],
    },
    {
      id: "dz15", title: "Two themes, one card",
      brief: "Both cards share every rule. Make the second one dark by changing <b>only its tokens</b> on <code>.dark</code>: <span class=\"sw\" style=\"--s:#15140f\">--bg #15140f</span> <span class=\"sw\" style=\"--s:#f3eee2\">--fg #f3eee2</span> <span class=\"sw\" style=\"--s:#8d887b\">--mute #8d887b</span> <span class=\"sw\" style=\"--s:#2c2a23\">--line #2c2a23</span>",
      idea: "A theme is a set of token values. Components never ask \"am I dark?\"; they just read <code>var(--bg)</code>, and the theme decides what that is.",
      html: `<div class="card"><b>Aa</b><p>Light</p></div><div class="card dark"><b>Aa</b><p>Dark</p></div>`,
      css: `body {
  background: #d9d4ca;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
}

.card {
  --bg: #fffdf8;
  --fg: #1d1b17;
  --mute: #8b8478;
  --line: #e4ddcf;
  width: 140px;
  padding: 18px;
  border-radius: 14px;
  background: var(--bg);
  color: var(--fg);
  box-shadow: inset 0 0 0 1px var(--line);
}

+.dark {
+  --bg: #15140f;
+  --fg: #f3eee2;
+  --mute: #8d887b;
+  --line: #2c2a23;
+}

b {
  display: block;
  font: 400 56px/1 ${SERIF};
}

p {
  margin: 10px 0 0;
  font: 600 11px ${MONO};
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--mute);
}
`,
      rules: [["The dark card only changes tokens", (css) => { const m = css.match(/\.dark\s*\{([^}]*)\}/); return !!m && m[1].split(";").map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith("--")); }]],
      hints: ["Add a rule for <code>.dark</code> with four lines, each starting with <code>--</code>.", "<code>.dark { --bg: #15140f; --fg: #f3eee2; --mute: #8d887b; --line: #2c2a23; }</code>"],
    },
    {
      id: "dz16", title: "Aurora", pass: 92,
      brief: "Light the hero with three soft glows: violet <code>#7b5cff</code> from the top right, pink <code>#ff5fa8</code> from the top left, teal <code>#1fd1c1</code> from the bottom. Each fades to transparent at <b>70%</b>.",
      idea: "Stack several <code>radial-gradient</code>s in one <code>background</code>, each fading to <code>transparent</code>, and they blend like coloured lights.",
      html: `<div class="hero"><p>New</p><h1>Ship it<br>softly.</h1></div>`,
      css: `body {
  background: #07060c;
}

.hero {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 26px;
+  background:
+    radial-gradient(60% 80% at 90% 0%, #7b5cff, transparent 70%),
+    radial-gradient(50% 70% at 0% 0%, #ff5fa8, transparent 70%),
+    radial-gradient(80% 60% at 70% 100%, #1fd1c1, transparent 70%);
}

p {
  margin: 0 0 10px;
  font: 600 11px ${MONO};
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, .7);
}

h1 {
  margin: 0;
  color: #ffffff;
  font: 700 46px/.95 ${SANS};
  letter-spacing: -.04em;
}
`,
      rules: [["Three light sources", (css) => (css.match(/radial-gradient/g) || []).length >= 3]],
      hints: ["One glow: <code>radial-gradient(60% 80% at 90% 0%, #7b5cff, transparent 70%)</code>. The first numbers are its size, <code>at</code> is where it sits.",
        "Pink: <code>50% 70% at 0% 0%</code>. Teal: <code>80% 60% at 70% 100%</code>. Separate the three with commas."],
    },
    {
      id: "dz17", title: "Elevation", tol: 8,
      brief: "Three cards, three heights. Each shadow has two layers: a tight one for contact and a soft one for lift. Use <code>rgba(16, 24, 40, …)</code>; the hints have the exact values.",
      idea: "Real shadows are two shadows: a small dark one where the object touches, and a big faint one from the light around it. A negative spread keeps the soft one tucked under the card.",
      html: `<i>1</i><i>2</i><i>3</i>`,
      css: `body {
  background: #e4e8ef;
  display: flex;
  gap: 26px;
  align-items: center;
  justify-content: center;
}

i {
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border-radius: 14px;
  background: #ffffff;
  font: 600 13px ${MONO};
  font-style: normal;
  color: #8a90a0;
}

+i:nth-child(1) {
+  box-shadow: 0 1px 2px rgba(16, 24, 40, .16), 0 1px 3px rgba(16, 24, 40, .1);
+}

+i:nth-child(2) {
+  box-shadow: 0 2px 4px -2px rgba(16, 24, 40, .12), 0 8px 16px -4px rgba(16, 24, 40, .2);
+}

+i:nth-child(3) {
+  box-shadow: 0 8px 12px -4px rgba(16, 24, 40, .14), 0 26px 40px -10px rgba(16, 24, 40, .4);
+}
`,
      rules: [["Every card has two shadow layers", (css) => [1, 2, 3].every((n) => { const m = css.match(new RegExp("nth-child\\(" + n + "\\)\\s*\\{[^}]*box-shadow\\s*:([^;}]*)")); return !!m && m[1].split(/,(?![^(]*\))/).length >= 2; })]],
      hints: ["Card 1: <code>0 1px 2px rgba(16, 24, 40, .16), 0 1px 3px rgba(16, 24, 40, .1)</code>",
        "Card 2: <code>0 2px 4px -2px rgba(16, 24, 40, .12), 0 8px 16px -4px rgba(16, 24, 40, .2)</code>",
        "Card 3: <code>0 8px 12px -4px rgba(16, 24, 40, .14), 0 26px 40px -10px rgba(16, 24, 40, .4)</code>"],
    },
    {
      id: "dz18", title: "Pop",
      brief: "Print it like a comic: tile the background with black dots <b>2.5px</b> across on a <b>14px</b> grid, tilt the word <b>−6°</b>, and give it a hard offset shadow <b>8px 8px</b> in <code>#1d1b17</code>.",
      idea: "One <code>radial-gradient</code> dot plus a <code>background-size</code> tiles into a halftone. A shadow with no blur reads as print, not as depth.",
      html: `<div class="pop"><h1>pop</h1></div>`,
      css: `body {
  background: #ff6fb5;
}

.pop {
  height: 100%;
  display: grid;
  place-items: center;
+  background: radial-gradient(circle, #1d1b17 2.5px, transparent 3px) 0 0 / 14px 14px;
}

h1 {
  margin: 0;
  padding: 2px 26px 10px;
  background: #ffd21f;
  color: #1d1b17;
  font: 800 72px/1 ${SANS};
  letter-spacing: -.05em;
+  transform: rotate(-6deg);
+  box-shadow: 8px 8px 0 #1d1b17;
}
`,
      rules: [["Dots tiled with a background size", /\/\s*\d+px\s+\d+px|background-size/], ["Tilted with transform", /rotate\(/], ["A hard shadow, no blur", /box-shadow\s*:\s*\d+px\s+\d+px\s+0\s/]],
      hints: ["<code>background: radial-gradient(circle, #1d1b17 2.5px, transparent 3px) 0 0 / 14px 14px;</code> The part after <code>/</code> is the tile size.",
        "<code>transform: rotate(-6deg); box-shadow: 8px 8px 0 #1d1b17;</code>"],
    },
    {
      id: "dz19", title: "Bento",
      brief: "Lay the tiles out with named areas: three columns <b>1.3fr 1fr 1fr</b>, two equal rows, <b>10px</b> gaps. <b>a</b> fills the left column, <b>b</b> spans the top right, <b>c</b> and <b>d</b> share the bottom.",
      idea: "<code>grid-template-areas</code> draws the layout as a little picture in text. Each tile then just says which letter it is.",
      html: `<div class="bento"><div class="a"><b>Fast</b><p>Pages open in under 40 ms</p></div><div class="b"><b>Private by default</b></div><div class="c"><b>98%</b><p>uptime</p></div><div class="d"><b>Offline</b></div></div>`,
      css: `body {
  background: #0b0b0d;
  padding: 14px;
}

.bento {
  height: 100%;
+  display: grid;
+  grid-template-columns: 1.3fr 1fr 1fr;
+  grid-template-rows: 1fr 1fr;
+  grid-template-areas:
+    "a b b"
+    "a c d";
+  gap: 10px;
}

.bento > div {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 14px;
  border-radius: 16px;
  background: #18181c;
  color: #f2f2f4;
  font-family: ${SANS};
}

+.a { grid-area: a; }
+.b { grid-area: b; }
+.c { grid-area: c; }
+.d { grid-area: d; }

.a {
  background: linear-gradient(160deg, #ff5fa8, #7b5cff);
}

.c {
  background: #e8ff59;
  color: #111111;
}

b {
  font-size: 19px;
  line-height: 1.05;
  letter-spacing: -.02em;
}

.a b {
  font-size: 34px;
}

p {
  margin: 4px 0 0;
  font-size: 12px;
  opacity: .75;
}
`,
      rules: [["Laid out with named areas", /grid-template-areas/], ["Every tile names its area", (css) => ["a", "b", "c", "d"].every((t) => new RegExp("grid-area\\s*:\\s*" + t + "\\b").test(css))]],
      hints: ["<code>grid-template-areas: \"a b b\" \"a c d\";</code> One string per row, one letter per column.",
        "Then each tile: <code>.a { grid-area: a; }</code> and the same for b, c and d."],
    },
    {
      id: "dz20", title: "App shell",
      brief: "Build the app frame: a <b>64px</b> sidebar running the full height, a <b>46px</b> header, and the content as <b>3 columns</b> with <b>10px</b> gaps, the last card spanning the whole row.",
      idea: "<code>grid-row: 1 / -1</code> stretches an item from the first line to the last. <code>-1</code> always means \"the end\", however many tracks there are.",
      html: `<div class="app"><aside><i></i><i></i><i></i></aside><header><b></b><span></span></header><main><i></i><i></i><i></i><i class="wide"></i></main></div>`,
      css: `body {
  background: #f6f6f4;
}

.app {
  height: 100%;
+  display: grid;
+  grid-template-columns: 64px 1fr;
+  grid-template-rows: 46px 1fr;
}

aside {
+  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 14px;
  background: #16151a;
}

aside i {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #34323c;
}

aside i:first-child {
  background: #ff6fb5;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e6e4df;
  background: #ffffff;
}

header b {
  width: 90px;
  height: 10px;
  border-radius: 5px;
  background: #d9d6cf;
}

header span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #ffd21f;
}

main {
  padding: 14px;
+  display: grid;
+  grid-template-columns: repeat(3, 1fr);
+  gap: 10px;
}

main i {
  border-radius: 10px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #e6e4df;
}

main .wide {
+  grid-column: 1 / -1;
  background: #eceae4;
}
`,
      rules: [["Sidebar spans every row", /grid-row\s*:\s*1\s*\/\s*-1/], ["Wide card spans every column", /grid-column\s*:\s*1\s*\/\s*-1/]],
      hints: ["<code>.app { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: 46px 1fr; }</code>",
        "<code>aside { grid-row: 1 / -1; }</code> and <code>main .wide { grid-column: 1 / -1; }</code>"],
    },
    {
      id: "dz21", title: "Twelve columns",
      brief: "On a 12-column grid: the headline spans <b>9 columns</b> from the left, the image <b>5</b>, and the deck runs from <b>column line 7</b> to the end, sitting at the bottom.",
      idea: "Magazines hang everything on one grid of columns. <code>span 5</code> says how wide; <code>7 / -1</code> says from which line to which.",
      html: `<div class="g"><p class="k">Issue 04</p><h1>Slow tulips</h1><div class="img"></div><p class="dek">What a flower bed teaches about patience, and about doing one thing well.</p></div>`,
      css: `body {
  background: #f3efe6;
  color: #1a1712;
}

.g {
  height: 100%;
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: auto auto 1fr;
  gap: 8px;
}

.k {
  grid-column: 1 / -1;
  margin: 0;
  font: 600 10.5px ${MONO};
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #b4442a;
}

h1 {
  margin: 0;
  font: 400 52px/.92 ${SERIF};
  letter-spacing: -.03em;
+  grid-column: 1 / span 9;
}

.img {
  border-radius: 6px;
  background: linear-gradient(135deg, #ff6fb5, #e3261b);
+  grid-column: 1 / span 5;
}

.dek {
  margin: 0;
  font: 14px/1.45 ${SERIF};
  color: #4a443a;
+  grid-column: 7 / -1;
+  align-self: end;
}
`,
      rules: [["Widths by span", /span\s+\d/], ["Deck runs to the last line", /7\s*\/\s*-1/]],
      hints: ["<code>h1 { grid-column: 1 / span 9; }</code> and <code>.img { grid-column: 1 / span 5; }</code>", "<code>.dek { grid-column: 7 / -1; align-self: end; }</code>"],
    },
    {
      id: "dz22", title: "Notification row",
      brief: "Lay each row out as avatar, text, time, <b>12px</b> apart and centred. Long messages must stop at one line with an ellipsis instead of pushing the time off the card.",
      idea: "Flex items won't shrink below their content unless you say <code>min-width: 0</code>. Then <code>overflow: hidden</code> and <code>text-overflow: ellipsis</code> can do their job.",
      html: `<div class="list"><div class="row"><i class="av"></i><div class="tx"><b>Ana Lima</b><span>Shared “Spring planting plan, final final v3.pdf” with the whole studio</span></div><time>2m</time></div><div class="row"><i class="av two"></i><div class="tx"><b>Kofi Mensah</b><span>Moved 48 bulbs from Backlog to Planted, and left a note about frost</span></div><time>1h</time></div></div>`,
      css: `body {
  background: #f4f4f6;
  display: grid;
  place-items: center;
  font-family: ${UI};
}

.list {
  width: 300px;
  padding: 6px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .08), 0 8px 24px -8px rgba(16, 24, 40, .14);
}

.row {
  padding: 10px;
+  display: flex;
+  align-items: center;
+  gap: 12px;
}

.av {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6fb5, #ffb547);
}

.av.two {
  background: linear-gradient(135deg, #1fd1c1, #3d8fe0);
}

.tx {
  display: grid;
+  flex: 1;
+  min-width: 0;
}

b {
  font-size: 14px;
  color: #17181c;
}

span {
  font-size: 13px;
  color: #6b6f7b;
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
}

time {
  font-size: 12px;
  color: #9a9eaa;
}
`,
      rules: [["Text allowed to shrink", /min-width\s*:\s*0/], ["Cut with an ellipsis", /text-overflow\s*:\s*ellipsis/]],
      hints: ["<code>.row { display: flex; align-items: center; gap: 12px; }</code> and <code>.tx { flex: 1; min-width: 0; }</code>",
        "The message: <code>white-space: nowrap; overflow: hidden; text-overflow: ellipsis;</code>"],
    },
    {
      id: "dz23", title: "Bauhaus",
      brief: "Cut each tile into its shape: a quarter disc, a circle, a triangle, a quarter disc facing the other way, a leaf and a dome. The hints give each one.",
      idea: "<code>border-radius</code> takes one value per corner, and <code>100%</code> on a corner makes a quarter circle. <code>clip-path: polygon()</code> cuts anything with straight edges.",
      html: `<div class="b"><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
      css: `body {
  background: #f2ece0;
}

.b {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.b i:nth-child(1) {
  background: #e63b2e;
+  border-radius: 0 0 100% 0;
}

.b i:nth-child(2) {
  background: #1f4fa8;
+  border-radius: 50%;
}

.b i:nth-child(3) {
  background: #161616;
+  clip-path: polygon(0 100%, 50% 0, 100% 100%);
}

.b i:nth-child(4) {
  background: #f5c518;
+  border-radius: 100% 0 0 0;
}

.b i:nth-child(5) {
  background: #161616;
+  border-radius: 100% 0;
}

.b i:nth-child(6) {
  background: #e63b2e;
+  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
}
`,
      rules: [["A shape cut with clip-path", /clip-path\s*:\s*polygon/], ["Quarter circles from 100% corners", /border-radius\s*:[^;}]*100%/]],
      hints: ["The four corner values go top-left, top-right, bottom-right, bottom-left. Tile 1: <code>0 0 100% 0</code>. Tile 4: <code>100% 0 0 0</code>.",
        "Triangle: <code>clip-path: polygon(0 100%, 50% 0, 100% 100%)</code>. Leaf: <code>border-radius: 100% 0</code>.",
        "Dome: <code>border-radius: 50% 50% 0 0 / 100% 100% 0 0</code> (before the slash is across, after is down)."],
    },
    {
      id: "dz24", title: "Open late",
      brief: "Lay a checkerboard of <b>20px</b> squares (a <b>40px</b> tile) in <code>#161616</code> and <code>#f2ece0</code>, tilt the sticker <b>−12°</b>, and cut it out with a <b>6px</b> cream ring.",
      idea: "<code>repeating-conic-gradient</code> sweeps colours round a point; two quarters dark, two light, tiled, is a checkerboard.",
      html: `<div class="c"><b>open<br>late</b></div>`,
      css: `body {
  background: #f2ece0;
}

.c {
  height: 100%;
  display: grid;
  place-items: center;
+  background: repeating-conic-gradient(#161616 0 25%, #f2ece0 0 50%) 0 0 / 40px 40px;
}

b {
  display: grid;
  place-items: center;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: #ff6fb5;
  color: #161616;
  font: 800 30px/.9 ${SANS};
  letter-spacing: -.04em;
  text-align: center;
+  transform: rotate(-12deg);
+  box-shadow: 0 0 0 6px #f2ece0;
}
`,
      rules: [["A conic checkerboard", /conic-gradient/], ["Ring with box-shadow", /box-shadow\s*:\s*0\s+0\s+0\s+\d+px/]],
      hints: ["<code>background: repeating-conic-gradient(#161616 0 25%, #f2ece0 0 50%) 0 0 / 40px 40px;</code>", "<code>transform: rotate(-12deg); box-shadow: 0 0 0 6px #f2ece0;</code>"],
    },
    {
      id: "dz25", title: "Op art", pass: 94,
      brief: "Two sets of rings, <b>6px</b> bands: cream rings centred at <b>40% 40%</b> on the disc, red <code>#e3261b</code> rings centred at <b>60% 60%</b> on the inner disc. The offset makes them shimmer.",
      idea: "<code>repeating-radial-gradient</code> repeats bands outward from a centre. Move the centre a little and two sets of rings start to vibrate.",
      html: `<div class="o"><i></i></div>`,
      css: `body {
  background: #111111;
  display: grid;
  place-items: center;
}

.o {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 50%;
+  background: repeating-radial-gradient(circle at 40% 40%, #f2ece0 0 6px, #111111 6px 12px);
}

.o i {
  position: absolute;
  inset: 50px;
  border-radius: 50%;
+  background: repeating-radial-gradient(circle at 60% 60%, #e3261b 0 6px, #111111 6px 12px);
}
`,
      rules: [["Two sets of rings", (css) => (css.match(/repeating-radial-gradient/g) || []).length >= 2]],
      hints: ["<code>repeating-radial-gradient(circle at 40% 40%, #f2ece0 0 6px, #111111 6px 12px)</code>", "The inner disc is the same with <code>at 60% 60%</code> and <code>#e3261b</code>."],
    },
    {
      id: "dz26", title: "Pixel tulip",
      brief: "The 49 cells already know their colours. Make them a <b>7-column</b> grid of <b>22px</b> squares, <b>4px</b> apart, with <b>4px</b> corners.",
      idea: "A pixel picture is just a grid where every cell is one colour. <code>repeat(7, 22px)</code> sets the columns; rows appear as the cells wrap.",
      html: `<div class="px">${TULIP}</div>`,
      css: `body {
  background: #10261a;
  display: grid;
  place-items: center;
}

.px {
+  display: grid;
+  grid-template-columns: repeat(7, 22px);
+  gap: 4px;
}

.px i {
  height: 22px;
+  border-radius: 4px;
}

.p { background: #ff6fb5; }
.d { background: #d23f87; }
.y { background: #ffd21f; }
.g { background: #3faa52; }
.k { background: #24803c; }
`,
      rules: [["Seven columns", /repeat\(\s*7/]],
      hints: ["<code>.px { display: grid; grid-template-columns: repeat(7, 22px); gap: 4px; }</code>", "Round the cells: <code>border-radius: 4px</code>."],
    },
    {
      id: "dz27", title: "Pricing tier", h: 300,
      brief: "Finish the featured plan: a pill badge (<b>3px 9px</b>, pink at 14%), square pink bullets <b>6px</b> wide drawn with <code>::before</code>, <b>10px</b> from each line, and a full-width pink button with <b>11px</b> padding and <b>10px</b> corners.",
      idea: "The best pricing cards use one accent colour three times: the badge, the bullets and the button. Everything else stays quiet.",
      html: `<div class="tier"><p class="nm">Pro <span>Most picked</span></p><p class="pr"><b>$12</b> a month</p><ul><li>Every course and level</li><li>Progress on every device</li><li>Hints when you're stuck</li></ul><a>Start free for 14 days</a></div>`,
      css: `body {
  background: #0c0b0e;
  display: grid;
  place-items: center;
  font-family: ${UI};
}

.tier {
  width: 260px;
  padding: 20px;
  border-radius: 18px;
  background: #16141a;
  color: #f4f1f7;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08), 0 30px 60px -20px rgba(255, 111, 181, .35);
}

.nm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.nm span {
  font-size: 11px;
  font-weight: 600;
+  padding: 3px 9px;
+  border-radius: 999px;
+  background: rgba(255, 111, 181, .14);
+  color: #ff8cc6;
}

.pr {
  margin: 10px 0 14px;
  color: #a39fab;
  font-size: 13px;
}

.pr b {
  margin-right: 4px;
  font-size: 40px;
  letter-spacing: -.04em;
  color: #ffffff;
}

ul {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 13.5px;
  color: #d9d5df;
}

li {
+  display: flex;
+  align-items: center;
+  gap: 10px;
}

+li::before {
+  content: "";
+  width: 6px;
+  height: 6px;
+  background: #ff6fb5;
+}

a {
  display: block;
  font-size: 14px;
  font-weight: 600;
+  padding: 11px;
+  border-radius: 10px;
+  background: #ff6fb5;
+  color: #1a0d14;
+  text-align: center;
}
`,
      rules: [["A pill badge", /border-radius\s*:\s*\d{3,}px/], ["Bullets drawn with ::before", /li::before/]],
      hints: ["Badge: <code>padding: 3px 9px; border-radius: 999px; background: rgba(255, 111, 181, .14); color: #ff8cc6;</code>",
        "Bullets: make <code>li</code> a flex row with <code>gap: 10px</code>, then <code>li::before { content: \"\"; width: 6px; height: 6px; background: #ff6fb5; }</code>",
        "Button: <code>padding: 11px; border-radius: 10px; background: #ff6fb5; color: #1a0d14; text-align: center;</code>"],
    },
    {
      id: "dz28", title: "Command menu", h: 260,
      brief: "Make each result a row with <b>10px</b> gaps, highlight the active one (<code>#f3f0ff</code>, text <code>#5b3fd6</code>, icon <code>#7b5cff</code>), and push every key hint to the right edge.",
      idea: "<code>margin-left: auto</code> on the last item in a flex row pushes it to the far end, which is how every menu lines up its shortcuts.",
      html: `<div class="k"><div class="q"><i></i><span>Search lessons, levels, settings</span><kbd>esc</kbd></div><ul><li class="on"><i></i>Open the design studio<kbd>↵</kbd></li><li><i></i>Resume DSA, chapter 19</li><li><i></i>Switch to light theme<kbd>⌘ J</kbd></li><li><i></i>Review due cards</li></ul></div>`,
      css: `body {
  background: #e9e7f0;
  display: grid;
  place-items: center;
  font-family: ${UI};
}

.k {
  width: 320px;
  overflow: hidden;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(20, 16, 40, .08), 0 24px 48px -12px rgba(20, 16, 40, .28);
}

.q {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #eeecf3;
  color: #9a96a8;
  font-size: 14px;
}

.q i {
  width: 14px;
  height: 14px;
  border: 2px solid #b5b1c2;
  border-radius: 50%;
}

ul {
  list-style: none;
  margin: 0;
  padding: 6px;
}

li {
  padding: 9px 10px;
  border-radius: 8px;
  color: #2b2836;
  font-size: 13.5px;
+  display: flex;
+  align-items: center;
+  gap: 10px;
}

li i {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: #e4e1ec;
}

li.on {
+  background: #f3f0ff;
+  color: #5b3fd6;
}

li.on i {
+  background: #7b5cff;
}

kbd {
  padding: 2px 6px;
  border-radius: 5px;
  background: #f2f0f6;
  box-shadow: inset 0 -1px 0 #dcd9e4;
  font: 500 11px ${MONO};
  color: #7d7990;
+  margin-left: auto;
}
`,
      rules: [["Shortcuts pushed with an auto margin", /margin-left\s*:\s*auto/], ["Rows are flex", /li\s*\{[^}]*display\s*:\s*flex/]],
      hints: ["<code>li { display: flex; align-items: center; gap: 10px; }</code>", "<code>kbd { margin-left: auto; }</code> and colour the <code>.on</code> row and its icon."],
    },
    {
      id: "dz29", title: "Toast stack",
      brief: "Stack the older toasts behind the newest: the middle one up <b>14px</b> and scaled to <b>.94</b> at <b>80%</b> opacity, the back one up <b>28px</b> at <b>.88</b> and <b>50%</b>.",
      idea: "Depth without 3D: each card further back is a little higher, a little smaller and a little fainter. <code>transform-origin: top</code> keeps them peeking over the top edge.",
      html: `<div class="stack"><div class="t">Saved to your garden</div><div class="t">Level 12 matched</div><div class="t"><b>Streak: 7 days</b><span>Keep it going tomorrow</span></div></div>`,
      css: `body {
  background: #f3f1ec;
  font-family: ${UI};
}

.stack {
  position: absolute;
  left: 40px;
  right: 40px;
  bottom: 30px;
  height: 64px;
}

.t {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 16px;
  border-radius: 12px;
  background: #ffffff;
  color: #2a2722;
  font-size: 13.5px;
  box-shadow: 0 0 0 1px rgba(30, 25, 15, .06), 0 10px 24px -10px rgba(30, 25, 15, .25);
  transform-origin: 50% 0;
}

.t:nth-child(1) {
+  transform: translateY(-28px) scale(.88);
+  opacity: .5;
}

.t:nth-child(2) {
+  transform: translateY(-14px) scale(.94);
+  opacity: .8;
}

b {
  font-size: 14px;
}

span {
  color: #8a857b;
  font-size: 12.5px;
}
`,
      rules: [["Moved and scaled with transform", /translateY\([^)]*\)\s*scale\(/]],
      hints: ["Middle: <code>transform: translateY(-14px) scale(.94); opacity: .8;</code>", "Back: <code>transform: translateY(-28px) scale(.88); opacity: .5;</code>"],
    },
    {
      id: "dz30", title: "Now playing",
      brief: "Put the art beside the words, <b>14px</b> apart and centred. Round the art <b>12px</b> and paint it with a conic sweep from <b>200°</b>: pink, amber, violet, back to pink. Fill the bar to <b>43%</b> and give it a <b>10px</b> knob.",
      idea: "A <code>conic-gradient</code> makes instant album art. The knob is a <code>::after</code> on the filled bar, so it always sits at the end of the progress.",
      html: `<div class="np"><div class="art"></div><div class="meta"><b>Slow Bloom</b><span>The Night Garden</span><div class="bar"><i></i></div><div class="times"><span>1:42</span><span>3:58</span></div></div></div>`,
      css: `body {
  background: #1a1420;
  display: grid;
  place-items: center;
  font-family: ${UI};
}

.np {
  width: 310px;
  padding: 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, .06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08);
  color: #ffffff;
+  display: flex;
+  align-items: center;
+  gap: 14px;
}

.art {
  flex: none;
  width: 84px;
  height: 84px;
+  border-radius: 12px;
+  background: conic-gradient(from 200deg, #ff6fb5, #ffb547, #7b5cff, #ff6fb5);
}

.meta {
  flex: 1;
  min-width: 0;
}

b {
  display: block;
  font-size: 16px;
  letter-spacing: -.01em;
}

.meta > span {
  font-size: 13px;
  color: rgba(255, 255, 255, .6);
}

.bar {
  position: relative;
  height: 4px;
  margin: 14px 0 6px;
  border-radius: 2px;
  background: rgba(255, 255, 255, .15);
}

.bar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 2px;
  background: #ffffff;
+  width: 43%;
}

+.bar i::after {
+  content: "";
+  position: absolute;
+  right: -5px;
+  top: -3px;
+  width: 10px;
+  height: 10px;
+  border-radius: 50%;
+  background: #ffffff;
+}

.times {
  display: flex;
  justify-content: space-between;
  font: 11px ${MONO};
  color: rgba(255, 255, 255, .5);
}
`,
      rules: [["Art from a conic gradient", /conic-gradient/], ["Knob drawn with ::after", /::after/]],
      hints: ["<code>.np { display: flex; align-items: center; gap: 14px; }</code>",
        "Art: <code>border-radius: 12px; background: conic-gradient(from 200deg, #ff6fb5, #ffb547, #7b5cff, #ff6fb5);</code>",
        "Knob: <code>.bar i::after { content: \"\"; position: absolute; right: -5px; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: #fff; }</code>"],
    },
    {
      id: "dz31", title: "Stat tiles",
      brief: "Three equal tiles, <b>10px</b> apart. Give the numbers tabular figures, and tint the change pills: up in <code>#e6f7ee</code> / <code>#138a4b</code>, down in <code>#fdecec</code> / <code>#c2352b</code>.",
      idea: "Dashboards are read at a glance: one label, one big number, one coloured change. Colour only where it carries meaning.",
      html: `<div class="s"><div><p>Visitors</p><b>12,408</b><em class="up">+8.2%</em></div><div><p>Signups</p><b>1,316</b><em class="up">+3.1%</em></div><div><p>Churn</p><b>2.4%</b><em class="down">−0.6%</em></div></div>`,
      css: `body {
  background: #f5f6f8;
  padding: 20px;
  font-family: ${UI};
}

.s {
  height: 100%;
+  display: grid;
+  grid-template-columns: repeat(3, 1fr);
+  gap: 10px;
}

.s > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 14px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 0 0 1px #e8eaee;
}

p {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

b {
  margin: 6px 0 auto;
  font-size: 26px;
  letter-spacing: -.03em;
  color: #111318;
+  font-variant-numeric: tabular-nums;
}

em {
  padding: 3px 8px;
  border-radius: 999px;
  font: normal 600 11.5px ${UI};
}

.up {
+  background: #e6f7ee;
+  color: #138a4b;
}

.down {
+  background: #fdecec;
+  color: #c2352b;
}
`,
      rules: [["Equal columns", /repeat\(\s*3\s*,\s*1fr\s*\)/], ["Tabular figures", /tabular-nums/]],
      hints: ["<code>.s { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }</code>", "Then <code>font-variant-numeric: tabular-nums</code> on <code>b</code>, and the two pill colours."],
    },
    {
      id: "dz32", title: "Chat thread",
      brief: "Bubbles are at most <b>72%</b> wide with <b>18px</b> corners. Theirs sit left with a <b>5px</b> bottom-left corner, yours sit right with a <b>5px</b> bottom-right corner. Bubbles from the same person sit <b>2px</b> closer; a change of speaker adds <b>10px</b>.",
      idea: "<code>align-self</code> lets one flex child break from the line. Small changes in spacing group messages into turns without any lines or labels.",
      html: `<div class="chat"><p class="them">Did the tulips come up?</p><p class="me">Three so far! The pink ones.</p><p class="me">Sending a photo tonight</p><p class="them">Can't wait</p></div>`,
      css: `body {
  background: #ffffff;
  font-family: ${UI};
}

.chat {
  height: 100%;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
}

p {
  margin: 0;
  padding: 8px 13px;
  font-size: 14px;
  line-height: 1.35;
+  max-width: 72%;
+  border-radius: 18px;
}

.them {
  background: #eeedf2;
  color: #1c1b22;
+  align-self: flex-start;
+  border-bottom-left-radius: 5px;
}

.me {
  background: #7b5cff;
  color: #ffffff;
+  align-self: flex-end;
+  border-bottom-right-radius: 5px;
}

+.me + .me {
+  margin-top: -2px;
+}

+.them + .me,
+.me + .them {
+  margin-top: 10px;
+}
`,
      rules: [["Sides set with align-self", /align-self\s*:\s*flex-end/], ["Bubbles have a max width", /max-width\s*:\s*\d+%/]],
      hints: ["<code>p { max-width: 72%; border-radius: 18px; }</code>, then <code>align-self: flex-start</code> for theirs and <code>flex-end</code> for yours.",
        "Tails: <code>border-bottom-left-radius: 5px</code> (theirs) and <code>border-bottom-right-radius: 5px</code> (yours).",
        "Turns: <code>.me + .me { margin-top: -2px; }</code> and <code>.them + .me, .me + .them { margin-top: 10px; }</code>"],
    },
  ],
};
})();
