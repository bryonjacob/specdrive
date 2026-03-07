#!/usr/bin/env bash
# Usage: ./scripts/spin.sh "message" command [args...]
# Shows a spinner in TTY, plain label in CI/pipes.

msg="$1"; shift

if [ -t 1 ]; then
  "$@" &>/dev/null &
  pid=$!
  chars='|/-\'
  while kill -0 "$pid" 2>/dev/null; do
    for ((i=0; i<${#chars}; i++)); do
      printf '\r  %s %s' "${chars:$i:1}" "$msg"
      sleep 0.1
    done
  done
  wait "$pid"
  code=$?
  if [ $code -eq 0 ]; then
    printf '\r  done: %s\n' "$msg"
  else
    printf '\r  FAIL: %s (exit %d)\n' "$msg" "$code"
    exit $code
  fi
else
  echo "  $msg"
  "$@"
fi
