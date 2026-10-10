#!/usr/bin/env python3
"""Check/prepare upstream upgrades without altering the active checkout."""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

BASE = 'feature/creator-on-v2.10.2'
UPSTREAM = 'https://github.com/ranxi2001/sub2api.git'


def git(root, *args, check=True):
    return subprocess.run(['git', *args], cwd=root, text=True, capture_output=True, check=check)


def release(tag):
    endpoint = 'latest' if tag == 'latest' else 'tags/' + tag
    headers = {'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GH_TOKEN')
    if not token:
        credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                                    text=True, capture_output=True, timeout=15,
                                    env=dict(os.environ, GIT_TERMINAL_PROMPT='0'))
        values = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
        token = values.get('password')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request('https://api.github.com/repos/ranxi2001/sub2api/releases/' + endpoint,
                                     headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    if data['draft'] or data['prerelease'] or not re.fullmatch(r'v\d+\.\d+\.\d+', data['tag_name']):
        raise ValueError('Only stable vX.Y.Z releases are supported')
    return data


def prepare(root, data):
    tag = data['tag_name']
    ref = 'refs/creator/upstream/' + tag
    git(root, 'fetch', '--no-tags', UPSTREAM, 'refs/tags/' + tag + ':' + ref)
    git(root, 'fetch', 'origin', BASE)
    base = 'origin/' + BASE
    if git(root, 'merge-base', '--is-ancestor', ref, base, check=False).returncode == 0:
        print('ALREADY_INTEGRATED ' + tag)
        return
    branch = 'upgrade/creator-' + tag
    worktree = root.parent / ('sub2api-creator-' + tag)
    if worktree.exists() or git(root, 'show-ref', '--verify', 'refs/heads/' + branch, check=False).returncode == 0:
        raise RuntimeError('Upgrade already prepared. Inspect existing branch/worktree: ' + str(worktree))
    base_sha = git(root, 'rev-parse', base).stdout.strip()
    git(root, 'worktree', 'add', '-b', branch, str(worktree), base)
    merged = git(worktree, 'merge', '--no-commit', '--no-ff', ref, check=False)
    conflicts = git(worktree, 'diff', '--name-only', '--diff-filter=U').stdout.splitlines()
    version_file = 'backend/cmd/server/VERSION'
    if version_file in conflicts:
        (worktree / version_file).write_text(tag[1:] + '-creator.1\n')
        git(worktree, 'add', version_file)
        conflicts.remove(version_file)
    elif merged.returncode == 0:
        (worktree / version_file).write_text(tag[1:] + '-creator.1\n')
        git(worktree, 'add', version_file)
    changed = git(worktree, 'diff', '--name-only', base_sha).stdout.splitlines()
    report = {
        'upstream': tag, 'release_url': data['html_url'], 'release_notes': data.get('body', ''),
        'base_commit': base_sha, 'branch': branch, 'worktree': str(worktree), 'conflicts': conflicts,
        'migrations': [p for p in changed if p.startswith('backend/migrations/') and p.endswith('.sql')],
        'worker_changes': [p for p in changed if 'reauth' in p or 'totp' in p or 'excel_oauth' in p],
        'next': 'Review release notes, migrations and Worker changes; resolve conflicts, test, then commit and publish.',
    }
    # Keep the report outside the worktree so it cannot enter the application image by accident.
    path = root.parent / ('creator-upgrade-' + tag + '.json')
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'release_notes'}, ensure_ascii=False, indent=2))
    print('REPORT ' + str(path))
    if conflicts:
        raise RuntimeError('Merge conflicts require review; production and the base branch were not changed')
    if merged.returncode and not git(worktree, 'rev-parse', '--verify', 'MERGE_HEAD', check=False).returncode == 0:
        raise RuntimeError(merged.stderr)
    print('READY_FOR_REVIEW (not committed or pushed)')


def publish(root, reviewed):
    if not reviewed:
        raise RuntimeError('Review migrations and Worker changes, commit the upgrade, then use --reviewed')
    branch = git(root, 'branch', '--show-current').stdout.strip()
    if not branch.startswith('upgrade/creator-v'):
        raise RuntimeError('Publish must run inside the prepared upgrade worktree')
    if git(root, 'status', '--porcelain').stdout or git(root, 'rev-parse', '--verify', 'MERGE_HEAD', check=False).returncode == 0:
        raise RuntimeError('Resolve and commit the upgrade first; worktree must be clean')
    git(root, 'fetch', 'origin', BASE)
    git(root, 'merge-base', '--is-ancestor', 'origin/' + BASE, 'HEAD')
    # Normal push rejects concurrent changes. Never force-push the integration branch.
    result = git(root, 'push', 'origin', 'HEAD:refs/heads/' + BASE)
    print(result.stdout + result.stderr)
    print('BUILD_STARTED https://github.com/Nankeonlydream/sub2api/actions/workflows/creator-image.yml')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'prepare', 'publish'])
    parser.add_argument('version', nargs='?', default='latest')
    parser.add_argument('--reviewed', action='store_true')
    args = parser.parse_args()
    root = Path(git(Path.cwd(), 'rev-parse', '--show-toplevel').stdout.strip())
    if args.action == 'publish':
        publish(root, args.reviewed)
        return
    data = release(args.version)
    print(data['tag_name'] + ' ' + data['html_url'])
    if args.action == 'prepare':
        prepare(root, data)
    else:
        print(data.get('body', ''))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, subprocess.SubprocessError, OSError) as exc:
        print('STOP: ' + str(exc), file=sys.stderr)
        sys.exit(1)
