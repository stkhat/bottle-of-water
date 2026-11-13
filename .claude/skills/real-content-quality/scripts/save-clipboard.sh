#!/bin/zsh
# Usage: save-clipboard.sh <corpus-dir> <youtube|netflix|articles>
# Saves the JSON a grab snippet put on the clipboard to <corpus-dir>/<kind>/<id>.json.
set -u
dir=$1/$2; mkdir -p "$dir"
tmp=$(mktemp); LANG=en_US.UTF-8 pbpaste > "$tmp"
id=$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$tmp") || { echo "clipboard is not a grab result"; rm -f "$tmp"; exit 1; }
mv "$tmp" "$dir/$id.json" && echo "saved $2/$id ($(wc -c < "$dir/$id.json") bytes)"
echo "now remove the grab's textarea from the page: document.getElementById('__tqta')?.remove()"
