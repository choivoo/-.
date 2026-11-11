"""String-art solver: one continuous black thread on a square board with 400 nails.

Model (physical): a thread of width `s` working-pixels crossing a pixel covers a
fraction of it; overlapping threads saturate, so perceived darkness of a pixel is
    dark = 1 - exp(-s * L)      (L = accumulated thread length through the pixel)
Step 1  greedy: from the current nail, pick the next nail whose line lowers the
        weighted squared error to the target the most.
Step 2  refinement: for every interior nail of the path, try all other nails
        (replacing the two lines that touch it) and keep the best. The thread
        stays one continuous strand and the line count does not change.
"""
import sys, json, math
import numpy as np, cv2
from numba import njit

N_NAILS = 400
_num = lambda i: len(sys.argv) > i and sys.argv[i].replace('.', '').isdigit()
R = int(sys.argv[2]) if _num(2) else 420       # working resolution
N_LINES = int(sys.argv[1]) if _num(1) else 5000
S = float(sys.argv[3]) if _num(3) else 0.11    # thread width in working px
SWEEPS = int(sys.argv[4]) if _num(4) else 4
MIN_GAP = 12
import os
CLIP=float(os.environ.get('CLIP',1.6)); BG=float(os.environ.get('BG',0.62)); SHARP=float(os.environ.get('SHARP',0.7))
FEATW=float(os.environ.get('FEATW',0)); OUT=os.environ.get('OUT','work')
CROP=tuple(int(v) for v in os.environ.get('CROP','90,85,560').split(','))
LIGHTW=float(os.environ.get('LIGHTW',0)); FACEW=float(os.environ.get('FACEW',2.6)); EDGEW=float(os.environ.get('EDGEW',2.0))
DMAX=float(os.environ.get('DMAX',0.86)); GAM=float(os.environ.get('GAM',1.1))                                             # min nail distance along rim


def nail_positions(n=N_NAILS, size=1.0):
    """n nails evenly spaced on the square perimeter, #1 near top-left, clockwise.
    Half-step offset => exactly n/4 per side, none exactly on a corner."""
    per = n // 4
    pts = []
    for i in range(n):
        side, k = divmod(i, per)
        t = (k + 0.5) / per * size
        if side == 0: pts.append((t, 0.0))            # top, left->right
        elif side == 1: pts.append((size, t))         # right, top->bottom
        elif side == 2: pts.append((size - t, size))  # bottom, right->left
        else: pts.append((0.0, size - t))             # left, bottom->top
    return np.array(pts, dtype=np.float64)


def make_target(path="input/photo.jpg", R=R):
    img = cv2.imread(path)
    # square crop around the head (photo is 758x1010)
    x0, y0, sz = CROP
    crop = img[y0:y0 + sz, x0:x0 + sz]
    cv2.imwrite(OUT+"/crop.png", crop)
    # classical GrabCut (graph-cut segmentation, no learned model) to separate the
    # person from the busy backdrop, so threads are not wasted on curtain texture
    gx0, gy0, gsz = 62, 28, 634                    # segmentation runs on a wider window
    big = img[gy0:gy0 + gsz, gx0:gx0 + gsz]
    mask = np.full(big.shape[:2], cv2.GC_PR_BGD, np.uint8)
    cv2.ellipse(mask, (318, 330), (250, 300), 0, 0, 360, cv2.GC_PR_FGD, -1)
    cv2.rectangle(mask, (0, 560), (gsz, gsz), cv2.GC_PR_FGD, -1)
    cv2.ellipse(mask, (312, 372), (150, 190), 0, 0, 360, cv2.GC_FGD, -1)
    mask[:, :6] = cv2.GC_BGD; mask[:, -6:] = cv2.GC_BGD; mask[:6] = cv2.GC_BGD
    cv2.grabCut(big, mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    mask = mask[y0 - gy0:y0 - gy0 + sz, x0 - gx0:x0 - gx0 + sz]
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    fgs = cv2.GaussianBlur(fg.astype(np.float64), (0, 0), 2.5)
    cv2.imwrite(OUT+"/mask.png", (fgs * 255).astype(np.uint8))
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    g = cv2.bilateralFilter(g, 9, 30, 5)
    g = cv2.createCLAHE(clipLimit=CLIP, tileGridSize=(4, 4)).apply(g).astype(np.float64) / 255
    lo, hi = np.percentile(g[fg > 0], 1), np.percentile(g[fg > 0], 99.5)
    g = np.clip((g - lo) / (hi - lo), 0, 1)
    g = fgs * g + (1 - fgs) * BG                      # flat mid-grey backdrop
    g = cv2.resize(g, (R, R), interpolation=cv2.INTER_AREA)
    bl = cv2.GaussianBlur(g, (0, 0), R / 70)
    g = np.clip(g + SHARP * (g - bl), 0, 1)
    dark = 0.02 + DMAX * (1 - g) ** GAM
    # importance: face ellipse + local detail
    yy, xx = np.mgrid[0:R, 0:R] / R
    cx, cy = (372 - x0) / sz, (400 - y0) / sz
    face = np.exp(-(((xx - cx) / (190 / sz)) ** 2 + ((yy - cy) / (228 / sz)) ** 2) ** 2)
    gx = cv2.Sobel(bl, cv2.CV_64F, 1, 0); gy = cv2.Sobel(bl, cv2.CV_64F, 0, 1)
    edge = cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), R / 120)
    edge /= edge.max()
    feat = np.clip(cv2.GaussianBlur(g, (0, 0), R / 40) - g, 0, None)   # locally dark = eyes, brows, lips
    feat = cv2.GaussianBlur(feat, (0, 0), R / 200); feat /= feat.max()
    prox = cv2.GaussianBlur(feat, (0, 0), R / 28); prox /= prox.max()      # neighbourhood of eyes / brows / mouth
    w = LIGHTW * face * prox + 0.6 + FACEW * face + EDGEW * face * edge + 0.6 * edge + FEATW * face * feat
    return dark, w


@njit(cache=True, fastmath=True)
def line_delta(L, D, W, s, x0, y0, x1, y1, sign):
    """Change of weighted squared error if line is added (sign=+1) / removed (-1)."""
    dx = x1 - x0; dy = y1 - y0
    steep = abs(dy) > abs(dx)
    if steep:
        x0, y0, x1, y1 = y0, x0, y1, x1
        dx, dy = dy, dx
    if x0 > x1:
        x0, x1, y0, y1 = x1, x0, y1, y0
    dx = x1 - x0; dy = y1 - y0
    g = dy / dx
    a = math.sqrt(1 + g * g) * sign
    n = L.shape[0]
    tot = 0.0
    xi = int(math.ceil(x0)); xe = int(math.floor(x1))
    for x in range(max(xi, 0), min(xe, n - 1) + 1):
        y = y0 + g * (x - x0)
        yi = int(math.floor(y)); f = y - yi
        for k in range(2):
            yy = yi + k
            if yy < 0 or yy >= n: continue
            wt = (1 - f) if k == 0 else f
            if steep: l = L[x, yy]; d = D[x, yy]; w = W[x, yy]
            else: l = L[yy, x]; d = D[yy, x]; w = W[yy, x]
            e0 = d - (1 - math.exp(-s * l))
            e1 = d - (1 - math.exp(-s * (l + a * wt)))
            tot += w * (e1 * e1 - e0 * e0)
    return tot


@njit(cache=True, fastmath=True)
def line_apply(L, x0, y0, x1, y1, sign):
    dx = x1 - x0; dy = y1 - y0
    steep = abs(dy) > abs(dx)
    if steep:
        x0, y0, x1, y1 = y0, x0, y1, x1
    if x0 > x1:
        x0, x1, y0, y1 = x1, x0, y1, y0
    dx = x1 - x0; dy = y1 - y0
    g = dy / dx
    a = math.sqrt(1 + g * g) * sign
    n = L.shape[0]
    xi = int(math.ceil(x0)); xe = int(math.floor(x1))
    for x in range(max(xi, 0), min(xe, n - 1) + 1):
        y = y0 + g * (x - x0)
        yi = int(math.floor(y)); f = y - yi
        for k in range(2):
            yy = yi + k
            if yy < 0 or yy >= n: continue
            wt = (1 - f) if k == 0 else f
            if steep: L[x, yy] += a * wt
            else: L[yy, x] += a * wt


@njit(cache=True)
def allowed(a, b, n, per, gap):
    if a == b: return False
    if a // per == b // per: return False          # same side: thread would lie on the rim
    d = abs(a - b); d = min(d, n - d)
    return d >= gap


@njit(cache=True)
def total_err(L, D, W, s):
    t = 0.0
    for i in range(L.shape[0]):
        for j in range(L.shape[1]):
            e = D[i, j] - (1 - math.exp(-s * L[i, j]))
            t += W[i, j] * e * e
    return t


@njit(cache=True)
def greedy(L, D, W, s, P, n_lines, gap, start):
    n = P.shape[0]; per = n // 4
    seq = np.empty(n_lines + 1, np.int64)
    seq[0] = start
    cur = start; prev = -1
    for i in range(n_lines):
        best = 1e18; bj = -1
        for j in range(n):
            if j == prev or not allowed(cur, j, n, per, gap): continue
            d = line_delta(L, D, W, s, P[cur, 0], P[cur, 1], P[j, 0], P[j, 1], 1.0)
            if d < best: best = d; bj = j
        line_apply(L, P[cur, 0], P[cur, 1], P[bj, 0], P[bj, 1], 1.0)
        prev = cur; cur = bj; seq[i + 1] = bj
    return seq


@njit(cache=True)
def refine(L, D, W, s, P, seq, gap):
    """One sweep of single-nail replacement. Returns number of changes."""
    n = P.shape[0]; per = n // 4
    m = seq.shape[0]; changed = 0
    for i in range(1, m - 1):
        a = seq[i - 1]; b = seq[i]; c = seq[i + 1]
        # take the two lines out
        line_apply(L, P[a, 0], P[a, 1], P[b, 0], P[b, 1], -1.0)
        line_apply(L, P[b, 0], P[b, 1], P[c, 0], P[c, 1], -1.0)
        pa = seq[i - 2] if i >= 2 else -1
        nc = seq[i + 2] if i + 2 < m else -1
        best = 1e18; bj = -1
        for j in range(n):
            if not allowed(a, j, n, per, gap) or not allowed(j, c, n, per, gap): continue
            if j == pa or j == nc: continue          # no immediate back-tracking
            d = line_delta(L, D, W, s, P[a, 0], P[a, 1], P[j, 0], P[j, 1], 1.0)
            if d >= best: continue
            line_apply(L, P[a, 0], P[a, 1], P[j, 0], P[j, 1], 1.0)
            d += line_delta(L, D, W, s, P[j, 0], P[j, 1], P[c, 0], P[c, 1], 1.0)
            line_apply(L, P[a, 0], P[a, 1], P[j, 0], P[j, 1], -1.0)
            if d < best: best = d; bj = j
        if bj < 0: bj = b
        if bj != b: changed += 1
        seq[i] = bj
        line_apply(L, P[a, 0], P[a, 1], P[bj, 0], P[bj, 1], 1.0)
        line_apply(L, P[bj, 0], P[bj, 1], P[c, 0], P[c, 1], 1.0)
    return changed


if __name__ == "__main__":
    import os, time
    os.makedirs(OUT, exist_ok=True)
    D, W = make_target()
    cv2.imwrite(OUT+"/target.png", ((1 - D) * 255).astype(np.uint8))
    cv2.imwrite(OUT+"/weight.png", (W / W.max() * 255).astype(np.uint8))
    P = nail_positions() * (R - 1)
    L = np.zeros((R, R))
    t = time.time()
    seq = greedy(L, D, W, S, P, N_LINES, MIN_GAP, 0)
    e = total_err(L, D, W, S)
    print(f"greedy {time.time()-t:.1f}s err={e:.1f}", flush=True)
    for k in range(SWEEPS):
        ch = refine(L, D, W, S, P, seq, MIN_GAP)
        print(f"sweep {k+1}: changed {ch}, err={total_err(L, D, W, S):.1f} ({time.time()-t:.0f}s)", flush=True)
        if ch < 20: break
    # consistency check: rebuild L from the sequence
    L2 = np.zeros((R, R))
    for i in range(len(seq) - 1):
        line_apply(L2, *P[seq[i]], *P[seq[i + 1]], 1.0)
    assert np.abs(L2 - L).max() < 1e-6
    cv2.imwrite(OUT+"/model.png", (np.exp(-S * L) * 255).astype(np.uint8))
    json.dump({"seq": [int(x) for x in seq], "R": R, "S": S}, open(OUT+"/seq.json", "w"))
