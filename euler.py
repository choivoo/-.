"""Single-thread ordering: rim hops for odd nails + Eulerian trail (Hierholzer)."""
import random
import numpy as np


def euler_thread(pairs, n, seed=7):
    """pairs: list of (a,b) picture lines. Returns nail sequence of one thread and hop flags."""
    deg = np.zeros(n, int)
    for a, b in pairs: deg[a] += 1; deg[b] += 1
    odd = [i for i in range(n) if deg[i] % 2]
    # pair odd nails with rim neighbours; pick the cheaper of the two cyclic pairings
    def cost(off):
        return sum((odd[(k + off + 1) % len(odd)] - odd[(k + off) % len(odd)]) % n for k in range(0, len(odd), 2))
    off = 0 if cost(0) <= cost(1) else 1
    hops = [(odd[(k + off) % len(odd)], odd[(k + off + 1) % len(odd)]) for k in range(0, len(odd), 2)]
    edges = [(a, b, 0) for a, b in pairs] + [(a, b, 1) for a, b in hops]
    adj = [[] for _ in range(n)]
    for ei, (a, b, h) in enumerate(edges): adj[a].append((b, ei)); adj[b].append((a, ei))
    rng = random.Random(seed)                       # shuffled so the picture emerges evenly
    for l in adj: rng.shuffle(l)
    used = [False] * len(edges); ptr = [0] * n
    start = 0 if adj[0] else edges[0][0]
    stack = [(start, -1)]; trail = []
    while stack:
        v, ein = stack[-1]
        while ptr[v] < len(adj[v]) and used[adj[v][ptr[v]][1]]: ptr[v] += 1
        if ptr[v] == len(adj[v]):
            trail.append(stack.pop())
        else:
            u, ei = adj[v][ptr[v]]; used[ei] = True; stack.append((u, ei))
    assert all(used), "line graph not connected"
    trail.reverse()
    seq = [t[0] for t in trail]
    hop = [edges[t[1]][2] for t in trail[1:]]
    return seq, hop
