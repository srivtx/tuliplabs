"""Builds the question bank for the DSA mock test, content/ds-mock.json, from content/ds.json.

Every question comes from a block that build.py --verify already proves, turned into a form a timed test
can mark without running anything:
  mc       a quiz block, as it is
  out      a predict block, with its output computed here by real Python (only short, deterministic ones)
  line     a bug exercise whose fix changes exactly one line: click the broken line
  pattern  a write exercise's prompt: which chapter's technique solves it (the prompts that name it are left out)
  order    a parsons block: the right order, plus everything the page needs to run its tests

Generated "trace it" questions don't live here: learn/mock-gen.js makes fresh ones every time, and
tools/mock-check.js checks them against independent brute-force answers.

  python3 tools/mock.py          build it
  python3 tools/mock.py --stats  build it and count each kind per chapter"""
import difflib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")

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


def build(stats=False):
    data = json.load(open(os.path.join(CONTENT, "ds.json"), encoding="utf-8"))
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
        for sec in ch["sections"]:
            for b in sec["blocks"]:
                t = b["type"]
                if t == "quiz":
                    add({"kind": "mc", "id": b["id"], "q": b["q"], "opts": b["opts"], "why": b.get("why", "")}, ch)
                elif t == "predict":
                    outs = []
                    for seed in (0, 1):
                        random.seed(seed)
                        harness.reset(ch["id"] + ":mock")
                        r = harness.cell(ch["id"] + ":mock", ch["prelude"], b["code"])
                        outs.append(None if r["error"] or r["figures"] else r["stdout"])
                    out = outs[0]
                    if out is None or out != outs[1] or not out.strip():
                        continue
                    lines = out.rstrip("\n").split("\n")
                    if len(lines) > 6 or len(out) > 160 or len(b["code"].split("\n")) > 16:
                        continue  # too long to type in a test
                    hidden = set(re.findall(r"^(?:def|class)\s+(\w+)", ch["prelude"], re.M)) - set(re.findall(r"^\s*(?:def|class)\s+(\w+)", b["code"], re.M))
                    if any(re.search(r"\b" + name + r"\b", b["code"]) for name in hidden):
                        continue  # it calls a helper the test page doesn't show
                    add({"kind": "out", "id": b["id"], "code": b["code"], "out": out.rstrip("\n")}, ch)
                elif t == "exercise" and b.get("kind") == "bug":
                    a, s = b["starter"].rstrip("\n").split("\n"), b["solution"].rstrip("\n").split("\n")
                    ops = [o for o in difflib.SequenceMatcher(None, a, s).get_opcodes() if o[0] != "equal"]
                    if len(ops) != 1 or ops[0][0] != "replace" or ops[0][2] - ops[0][1] != 1 or ops[0][4] - ops[0][3] != 1:
                        continue  # the fix isn't exactly one line changed
                    i = ops[0][1]
                    if len(a) > 24:
                        continue
                    # the exercise's prompt describes the bug, so the question shows what the code should do instead: its first checks
                    checks = [l for l in b["tests"].split("\n") if l.startswith("assert ") and len(l) <= 110][:3]
                    # the shown checks must catch the bug: the buggy code fails them and the fixed code passes them
                    while checks and harness.check(ch["prelude"], b["setup"], b["starter"], "\n".join(checks))["passed"]:
                        more = [l for l in b["tests"].split("\n") if l.startswith("assert ") and len(l) <= 110 and l not in checks]
                        if not more or len(checks) >= 5:
                            checks = []
                            break
                        checks.append(more[0])
                    if not checks or not harness.check(ch["prelude"], b["setup"], b["solution"], "\n".join(checks))["passed"]:
                        continue
                    add({"kind": "line", "id": b["id"], "title": b.get("title", ""), "prompt": b["prompt"], "checks": checks, "code": b["starter"].rstrip("\n"), "line": i, "fix": s[ops[0][3]]}, ch)
                elif t == "exercise" and b.get("kind") == "write" and ch["num"] in PATTERN_CHAPTERS:
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
    chapters = [{"num": c["num"], "title": c["title"], "name": short_title(c), "part": c["part"], "prelude": c["prelude"], "pattern": c["num"] in PATTERN_CHAPTERS, "words": GIVEAWAY.get(c["num"], [])} for c in data["chapters"]]
    out = {"track": "ds", "chapters": chapters, "questions": qs}
    with open(os.path.join(CONTENT, "ds-mock.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    kinds = {}
    for q in qs:
        kinds[q["kind"]] = kinds.get(q["kind"], 0) + 1
    print(f"built ds-mock.json: {len(qs)} questions", json.dumps(kinds))
    if stats:
        for n in sorted(count):
            print(n, count[n])
    return out


if __name__ == "__main__":
    build("--stats" in sys.argv)
