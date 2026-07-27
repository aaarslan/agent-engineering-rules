#!/usr/bin/env bash
# Warning-oriented scan for web/TypeScript projects. Exit: 0 complete, 2 tool/input failure.
set -uo pipefail

[[ $# -le 1 ]] || { echo "ERROR: usage: slop-scan.sh [project-root]" >&2; exit 2; }
scan_root="${1:-.}"
[[ -d "$scan_root" ]] || { echo "ERROR: project root is not a directory: $scan_root" >&2; exit 2; }
for command in find grep sed awk head; do
  command -v "$command" >/dev/null 2>&1 || { echo "ERROR: required command is unavailable: $command" >&2; exit 2; }
done
cd "$scan_root" || { echo "ERROR: cannot enter project root: $scan_root" >&2; exit 2; }
[[ -d src ]] || { echo "ERROR: unsupported project layout: expected a src/ directory" >&2; exit 2; }

warnings=0
manual_items=0
warn() { echo "HEURISTIC: $1"; warnings=$((warnings + 1)); }
manual() { echo "MANUAL: $1"; manual_items=$((manual_items + 1)); }
report() {
  local title="$1" kind="$2" message="$3" matches="$4"
  echo "== $title =="
  if [[ -n "$matches" ]]; then printf '%s\n' "$matches"; "$kind" "$message"; else echo "none"; fi
}
references() {
  grep -rIlE --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.git "$1" . 2>/dev/null \
    | grep -Fvx "$2" | grep -Fvx "./$2" | head -n 1 || true
}

echo "== Reference candidates =="
roots=(src)
[[ -d public ]] && roots+=(public)
candidate_count=0
while IFS= read -r -d '' file; do
  case "$file" in *.test.*|*.spec.*|*/test/*|*/tests/*|*/__tests__/*|*.d.ts|src/index.html) continue ;; esac
  candidate_count=$((candidate_count + 1))
  base="${file##*/}"; stem="${base%.*}"; extension="${base##*.}"
  escaped_base=$(printf '%s' "$base" | sed 's/[][(){}.^$*+?|\/]/\\&/g')
  escaped_stem=$(printf '%s' "$stem" | sed 's/[][(){}.^$*+?|\/]/\\&/g')
  case "$extension" in
    ts|tsx|js|jsx|mjs|cjs) pattern="[/\"']${escaped_stem}(\.(ts|tsx|js|jsx|mjs|cjs))?[\"']" ;;
    *) pattern="$escaped_base" ;;
  esac
  [[ -n "$(references "$pattern" "$file")" ]] || warn "$file has no textual reference; verify routing, conventions, generation, and asset pipelines before deletion"
done < <(find "${roots[@]}" -type f -print0 2>/dev/null)
[[ $candidate_count -gt 0 ]] || echo "none scanned"

code_globs=(--include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.mjs' --include='*.cjs')
sinks=$(grep -rnE "${code_globs[@]}" 'innerHTML|insertAdjacentHTML|outerHTML|document\.write' src 2>/dev/null | grep -vE '\.(test|spec)\.' || true)
report "HTML sinks" manual "trace untrusted data to each sink; prefer text APIs or framework escaping" "$sinks"
escapers=$(grep -rniE "${code_globs[@]}" 'function +(escapeh|sanitizeh)|escapeHtml|sanitizeHtml' src 2>/dev/null | grep -vE '\.(test|spec)\.' || true)
report "Escaper-like definitions" warn "inspect implementation and sink context before calling it unsafe" "$escapers"
timers=$(grep -rnE "${code_globs[@]}" 'setTimeout|setInterval' src 2>/dev/null | grep -vE '\.(test|spec)\.' || true)
report "Timers" manual "verify timers do not fabricate latency or loading for synchronous work" "$timers"

echo "== Possibly dead TypeScript exports =="
dead_count=0
while IFS= read -r -d '' file; do
  case "$file" in *.test.*|*.spec.*|*/test/*|*/tests/*|*/__tests__/*|*.d.ts|*/main.ts|*/main.tsx|*/index.ts|*/index.tsx) continue ;; esac
  symbols=$(grep -oE '^export (const|function|class|type|interface|enum) [A-Za-z0-9_]+' "$file" 2>/dev/null | awk '{print $3}' || true)
  while IFS= read -r symbol; do
    [[ -n "$symbol" ]] || continue
    reference=$(grep -rwl --include='*.ts' --include='*.tsx' --include='*.html' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.git "$symbol" . 2>/dev/null | grep -Fvx "$file" | grep -Fvx "./$file" | head -n 1 || true)
    if [[ -z "$reference" ]]; then
      warn "$file exports $symbol with no textual reference; verify public, type-only, generated, and dynamic consumers"
      dead_count=$((dead_count + 1))
    fi
  done <<< "$symbols"
done < <(find src \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 2>/dev/null)
[[ $dead_count -gt 0 ]] || echo "none"

storage=$(grep -rnE "${code_globs[@]}" --include='*.html' '(window\.)?(localStorage|sessionStorage)\b' src index.html 2>/dev/null | grep -vE '\.(test|spec)\.' || true)
report "Storage touchpoints" manual "inspect disabled storage, corrupt data, recovery, and overwrite behavior" "$storage"
todos=$(grep -rnE 'TODO|FIXME' src 2>/dev/null | grep -vE '#[0-9]+|[A-Z]{2,}-[0-9]+' || true)
report "Untracked TODO or FIXME" manual "link unresolved markers to tracked work" "$todos"

echo "SUMMARY: completed; heuristic_warnings=$warnings manual_review_items=$manual_items deterministic_failures=0"
exit 0
