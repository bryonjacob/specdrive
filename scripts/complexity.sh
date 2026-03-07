#!/usr/bin/env bash
# Radon-style complexity report from codemetrics-cli.
# Shows per-function detail (B and above) and per-file summary.

set -euo pipefail

green='\033[32m'   # A (1-5)
yellow='\033[33m'  # B (6-10)
red='\033[31m'     # C (11-15)
magenta='\033[35m' # D (16+)
bold='\033[1m'
reset='\033[0m'

if ! [ -t 1 ]; then
  green='' yellow='' red='' magenta='' bold='' reset=''
fi

grade() {
  local n=$1
  if   [ "$n" -le 5  ]; then printf "${green}A${reset}"
  elif [ "$n" -le 10 ]; then printf "${yellow}B${reset}"
  elif [ "$n" -le 15 ]; then printf "${red}C${reset}"
  else                       printf "${magenta}D${reset}"
  fi
}

color() {
  local n=$1
  if   [ "$n" -le 5  ]; then printf "${green}%s${reset}" "$n"
  elif [ "$n" -le 10 ]; then printf "${yellow}%s${reset}" "$n"
  elif [ "$n" -le 15 ]; then printf "${red}%s${reset}" "$n"
  else                       printf "${magenta}%s${reset}" "$n"
  fi
}

threshold=${1:-6}
prefix="$PWD/"

# Collect all data in one pass, strip absolute path prefix
all=$(npx codemetrics-cli -d -t 1 -p 'src/**/*.ts' 2>/dev/null | sed "s|$prefix||")

# Detail: functions at threshold and above, sorted by file then line
if [ -n "$all" ]; then
  # Sort by file path, then numerically by line number
  detail=$(echo "$all" | awk -v t="$threshold" '$1 >= t' | awk -F'[: ]' '{printf "%s %06d %s\n", $2, $3, $0}' | sort | awk '{$1=$2=""; print substr($0,3)}')

  current_file=""
  while IFS=' ' read -r score location; do
    file="${location%%:*}"
    line="${location##*:}"

    if [ "$file" != "$current_file" ]; then
      [ -n "$current_file" ] && echo ""
      printf "${bold}%s${reset}\n" "$file"
      current_file="$file"
    fi

    printf "  :%s  %s (%s)\n" "$line" "$(color "$score")" "$(grade "$score")"
  done <<< "$detail"
  echo ""
fi

# Summary table
echo ""
printf "${bold}%-40s  %s${reset}\n" "File" "Worst"
printf "%-40s  %s\n" "────────────────────────────────────────" "─────"

declare -A file_scores
while IFS=' ' read -r score location; do
  file="${location%%:*}"
  prev=${file_scores[$file]:-0}
  [ "$score" -gt "$prev" ] && file_scores[$file]=$score
done <<< "$all"

for file in "${!file_scores[@]}"; do
  echo "${file_scores[$file]} $file"
done | sort -rn | while read -r score file; do
  printf "%-40s  %s (%s)\n" "$file" "$(grade "$score")" "$(color "$score")"
done
