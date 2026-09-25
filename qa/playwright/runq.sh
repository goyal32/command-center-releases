#!/bin/bash
cd "$(dirname "$0")"
for s in "$@"; do
  timeout 900 xvfb-run -a -s "-screen 0 1920x1080x24" node "$s.js" > "$s.out" 2>&1
  echo "$s exit=$?" >> queue.log
done
