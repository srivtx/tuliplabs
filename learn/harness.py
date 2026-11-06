"""Runs learner code for the Tulip Labs code tracks.

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


# ---------------------------------------------------------------- workbench --
# A Workbench project is a small repository: several .py files that import each other, a disk the
# program writes to, and a main module whose handle(line) answers the terminal. Files are served to
# `import` by a finder, so `import store` inside shell.py loads the learner's store.py as a real module.
import importlib.abc
import importlib.util
import os
import re
import tempfile

_PROJECTS = {}        # pid -> {"finder", "mods", "main", "dir"}
DISK_LIMIT = 4000     # characters of each disk file sent back to the page


class _Files(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def __init__(self, files):
        self.files = files

    def find_spec(self, name, path=None, target=None):
        if name + ".py" in self.files:
            return importlib.util.spec_from_loader(name, self, origin=name + ".py")
        return None

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        fn = module.__spec__.origin
        module.__file__ = fn
        exec(compile(self.files[fn], fn, "exec"), module.__dict__)


def _project_dir(pid, wipe=False):
    base = os.environ.get("WB_DISK") or os.path.join(tempfile.gettempdir(), "tulip-wb")
    d = os.path.join(base, re.sub(r"\W", "_", pid))
    os.makedirs(d, exist_ok=True)
    if wipe:
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if os.path.isfile(p):
                os.remove(p)
    return d


def _disk(d):
    out = []
    for f in sorted(os.listdir(d)):
        p = os.path.join(d, f)
        if not os.path.isfile(p):
            continue
        with open(p, "rb") as fh:
            raw = fh.read()
        out.append({"name": f, "size": len(raw), "text": raw[:DISK_LIMIT].decode("utf-8", "replace")})
    return out


def _project_error(exc, files):
    """The error, plus the deepest frame in the learner's files so the editor can underline it."""
    head = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
    if isinstance(exc, NotImplementedError):
        head = "NotImplementedError: this part isn't written yet"
    where = None
    if isinstance(exc, SyntaxError) and exc.filename in files:
        head = f"SyntaxError: {exc.msg}"
        where = [exc.filename, exc.lineno or 1]
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename in files]
    lines = [f"  {f.filename}, line {f.lineno}: {(f.line or '').strip()}" for f in frames[-4:]]
    if frames and not where:
        where = [frames[-1].filename, frames[-1].lineno]
    if where and not lines:
        lines = [f"  {where[0]}, line {where[1]}"]
    return head + ("\n" + "\n".join(lines) if lines else ""), where


class _InDir:
    """Run with the project's disk as the working directory, and stdout captured."""
    def __init__(self, d):
        self.d = d
        self.out = _Capture()

    def __enter__(self):
        self.cwd = os.getcwd()
        self.old = sys.stdout, sys.stderr
        os.chdir(self.d)
        sys.stdout = sys.stderr = self.out
        return self

    def __exit__(self, *a):
        sys.stdout, sys.stderr = self.old
        os.chdir(self.cwd)
        return False


def _unload(pid):
    p = _PROJECTS.pop(pid, None)
    if not p:
        return
    if p["finder"] in sys.meta_path:
        sys.meta_path.remove(p["finder"])
    for m in p["mods"]:
        sys.modules.pop(m, None)


def project_load(pid, files, main, wipe=False):
    """Start (or restart) the program. The disk survives a restart unless wipe is set,
    which is exactly what a crash looks like: memory is gone, files are not."""
    _unload(pid)
    d = _project_dir(pid, wipe)
    finder = _Files(dict(files))
    sys.meta_path.insert(0, finder)
    import linecache
    for fn, src in files.items():
        # so tracebacks can quote the learner's line
        linecache.cache[fn] = (len(src), None, src.splitlines(True), fn)
    mods = [f[:-3] for f in files if f.endswith(".py")]
    for m in mods:
        sys.modules.pop(m, None)
    _PROJECTS[pid] = {"finder": finder, "mods": mods, "main": None, "dir": d, "files": files}
    error = where = None
    with _InDir(d) as io_:
        try:
            _PROJECTS[pid]["main"] = importlib.import_module(main)
        except BaseException as exc:  # noqa: BLE001
            error, where = _project_error(exc, files)
    return {"stdout": io_.out.getvalue(), "error": error, "where": where, "disk": _disk(d)}


def project_call(pid, line):
    """One line typed into the terminal, answered by the program's handle(line)."""
    p = _PROJECTS.get(pid)
    if not p or not p["main"]:
        return {"stdout": "", "error": "The program isn't running. Press Run first.", "where": None, "disk": []}
    error = where = None
    with _InDir(p["dir"]) as io_:
        try:
            handle_fn = getattr(p["main"], "handle", None)
            if handle_fn is None:
                raise NameError(f"{p['main'].__name__}.py has no handle(line) function yet")
            reply = handle_fn(line)
            if reply is not None:
                print(reply)
        except BaseException as exc:  # noqa: BLE001
            error, where = _project_error(exc, p["files"])
    return {"stdout": io_.out.getvalue(), "error": error, "where": where, "disk": _disk(p["dir"])}


def project_tear(pid, name, keep):
    """Pull the plug in the middle of a write: the file keeps only part of its last record."""
    p = _PROJECTS.get(pid)
    d = p["dir"] if p else _project_dir(pid)
    path = os.path.join(d, name)
    if os.path.isfile(path):
        with open(path, "rb") as fh:
            raw = fh.read()
        body = raw.rstrip(b"\n")
        cut = body.rfind(b"\n") + 1
        last = body[cut:]
        with open(path, "wb") as fh:
            fh.write(body[:cut] + last[:max(1, int(len(last) * keep))])
    _unload(pid)
    return {"disk": _disk(d)}


def _test_helpers(pid, files, main):
    """What a ticket's tests can call: run a line, restart the program, read or tear the disk."""
    def run(line):
        r = project_call(pid, line)
        if r["error"]:
            raise RuntimeError(r["error"])
        return r["stdout"].rstrip("\n")

    def restart():
        r = project_load(pid, files, main)
        if r["error"]:
            raise RuntimeError(r["error"])

    def disk(name):
        path = os.path.join(_project_dir(pid), name)
        if not os.path.isfile(path):
            return None
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()

    def tear(name, keep=0.5):
        project_tear(pid, name, keep)
        restart()

    return {"run": run, "restart": restart, "disk": disk, "tear": tear}


def project_check(pid, files, main, tickets):
    """Run each ticket's tests, oldest first, each on a clean disk with a fresh start.
    tickets: [[title, tests], ...]. Stops at the first failing check, so there's one thing to fix."""
    tid = pid + ":check"
    results = []
    for title, tests in tickets:
        loaded = project_load(tid, files, main, wipe=True)
        try:
            stmts = _statements(tests or "")
        except SyntaxError as exc:
            return {"passed": False, "tickets": results, "error": f"Broken tests in '{title}': {exc}"}
        total = sum(1 for n, _ in stmts if isinstance(n, ast.Assert))
        res = {"title": title, "total": total, "ok": 0}
        results.append(res)
        if loaded["error"]:
            res.update(failed="(starting the program)", message=loaded["error"], where=loaded["where"])
            break
        ns = {"__name__": "__tests__", **_test_helpers(tid, files, main)}
        ns[main] = _PROJECTS[tid]["main"]
        with _InDir(_project_dir(tid)):
            for m in _PROJECTS[tid]["mods"]:
                # every file is visible to the tests, even one main doesn't import yet
                try:
                    ns[m] = importlib.import_module(m)
                except BaseException:  # noqa: BLE001 - a test that uses it will say what broke
                    pass
        with _InDir(_project_dir(tid)):
            for node, src in stmts:
                try:
                    exec(compile(ast.Module([node], []), "<tests>", "exec"), ns)
                    if isinstance(node, ast.Assert):
                        res["ok"] += 1
                except AssertionError as exc:
                    res.update(failed=src.strip(), message=str(exc) or "This check did not hold.")
                    break
                except BaseException as exc:  # noqa: BLE001
                    msg, where = _project_error(exc, files)
                    res.update(failed=src.strip(), message=msg, where=where)
                    break
        if "failed" in res:
            break
    _unload(tid)
    passed = len(results) == len(tickets) and all("failed" not in r for r in results)
    return {"passed": passed, "tickets": results, "error": None}


def project_session(pid, files, main, transcript, prompt):
    """Replay a terminal transcript ('prompt> cmd' lines, then the expected output) against the program.
    Returns the first line that differs, or None. Used by build.py --verify."""
    project_load(pid, files, main, wipe=True)
    cmd, want = None, []

    def flush():
        if cmd is None:
            return None
        if cmd == "!restart":
            project_load(pid, files, main)
            got = ""
        else:
            r = project_call(pid, cmd)
            if r["error"]:
                return f"{prompt}{cmd} raised {r['error']}"
            got = r["stdout"].rstrip("\n")
        if got != "\n".join(want).rstrip("\n"):
            return f"{prompt}{cmd}\n  expected: {chr(10).join(want)!r}\n  got:      {got!r}"
        return None

    for line in transcript.splitlines():
        if line.startswith(prompt) or line == "!restart":
            bad = flush()
            if bad:
                return bad
            cmd, want = (line[len(prompt):] if line.startswith(prompt) else line), []
        elif cmd is not None:
            want.append(line)
    bad = flush()
    _unload(pid)
    return bad


def handle(req):
    """Single entry point used by the worker and the dev server."""
    op = req.get("op")
    if op == "project_load":
        return project_load(req["pid"], req["files"], req["main"], req.get("wipe", False))
    if op == "project_call":
        return project_call(req["pid"], req["line"])
    if op == "project_tear":
        return project_tear(req["pid"], req["name"], req.get("keep", 0.5))
    if op == "project_check":
        return project_check(req["pid"], req["files"], req["main"], req["tickets"])
    if op == "cell":
        return cell(req["ns"], req.get("prelude", ""), req["code"])
    if op == "check":
        return check(req.get("prelude", ""), req.get("setup", ""), req["code"],
                     req.get("tests", ""), req.get("show", ""))
    if op == "reset":
        return reset(req["ns"])
    return {"error": f"unknown op {op!r}"}
