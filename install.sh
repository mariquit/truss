#!/usr/bin/env bash
# Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
plugins_dir="$config_dir/plugins"
discovery=openai-compatible-discovery
audit=compaction-audit
available=("$discovery" "$audit" context-diff usage-breakdown)
names=()
upgrade=false
all=false

usage() {
  printf 'Usage: %s [--upgrade] [--all | PLUGIN_ID ...]\n' "$0"
  printf 'Without plugin IDs, opens the installer menu. Available plugins:\n'
  printf '  %s\n' "${available[@]}"
}

for arg in "$@"; do
  case "$arg" in
    --upgrade) upgrade=true ;;
    --all) all=true ;;
    --help|-h) usage; exit 0 ;;
    "$discovery"|"$audit"|context-diff|usage-breakdown)
      if [[ " ${names[*]} " != *" $arg "* ]]; then names+=("$arg"); fi ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done
if $all; then
  if (( ${#names[@]} )); then
    printf '%s\n' 'Use --all or plugin IDs, not both.' >&2
    exit 2
  fi
  names=("${available[@]}")
fi

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

exists() {
  [[ -e "$1" || -L "$1" ]]
}

if (( ${#names[@]} == 0 )); then
  command -v python3 >/dev/null || fail 'The installer menu requires Python 3. Use plugin IDs or --all to skip the menu.'
  if ! ( : </dev/tty ) 2>/dev/null; then
    fail 'The installer menu requires a controlling terminal. Pass plugin IDs or --all for unattended installs.'
  fi
  selection=$(python3 "$root/install.py" "${available[@]}" 3>&1 </dev/tty >/dev/tty)
  if [[ -z $selection ]]; then exit 0; fi
  mapfile -t names <<< "$selection"
fi

command -v flock >/dev/null || fail 'The installer requires flock.'
mkdir -p -- "$config_dir"
exec 9<"$config_dir"
flock -n 9 || fail 'Could not lock the OpenCode config directory. Check for another installer run.'
[[ ! -L "$plugins_dir" ]] || fail "Refusing to install through a symlink: $plugins_dir"
mkdir -p -- "$plugins_dir"

for name in "${names[@]}"; do
  target="$plugins_dir/$name"
  if exists "$target" && [[ ! -d "$target" || -L "$target" ]]; then
    fail "Refusing to replace a symlink or non-directory: $target"
  fi
done

# An older Audit install can still own one of the standalone slash commands.
if [[ " ${names[*]} " != *" $audit "* && -f "$plugins_dir/$audit/src/tui.ts" ]]; then
  for name in "${names[@]}"; do
    case "$name" in
      context-diff|usage-breakdown)
        if grep -Fq -- "name: \"$name\"" "$plugins_dir/$audit/src/tui.ts"; then
          fail "Compaction Audit already defines /$name. Run $0 --upgrade $audit $name to avoid duplicate commands."
        fi ;;
    esac
  done
fi

work=$(mktemp -d -- "$config_dir/.addon-install.XXXXXXXX")
attempted=()
committed=false

cleanup() {
  local status=$? i name target
  trap '' HUP INT TERM
  if ! $committed; then
    if [[ -n ${filters-} && "$work/staged/filters.json" -ef "$filters" ]]; then
      rm -- "$filters" || {
        printf 'Could not roll back the new filter file: %s\n' "$filters" >&2
        status=1
      }
    fi
    for (( i=${#attempted[@]}-1; i>=0; i-- )); do
      name=${attempted[i]}
      target="$plugins_dir/$name"
      if ! exists "$work/staged/$name" && exists "$target"; then
        if ! mv -T -- "$target" "$work/staged/$name"; then
          continue
        fi
      fi
      if exists "$work/previous/$name" && ! exists "$target"; then
        mv -T -- "$work/previous/$name" "$target" || true
      fi
    done
    for name in "${attempted[@]}"; do
      if exists "$work/previous/$name" || ! exists "$work/staged/$name"; then
        printf 'Rollback was incomplete. Recovery files: %s\n' "$work" >&2
        exit 1
      fi
    done
  fi

  rm -rf -- "$work/staged"
  if rmdir -- "$work/previous" 2>/dev/null; then
    rmdir -- "$work"
  elif $committed; then
    printf 'Backups: %s\n' "$work/previous"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -- "$work/staged" "$work/previous"
# Keep publication and rollback on the same filesystem so moves are renames.
staging_device=$(stat -c %d -- "$work")
[[ $staging_device == "$(stat -c %d -- "$plugins_dir")" ]] ||
  fail 'The plugin and staging directories must be on the same filesystem.'

prepare() {
  local name=$1 file input
  shift
  local source="$root/plugins/$name" target="$plugins_dir/$name" staged="$work/staged/$name"
  local identical=true
  local files=("$@" LICENSE NOTICE)

  if [[ ! -d "$target" || -L "$target/src" ]]; then
    identical=false
  else
    for file in "${files[@]}"; do
      input="$source/$file"
      if [[ $file == LICENSE || $file == NOTICE ]]; then input="$root/$file"; fi
      if [[ ! -f "$target/$file" || -L "$target/$file" ]] || ! cmp -s -- "$input" "$target/$file"; then
        identical=false
        break
      fi
    done
  fi

  if $identical; then
    unchanged+=("$name")
    return
  fi
  if exists "$target"; then
    $upgrade || fail "Different or incomplete installation: $target. Run with --upgrade to replace it with a backup."
    [[ $staging_device == "$(stat -c %d -- "$target")" ]] || fail "Cannot back up a plugin on another filesystem: $target"
  fi

  for file in "${files[@]}"; do
    input="$source/$file"
    if [[ $file == LICENSE || $file == NOTICE ]]; then input="$root/$file"; fi
    install -D -m 0644 -- "$input" "$staged/$file"
  done
  if [[ $name == "$discovery" ]]; then
    if exists "$target/filters.json"; then
      [[ -f "$target/filters.json" || -L "$target/filters.json" ]] || fail "Expected a file or symlink: $target/filters.json"
      cp -aT -- "$target/filters.json" "$staged/filters.json"
    else
      install -m 0644 -- "$source/filters.example.json" "$staged/filters.json"
    fi
  fi
  changes+=("$name")
}

changes=()
unchanged=()
for name in "${names[@]}"; do
  case "$name" in
    "$discovery")
      prepare "$name" package.json index.ts
      filters="$plugins_dir/$discovery/filters.json"
      if [[ ! -d "$work/staged/$discovery" ]] && ! exists "$filters"; then
        install -m 0644 -- "$root/plugins/$discovery/filters.example.json" "$work/staged/filters.json"
      fi ;;
    "$audit") prepare "$name" package.json src/index.ts src/audit.ts src/export.ts src/rpc.ts src/tui.ts ;;
    context-diff) prepare "$name" package.json index.ts rpc.ts tui.ts src/context-diff.ts ;;
    usage-breakdown) prepare "$name" package.json index.ts tui.ts src/usage.ts ;;
  esac
done

for name in "${changes[@]}"; do
  target="$plugins_dir/$name"
  attempted+=("$name")
  if exists "$target"; then
    mv -T -- "$target" "$work/previous/$name"
  fi
  mv -T -- "$work/staged/$name" "$target"
done
if [[ -f "$work/staged/filters.json" ]]; then
  ln -T -- "$work/staged/filters.json" "$filters"
fi
committed=true

for name in "${unchanged[@]}"; do
  printf 'Already installed: %s\n' "$plugins_dir/$name"
done
for name in "${changes[@]}"; do
  if [[ -d "$work/previous/$name" ]]; then
    printf 'Upgraded: %s\n' "$plugins_dir/$name"
  else
    printf 'Installed: %s\n' "$plugins_dir/$name"
  fi
done
