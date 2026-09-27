#!/bin/bash
SP="C:/Users/shung/AppData/Local/Temp/claude/C--Users-shung/b611e1c3-cb6d-40b3-94b3-ee053003c6ba/scratchpad"
W="C:/Users/shung/OneDrive/桌面/排球夢/.claude/worktrees/agent-a17aa1404ed442fb1"
M="$SP/mut-tree"; LOG="$SP/mutations-r3.log"; : > "$LOG"
runtests() { # $1 tap name, $2 name pattern (may be empty), rest: files
  local tap="$1" pat="$2"; shift 2
  if [ -n "$pat" ]; then (cd "$M" && node --test --test-reporter=tap --test-name-pattern="$pat" "$@" > "$SP/$tap.tap" 2>&1); else (cd "$M" && node --test --test-reporter=tap "$@" > "$SP/$tap.tap" 2>&1); fi
  grep -E "^(not ok|ok) |^  error:" "$SP/$tap.tap" | head -24 >> "$LOG"
}
mut() { # $1 mutation name, $2 pattern, rest files
  local name="$1" pat="$2"; shift 2
  echo "=== mutation $name ($(date +%H:%M:%S))" >> "$LOG"
  python "$SP/mutate.py" "$M" "$name" "$W" >> "$LOG" 2>&1
  runtests "mut-$name" "$pat" "$@"
  echo "--- restore" >> "$LOG"; python "$SP/mutate.py" "$M" restore >> "$LOG" 2>&1
}
echo "=== control (unmutated copy, $(date +%H:%M:%S))" >> "$LOG"
runtests control-round3 "" tests/direct-v8-round3.test.js
runtests control-r6 "R6" tests/direct-v8-rules.test.js
mut q5-literal "Q5" tests/direct-v8-round3.test.js
mut q5-lower-bound "Q5" tests/direct-v8-round3.test.js
mut gate "platformDistance" tests/direct-v8-round3.test.js
mut q6-1.5 "Q6" tests/direct-v8-round3.test.js
mut q2-auto-dive "Q2" tests/direct-v8-round3.test.js
mut r6-pressed-body "R6" tests/direct-v8-rules.test.js
mut a14-whole-action "" tests/direct-pass.test.js
echo "=== done $(date +%H:%M:%S)" >> "$LOG"
