#!/usr/bin/env bash
set -u
BASE="https://basket-random.game-files.crazygames.com/basket-random/7"
OUT="C:/Users/Administrator/Desktop/basketball/.work/assets"
mkdir -p "$OUT/images" "$OUT/media" "$OUT/icons"
node "C:/Users/Administrator/Desktop/basketball/.work/make-url-list.js" > "$OUT/urls.txt"
echo "url count: $(wc -l < "$OUT/urls.txt")"
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  out="$OUT/$rel"
  if [ -s "$out" ]; then continue; fi
  code=$(curl -sS -L --max-time 60 -w '%{http_code}' -o "$out" "$BASE/$rel")
  if [ "$code" != "200" ]; then echo "FAIL $code $rel"; rm -f "$out"; else echo "OK   $(wc -c < "$out")  $rel"; fi
done < "$OUT/urls.txt"
echo "--- done ---"
