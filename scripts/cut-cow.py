# Cuts the white backdrop out of public/assets/cow-gir.jpg for the hero pasture
# and the page-leave veil. Run: python scripts/cut-cow.py public/assets/cow-gir.jpg public/assets/cow-gir-cut.webp
# (needs numpy + Pillow; also writes a .png beside it, which is not used).
import sys
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
s = im.sum(axis=2)
# Distance from paper-white. Everything in the cow sums well under 600
# (the palest part, the udder, is ~560); the backdrop is ~750+.
lo, hi = 590.0, 735.0
a = np.clip((hi - s) / (hi - lo), 0, 1)
# Un-mix the white the edge pixels were blended with, so no pale rim.
safe = np.maximum(a, 1e-3)[..., None]
fg = np.clip((im - (1 - a[..., None]) * 255.0) / safe, 0, 255)
fg[a == 0] = 0
rgba = np.dstack([fg, a * 255]).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
w = 760
img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
img.save(out, 'WEBP', quality=88, alpha_quality=100, method=6)
img.save(out.replace('.webp', '.png'), optimize=True)
print(img.size)
