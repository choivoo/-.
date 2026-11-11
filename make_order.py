"""seq.json -> nail_order.txt (human-followable blueprint; render.py reads it back)."""
import sys, json, math
import numpy as np
from solve import nail_positions
from euler import euler_thread
d = json.load(open(sys.argv[1]))
pairs = [(d["seq"][i], d["seq"][i + 1]) for i in range(len(d["seq"]) - 1) if not d["hop"][i]]
seq, hop = euler_thread(pairs, 400)
n = len(seq) - 1
# sanity: one continuous thread, every picture line used exactly once
from collections import Counter
key = lambda a, b: (min(a, b), max(a, b))
assert Counter(key(a, b) for a, b in pairs) == Counter(key(seq[i], seq[i + 1]) for i in range(n) if not hop[i])
BOARD_MM = 600
rel = d["S"] / d["R"]
P = nail_positions() * BOARD_MM
length = sum(math.dist(P[seq[i]], P[seq[i + 1]]) for i in range(n)) / 1000
with open("nail_order.txt", "w", encoding="utf-8") as f:
    w = lambda s="": f.write(s + "\n")
    w("# 스트링 아트 설계도 — 못 번호 순서표 (nail_order.txt)")
    w("#")
    w(f"# 판   : 정사각형, 못이 놓이는 테두리 한 변 {BOARD_MM} mm 기준 (다른 크기는 같은 비율로 확대·축소)")
    w(f"# 못   : {len(P)}개, 테두리 둘레에 같은 간격({BOARD_MM/100:.0f} mm). 한 변에 100개씩.")
    w("#        번호는 왼쪽 위 모서리에서 시작해 시계 방향으로 1~400.")
    w("#          1~100   윗변   (왼쪽 → 오른쪽)")
    w("#          101~200 오른변 (위 → 아래)")
    w("#          201~300 아랫변 (오른쪽 → 왼쪽)")
    w("#          301~400 왼변   (아래 → 위)")
    w(f"#        각 변의 첫 못은 모서리에서 반 칸({BOARD_MM/200:.0f} mm) 떨어져 있다. final.png 테두리에 10번 단위 번호가 찍혀 있다.")
    w(f"# 실   : 검은 실 한 가닥, 굵기 약 {rel*BOARD_MM:.2f} mm (판 한 변의 1/{1/rel:.0f}). 총 길이 약 {length:.0f} m (+여유 10%).")
    w(f"# 줄 수: {n}줄 = 그림 선 {n - sum(hop)}줄 + 테두리 이동 {sum(hop)}줄.")
    w("#        '테두리' 표시는 같은 변(또는 모서리 너머)의 가까운 못으로 판 가장자리를 따라 옮겨 가는 짧은 이동이다.")
    w("# 방법 : 첫 줄의 왼쪽 못에 실을 묶고, 아래 순서대로 '왼쪽 못 → 오른쪽 못'으로 팽팽하게 당겨 못에 한 번 감고 다음 줄로 간다.")
    w("#        모든 줄은 바로 앞 줄이 끝난 못에서 시작하므로 실을 끊을 필요가 없다. 마지막 못에서 묶어 마무리한다.")
    w("#")
    w("# --- 아래 @ 줄은 render.py가 읽는 값 ---")
    w(f"# @nails = {len(P)}")
    w(f"# @thread_width_rel = {rel:.8f}")
    w(f"# @crop = {','.join(str(v) for v in d['crop'])}")
    w("#")
    w("# 순번: 출발 못 -> 도착 못")
    for i in range(n):
        if i % 100 == 0: w(f"# ---- {i + 1}~{min(i + 100, n)} ----")
        w(f"{i + 1:5d}: {seq[i] + 1:3d} -> {seq[i + 1] + 1:3d}" + ("   (테두리)" if hop[i] else ""))
print("segments", n, "hops", sum(hop), "length m", round(length))
