"""Reads nail_order.txt (the blueprint itself) and renders final.png and process.mp4.
usage: render.py [--still-only]
"""
import sys, re, math, subprocess
import numpy as np, cv2
from numba import njit
from PIL import Image, ImageDraw, ImageFont

N_NAILS = 400
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
BOARD = (238, 232, 220)      # RGB warm white board
THREAD = (18, 16, 16)
FPS, DUR = 30, 20
W = 1080


def read_order(path="nail_order.txt"):
    seq, meta = [], {}
    for line in open(path, encoding="utf-8"):
        if line.startswith("#"):
            m = re.match(r"#\s*@(\w+)\s*=\s*(\S+)", line)
            if m: meta[m.group(1)] = m.group(2)
            continue
        m = re.match(r"\s*\d+\s*:\s*(\d+)\s*->\s*(\d+)", line)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if not seq: seq.append(a)
            assert seq[-1] == a, "thread is not continuous"
            seq.append(b)
    return np.array(seq) - 1, meta


def nail_xy(size):
    per = N_NAILS // 4; pts = []
    for i in range(N_NAILS):
        side, k = divmod(i, per); t = (k + 0.5) / per * size
        pts.append([(t, 0), (size, t), (size - t, size), (0, size - t)][side])
    return np.array(pts, dtype=np.float64)


@njit(cache=True, fastmath=True)
def draw(T, x0, y0, x1, y1, width):
    """Multiply transmission T along a thread of sub-pixel `width` (px)."""
    steep = abs(y1 - y0) > abs(x1 - x0)
    if steep: x0, y0, x1, y1 = y0, x0, y1, x1
    if x0 > x1: x0, x1, y0, y1 = x1, x0, y1, y0
    if x1 - x0 < 1e-9: return
    g = (y1 - y0) / (x1 - x0); a = math.sqrt(1 + g * g) * width
    n = T.shape[0]
    for x in range(max(int(math.ceil(x0)), 0), min(int(math.floor(x1)), n - 1) + 1):
        y = y0 + g * (x - x0); yi = int(math.floor(y)); f = y - yi
        for k in range(2):
            yy = yi + k
            if yy < 0 or yy >= n: continue
            c = min(a * ((1 - f) if k == 0 else f), 1.0)
            if steep: T[x, yy] *= 1 - c
            else: T[yy, x] *= 1 - c


def compose(T, out, pad):
    """Transmission map -> RGB board image of side out+2*pad with nails."""
    t = cv2.resize(T, (out, out), interpolation=cv2.INTER_AREA)[..., None]
    img = np.empty((out + 2 * pad, out + 2 * pad, 3), np.float32)
    img[:] = BOARD
    img[pad:pad + out, pad:pad + out] = np.array(BOARD) * t + np.array(THREAD) * (1 - t)
    return img.astype(np.uint8)


def draw_nails(img, P, pad, r):
    for x, y in P:
        cv2.circle(img, (int(round(x * 16)) + pad * 16, int(round(y * 16)) + pad * 16), int(r * 16), (120, 112, 100), -1, cv2.LINE_AA, 4)
        cv2.circle(img, (int(round(x * 16)) + pad * 16, int(round(y * 16)) + pad * 16), int(r * 7), (215, 210, 200), -1, cv2.LINE_AA, 4)


def text(img, items):
    im = Image.fromarray(img); d = ImageDraw.Draw(im)
    for (xy, s, size, col, anchor) in items:
        d.text(xy, s, font=ImageFont.truetype(FONT, size), fill=col, anchor=anchor)
    return np.asarray(im).copy()


def main():
    seq, meta = read_order()
    n = len(seq) - 1
    rel_w = float(meta["thread_width_rel"])          # thread width / board side
    print("segments", n, "thread/board", rel_w)

    # ---------- final.png ----------
    SS, OUT, PAD = 4096, 2048, 96
    P = nail_xy(SS - 1); T = np.ones((SS, SS), np.float32)
    for i in range(n): draw(T, *P[seq[i]], *P[seq[i + 1]], rel_w * SS)
    img = compose(T, OUT, PAD)
    Pn = nail_xy(OUT - 1); draw_nails(img, Pn, PAD, 3.0)
    items = []
    for i in list(range(0, N_NAILS, 10)) + [N_NAILS - 1]:
        x, y = Pn[i]; side = i // 100
        off = [(0, -34), (34, 0), (0, 34), (-34, 0)][side]
        items.append(((x + PAD + off[0], y + PAD + off[1]), str(i + 1), 26, (90, 84, 76), "mm"))
    img = text(img, items)
    cv2.imwrite("final.png", img[..., ::-1])
    cv2.imwrite("work/final_small.png", cv2.resize(img, (900, 900), interpolation=cv2.INTER_AREA)[..., ::-1])
    if "--still-only" in sys.argv: return

    # ---------- process.mp4 ----------
    B, PADV, SSV = 960, 12, 1920                     # thread area, pad, supersample
    bx, by = (W - B - 2 * PADV) // 2, 10
    P = nail_xy(SSV - 1); Pv = nail_xy(B - 1)
    T = np.ones((SSV, SSV), np.float32)
    x0, y0, sz = [int(v) for v in meta["crop"].split(",")]
    photo = cv2.imread("input/photo.jpg")[y0:y0 + sz, x0:x0 + sz, ::-1]
    photo_big = cv2.resize(photo, (B, B), interpolation=cv2.INTER_CUBIC)
    t_draw, t_hold = 15.0, 1.0
    a = 7.5
    def count(t):                                     # lines finished at time t (float)
        return min(n, n * (math.exp(a * t / t_draw) - 1) / (math.exp(a) - 1))
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{W}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                           "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "process.mp4"],
                          stdin=subprocess.PIPE)
    done = 0; board = None
    snaps = {int(s * FPS): s for s in (0.4, 3, 7, 11, 14.9, 15.8, 16.9, 17.6, 19.5)}
    def base_frame():
        f = np.empty((W, W, 3), np.uint8); f[:] = (24, 24, 28)
        return f
    for fi in range(FPS * DUR):
        t = (fi + 1) / FPS
        frame = base_frame()
        if t <= t_draw + 1e-9:
            c = count(t); full = int(c) if c < n else n
            for i in range(done, full): draw(T, *P[seq[i]], *P[seq[i + 1]], rel_w * SSV)
            prev_done, done = done, full
            board = compose(T, B, PADV)
            draw_nails(board, Pv, PADV, 1.6)
            still = board.copy()
            # red: lines finished during this frame (newest few) + the one in progress
            ov = board.copy()
            for i in range(max(prev_done, full - 10), full):
                p, q = Pv[seq[i]] + PADV, Pv[seq[i + 1]] + PADV
                cv2.line(ov, (int(p[0] * 16), int(p[1] * 16)), (int(q[0] * 16), int(q[1] * 16)), (225, 30, 30), 1 if full - prev_done > 3 else 2, cv2.LINE_AA, 4)
            cur = full
            if full < n:
                fr = c - full
                p, q = Pv[seq[full]] + PADV, Pv[seq[full + 1]] + PADV; q = p + (q - p) * fr
                cv2.line(ov, (int(p[0] * 16), int(p[1] * 16)), (int(q[0] * 16), int(q[1] * 16)), (235, 25, 25), 2, cv2.LINE_AA, 4)
                cur = full + 1
                for k in (full, full + 1):
                    cv2.circle(ov, (int(Pv[seq[k]][0]) + PADV, int(Pv[seq[k]][1]) + PADV), 5, (235, 25, 25), -1, cv2.LINE_AA)
            board = ov
            frame[by:by + B + 2 * PADV, bx:bx + B + 2 * PADV] = board
            i0 = min(cur, n) - 1
            frame = text(frame, [((bx + 4, 1040), f"실 {cur:,} / {n:,}번째", 44, (255, 255, 255), "lm"),
                                 ((W - bx - 4, 1040), f"못 {seq[i0] + 1} → {seq[i0 + 1] + 1}", 36, (240, 90, 90), "rm")])
        else:
            u = t - t_draw
            final = still
            if u <= t_hold:                            # finished board
                frame[by:by + B + 2 * PADV, bx:bx + B + 2 * PADV] = final
                lab = f"완성 · 못 {N_NAILS}개 · 실 {n:,}줄 (한 가닥)"
            elif u <= t_hold + 1.6:                    # aligned cross-fade to the photo and back
                v = (u - t_hold) / 1.6; k = math.sin(math.pi * v) ** 0.7
                bimg = final.copy()
                bimg[PADV:PADV + B, PADV:PADV + B] = (final[PADV:PADV + B, PADV:PADV + B] * (1 - k) + photo_big * k).astype(np.uint8)
                frame[by:by + B + 2 * PADV, bx:bx + B + 2 * PADV] = bimg
                lab = "원본 사진과 겹쳐 보기"
            else:                                      # side by side
                v = min(1.0, (u - t_hold - 1.6) / 0.5); S2 = 516
                l = cv2.resize(photo, (S2, S2), interpolation=cv2.INTER_AREA)
                r = cv2.resize(final[PADV:PADV + B, PADV:PADV + B], (S2, S2), interpolation=cv2.INTER_AREA)
                yy = 250
                frame[yy:yy + S2, 16:16 + S2] = (l * v).astype(np.uint8) + (np.array((24, 24, 28)) * (1 - v)).astype(np.uint8)
                frame[yy:yy + S2, W - 16 - S2:W - 16] = (r * v).astype(np.uint8) + (np.array((24, 24, 28)) * (1 - v)).astype(np.uint8)
                frame = text(frame, [((16 + S2 // 2, yy - 44), "원본 사진", 44, (255, 255, 255), "mm"),
                                     ((W - 16 - S2 // 2, yy - 44), "실 그림 (스트링 아트)", 44, (255, 255, 255), "mm"),
                                     ((W // 2, 150), "원본과 비교", 60, (255, 255, 255), "mm"),
                                     ((W // 2, yy + S2 + 60), f"못 {N_NAILS}개 · 검은 실 한 가닥 · {n:,}줄", 40, (200, 200, 205), "mm")])
                lab = None
            if lab: frame = text(frame, [((W // 2, 1040), lab, 44, (255, 255, 255), "mm")])
        ff.stdin.write(frame.tobytes())
        if fi in snaps: cv2.imwrite(f"work/snap_{snaps[fi]:04.1f}.png", cv2.resize(frame, (540, 540), interpolation=cv2.INTER_AREA)[..., ::-1])
    ff.stdin.close(); ff.wait()
    assert done == n


if __name__ == "__main__":
    main()
