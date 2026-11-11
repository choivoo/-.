#!/bin/bash
# 처음부터 다시 만들기: 사진 -> 실 경로 계산 -> 설계도 -> 최종 이미지/영상
set -e
cd "$(dirname "$0")"
OUT=work GAM=0.8 SHARP=1.0 BG=0.45 FACEW=0.5 EDGEW=4 FEATW=60 LIGHTW=10 python3 solve2.py 5800 450 0.10 60 4
python3 make_order.py work/seq.json     # -> nail_order.txt
python3 render.py                       # nail_order.txt -> final.png, process.mp4
