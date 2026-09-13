"""Run after updating dist/courses.json to regenerate its compressed download."""
import gzip, hashlib, re
from pathlib import Path
root = Path(__file__).resolve().parent
raw = (root / 'courses.json').read_bytes()
name = 'courses-' + hashlib.sha256(raw).hexdigest()[:12] + '.bin'
(root / name).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
app = root / 'app.js'
app.write_text(re.sub(r'courses-[a-f0-9]{12}\.bin', name, app.read_text()))
for old in root.glob('courses-*.bin'):
    if old.name != name:
        old.unlink()
print(name)
