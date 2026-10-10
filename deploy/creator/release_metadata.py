#!/usr/bin/env python3
"""Generate the release contract embedded in Creator images (no credentials)."""
import hashlib
import json
import subprocess
from pathlib import Path


def generate(root):
    return {
        'version': (root / 'backend/cmd/server/VERSION').read_text().strip(),
        'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'migrations': {p.name: hashlib.sha256(p.read_text().strip().encode()).hexdigest()
                       for p in sorted((root / 'backend/migrations').glob('*.sql'))},
    }


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    (root / 'deploy/creator/release.json').write_text(json.dumps(generate(root), indent=2) + '\n')
    dockerfile = (root / 'Dockerfile.goreleaser').read_text()
    (root / 'deploy/creator/Dockerfile').write_text(
        dockerfile + '\nCOPY deploy/creator/release.json /app/creator-upgrade/release.json\n')
