"""Global string-art solver.
1. choose the best multiset of nail-to-nail lines out of ALL allowed pairs
   (greedy add with exact re-check, then remove/re-add improvement rounds);
2. turn that set into ONE continuous thread: nails with an odd number of lines are
   paired with their rim neighbour by a short hop along the frame edge, then an
   Eulerian trail (Hierholzer) orders every line so each starts where the last ended.
usage: solve2.py N_LINES R S ROUNDS
"""
import sys, os, json, math, time
import numpy as np, cv2
from numba import njit, prange
import solve
from euler import euler_thread
from solve import make_target, nail_positions, line_delta, line_apply, total_err, N_NAILS, MIN_GAP, OUT

N = int(sys.argv[1]); R = int(sys.argv[2]); S = float(sys.argv[3]); ROUNDS = int(sys.argv[4]); SWEEPS = int(sys.argv[5]) if len(sys.argv) > 5 else 6
MAXMULT = 2


@njit(cache=True, parallel=True, fastmath=True)
def score_all(G, H, P, A, B):
    """2nd-order estimate of error change for adding each candidate line."""
    m = A.shape[0]; out = np.empty(m); n = G.shape[0]
    for i in prange(m):
        x0 = P[A[i], 0]; y0 = P[A[i], 1]; x1 = P[B[i], 0]; y1 = P[B[i], 1]
        steep = abs(y1 - y0) > abs(x1 - x0)
        if steep: x0, y0, x1, y1 = y0, x0, y1, x1
        if x0 > x1: x0, x1, y0, y1 = x1, x0, y1, y0
        g = (y1 - y0) / (x1 - x0); a = math.sqrt(1 + g * g); tot = 0.0
        for x in range(max(int(math.ceil(x0)), 0), min(int(math.floor(x1)), n - 1) + 1):
            y = y0 + g * (x - x0); yi = int(math.floor(y)); f = y - yi
            for k in range(2):
                yy = yi + k
                if yy < 0 or yy >= n: continue
                v = a * ((1 - f) if k == 0 else f)
                if steep: tot += v * G[x, yy] + v * v * H[x, yy]
                else: tot += v * G[yy, x] + v * v * H[yy, x]
        out[i] = tot
    return out


def grads(L, D, W, s):
    T = np.exp(-s * L); e = D - (1 - T)            # E = W e^2, de/dL = -s T
    G = -2 * W * e * s * T
    Hh = W * (s * T) ** 2 + W * e * s * s * T      # 1/2 d2E/dL2
    return G, Hh


def add_lines(L, D, W, P, A, B, mult, want, K=40):
    added = 0
    while added < want:
        G, H = grads(L, D, W, S)
        sc = score_all(G, H, P, A, B)
        sc[mult >= MAXMULT] = 0
        order = np.argsort(sc)[:K]
        got = 0
        for i in order:
            if added >= want or sc[i] >= 0: break
            d = line_delta(L, D, W, S, *P[A[i]], *P[B[i]], 1.0)
            if d < 0.6 * sc[order[0]] * 0.25 or (d < 0 and got == 0):
                line_apply(L, *P[A[i]], *P[B[i]], 1.0); mult[i] += 1; added += 1; got += 1
        if got == 0: break
    return added


def remove_worst(L, D, W, P, A, B, mult, k):
    idx = np.nonzero(mult)[0]
    d = np.array([line_delta(L, D, W, S, *P[A[i]], *P[B[i]], -1.0) for i in idx])
    for j in np.argsort(d)[:k]:
        i = idx[j]
        line_apply(L, *P[A[i]], *P[B[i]], -1.0); mult[i] -= 1
    return k


@njit(cache=True)
def local_sweep(L, D, W, s, P, A, B, mult, lid, order, maxmult):
    """For each chosen line: take it out, then put back the best line that shares
    one of its nails (possibly itself). lid[a,b] = index of line a-b or -1."""
    n = P.shape[0]; changed = 0
    for i in order:
        if mult[i] == 0: continue
        a = A[i]; b = B[i]
        line_apply(L, P[a, 0], P[a, 1], P[b, 0], P[b, 1], -1.0); mult[i] -= 1
        best = line_delta(L, D, W, s, P[a, 0], P[a, 1], P[b, 0], P[b, 1], 1.0); bj = i
        for e in range(2):
            u = a if e == 0 else b
            for v in range(n):
                j = lid[u, v]
                if j < 0 or j == i or mult[j] >= maxmult: continue
                d = line_delta(L, D, W, s, P[u, 0], P[u, 1], P[v, 0], P[v, 1], 1.0)
                if d < best: best = d; bj = j
        if best < 0:
            line_apply(L, P[A[bj], 0], P[A[bj], 1], P[B[bj], 0], P[B[bj], 1], 1.0); mult[bj] += 1
        if bj != i: changed += 1
    return changed


if __name__ == "__main__":
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    D, W = make_target(R=R)
    cv2.imwrite(OUT + "/target.png", ((1 - D) * 255).astype(np.uint8))
    P = nail_positions() * (R - 1)
    per = N_NAILS // 4
    A, B = [], []
    for a in range(N_NAILS):
        for b in range(a + 1, N_NAILS):
            if solve.allowed(a, b, N_NAILS, per, MIN_GAP): A.append(a); B.append(b)
    A = np.array(A); B = np.array(B); mult = np.zeros(len(A), np.int64)
    L = np.zeros((R, R))
    n = add_lines(L, D, W, P, A, B, mult, N)
    print(f"greedy: {n} lines err={total_err(L, D, W, S):.1f} ({time.time()-t0:.0f}s)", flush=True)
    best = total_err(L, D, W, S)
    k = max(20, N // 25)
    for r in range(ROUNDS):
        Lb = L.copy(); mb = mult.copy()
        remove_worst(L, D, W, P, A, B, mult, k)
        add_lines(L, D, W, P, A, B, mult, N - mult.sum(), K=10)
        e = total_err(L, D, W, S)
        if e < best - 1e-3: best = e
        else:
            L[:] = Lb; mult[:] = mb; k = k // 2
            if k < 4: break
        if r % 10 == 0: print(f"round {r}: lines={mult.sum()} err={best:.1f} k={k} ({time.time()-t0:.0f}s)", flush=True)
    lid = -np.ones((N_NAILS, N_NAILS), np.int64)
    lid[A, B] = np.arange(len(A)); lid[B, A] = np.arange(len(A))
    rng = np.random.default_rng(1)
    for r in range(SWEEPS):
        ch = local_sweep(L, D, W, S, P, A, B, mult, lid, rng.permutation(len(A)), MAXMULT)
        add_lines(L, D, W, P, A, B, mult, N - mult.sum(), K=10)
        best = total_err(L, D, W, S)
        print(f"sweep {r}: changed {ch} lines={mult.sum()} err={best:.1f} ({time.time()-t0:.0f}s)", flush=True)
        if ch < 30: break
    print(f"final: lines={mult.sum()} err={best:.1f} ({time.time()-t0:.0f}s)")
    pairs = []
    for i in np.nonzero(mult)[0]:
        pairs += [(int(A[i]), int(B[i]))] * int(mult[i])
    seq, hop = euler_thread(pairs, N_NAILS)
    print(f"thread: {len(seq)-1} segments, of which {sum(hop)} rim hops")
    cv2.imwrite(OUT + "/model.png", (np.exp(-S * L) * 255).astype(np.uint8))
    json.dump({"seq": seq, "hop": hop, "R": R, "S": S, "crop": solve.CROP}, open(OUT + "/seq.json", "w"))
