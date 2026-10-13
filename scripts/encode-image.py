"""Optional media preparation: Pillow supplies WebP when ffmpeg lacks it."""
import io
import os
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageOps

source, target = sys.argv[1:3]
if Path(source).suffix.lower() in ('.mp4', '.webm', '.mov'):
    frame = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-i', source, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-threads', '1', '-'], check=True, capture_output=True)
    image = Image.open(io.BytesIO(frame.stdout))
else:
    image = ImageOps.exif_transpose(Image.open(source))
if '/_previews/' in target:
    image = ImageOps.fit(image, (384, 494), method=Image.Resampling.LANCZOS)
else:
    import re
    match = re.search(r'-(480|720|1080)\.webp$', target)
    width = min(image.width, int(match.group(1)) if match else 720)
    height = max(1, round(image.height * width / image.width))
    image = image.resize((width, height), Image.Resampling.LANCZOS)
if image.mode not in ('RGB', 'RGBA'):
    image = image.convert('RGB')
temporary = target + '.tmp'
image.save(temporary, format='WEBP', quality=85 if '/_previews/' in target else 82, method=5)
os.replace(temporary, target)
