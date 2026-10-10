#!/usr/bin/env python3
"""Verify a published image's exact revision has successful CI, print deploy command."""
import argparse
import hashlib
import json
import subprocess
import urllib.parse
import urllib.request

REPO = 'Nankeonlydream/sub2api'
IMAGE = 'ghcr.io/nankeonlydream/sub2api'


def get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=30) as response:
        raw = response.read()
        return json.loads(raw), raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version', help='Creator version, for example 2.10.4-creator.1')
    args = parser.parse_args()
    import re
    if not re.fullmatch(r'\d+\.\d+\.\d+-creator\.\d+', args.version):
        raise ValueError('Expected X.Y.Z-creator.N')
    token, _ = get('https://ghcr.io/token?scope=repository:nankeonlydream/sub2api:pull')
    headers = {'Authorization': 'Bearer ' + token['token'],
               'Accept': 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json'}
    base = 'https://ghcr.io/v2/nankeonlydream/sub2api/'
    index, raw = get(base + 'manifests/' + args.version, headers)
    digest = 'sha256:' + hashlib.sha256(raw).hexdigest()
    if 'manifests' in index:
        target = next(m for m in index['manifests'] if m.get('platform') == {'architecture': 'amd64', 'os': 'linux'})
        manifest, _ = get(base + 'manifests/' + target['digest'], headers)
    else:
        manifest = index
    config, _ = get(base + 'blobs/' + manifest['config']['digest'], headers)
    revision = config['config']['Labels']['org.opencontainers.image.revision']
    gh_headers = {'Accept': 'application/vnd.github+json'}
    credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                                capture_output=True, text=True, env=dict(__import__('os').environ, GIT_TERMINAL_PROMPT='0'))
    values = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
    if values.get('password'):
        gh_headers['Authorization'] = 'Bearer ' + values['password']
    runs, _ = get('https://api.github.com/repos/' + REPO + '/actions/workflows/creator-image.yml/runs?head_sha=' + revision,
                  gh_headers)
    successful = [r for r in runs['workflow_runs'] if r['head_sha'] == revision and r['conclusion'] == 'success']
    if not successful:
        raise RuntimeError('No successful Creator image CI for this exact image revision')
    print('CI_OK ' + successful[0]['html_url'])
    print('REVISION ' + revision)
    print('IMAGE ' + IMAGE + '@' + digest)
    print('After reviewing migrations/Worker changes and integrating the candidate:')
    print('sudo /usr/local/sbin/creator-upgrade --image ' + IMAGE + '@' + digest + ' --apply')


if __name__ == '__main__':
    main()
