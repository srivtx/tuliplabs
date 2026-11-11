"""Builds the question banks for every track's mock test, content/<track>-mock.json, from content/<track>.json.

Every question comes from a block that build.py --verify already proves, turned into a form a timed test
can mark without running anything:
  mc       a quiz block, as it is
  out      a predict block, with its output computed here by real Python (only short, deterministic ones)
  line     a bug exercise whose fix changes one line (or two side by side): click the broken line
  explain  a chapter's "explain it" card: say it in your own words, then compare with the model answer
  pattern  (DSA) a write exercise's prompt: which chapter's technique solves it (the prompts that name it are left out)
  order    a parsons block: the right order, plus everything the page needs to run its tests

Chapters that run in Node (lang: node) are run in Node in a box (learn/wb-node.js, via tools/mock-node.js),
the runtime their page uses. Generated "trace it" questions don't live here: learn/mock-gen.js (DSA) and
learn/mock-gen-x.js (the rest) make fresh ones every time, and tools/mock-check.js runs them for real.

  python3 tools/mock.py [track ...]          build them (all tracks if none given)
  python3 tools/mock.py --stats [track ...]  build them and count each kind per chapter"""
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
TRACKS = ["ds", "bx", "ps", "ms", "tc"]


def node_run(reqs):
    """Run requests in Node in a box; one result per request."""
    if not reqs:
        return []
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(reqs, fh)
    try:
        out = subprocess.run(["node", os.path.join(ROOT, "tools", "mock-node.js"), fh.name], capture_output=True, text=True, timeout=600)
        return json.loads(out.stdout)
    finally:
        os.unlink(fh.name)

# words that give the technique away in a prompt, per chapter: a prompt holding one isn't a "which pattern?" question
GIVEAWAY = {
    3: ["hash", "dict", "set("], 4: ["prefix", "difference array"], 5: ["recurs"], 6: ["sort"], 7: ["pointer"],
    8: ["window"], 9: ["binary search", "bisect"], 10: ["binary search", "bisect"], 11: ["stack"], 12: ["deque", "queue"],
    13: ["linked", "node"], 14: ["interval", "sweep"], 15: ["heap", "heapq"], 16: ["greedy"], 17: ["tree", "traversal"],
    18: ["bst", "search tree"], 19: ["bfs", "breadth"], 20: ["dfs", "depth-first"], 21: ["topolog"], 22: ["union", "find("],
    23: ["dijkstra"], 24: ["bellman", "floyd"], 25: ["spanning", "kruskal", "prim"], 26: ["trie"], 27: ["backtrack"],
    28: ["dp", "dynamic"], 29: ["knapsack", "dp"], 30: ["dp", "grid"], 31: ["dp"], 32: ["dp", "interval"], 33: ["bitmask", "mask", "dp"],
    34: ["dp", "tree"], 35: ["digit", "dp"], 36: ["dp"], 37: ["gcd", "mod"], 38: ["prime", "sieve"], 39: ["power", "inverse"],
    40: ["choose", "binomial", "count"], 41: ["bit", "xor"], 42: ["matrix"], 43: ["segment"], 44: ["lazy", "segment"],
    45: ["fenwick", "bit"], 46: ["sparse"], 47: ["lca", "ancestor", "lifting"], 48: ["kmp", "z-function", "z function"],
    49: ["hash"], 50: ["suffix"], 51: ["strongly", "scc"], 52: ["bridge", "articulation"], 53: ["flow"], 54: ["matching", "bipartite"],
    55: ["2-sat", "sat"], 56: ["euler"], 58: ["grundy", "nim"], 59: ["meet in the middle", "sqrt", "square root"],
}
# chapters whose exercises are about a technique you'd name: the rest (Big-O, arrays, constructive, stress tests) aren't
PATTERN_CHAPTERS = set(GIVEAWAY) - {57}


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)


# a sentence that tells you how to solve it. The statement comes first in every prompt and the how-to after,
# so the question keeps everything before the first such sentence
HOW = re.compile(r"\b(use|using|uses|start with|start from|store|the idea|keep|walk|always|try|hint|instead|so you|you only need|you'll need|trick|precompute|sort|sorted first|o\(|bottom-up|top-down|memo|recurrence|by computing|repeatedly|kahn|greedil|greedy|heap|stack|queue|compare each|for each|then|check for|push|pop|xor =|binary|two pointers|window|prefix|dp|recurs|dfs|bfs|graph|edge|node|tree|mask|bit|hash|set|dict|count them|in one go|drive forward|take each|half|halves|partner|the first .* that|each step|state)\b|[=:] ?[A-Za-z]\(|\bd\(n|→ ?\w+\(", re.I)
ASKS = re.compile(r"\b(return|count|find|how many|can you|is it|write|compute|what|which|print|output|decide)\b", re.I)
CONTINUES = re.compile(r"^(same|flip|now|this time|again|as before|like before|the same|also|next|then|harder|bonus|follow-up)\b", re.I)


def statement_only(html):
    """The problem statement up to its first how-to sentence, as HTML. Sentences end at '. ' outside tags."""
    text = re.sub(r"</p>\s*<p>", " ", html)
    sentences = re.split(r"(?<=[.?!])\s+(?=[A-Z(\"'])", text)
    kept = []
    for x in sentences:
        plain = strip_tags(x)
        if HOW.search(plain) or re.match(r"(it'?s|it is|this is|same)\b", plain, re.I) or re.search(r"\bsame\b", plain, re.I):
            break
        kept.append(x)
    out = " ".join(kept).strip()
    if not out or not ASKS.search(strip_tags(out)):
        return ""  # cut before it asks anything
    out = re.sub(r"^<p>|</p>$", "", out)
    return "<p>" + out + "</p>"


def short_title(ch):
    return re.split(r" \(|:", ch["title"])[0]


def one_change(starter, solution):
    """The lines a bug fix changes, if it's one block of one or two lines replaced by as many: (first, count, new lines)."""
    a, s = starter.rstrip("\n").split("\n"), solution.rstrip("\n").split("\n")
    ops = [o for o in difflib.SequenceMatcher(None, a, s).get_opcodes() if o[0] != "equal"]
    if len(ops) != 1 or ops[0][0] != "replace":
        return None
    n = ops[0][2] - ops[0][1]
    if n not in (1, 2) or ops[0][4] - ops[0][3] != n:
        return None
    return ops[0][1], n, s[ops[0][3]:ops[0][4]]


def build_track(track, stats=False):
    data = json.load(open(os.path.join(CONTENT, track + ".json"), encoding="utf-8"))
    sys.path.insert(0, os.path.join(ROOT, "learn"))
    cwd = os.getcwd()
    os.chdir(os.path.join(ROOT, "learn"))
    os.environ["MPLBACKEND"] = "Agg"
    import harness
    import random
    qs, count = [], {}

    def add(q, ch):
        q["ch"] = ch["num"]
        qs.append(q)
        count.setdefault(ch["num"], {}).setdefault(q["kind"], 0)
        count[ch["num"]][q["kind"]] += 1

    for ch in data["chapters"]:
        node = ch.get("lang") == "node"
        blocks = [b for sec in ch["sections"] for b in sec["blocks"]]

        # what each predict block prints (twice, to be sure it's the same each time), and whether each bug
        # exercise's shown checks catch the bug: in Python here, or in Node in a box for a Node chapter
        def outputs(code):
            if node:
                r = node_run([{"op": "cell", "ns": ch["id"] + ":mock" + str(k), "code": code} for k in (0, 1)])
                return [None if x["error"] else x["stdout"] for x in r]
            res = []
            for seed in (0, 1):
                random.seed(seed)
                harness.reset(ch["id"] + ":mock")
                r = harness.cell(ch["id"] + ":mock", ch["prelude"], code)
                res.append(None if r["error"] or r["figures"] else r["stdout"])
            return res

        def passes(setup, code, tests):
            if node:
                return node_run([{"op": "check", "setup": setup, "code": code, "tests": tests}])[0]["passed"]
            return harness.check(ch["prelude"], setup, code, tests)["passed"]

        for b in blocks:
            t = b["type"]
            if t == "quiz":
                add({"kind": "mc", "id": b["id"], "q": b["q"], "opts": b["opts"], "why": b.get("why", "")}, ch)
            elif t == "recall" and b.get("q") and b.get("a"):
                add({"kind": "explain", "id": b["id"], "q": b["q"], "a": b["a"]}, ch)
            elif t == "predict":
                outs = outputs(b["code"])
                out = outs[0]
                if out is None or out != outs[1] or not out.strip():
                    continue
                lines = out.rstrip("\n").split("\n")
                if len(lines) > 6 or len(out) > 160 or len(b["code"].split("\n")) > 18:
                    continue  # too long to type in a test
                if not node:
                    hidden = set(re.findall(r"^(?:def|class)\s+(\w+)", ch["prelude"], re.M)) - set(re.findall(r"^\s*(?:def|class)\s+(\w+)", b["code"], re.M))
                    if any(re.search(r"\b" + name + r"\b", b["code"]) for name in hidden):
                        continue  # it calls a helper the test page doesn't show
                add({"kind": "out", "id": b["id"], "code": b["code"], "out": out.rstrip("\n")}, ch)
            elif t == "exercise" and b.get("kind") == "bug":
                change = one_change(b["starter"], b["solution"])
                if not change or len(b["starter"].rstrip("\n").split("\n")) > 28:
                    continue
                i, n, fix = change
                if node:
                    # a Node exercise's checks send requests, then assert on the answers: show them whole, if short
                    tl = [l for l in b["tests"].rstrip("\n").split("\n") if l.strip()]
                    if len(tl) > 12 or max(len(l) for l in tl) > 110:
                        continue
                    checks = tl
                else:
                    # the exercise's prompt describes the bug, so the question shows what the code should do instead: its first checks
                    checks = [l for l in b["tests"].split("\n") if l.startswith("assert ") and len(l) <= 110][:3]
                    # the shown checks must catch the bug: the buggy code fails them and the fixed code passes them
                    while checks and passes(b["setup"], b["starter"], "\n".join(checks)):
                        more = [l for l in b["tests"].split("\n") if l.startswith("assert ") and len(l) <= 110 and l not in checks]
                        if not more or len(checks) >= 5:
                            checks = []
                            break
                        checks.append(more[0])
                if not checks or passes(b["setup"], b["starter"], "\n".join(checks)) or not passes(b["setup"], b["solution"], "\n".join(checks)):
                    continue
                add({"kind": "line", "id": b["id"], "title": b.get("title", ""), "prompt": b["prompt"], "checks": checks, "code": b["starter"].rstrip("\n"),
                     "line": i, "lines": list(range(i, i + n)), "fix": "\n".join(fix)}, ch)
            elif track == "ds" and t == "exercise" and b.get("kind") == "write" and ch["num"] in PATTERN_CHAPTERS:
                prompt = statement_only(b["prompt"])
                text = strip_tags(prompt).lower()
                if CONTINUES.match(text.strip()):
                    continue
                if not 90 <= len(text) <= 600 or re.search(r"\b(above|previous|same as|last exercise|again)\b", text):
                    continue
                if any(w in text for w in GIVEAWAY[ch["num"]]):
                    continue
                add({"kind": "pattern", "id": b["id"], "prompt": prompt, "title": b.get("title", "")}, ch)
            elif t == "parsons" and len(b["lines"]) <= 14:
                add({"kind": "order", "id": b["id"], "title": b.get("title", ""), "prompt": b.get("prompt", ""), "lines": b["lines"], "distractors": b.get("distractors", []),
                     "setup": b.get("setup", ""), "tests": b.get("tests", "")}, ch)
    os.chdir(cwd)
    chapters = [{"num": c["num"], "title": c["title"], "name": short_title(c), "part": c.get("part", ""), "prelude": c["prelude"], "lang": c.get("lang", "py"),
                 "pattern": track == "ds" and c["num"] in PATTERN_CHAPTERS, "words": GIVEAWAY.get(c["num"], []) if track == "ds" else []} for c in data["chapters"]]
    out = {"track": track, "chapters": chapters, "questions": qs}
    with open(os.path.join(CONTENT, track + "-mock.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    kinds = {}
    for q in qs:
        kinds[q["kind"]] = kinds.get(q["kind"], 0) + 1
    print(f"built {track}-mock.json: {len(qs)} questions", json.dumps(kinds))
    if stats:
        for n in sorted(count):
            print(" ", n, count[n])
    return out


def build(stats=False, tracks=None):
    for t in tracks or TRACKS:
        build_track(t, stats)


if __name__ == "__main__":
    build("--stats" in sys.argv, [a for a in sys.argv[1:] if not a.startswith("--")])
