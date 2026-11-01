"""Runs learner code for the Voxel Network Lab code tracks.

The same file runs in two places:
  * in the browser, inside Pyodide (a Web Worker), and
  * on a developer machine, behind tools/devserver.py, for testing.

It never imports anything heavy itself; matplotlib is only touched if the
learner's code already imported it.
"""
import ast
import base64
import io
import sys
import traceback

_SPACES = {}          # one notebook-style namespace per chapter
_ANIMS = []           # flipbooks made by the current run
MAX_FRAMES = 240


def flipbook(frames, cmap="viridis", vmin=None, vmax=None, titles=None, fps=8):
    """Show a sequence of 2-D arrays (or 1-D rows, stacked as they grow) as an animation.

    Call it with a list of numpy arrays; the page shows a player with play/pause and a slider.
    """
    import numpy as np
    import matplotlib
    import matplotlib.image as mpimg
    frames = [np.asarray(f, dtype=float) for f in frames]
    if not frames:
        return
    if len(frames) > MAX_FRAMES:
        step = len(frames) / MAX_FRAMES
        frames = [frames[int(i * step)] for i in range(MAX_FRAMES)]
    lo = min(f.min() for f in frames) if vmin is None else vmin
    hi = max(f.max() for f in frames) if vmax is None else vmax
    if hi == lo:
        hi = lo + 1
    out = []
    for f in frames:
        if f.ndim == 1:
            f = f[None, :]
        buf = io.BytesIO()
        mpimg.imsave(buf, f, cmap=cmap, vmin=lo, vmax=hi, format="png")
        out.append(base64.b64encode(buf.getvalue()).decode("ascii"))
    _ANIMS.append({"frames": out, "fps": fps, "titles": list(titles) if titles is not None else None})


def _take_anims():
    out = list(_ANIMS)
    _ANIMS.clear()
    return out
_PRELUDE_DONE = set()


class _Capture(io.StringIO):
    LIMIT = 20000

    def write(self, s):
        if self.tell() < self.LIMIT:
            return super().write(s)
        return len(s)


def _figures():
    """Return every open matplotlib figure as a base64 PNG, then close them."""
    if "matplotlib" not in sys.modules:
        return []
    import matplotlib.pyplot as plt
    out = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=90, bbox_inches="tight")
        out.append(base64.b64encode(buf.getvalue()).decode("ascii"))
    plt.close("all")
    return out


def _format_error(exc, filename):
    """A short traceback that only shows the learner's own lines."""
    tb = traceback.extract_tb(exc.__traceback__)
    frames = [f for f in tb if f.filename == filename]
    lines = []
    for f in frames[-3:]:
        lines.append(f"  line {f.lineno}: {(f.line or '').strip()}")
    head = f"{type(exc).__name__}: {exc}"
    if isinstance(exc, SyntaxError):
        head = f"SyntaxError: {exc.msg} (line {exc.lineno})"
        if exc.text:
            lines = ["  " + exc.text.rstrip()]
    return head + ("\n" + "\n".join(lines) if lines else "")


def _is_plot_object(value):
    """Don't echo things like <matplotlib.legend.Legend object at 0x...>."""
    if isinstance(value, (list, tuple)) and value:
        value = value[0]
    return type(value).__module__.split(".")[0] == "matplotlib"


def _exec(code, ns, filename):
    """Exec code like a notebook cell: the value of a final bare expression is echoed."""
    tree = ast.parse(code, filename, "exec")
    last = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = ast.Expression(tree.body.pop().value)
    exec(compile(tree, filename, "exec"), ns)
    if last is not None:
        value = eval(compile(last, filename, "eval"), ns)
        if value is not None and not _is_plot_object(value):
            print(repr(value))


_RC_DONE = []


def _style_plots():
    """Smaller default figures that fit the lesson column (once, after matplotlib loads)."""
    if _RC_DONE or "matplotlib" not in sys.modules:
        return
    import matplotlib
    matplotlib.rcParams.update({"figure.figsize": (6.4, 3.8), "figure.dpi": 90,
                                "axes.spines.top": False, "axes.spines.right": False})
    _RC_DONE.append(1)


def _run(code, ns, filename="<cell>"):
    _style_plots()
    out = _Capture()
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    error = None
    try:
        if "matplotlib" in code and "matplotlib" not in sys.modules:
            import matplotlib  # noqa: F401  (so the default style applies to this cell)
            _style_plots()
        _exec(code, ns, filename)
    except BaseException as exc:  # noqa: BLE001 - we report everything
        error = _format_error(exc, filename)
    finally:
        sys.stdout, sys.stderr = old
    return out.getvalue(), error


def _space(nsid, prelude):
    ns = _SPACES.get(nsid)
    if ns is None:
        ns = {"__name__": "__main__", "flipbook": flipbook}
        _SPACES[nsid] = ns
    if nsid not in _PRELUDE_DONE:
        _PRELUDE_DONE.add(nsid)
        if prelude:
            _, err = _run(prelude, ns, "<prelude>")
            if err:
                return ns, "Setup failed:\n" + err
    return ns, None


def reset(nsid):
    _SPACES.pop(nsid, None)
    _PRELUDE_DONE.discard(nsid)
    return {"ok": True}


def cell(nsid, prelude, code):
    """Run an example cell in the chapter's shared namespace."""
    ns, err = _space(nsid, prelude)
    if err:
        return {"stdout": "", "error": err, "figures": _figures()}
    stdout, error = _run(code, ns)
    return {"stdout": stdout, "error": error, "figures": _figures(), "anims": _take_anims()}


def _statements(tests):
    """Split test code into top-level statements, keeping their source text."""
    tree = ast.parse(tests, "<tests>", "exec")
    lines = tests.splitlines()
    out = []
    for node in tree.body:
        src = "\n".join(lines[node.lineno - 1: node.end_lineno])
        out.append((node, src))
    return out


def check(prelude, setup, code, tests, show=""):
    """Run learner code in a fresh namespace, then each test statement in turn.

    Returns passed / failed counts and a message for the first failure, so the
    learner sees one clear thing to fix at a time.
    """
    ns = {"__name__": "__main__", "flipbook": flipbook}
    _ANIMS.clear()
    for label, src in (("<prelude>", prelude), ("<setup>", setup)):
        if src:
            _, err = _run(src, ns, label)
            if err:
                return {"passed": False, "stdout": "", "error": "Setup failed:\n" + err,
                        "total": 0, "ok": 0, "figures": _figures()}
    stdout, error = _run(code, ns)
    figures = _figures()
    if error:
        return {"passed": False, "stdout": stdout, "error": error, "total": 0, "ok": 0,
                "figures": figures}
    try:
        stmts = _statements(tests or "")
    except SyntaxError as exc:
        return {"passed": False, "stdout": stdout, "error": "Broken tests: " + str(exc),
                "total": 0, "ok": 0, "figures": figures}
    total = sum(1 for n, _ in stmts if isinstance(n, ast.Assert))
    ok = 0
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = _Capture()
    try:
        for node, src in stmts:
            try:
                exec(compile(ast.Module([node], []), "<tests>", "exec"), ns)
                if isinstance(node, ast.Assert):
                    ok += 1
            except AssertionError as exc:
                msg = str(exc) or "This check did not hold."
                return {"passed": False, "stdout": stdout, "error": None, "total": total,
                        "ok": ok, "failed": src.strip(), "message": msg, "figures": figures}
            except BaseException as exc:  # noqa: BLE001
                return {"passed": False, "stdout": stdout, "error": None, "total": total,
                        "ok": ok, "failed": src.strip(),
                        "message": f"{type(exc).__name__}: {exc}", "figures": figures}
    finally:
        sys.stdout, sys.stderr = old
    result = {"passed": True, "stdout": stdout, "error": None, "total": total, "ok": ok,
              "figures": figures, "anims": _take_anims()}
    if show:
        # The reward: run a demo that uses the learner's own (now passing) code.
        show_out, show_err = _run(show, ns, "<show>")
        result["show"] = {"stdout": show_out, "error": show_err, "figures": _figures(),
                          "anims": _take_anims()}
    return result


def handle(req):
    """Single entry point used by the worker and the dev server."""
    op = req.get("op")
    if op == "cell":
        return cell(req["ns"], req.get("prelude", ""), req["code"])
    if op == "check":
        return check(req.get("prelude", ""), req.get("setup", ""), req["code"],
                     req.get("tests", ""), req.get("show", ""))
    if op == "reset":
        return reset(req["ns"])
    return {"error": f"unknown op {op!r}"}
