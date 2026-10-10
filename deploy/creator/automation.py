#!/usr/bin/env python3
"""Scheduled preparation: create a candidate branch and dispatch its CI, never deploy."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import upstream


def api(path, body=None):
    headers = {'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'}
    req = urllib.request.Request('https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY'] + '/' + path,
                                 data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def main():
    root = Path.cwd()
    data = upstream.release('latest')
    tag = data['tag_name']
    ref = 'refs/creator/upstream/' + tag
    upstream.git(root, 'fetch', '--no-tags', upstream.UPSTREAM, 'refs/tags/' + tag + ':' + ref)
    upstream.git(root, 'fetch', 'origin', upstream.BASE)
    summary = Path(os.environ['GITHUB_STEP_SUMMARY'])
    if upstream.git(root, 'merge-base', '--is-ancestor', ref, 'origin/' + upstream.BASE, check=False).returncode == 0:
        summary.write_text('已包含上游 ' + tag + '，无需升级。\n')
        return
    branch = 'upgrade/creator-' + tag
    remote = upstream.git(root, 'ls-remote', 'origin', 'refs/heads/' + branch).stdout.strip()
    if remote:
        sha = remote.split()[0]
        runs = api('actions/workflows/creator-image.yml/runs?head_sha=' + sha + '&per_page=20')['workflow_runs']
        if not runs:
            api('actions/workflows/creator-image.yml/dispatches', {'ref': branch})
        summary.write_text('候选分支已存在：`' + branch + '`。请检查 Creator image 的测试结果；未部署服务器。\n')
        return
    upstream.prepare(root, data)
    worktree = root.parent / ('sub2api-creator-' + tag)
    report = root.parent / ('creator-upgrade-' + tag + '.json')
    summary.write_text('已准备 `' + branch + '`。以下发布说明/迁移/Worker 变化需在上线前检查。\n\n' + report.read_text())
    upstream.git(worktree, 'diff', '--check', '--cached')
    upstream.git(worktree, '-c', 'user.name=Creator upgrade bot', '-c',
                 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
                 'commit', '-m', 'merge: prepare Creator upgrade to ' + tag)
    upstream.git(worktree, 'push', 'origin', 'HEAD:refs/heads/' + branch)
    # workflow_dispatch (unlike ordinary token pushes) starts the candidate CI.
    api('actions/workflows/creator-image.yml/dispatches', {'ref': branch})


if __name__ == '__main__':
    main()
