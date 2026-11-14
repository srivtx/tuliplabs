# DSA interview problems

Each block is one interview: built by `tools/interview.py` into `content/ds-interview.json`, proven with
`python3 tools/interview.py --verify`. Big tests allow 1.5 s, because Python in the page runs a few times
slower than on a laptop; the verifier checks each reference finishes with room to spare.

```interview
id: pairs
title: Pairs that hit the target
fn: count_pairs
ch: 3
decoys: 7, 6, 9, 28
bigo: O(n)
---prompt
A shop sells gift cards of different values. A customer wants to spend exactly `t` using **two different cards**.

Write `count_pairs(a, t)`: given the card values `a`, return how many pairs of positions `i < j` have `a[i] + a[j] == t`.

`count_pairs([1, 5, 3, 3, 4], 6)` is `2`: 1 + 5 and 3 + 3. `count_pairs([2, 4, 2], 6)` is also `2`, because each 2 pairs with the 4.
---examples
assert count_pairs([1, 5, 3, 3, 4], 6) == 2
assert count_pairs([2, 4, 2], 6) == 2
---clarify
+ tiny | Can the list be empty, or hold just one card? | Yes, both. With fewer than two cards there are no pairs, so return 0.
+ dups | Can two cards have the same value? | Yes, often. Count pairs of positions, so three 3s with t = 6 make 3 pairs.
+ neg | Can a value be negative or zero? | Yes: refunds show up as negative cards. Any whole number.
- | Is the list sorted? | No, it's in the order the cards were scanned.
- | Should I print the answer or return it? | Return it.
- | Which language should I use? | Whichever you're comfortable in. Python is fine.
---test tiny
assert count_pairs([], 5) == 0
assert count_pairs([5], 10) == 0
---test dups
assert count_pairs([3, 3, 3], 6) == 3
assert count_pairs([1, 1, 1, 1], 2) == 6
---test neg
assert count_pairs([-2, 7, 0, 5], 5) == 2
assert count_pairs([0, 0], 0) == 1
---test big
import random
random.seed(7)
big = [random.randint(-1000, 1000) for _ in range(200000)]
r, secs = timed(count_pairs, big, 17)
from collections import Counter
c = Counter(big)
assert r == sum(c[v] * c[17 - v] for v in c if v < 17 - v)
assert secs < 1.5, f"{secs:.2f} s for 200,000 cards: checking every pair is too slow"
---starter
def count_pairs(a, t):
    pass
---solution
def count_pairs(a, t):
    seen = {}
    pairs = 0
    for v in a:
        pairs += seen.get(t - v, 0)
        seen[v] = seen.get(v, 0) + 1
    return pairs
---brute
def count_pairs(a, t):
    n = len(a)
    return sum(1 for i in range(n) for j in range(i + 1, n) if a[i] + a[j] == t)
---approach
Walk the list once, keeping a count of every value seen so far. Each new value `v` pairs with every earlier `t - v`, so add that count, then record `v`. One pass, O(n).
---hint
Checking every pair is O(n²). For one card `v`, what value would its partner need to be?
---hint
Its partner is `t - v`. If you remember how many times each value has appeared *so far*, you know how many partners `v` has to its left.
---hint
Keep `seen = {}` of counts. For each `v`: add `seen.get(t - v, 0)` to the answer, then do `seen[v] += 1`. Adding before recording stops a card pairing with itself.
---twist
Good. Now the customer wants a **difference**, not a sum: count pairs `i < j` where `a[j] - a[i] == t` (the later card is worth exactly `t` more). Write `count_rises(a, t)`. For `[1, 4, 2, 5]` and `t = 3` that's `2`: 1 → 4 and 2 → 5.
---twisttests
assert count_rises([1, 4, 2, 5], 3) == 2
assert count_rises([5, 2], 3) == 0
assert count_rises([1, 1, 1], 0) == 3
assert count_rises([], 1) == 0
---twistsolution
def count_rises(a, t):
    seen = {}
    rises = 0
    for v in a:
        rises += seen.get(v - t, 0)
        seen[v] = seen.get(v, 0) + 1
    return rises
```

```interview
id: closest
title: The closest pair
fn: closest_sum
ch: 7
decoys: 3, 9, 15, 28
bigo: O(n)
---prompt
A lab has weights sorted from lightest to heaviest. You need two **different** weights whose total is as close as possible to a target `t`.

Write `closest_sum(a, t)`: `a` is sorted in ascending order. Return the smallest possible `abs(a[i] + a[j] - t)` over pairs `i < j`.

`closest_sum([1, 3, 4, 7, 10], 15)` is `1`: 4 + 10 = 14, which is 1 away. `closest_sum([2, 5, 9], 7)` is `0`: 2 + 5.
---examples
assert closest_sum([1, 3, 4, 7, 10], 15) == 1
assert closest_sum([2, 5, 9], 7) == 0
---clarify
+ tiny | What if there are fewer than two weights? | Then there's no pair. Return None.
+ dups | Can two weights be equal? | Yes, and two equal weights are still two different weights.
+ neg | Can weights or the target be negative? | Yes, they're offsets from a reference weight. Any whole numbers.
- | Is the list really sorted? | Yes, smallest first.
- | Do I need to return which pair it was? | No, just the distance.
- | Is there a time limit? | Aim for the best you can. We'll talk about cost before you code.
---test tiny
assert closest_sum([], 4) is None
assert closest_sum([3], 4) is None
---test dups
assert closest_sum([5, 5], 10) == 0
assert closest_sum([1, 4, 4, 9], 8) == 0
---test neg
assert closest_sum([-8, -3, 1, 6], -10) == 1
assert closest_sum([-5, -1], 0) == 6
---test big
import random
random.seed(3)
big = sorted(random.sample(range(-10**9, 10**9), 200000))
r, secs = timed(closest_sum, big, 123456789)
import bisect
best = None
for i, v in enumerate(big):
    k = bisect.bisect_left(big, 123456789 - v, i + 1)
    for j in (k - 1, k):
        if i < j < len(big):
            d = abs(v + big[j] - 123456789)
            best = d if best is None else min(best, d)
assert r == best
assert secs < 1.5, f"{secs:.2f} s for 200,000 weights: trying every pair is too slow"
---starter
def closest_sum(a, t):
    pass
---solution
def closest_sum(a, t):
    if len(a) < 2:
        return None
    i, j = 0, len(a) - 1
    best = abs(a[i] + a[j] - t)
    while i < j:
        s = a[i] + a[j]
        best = min(best, abs(s - t))
        if s < t:
            i += 1
        elif s > t:
            j -= 1
        else:
            return 0
    return best
---brute
def closest_sum(a, t):
    n = len(a)
    if n < 2:
        return None
    return min(abs(a[i] + a[j] - t) for i in range(n) for j in range(i + 1, n))
---approach
Put one finger on each end. If the pair is too small, only moving the left finger right can make it bigger; if too big, move the right finger left. Every step throws away one weight for good, so it's one pass, O(n).
---hint
The list is sorted. What does that tell you about `a[0] + a[-1]` compared with `a[1] + a[-1]`?
---hint
Start with `i = 0` and `j = len(a) - 1`. If `a[i] + a[j]` is below `t`, no pair using `a[i]` with anything left of `j` can be closer, so move `i`.
---hint
Loop while `i < j`: record `abs(s - t)`, then `i += 1` if `s < t`, `j -= 1` if `s > t`, and return 0 if it's exact.
---twist
Nice. Now the weights arrive **unsorted**, straight off the scale. Change `closest_sum(a, t)` so it works for any order. What does that cost now?
---twisttests
assert closest_sum([10, 1, 7, 4, 3], 15) == 1
assert closest_sum([9, 2, 5], 7) == 0
assert closest_sum([6, -8, 1, -3], -10) == 1
assert closest_sum([4], 4) is None
---twistsolution
def closest_sum(a, t):
    a = sorted(a)
    if len(a) < 2:
        return None
    i, j = 0, len(a) - 1
    best = abs(a[i] + a[j] - t)
    while i < j:
        s = a[i] + a[j]
        best = min(best, abs(s - t))
        if s < t:
            i += 1
        elif s > t:
            j -= 1
        else:
            return 0
    return best
```

```interview
id: distinct
title: Longest stretch with few kinds
fn: longest_k_kinds
ch: 8
decoys: 3, 7, 11, 31
bigo: O(n)
---prompt
A bird watcher logs one letter per bird they see, in order, like `"aabcbbd"`. They want the longest **unbroken** stretch of the log that has at most `k` different kinds of bird.

Write `longest_k_kinds(s, k)`: return the length of the longest substring of `s` with at most `k` distinct letters.

`longest_k_kinds("aabcbbd", 2)` is `4`: `"bcbb"`. `longest_k_kinds("abc", 3)` is `3`.
---examples
assert longest_k_kinds("aabcbbd", 2) == 4
assert longest_k_kinds("abc", 3) == 3
---clarify
+ empty | Can the log be empty? | Yes. Then the answer is 0.
+ kzero | Can k be 0? | Yes. No letters are allowed, so the answer is 0.
+ bigk | What if k is more than the number of kinds in the log? | Then the whole log counts.
- | Are the letters only lowercase? | Yes, a to z. It won't matter much.
- | Should I return the substring itself? | Just its length.
- | Can I use extra memory? | Yes, within reason.
---test empty
assert longest_k_kinds("", 2) == 0
---test kzero
assert longest_k_kinds("aaa", 0) == 0
---test bigk
assert longest_k_kinds("abcab", 10) == 5
assert longest_k_kinds("z", 1) == 1
---test big
import random
random.seed(11)
big = "".join("d" if i % 60000 == 59999 else random.choice("abc") for i in range(200000))
r, secs = timed(longest_k_kinds, big, 3)
from collections import Counter
c, i, want = Counter(), 0, 0
for j, ch in enumerate(big):
    c[ch] += 1
    while len(c) > 3:
        c[big[i]] -= 1
        if not c[big[i]]:
            del c[big[i]]
        i += 1
    want = max(want, j - i + 1)
assert r == want
assert secs < 1.5, f"{secs:.2f} s for 200,000 birds: restarting from every position is too slow"
---starter
def longest_k_kinds(s, k):
    pass
---solution
def longest_k_kinds(s, k):
    count = {}
    left = best = 0
    for right, ch in enumerate(s):
        count[ch] = count.get(ch, 0) + 1
        while len(count) > k:
            out = s[left]
            count[out] -= 1
            if count[out] == 0:
                del count[out]
            left += 1
        best = max(best, right - left + 1)
    return best
---brute
def longest_k_kinds(s, k):
    best = 0
    for i in range(len(s)):
        kinds = set()
        for j in range(i, len(s)):
            kinds.add(s[j])
            if len(kinds) > k:
                break
            best = max(best, j - i + 1)
    return best
---approach
Slide a window over the log. Grow it on the right one letter at a time, keeping a count per letter; whenever it holds more than `k` kinds, shrink it from the left until it's legal again. Each letter enters and leaves once: O(n).
---hint
If a stretch has too many kinds, any longer stretch containing it does too. So once it breaks, you never need to look further right with the same start.
---hint
Keep a window `s[left:right + 1]` and a dict of letter counts inside it. Move `right` every step; move `left` only when there are too many kinds.
---hint
After adding `s[right]`, `while len(count) > k:` take one off `count[s[left]]` (deleting it at zero) and step `left`. Then the window length `right - left + 1` is a candidate.
---twist
The watcher changes their mind: they want stretches with **exactly** `k` kinds. Write `longest_exactly_k(s, k)`, and return 0 if no stretch has exactly `k` kinds.
---twisttests
assert longest_exactly_k("aabcbbd", 2) == 4
assert longest_exactly_k("aab", 3) == 0
assert longest_exactly_k("abcab", 3) == 5
assert longest_exactly_k("", 1) == 0
assert longest_exactly_k("aaab", 1) == 3
---twistsolution
def longest_exactly_k(s, k):
    count = {}
    left = best = 0
    for right, ch in enumerate(s):
        count[ch] = count.get(ch, 0) + 1
        while len(count) > k:
            out = s[left]
            count[out] -= 1
            if count[out] == 0:
                del count[out]
            left += 1
        if len(count) == k:
            best = max(best, right - left + 1)
    return best
```

```interview
id: range
title: Where does it start and end?
fn: find_range
ch: 9
decoys: 3, 7, 4, 15
bigo: O(log n)
---prompt
A ledger keeps transaction amounts **sorted**. Auditors keep asking: where does amount `x` first appear, and where does it last appear?

Write `find_range(a, x)`: return a tuple `(first, last)` of the first and last index of `x` in the sorted list `a`. Each query should be fast, because the auditors ask thousands of them.

`find_range([1, 2, 2, 2, 5], 2)` is `(1, 3)`. `find_range([1, 3, 5], 5)` is `(2, 2)`.
---examples
assert find_range([1, 2, 2, 2, 5], 2) == (1, 3)
assert find_range([1, 3, 5], 5) == (2, 2)
---clarify
+ missing | What if x isn't in the list? | Return (-1, -1).
+ empty | Can the ledger be empty? | Yes. Then x is missing: (-1, -1).
+ dups | Can one amount fill most of the ledger? | Yes, a million copies of the same amount happens. Your answer must stay fast then too.
- | Is it sorted smallest first? | Yes.
- | Are the amounts whole numbers? | Yes.
- | Can I use the bisect module? | Yes, or write the search yourself.
---test missing
assert find_range([1, 3, 5], 4) == (-1, -1)
assert find_range([1, 3, 5], 9) == (-1, -1)
assert find_range([1, 3, 5], 0) == (-1, -1)
---test empty
assert find_range([], 3) == (-1, -1)
---test dups
assert find_range([7] * 10, 7) == (0, 9)
assert find_range([1, 7, 7], 7) == (1, 2)
---test big
import random, time
random.seed(5)
big = sorted([random.randint(0, 1000) for _ in range(100000)] + [500] * 100000)
qs = [random.randint(-5, 1005) for _ in range(3000)] + [500] * 100
t0 = time.perf_counter()
got = [find_range(big, q) for q in qs]
secs = time.perf_counter() - t0
import bisect
for q, g in zip(qs, got):
    lo, hi = bisect.bisect_left(big, q), bisect.bisect_right(big, q) - 1
    assert g == ((lo, hi) if lo <= hi else (-1, -1)), f"find_range(big, {q}) gave {g}"
assert secs < 1.5, f"{secs:.2f} s for 3,100 queries on 200,000 amounts: scanning is too slow"
---starter
def find_range(a, x):
    pass
---solution
def find_range(a, x):
    def first_at_least(v):
        lo, hi = 0, len(a)
        while lo < hi:
            mid = (lo + hi) // 2
            if a[mid] < v:
                lo = mid + 1
            else:
                hi = mid
        return lo
    lo = first_at_least(x)
    if lo == len(a) or a[lo] != x:
        return (-1, -1)
    return (lo, first_at_least(x + 1) - 1)
---brute
def find_range(a, x):
    idx = [i for i, v in enumerate(a) if v == x]
    return (idx[0], idx[-1]) if idx else (-1, -1)
---approach
Two binary searches: the first index whose value is at least `x`, and the first index whose value is at least `x + 1`. The answer is the first, and one before the second. Each is O(log n), even when `x` fills half the ledger.
---hint
Finding *one* copy with binary search is easy. Why isn't walking left and right from it fast enough?
---hint
Ask a different question: "what's the first index whose value is ≥ x?" That's a yes/no boundary, and binary search finds boundaries.
---hint
Write `first_at_least(v)` with `lo, hi = 0, len(a)`: if `a[mid] < v` set `lo = mid + 1`, else `hi = mid`. Then the range is `first_at_least(x)` to `first_at_least(x + 1) - 1`.
---twist
The auditors now want counts: write `count_between(a, lo, hi)`, the number of amounts with `lo <= amount <= hi`. Same sorted ledger, same need for speed.
---twisttests
assert count_between([1, 2, 2, 2, 5], 2, 4) == 3
assert count_between([1, 2, 2, 2, 5], 0, 9) == 5
assert count_between([1, 3, 5], 6, 9) == 0
assert count_between([], 1, 2) == 0
assert count_between([4, 4], 4, 4) == 2
---twistsolution
import bisect

def count_between(a, lo, hi):
    if lo > hi:
        return 0
    return bisect.bisect_right(a, hi) - bisect.bisect_left(a, lo)
```

```interview
id: higher
title: Wait for a higher price
fn: wait_for_higher
ch: 11
decoys: 12, 7, 15, 28
bigo: O(n)
---prompt
A trader looks at a list of daily prices. For each day they want to know: **how many days until the price is strictly higher** than today's?

Write `wait_for_higher(prices)`: return a list where entry `i` is the number of days after day `i` until a strictly higher price, or `0` if it never comes.

`wait_for_higher([3, 1, 4, 2, 5])` is `[2, 1, 2, 1, 0]`.
---examples
assert wait_for_higher([3, 1, 4, 2, 5]) == [2, 1, 2, 1, 0]
assert wait_for_higher([5, 4, 6]) == [2, 1, 0]
---clarify
+ equal | Does an equal price count as higher? | No, it must be strictly higher.
+ never | What if a higher price never comes? | Put 0 for that day.
+ empty | Can the list be empty? | Yes. Return an empty list.
- | Are prices whole numbers? | Yes, in cents.
- | Should I change the list in place? | No, return a new one.
- | How many days can there be? | Up to a few hundred thousand.
---test equal
assert wait_for_higher([2, 2, 3]) == [2, 1, 0]
assert wait_for_higher([4, 4, 4]) == [0, 0, 0]
---test never
assert wait_for_higher([9, 7, 5]) == [0, 0, 0]
---test empty
assert wait_for_higher([]) == []
---test big
big = list(range(150000, 0, -1)) + [10**6]
r, secs = timed(wait_for_higher, big)
assert r == [150000 - i for i in range(150000)] + [0]
assert secs < 1.5, f"{secs:.2f} s for 150,001 falling days: looking ahead from each day is too slow"
---starter
def wait_for_higher(prices):
    pass
---solution
def wait_for_higher(prices):
    out = [0] * len(prices)
    waiting = []
    for i, p in enumerate(prices):
        while waiting and prices[waiting[-1]] < p:
            j = waiting.pop()
            out[j] = i - j
        waiting.append(i)
    return out
---brute
def wait_for_higher(prices):
    out = []
    for i, p in enumerate(prices):
        d = 0
        for j in range(i + 1, len(prices)):
            if prices[j] > p:
                d = j - i
                break
        out.append(d)
    return out
---approach
Keep a stack of days still waiting for a higher price; their prices only fall from bottom to top. Each new price pops every waiting day it beats and fills in their answers, then waits itself. Every day is pushed and popped once: O(n).
---hint
On a falling market every day looks ahead a long way. What work is being repeated?
---hint
Keep the days that haven't found their answer yet. When a new price arrives, which of them does it answer?
---hint
A stack of indices: `while stack and prices[stack[-1]] < p:` pop `j` and set `out[j] = i - j`. Then push `i`.
---twist
The market is now a **loop**: after the last day comes the first day again. Write `wait_circular(prices)`: days until a strictly higher price, looking past the end and round to the start, or 0 if no price in the whole loop is higher.
---twisttests
assert wait_circular([3, 1, 4, 2, 5]) == [2, 1, 2, 1, 0]
assert wait_circular([5, 1, 2]) == [0, 1, 1]
assert wait_circular([2, 2]) == [0, 0]
assert wait_circular([]) == []
---twistsolution
def wait_circular(prices):
    n = len(prices)
    out = [0] * n
    waiting = []
    for k in range(2 * n):
        i = k % n
        while waiting and prices[waiting[-1]] < prices[i]:
            j = waiting.pop()
            out[j] = (i - j) % n
        if k < n:
            waiting.append(i)
    return out
```

```interview
id: median
title: The running middle
fn: running_median
ch: 15
decoys: 6, 9, 14, 11
bigo: O(n log n)
---prompt
A sensor sends readings one at a time. After **each** reading, a dashboard shows the middle value of everything seen so far.

Write `running_median(a)`: return a list whose entry `i` is the median of `a[0..i]`. When there's an even number of readings, use the **lower** of the two middle values, so every answer is a reading.

`running_median([5, 2, 8, 1])` is `[5, 2, 5, 2]`: after `5, 2` the middle two are 2 and 5, and the lower is 2.
---examples
assert running_median([5, 2, 8, 1]) == [5, 2, 5, 2]
assert running_median([1, 2, 3]) == [1, 1, 2]
---clarify
+ even | With an even count, which middle do I show? | The lower of the two middle values.
+ dups | Can readings repeat? | Yes, the same reading can arrive many times.
+ neg | Can readings be negative? | Yes, it's a thermometer in a freezer sometimes.
+ empty | Can there be no readings at all? | Yes. Return an empty list.
- | Do readings arrive sorted? | No, in any order.
- | Can I store all the readings? | Yes, memory is fine.
---test even
assert running_median([4, 9]) == [4, 4]
assert running_median([9, 4, 7, 3]) == [9, 4, 7, 4]
---test dups
assert running_median([3, 3, 3, 1]) == [3, 3, 3, 3]
---test neg
assert running_median([-1, -5, 0]) == [-1, -5, -1]
---test empty
assert running_median([]) == []
---test big
import random, heapq
random.seed(9)
big = [random.randint(-10**6, 10**6) for _ in range(100000)]
r, secs = timed(running_median, big)
lo, hi, want = [], [], []
for v in big:
    if lo and v > -lo[0]:
        heapq.heappush(hi, v)
    else:
        heapq.heappush(lo, -v)
    if len(lo) > len(hi) + 1:
        heapq.heappush(hi, -heapq.heappop(lo))
    elif len(hi) > len(lo):
        heapq.heappush(lo, -heapq.heappop(hi))
    want.append(-lo[0])
assert r == want
assert secs < 1.5, f"{secs:.2f} s for 100,000 readings: sorting after every reading is too slow"
---starter
def running_median(a):
    pass
---solution
import heapq

def running_median(a):
    low, high, out = [], [], []   # low is a max-heap (negated), high a min-heap
    for v in a:
        if low and v > -low[0]:
            heapq.heappush(high, v)
        else:
            heapq.heappush(low, -v)
        if len(low) > len(high) + 1:
            heapq.heappush(high, -heapq.heappop(low))
        elif len(high) > len(low):
            heapq.heappush(low, -heapq.heappop(high))
        out.append(-low[0])
    return out
---brute
def running_median(a):
    out = []
    for i in range(len(a)):
        s = sorted(a[:i + 1])
        out.append(s[i // 2])
    return out
---approach
Keep two heaps: a max-heap of the lower half and a min-heap of the upper half, with the lower half one bigger when the count is odd. The median is the top of the lower half. Each reading is a push and maybe one move: O(log n), so O(n log n) in all.
---hint
You only ever need the middle. Do you need the whole list in order to know it?
---hint
Split the readings into a lower half and an upper half. You need the biggest of the lower half fast, and the smallest of the upper half fast. Which structure gives you the top in O(1)?
---hint
Python's `heapq` is a min-heap; store negatives for the lower half. Push each reading to the right side, then move one top across if the sizes differ by more than one.
---twist
The dashboard changes: show the **k-th smallest** reading so far, or `None` until there are `k` readings. Write `running_kth(a, k)`.
---twisttests
assert running_kth([5, 2, 8, 1], 2) == [None, 5, 5, 2]
assert running_kth([3, 1, 2], 1) == [3, 1, 1]
assert running_kth([4, 4], 3) == [None, None]
assert running_kth([], 1) == []
---twistsolution
import heapq

def running_kth(a, k):
    keep, out = [], []   # the k smallest so far, as a max-heap (negated)
    for v in a:
        heapq.heappush(keep, -v)
        if len(keep) > k:
            heapq.heappop(keep)
        out.append(-keep[0] if len(keep) == k else None)
    return out
```

```interview
id: bookings
title: Merge the bookings
fn: merge_bookings
ch: 14
decoys: 15, 7, 16, 9
bigo: O(n log n)
---prompt
A meeting room's calendar is a list of bookings `[start, end]`, in no particular order. A booking holds the room from `start` up to, but not including, `end`.

Write `merge_bookings(bs)`: return the times the room is busy, as a sorted list of `[start, end]` blocks where overlapping bookings are joined into one.

`merge_bookings([[5, 8], [1, 3], [2, 4]])` is `[[1, 4], [5, 8]]`.
---examples
assert merge_bookings([[5, 8], [1, 3], [2, 4]]) == [[1, 4], [5, 8]]
assert merge_bookings([[1, 10], [2, 3]]) == [[1, 10]]
---clarify
+ touch | If one booking ends at 3 and the next starts at 3, is that one block? | Yes. The room is never free in between, so join them.
+ unsorted | Are the bookings in time order? | No, they're in the order people made them.
+ empty | Can the calendar be empty? | Yes. Return an empty list.
- | Can a booking have start equal to end? | No, every booking is at least one unit long.
- | Are times whole numbers? | Yes, minutes since midnight.
- | Can I sort the input in place? | Better not; make a sorted copy.
---test touch
assert merge_bookings([[1, 3], [3, 5]]) == [[1, 5]]
assert merge_bookings([[1, 2], [4, 5]]) == [[1, 2], [4, 5]]
---test unsorted
assert merge_bookings([[8, 9], [1, 2], [5, 7], [6, 8]]) == [[1, 2], [5, 9]]
---test empty
assert merge_bookings([]) == []
---test big
import random
random.seed(2)
big = []
for i in range(100000):
    s = random.randint(0, 10**8)
    big.append([s, s + random.randint(1, 600)])
r, secs = timed(merge_bookings, [b[:] for b in big])
want = []
for s, e in sorted(big):
    if want and s <= want[-1][1]:
        want[-1][1] = max(want[-1][1], e)
    else:
        want.append([s, e])
assert r == want
assert secs < 1.5, f"{secs:.2f} s for 100,000 bookings: comparing every pair is too slow"
---starter
def merge_bookings(bs):
    pass
---solution
def merge_bookings(bs):
    out = []
    for s, e in sorted(bs):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out
---brute
def merge_bookings(bs):
    blocks = [list(b) for b in bs]
    changed = True
    while changed:
        changed = False
        for i in range(len(blocks)):
            for j in range(i + 1, len(blocks)):
                a, b = blocks[i], blocks[j]
                if a[0] <= b[1] and b[0] <= a[1]:
                    blocks[i] = [min(a[0], b[0]), max(a[1], b[1])]
                    del blocks[j]
                    changed = True
                    break
            if changed:
                break
    return sorted(blocks)
---approach
Sort by start time. Then walk once: a booking that starts before (or exactly when) the current block ends extends it; otherwise it starts a new block. Sorting is O(n log n) and the walk is O(n).
---hint
If the bookings were in start order, which booking could the next one possibly overlap with?
---hint
Sort them. Then each booking only needs comparing with the last block you've built so far.
---hint
For each `[s, e]` in sorted order: if `s <= out[-1][1]`, set `out[-1][1] = max(out[-1][1], e)`; otherwise append `[s, e]`.
---twist
The office wants fewer rooms. Write `rooms_needed(bs)`: the smallest number of rooms that fits every booking, where a booking ending at 3 frees its room for one starting at 3.
---twisttests
assert rooms_needed([[1, 4], [2, 5], [7, 9]]) == 2
assert rooms_needed([[1, 3], [3, 5]]) == 1
assert rooms_needed([[1, 10], [2, 3], [4, 5], [2, 9]]) == 3
assert rooms_needed([]) == 0
---twistsolution
def rooms_needed(bs):
    events = sorted([(s, 1) for s, e in bs] + [(e, -1) for s, e in bs])
    busy = most = 0
    for _, d in events:
        busy += d
        most = max(most, busy)
    return most
```

```interview
id: maze
title: Out of the warehouse
fn: shortest_path
ch: 19
decoys: 20, 23, 30, 27
bigo: O(rows × cols)
bigos: O(rows + cols); O(rows × cols); O(rows × cols × log(rows × cols)); O(2^(rows × cols))
---prompt
A robot starts in the top-left corner of a warehouse floor and must reach the bottom-right corner. The floor is a list of strings: `.` is open floor and `#` is a shelf. The robot moves one square up, down, left or right per step.

Write `shortest_path(grid)`: return the fewest steps to get from the top-left to the bottom-right, or `-1` if it can't be done.

For `[".#.", "...", "#.."]` the answer is `4`.
---examples
assert shortest_path([".#.", "...", "#.."]) == 4
assert shortest_path([".#", "#."]) == -1
---clarify
+ blocked | What if the start or the end square is a shelf? | Then the robot can't do it: return -1.
+ single | Can the floor be a single square? | Yes. The robot is already there: 0 steps.
+ nodiag | Can the robot move diagonally? | No, only up, down, left and right.
- | Is every row the same length? | Yes, the floor is a rectangle.
- | Does it matter which path I take? | No, only how many steps.
- | Can the robot step off the floor? | No, it stays on the grid.
---test blocked
assert shortest_path(["#.", ".."]) == -1
assert shortest_path(["..", ".#"]) == -1
---test single
assert shortest_path(["."]) == 0
---test nodiag
assert shortest_path([".#", ".."]) == 2
assert shortest_path([".#", "#."]) == -1
---test big
n = 301
rows = []
for r in range(n):
    if r % 2 == 1:
        rows.append(("#" * (n - 1) + ".") if r % 4 == 1 else ("." + "#" * (n - 1)))
    else:
        rows.append("." * n)
r, secs = timed(shortest_path, rows)
from collections import deque
dist = {(0, 0): 0}
q = deque([(0, 0)])
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < n and 0 <= nx < n and rows[ny][nx] == "." and (ny, nx) not in dist:
            dist[(ny, nx)] = dist[(y, x)] + 1
            q.append((ny, nx))
assert r == dist[(n - 1, n - 1)]
assert secs < 1.5, f"{secs:.2f} s on a 301 × 301 snake: exploring every path is too slow"
---starter
def shortest_path(grid):
    pass
---solution
from collections import deque

def shortest_path(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == "#" or grid[-1][-1] == "#":
        return -1
    dist = [[-1] * cols for _ in range(rows)]
    dist[0][0] = 0
    q = deque([(0, 0)])
    while q:
        r, c = q.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return dist[r][c]
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "." and dist[nr][nc] < 0:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return -1
---brute
def shortest_path(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == "#" or grid[-1][-1] == "#":
        return -1
    best = [[None] * cols for _ in range(rows)]
    changed = True
    best[0][0] = 0
    while changed:
        changed = False
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] != "." or best[r][c] is None:
                    continue
                for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == ".":
                        if best[nr][nc] is None or best[nr][nc] > best[r][c] + 1:
                            best[nr][nc] = best[r][c] + 1
                            changed = True
    v = best[-1][-1]
    return -1 if v is None else v
---approach
Breadth-first search from the start. A queue visits squares in order of distance, so the first time you reach a square is by a shortest route; mark it and never visit it again. Each square is handled once: O(rows × cols).
---hint
Every step costs the same. Which search reaches the squares in order of how far away they are?
---hint
Use a queue: start at (0, 0) with distance 0, and from each square add its open, unvisited neighbours with distance + 1.
---hint
`collections.deque`, a `dist` grid of -1s, and mark a square the moment you add it to the queue, not when you take it out, so nothing is queued twice.
---twist
The robot gets a forklift: it may **remove at most one shelf** along the way. Write `shortest_path_one_wall(grid)`: fewest steps, where stepping onto one `#` square is allowed once. The start and end squares are always open in this version.
---twisttests
assert shortest_path_one_wall([".#", "#."]) == 2
assert shortest_path_one_wall([".#.", "##.", "..."]) == 4
assert shortest_path_one_wall(["..", ".."]) == 2
assert shortest_path_one_wall([".##", "###", "##."]) == -1
assert shortest_path_one_wall(["."]) == 0
---twistsolution
from collections import deque

def shortest_path_one_wall(grid):
    rows, cols = len(grid), len(grid[0])
    seen = {(0, 0, 0)}
    q = deque([(0, 0, 0, 0)])
    while q:
        r, c, used, d = q.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return d
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols:
                nu = used + (grid[nr][nc] == "#")
                if nu <= 1 and (nr, nc, nu) not in seen:
                    seen.add((nr, nc, nu))
                    q.append((nr, nc, nu, d + 1))
    return -1
```

```interview
id: groups
title: How many friend groups?
fn: count_groups
ch: 22
decoys: 19, 21, 25, 3
bigo: O(n + m)
bigos: O(n + m); O(n × m); O((n + m) log n); O(n²)
---prompt
A social app has `n` people, numbered `0` to `n - 1`, and a list of friendships `links`, each a pair `(a, b)`. Friends of friends are in the same group.

Write `count_groups(n, links)`: return how many separate groups there are. Someone with no friends is a group of one.

`count_groups(5, [(0, 1), (1, 2), (3, 4)])` is `2`.

(Here `m` is the number of links.)
---examples
assert count_groups(5, [(0, 1), (1, 2), (3, 4)]) == 2
assert count_groups(3, []) == 3
---clarify
+ zero | Can there be zero people? | Yes. Then there are no groups: 0.
+ self | Can someone be linked to themselves? | Yes, it's a glitch in the app. It changes nothing.
+ dups | Can the same friendship appear twice? | Yes, in either order: (1, 2) and (2, 1).
- | Is friendship two-way? | Yes, if a is b's friend then b is a's.
- | Do I need to list the groups? | No, just count them.
- | Are the numbers always in range? | Yes, from 0 to n - 1.
---test zero
assert count_groups(0, []) == 0
---test self
assert count_groups(2, [(0, 0), (1, 1)]) == 2
---test dups
assert count_groups(3, [(1, 2), (2, 1), (1, 2)]) == 2
---test big
n = 200000
links = [(i, i + 1) for i in range(0, n - 1, 2)] + [(i, i + 2) for i in range(0, n - 2, 2)]
r, secs = timed(count_groups, n, links)
assert r == 1
assert secs < 1.5, f"{secs:.2f} s for 200,000 people: relabelling whole groups on every link is too slow"
---starter
def count_groups(n, links):
    pass
---solution
def count_groups(n, links):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    groups = n
    for a, b in links:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            groups -= 1
    return groups
---brute
def count_groups(n, links):
    label = list(range(n))
    for a, b in links:
        la, lb = label[a], label[b]
        if la != lb:
            for i in range(n):
                if label[i] == la:
                    label[i] = lb
    return len(set(label))
---approach
Union-find: every person points towards a representative of their group. A link finds both representatives and, if they differ, joins one under the other, which removes one group. With path halving each find is nearly O(1), so it's about O(n + m).
---hint
You start with `n` groups. What happens to the count each time a link joins two *different* groups?
---hint
Give everyone a `parent`, starting as themselves. A group is everyone who reaches the same root by following parents.
---hint
For each link, `ra, rb = find(a), find(b)`; if they differ, `parent[ra] = rb` and the count drops by one. Make `find` shorten the path as it walks: `parent[x] = parent[parent[x]]`.
---twist
Now the app wants a live number: write `largest_after_each(n, links)`, which returns a list with the size of the **biggest group after each link** is added.
---twisttests
assert largest_after_each(5, [(0, 1), (1, 2), (3, 4)]) == [2, 3, 3]
assert largest_after_each(2, [(0, 0)]) == [1]
assert largest_after_each(4, [(0, 1), (2, 3), (1, 3)]) == [2, 2, 4]
assert largest_after_each(3, []) == []
---twistsolution
def largest_after_each(n, links):
    parent = list(range(n))
    size = [1] * n

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    best, out = 1 if n else 0, []
    for a, b in links:
        ra, rb = find(a), find(b)
        if ra != rb:
            if size[ra] > size[rb]:
                ra, rb = rb, ra
            parent[ra] = rb
            size[rb] += size[ra]
            best = max(best, size[rb])
        out.append(best)
    return out
```

```interview
id: stalls
title: Pick the stalls
fn: best_picks
ch: 28
decoys: 16, 27, 15, 8
bigo: O(n)
---prompt
A street market has a row of stalls, each with a value `vals[i]` you'd earn by running it. The rules say you can't run **two neighbouring stalls**.

Write `best_picks(vals)`: return the most you can earn.

`best_picks([2, 7, 9, 3, 1])` is `12`: stalls 0, 2 and 4 give 2 + 9 + 1.
---examples
assert best_picks([2, 7, 9, 3, 1]) == 12
assert best_picks([5, 1, 1, 5]) == 10
---clarify
+ empty | Can the row be empty? | Yes. Then you earn 0.
+ one | Can there be just one stall? | Yes. Take it if it's worth something.
+ neg | Can a stall lose money (a negative value)? | Yes. You don't have to run it, so you'd skip it.
- | Do I have to say which stalls? | No, just the total.
- | Are values whole numbers? | Yes.
- | Can I run zero stalls? | Yes, and then you earn 0.
---test empty
assert best_picks([]) == 0
---test one
assert best_picks([4]) == 4
---test neg
assert best_picks([-3, -1]) == 0
assert best_picks([-2, 5, -1, 4]) == 9
assert best_picks([3, -10, -10, 3]) == 6
---test big
import random
random.seed(4)
big = [random.randint(-50, 100) for _ in range(200000)]
r, secs = timed(best_picks, big)
take = skip = 0
for v in big:
    take, skip = skip + v, max(take, skip)
assert r == max(take, skip, 0)
assert secs < 1.5, f"{secs:.2f} s for 200,000 stalls: trying every choice is far too slow"
---starter
def best_picks(vals):
    pass
---solution
def best_picks(vals):
    take = skip = 0   # best total if the last stall is taken / not taken
    for v in vals:
        take, skip = skip + v, max(take, skip)
    return max(take, skip)
---brute
def best_picks(vals):
    def best(i):
        if i >= len(vals):
            return 0
        return max(best(i + 1), vals[i] + best(i + 2))
    return best(0)
---approach
Walk the stalls once, keeping two numbers: the best total if the last stall was run, and the best if it wasn't. A stall can only be run if the one before wasn't. That's dynamic programming with O(1) memory: O(n).
---hint
Trying every set of stalls doubles with each stall. What's the only thing about the past that limits your choice for stall `i`?
---hint
Whether stall `i - 1` was taken. So keep the best total ending "taken" and the best ending "not taken".
---hint
For each `v`: `take, skip = skip + v, max(take, skip)`. The answer is `max(take, skip)`, which is never below 0 because `skip` starts at 0.
---twist
The market moves to a **roundabout**: the stalls form a circle, so the first and the last are neighbours too. Write `best_picks_circle(vals)`.
---twisttests
assert best_picks_circle([2, 3, 2]) == 3
assert best_picks_circle([1, 2, 3, 1]) == 4
assert best_picks_circle([5]) == 5
assert best_picks_circle([]) == 0
assert best_picks_circle([4, 1, 1, 4]) == 5
---twistsolution
def best_picks_circle(vals):
    def line(vs):
        take = skip = 0
        for v in vs:
            take, skip = skip + v, max(take, skip)
        return max(take, skip)
    if len(vals) <= 1:
        return max(vals[0], 0) if vals else 0
    return max(line(vals[1:]), line(vals[:-1]))
```
