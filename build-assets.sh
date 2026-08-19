#!/usr/bin/env bash
#
# build-assets.sh — run from the project root, once, and again whenever you
# add media. Requires ffmpeg (brew install ffmpeg).
#
# Produces three things the mobile site looks for. All three are OPTIONAL:
# if a file is missing the site falls back to the original automatically, so
# nothing breaks — it is just heavier until this has run.
#
#   assets/_derived/<path>-{480,720,1080}.webp   carousel image sizes
#   assets/_posters/<path>.webp                  video first frames
#   assets/_mobile/<path>.mp4                    mobile video renditions
#
# The paths deliberately mirror the originals (including the leading
# "assets/projects/...") so the URL is derivable from the source path with no
# manifest to keep in sync.
#
set -euo pipefail

SRC_ROOT="assets/projects"
[ -d "$SRC_ROOT" ] || { echo "Run this from the project root ($SRC_ROOT not found)."; exit 1; }

command -v ffmpeg >/dev/null || { echo "ffmpeg not found."; exit 1; }

echo "==> 1/3  image derivatives"
# Never upscales: min(target, source width). -2 keeps the height even.
find "$SRC_ROOT" \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0 |
while IFS= read -r -d '' f; do
  stem="${f%.*}"
  for w in 480 720 1080; do
    out="assets/_derived/${stem}-${w}.webp"
    [ -f "$out" ] && continue
    mkdir -p "$(dirname "$out")"
    ffmpeg -loglevel error -y -i "$f" \
      -vf "scale='min(${w},iw)':-2:flags=lanczos" \
      -c:v libwebp -quality 80 -compression_level 5 "$out"
    echo "    $out"
  done
done

echo "==> 2/3  video posters (first frame)"
find "$SRC_ROOT" \( -iname '*.mp4' -o -iname '*.webm' -o -iname '*.mov' \) -print0 |
while IFS= read -r -d '' f; do
  stem="${f%.*}"
  out="assets/_posters/${stem}.webp"
  [ -f "$out" ] && continue
  mkdir -p "$(dirname "$out")"
  ffmpeg -loglevel error -y -i "$f" \
    -vf "select=eq(n\,0),scale='min(720,iw)':-2" -frames:v 1 \
    -c:v libwebp -quality 78 "$out"
  echo "    $out"
done

echo "==> 3/3  mobile video renditions"
# Decisions baked in here, all of them about decode cost rather than file size:
#   -an          strip audio entirely — one less decoder per tile, and it lets
#                iOS treat the element more cheaply
#   720 wide cap tiles are ~260 CSS px; even at 2x DPR that is the ceiling
#   -g 30        1-second GOP so a loop restarts instantly with no visible hitch
#   +faststart   moov atom first, so playback can begin before the full file
#   yuv420p      the only chroma format decoded in hardware everywhere
find "$SRC_ROOT" \( -iname '*.mp4' -o -iname '*.webm' -o -iname '*.mov' \) -print0 |
while IFS= read -r -d '' f; do
  stem="${f%.*}"
  out="assets/_mobile/${stem}.mp4"
  [ -f "$out" ] && continue
  mkdir -p "$(dirname "$out")"
  ffmpeg -loglevel error -y -i "$f" \
    -vf "scale='min(720,iw)':-2:flags=lanczos" \
    -an \
    -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p \
    -b:v 1100k -maxrate 1500k -bufsize 2200k \
    -g 30 -keyint_min 30 -sc_threshold 0 \
    -movflags +faststart \
    "$out"
  echo "    $out"
done

echo
echo "Done."
echo "Sanity check: originals vs mobile renditions"
du -sh "$SRC_ROOT" assets/_mobile assets/_derived assets/_posters 2>/dev/null || true
