/* The design studio's levels. Each one is a board (360×240), some fixed HTML, the CSS you start with, and the
   answer CSS that draws the target. The match meter compares your pixels with the answer's.
   rules: [label, regex on your CSS (or a function that returns true when it's right), true when the regex must NOT match]. */
window.DZ = {
  w: 360, h: 240,
  base: "*,*::before,*::after{box-sizing:border-box}html,body{margin:0;width:360px;height:240px;overflow:hidden}body{font:16px/1.4 Georgia,serif}",
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
  ],
};
