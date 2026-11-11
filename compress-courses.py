"""Generate compressed semester downloads and their content-addressed manifest."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = [('202710', 'Fall 2026', 'courses.json', 'husky-fall26'),
          ('202730', 'Spring 2027', 'courses-202730.json', 'husky-202730')]


def compress():
    prepared = []
    for term, label, filename, storage_key in CONFIG:
        raw = (ROOT / filename).read_bytes()
        data = json.loads(raw)
        if data['term'] != term or not data['courses'] or not data['calendarStart']:
            raise ValueError(f'Invalid semester snapshot: {filename}')
        name = f'courses-{term}-' + hashlib.sha256(raw).hexdigest()[:12] + '.bin'
        prepared.append((dict(id=term, label=label, file=filename,
                              compressed=name, storageKey=storage_key), gzip.compress(raw, compresslevel=9, mtime=0)))
    for entry, compressed in prepared:
        (ROOT / entry['compressed']).write_bytes(compressed)
        print(f'{entry["label"]}: {entry["compressed"]} ({len(compressed):,} bytes)')
    manifest = dict(defaultTerm='202710', terms=[entry for entry, _ in prepared])
    (ROOT / 'terms.json').write_text(json.dumps(manifest, indent=2) + '\n')
    current = {entry['compressed'] for entry, _ in prepared}
    for old in ROOT.glob('courses-*.bin'):
        if old.name not in current:
            old.unlink()


if __name__ == '__main__':
    compress()
