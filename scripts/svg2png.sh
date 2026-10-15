#!/bin/bash
# usage: svg2png.sh in.svg out.png width height
CH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
[ -x "$CH" ] || CH=$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1)
$CH --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=$3,$(($4+120)) --screenshot="$2" "file://$(realpath $1)" >/dev/null 2>&1
