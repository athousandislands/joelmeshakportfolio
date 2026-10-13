#!/usr/bin/env bash
# Generate optional optimized media without changing any originals.
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to prepare media."; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe is required to prepare media."; exit 1; }
node scripts/prepare-media.mjs
