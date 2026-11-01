/* Build your own X, chapter 4: a bytecode virtual machine.
   Left: the program as a tape of instructions, with an amber cursor (the program counter).
   Middle: the stack, where every calculation happens. Right: named variable slots and the output.
   The "why": a tree is easy to walk but slow to re-walk; a flat list of tiny instructions is what
   CPython, the JVM and Lua actually run, and a loop is just a jump backwards. */
VIZ.register("bx-vm", async (api) => {
  const W = await api.world3d();
  const PROGRAMS = {
    sum: { label: "while loop: 1+…+5", src: "total = 0\ni = 1\nwhile i <= 5:\n    total = total + i\n    i = i + 1\nprint(total)", code: [
      ["PUSH", 0], ["STORE", "total"], ["PUSH", 1], ["STORE", "i"],
      ["LOAD", "i"], ["PUSH", 5], ["LE"], ["JUMP_IF_FALSE", 17],
      ["LOAD", "total"], ["LOAD", "i"], ["ADD"], ["STORE", "total"],
      ["LOAD", "i"], ["PUSH", 1], ["ADD"], ["STORE", "i"], ["JUMP", 4],
      ["LOAD", "total"], ["PRINT"], ["HALT"]] },
    arith: { label: "arithmetic: x*x + y*y", src: "x = 3\ny = 4\nprint(x * x + y * y)", code: [
      ["PUSH", 3], ["STORE", "x"], ["PUSH", 4], ["STORE", "y"],
      ["LOAD", "x"], ["LOAD", "x"], ["MUL"], ["LOAD", "y"], ["LOAD", "y"], ["MUL"], ["ADD"], ["PRINT"], ["HALT"]] },
  };
  const WHY = {
    PUSH: "Put a constant on top of the stack. Numbers written in your source code become PUSH instructions.",
    LOAD: "Copy a variable's value onto the stack. Instructions never read variables directly; they only ever work on the stack.",
    STORE: "Pop the top of the stack into a variable. This is what <code>=</code> compiles to.",
    ADD: "Pop two values, push their sum. No operand needed: the inputs are always the top two stack slots. That's why stack machines have such short instructions.",
    MUL: "Pop two values, push their product. Precedence was already settled by the compiler: by the time code runs, the order of instructions <i>is</i> the order of operations.",
    LE: "Pop two values, push True if the lower one ≤ the upper one. Comparisons are just more arithmetic that produce a boolean.",
    JUMP_IF_FALSE: "Pop the condition. If it's false, set the program counter to the target instead of the next line. This one instruction is the whole <code>while</code> check.",
    JUMP: "Set the program counter back to the loop test. A loop is nothing more than a jump backwards.",
    PRINT: "Pop the top value and write it to the output.",
    HALT: "Stop the machine.",
  };
  let prog = "sum", pc, stack, vars, out, steps, halted, busy = false;
  const P = () => PROGRAMS[prog];
  const rowY = (k) => 7.4 - k * 0.4;
  const text = (ins) => `${ins[0]}${ins.length > 1 ? " " + ins[1] : ""}`;
  function reset() { pc = 0; stack = []; vars = {}; out = []; steps = 0; halted = false; }
  function drawTape() {
    W.clear();
    P().code.forEach((ins, k) => {
      const jump = ins[0].startsWith("JUMP");
      W.box("c" + k, { x: -3.3, y: rowY(k), z: 0, sx: 2.6, sy: 0.32, sz: 0.3, color: jump ? "c4" : "c5", opacity: 0.55, label: `${k}  ${text(ins)}`, labelSize: 0.22, labelUp: -0.16, instant: true,
        info: { title: `${k}: ${text(ins)}`, html: `<p>${WHY[ins[0]]}</p>` } });
      if (jump) W.line("j" + k, [ins[0] === "JUMP" ? -4.75 : -4.95, rowY(k), 0], [ins[0] === "JUMP" ? -4.75 : -4.95, rowY(ins[1]), 0], { color: "c4" });
    });
    W.label("tapeL", "program (bytecode)", [-3.3, 8, 0], { color: "muted", size: 0.3 });
    W.label("stackL", "stack", [0.6, -0.5, 0], { color: "muted", size: 0.3 });
    W.label("varL", "variables", [3.6, -0.5, 0], { color: "muted", size: 0.3 });
  }
  function drawState(last) {
    W.box("pc", { x: -1.75, y: rowY(Math.min(pc, P().code.length - 1)), z: 0, s: 0.3, color: halted ? "ok" : "c1", glow: true,
      info: { title: `Program counter: ${pc}`, html: "<p>The address of the next instruction. Normally it just goes up by one; jumps are the only thing that move it anywhere else.</p>" } });
    for (let k = 0; k < 8; k++) {
      if (k < stack.length) W.box("s" + k, { x: 0.6, y: 0.3 + k * 0.62, z: 0, sx: 1.4, sy: 0.54, sz: 0.6, color: "c2", label: String(stack[k]), labelSize: 0.3, labelUp: -0.27, fromY: 6,
        info: { title: `Stack slot ${k}: ${stack[k]}`, html: "<p>The stack holds the values in the middle of a calculation. Operations take their inputs from the top and push their result back. No registers to name, no temporary variables: the compiler never has to decide where intermediate results live.</p>" } });
      else if (W.has("s" + k)) W.remove("s" + k);
    }
    Object.keys(vars).forEach((name, k) => W.box("v" + name, { x: 3.6, y: 0.4 + k * 0.8, z: 0, sx: 2.2, sy: 0.6, sz: 0.6, color: "c3", label: `${name} = ${vars[name]}`, labelSize: 0.28, labelUp: -0.3,
      info: { title: `Variable ${name}`, html: "<p>Named storage. Only LOAD and STORE touch it. A real VM would number these slots instead of looking up names, which is one more reason bytecode runs faster than walking a tree.</p>" } }));
    W.label("out", `output: ${out.join(" ") || "(nothing yet)"}`, [3.6, 6.8, 0], { color: out.length ? "ok" : "muted", size: 0.32 });
    if (last !== undefined) W.flash("c" + last);
    api.status(`source:\n${P().src}\n\npc = ${pc}   steps = ${steps}\nstack: [${stack.join(", ")}]\nvars: ${JSON.stringify(vars)}\noutput: ${out.join(" ")}`);
  }
  function step() {
    if (halted) return;
    const k = pc, [op, arg] = P().code[pc];
    pc++; steps++;
    if (op === "PUSH") stack.push(arg);
    else if (op === "LOAD") stack.push(vars[arg]);
    else if (op === "STORE") vars[arg] = stack.pop();
    else if (op === "ADD" || op === "MUL" || op === "LE") {
      const b = stack.pop(), a = stack.pop();
      stack.push(op === "ADD" ? a + b : op === "MUL" ? a * b : a <= b);
    } else if (op === "JUMP_IF_FALSE") { if (!stack.pop()) pc = arg; }
    else if (op === "JUMP") pc = arg;
    else if (op === "PRINT") out.push(stack.pop());
    else if (op === "HALT") { halted = true; pc = k; }
    drawState(k);
    api.explain(`${k}: ${text(P().code[k])}`, `<p>${WHY[op]}</p>`);
    if (halted) {
      api.explain("HALT", `<p>Done in <b>${steps}</b> tiny steps. ${prog === "sum" ? "The loop body ran 5 times, and each pass went through the same instructions 4→16 again: compiled once, run many times." : "Notice MUL ran before ADD only because the compiler put it first. The VM itself knows nothing about precedence."}</p>`);
      if (prog === "sum") api.done("You ran a while loop on a stack machine");
    }
  }
  async function runAll() {
    if (busy) return;
    busy = true;
    while (!halted) { step(); await api.sleep(140); }
    busy = false;
  }
  api.seg(Object.entries(PROGRAMS).map(([k, v]) => ({ label: v.label, value: k })), prog, (v) => { if (busy) return; prog = v; reset(); drawTape(); drawState(); });
  api.button("Step", step, { primary: true });
  api.button("Run", runAll);
  api.button("Reset", () => { if (busy) return; reset(); drawTape(); drawState(); });
  W.camera({ target: [0.1, 3.7, 0], dist: 17.5, theta: 0, phi: 1.45, instant: true });
  api.hud("amber rows are jumps · click any instruction to ask why");
  reset(); drawTape(); drawState();
  api.explain("How to read this", "<p>A compiler turned the Python-like source (right panel) into the <b>bytecode</b> on the left. The red cursor is the program counter. Press <b>Step</b> to run one instruction and watch the stack in the middle.</p><p>Every instruction does one tiny thing. Click one to ask why it exists.</p>");
});
