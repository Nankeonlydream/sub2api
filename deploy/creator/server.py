#!/usr/bin/env python3
"""Right-node Creator image updater. Default is validation only; --apply switches it."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time

HOST = 'iZrj92zzv39jbi7n9fz4fuZ'
REPOSITORY = 'ghcr.io/nankeonlydream/sub2api'
DEPLOY = Path('/root/sub2api-deploy')
RELEASES = Path('/root/sub2api-creator-release')
OVERRIDE = DEPLOY / 'docker-compose.creator.yml'
COMPOSE = ['docker', 'compose', '-f', str(DEPLOY / 'docker-compose.yml'), '-f', str(OVERRIDE)]


def run(args, timeout=300):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, universal_newlines=True, timeout=timeout)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def log(message):
    print(message, flush=True)


def validate_image_ref(value):
    pattern = re.escape(REPOSITORY) + r'(?:@sha256:[a-f0-9]{64}|:\d+\.\d+\.\d+-creator\.\d+)'
    require(re.fullmatch(pattern, value), 'Use a fixed Creator version or digest from ' + REPOSITORY)
    return value


def validate_metadata(data, image):
    require(re.fullmatch(r'\d+\.\d+\.\d+-creator\.\d+', data.get('version', '')), 'Invalid Creator version')
    require(re.fullmatch(r'[a-f0-9]{40}', data.get('revision', '')), 'Invalid revision')
    require(image['Architecture'] == 'amd64', 'Image architecture mismatch')
    require(image['Config'].get('Labels', {}).get('org.opencontainers.image.revision') == data['revision'],
            'Image revision does not match release metadata')
    require(isinstance(data.get('migrations'), dict) and data['migrations'], 'Missing migrations metadata')
    for filename, checksum in data['migrations'].items():
        require(re.fullmatch(r'[0-9]+[a-z]?_[A-Za-z0-9_]+\.sql', filename), 'Invalid migration filename')
        require(re.fullmatch(r'[a-f0-9]{64}', checksum), 'Invalid migration checksum')


def replace_image(original, old, new):
    # Only accept the existing minimal, single-service override. Fail closed on layout changes.
    pattern = r'(?m)^([ \t]+image:[ \t]*)' + re.escape(old) + r'[ \t]*$'
    require(len(re.findall(pattern, original)) == 1, 'Unexpected image entry in Creator override')
    return re.sub(pattern, lambda m: m[1] + new, original)


def atomic_write(path, text):
    temporary = path.with_name(path.name + '.creator-tmp')
    with open(temporary, 'w') as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def config_signature(container):
    return {
        'env': dict(item.split('=', 1) for item in container['Config']['Env']),
        'mounts': sorted((m['Type'], m['Source'], m['Destination'], m['RW']) for m in container['Mounts']),
        'ports': container['HostConfig']['PortBindings'],
        'network': container['HostConfig']['NetworkMode'],
    }


def curl(name, path):
    return run(['docker', 'exec', name, 'curl', '-fsS', '--max-time', '10', 'http://127.0.0.1:8080' + path])


def assets(name):
    html = curl(name, '/creator')
    for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
        require(src.startswith('/assets/'), 'Unexpected frontend script path')
        match = re.search(r'CreatorStudioView-[A-Za-z0-9_-]+\.js', curl(name, src))
        if match:
            path = '/assets/' + match[0]
            body = curl(name, path)
            require(all(size in body for size in ['1024x688', '688x1024', '1024x768', '768x1024']),
                    'Creator 1K preset regression')
            return {'path': path, 'sha256': hashlib.sha256(body.encode()).hexdigest()}
    raise RuntimeError('Creator assets missing')


def migrations():
    # Credentials stay inside the existing container; only names/checksums leave it.
    command = ('export PGPASSWORD="$DATABASE_PASSWORD"; exec psql -h "$DATABASE_HOST" '
               '-p "${DATABASE_PORT:-5432}" -U "$DATABASE_USER" -d "$DATABASE_DBNAME" '
               '-At -v ON_ERROR_STOP=1 -c "SELECT filename,checksum FROM schema_migrations ORDER BY filename"')
    output = run(['docker', 'exec', 'sub2api', 'sh', '-c', command])
    return dict(line.split('|', 1) for line in output.splitlines() if line)


def wait_healthy():
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        container = inspect('sub2api')
        if container['State'].get('Health', {}).get('Status') == 'healthy':
            return container
        time.sleep(2)
    raise RuntimeError('Container health timeout')


def validate_running(image, metadata, old, expected_migrations):
    current = wait_healthy()
    require(current['Image'] == image['Id'], 'Running image mismatch')
    require(config_signature(current) == config_signature(old), 'Environment/mount/port/network changed')
    version = run(['docker', 'exec', 'sub2api', '/app/sub2api', '-version'])
    require(metadata['version'] in version and metadata['revision'] in version, 'Running version mismatch')
    require(json.loads(curl('sub2api', '/health'))['status'] == 'ok', 'Application health failed')
    asset = assets('sub2api')
    applied = migrations()
    require(all(applied.get(name) == checksum for name, checksum in expected_migrations.items()),
            'New migration verification failed')
    return current, asset


def switch_image(original, replacement, image, metadata, old, expected_migrations, root):
    try:
        atomic_write(OVERRIDE, replacement)
        run(COMPOSE + ['config', '--quiet'])
        log(run(COMPOSE + ['up', '-d', '--no-deps', '--pull', 'never', 'sub2api']))
        return validate_running(image, metadata, old, expected_migrations)
    except Exception:
        log('VALIDATION_FAILED: restoring previous application image; database migrations are not undone')
        atomic_write(OVERRIDE, original)
        try:
            run(COMPOSE + ['up', '-d', '--no-deps', '--pull', 'never', 'sub2api'])
            restored = wait_healthy()
            require(restored['Image'] == old['Image'], 'Rollback image mismatch')
            require(config_signature(restored) == config_signature(old), 'Rollback config mismatch')
            log('APPLICATION_ROLLBACK_OK')
        except Exception:
            log('ROLLBACK_FAILED: inspect ' + str(root))
            raise
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', help='Fixed Creator image version or digest')
    parser.add_argument('--apply', action='store_true', help='Switch the production container after validation')
    parser.add_argument('--status', action='store_true', help='Show current version and health without updating')
    args = parser.parse_args()
    require(os.geteuid() == 0, 'Run with sudo')
    require(socket.gethostname() == HOST, 'Wrong host: this updater is for the right node only')
    os.umask(0o077)
    RELEASES.mkdir(parents=True, exist_ok=True)
    with open(RELEASES / 'creator-upgrade.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        old = inspect('sub2api')
        if args.status:
            log(json.dumps({'image': old['Config']['Image'], 'health': old['State'].get('Health', {}).get('Status')}))
            log(run(['docker', 'exec', 'sub2api', '/app/sub2api', '-version']))
            return
        require(args.image, '--image is required')
        validate_image_ref(args.image)
        require(old['Config']['Image'].startswith(REPOSITORY + '@sha256:'), 'Unexpected current production image')
        require(old['State'].get('Health', {}).get('Status') == 'healthy', 'Current service is not healthy')
        original = OVERRIDE.read_text()
        log('PULL ' + args.image)
        log(run(['docker', 'pull', args.image], timeout=600))
        image = inspect(args.image)
        digests = [ref for ref in image.get('RepoDigests', []) if ref.startswith(REPOSITORY + '@sha256:')]
        require(digests, 'Image has no repository digest')
        pinned = args.image if '@sha256:' in args.image else digests[0]
        require(inspect(pinned)['Id'] == image['Id'], 'Digest does not match pulled image')
        metadata = json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat',
                                   pinned, '/app/creator-upgrade/release.json']))
        validate_metadata(metadata, image)
        version = run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', '/app/sub2api', pinned, '-version'])
        require(metadata['version'] in version and metadata['revision'] in version, 'Binary metadata mismatch')
        replacement = replace_image(original, old['Config']['Image'], pinned)
        before = migrations()
        expected = {n: c for n, c in metadata['migrations'].items() if n not in before}
        log('PENDING_MIGRATIONS ' + json.dumps(sorted(expected)))
        if old['Image'] == image['Id']:
            validate_running(image, metadata, old, expected)
            log('ALREADY_DEPLOYED ' + metadata['version'])
            return
        smoke = 'creator-upgrade-smoke-' + str(os.getpid())
        run(['docker', 'run', '-d', '--name', smoke, '--network', 'none', '-e', 'AUTO_SETUP=false', pinned])
        try:
            for _ in range(30):
                try:
                    require(json.loads(curl(smoke, '/health'))['status'] == 'ok', 'Smoke health failed')
                    break
                except (RuntimeError, subprocess.CalledProcessError):
                    time.sleep(1)
            else:
                raise RuntimeError('Isolated smoke startup failed')
            log('ISOLATED_CREATOR_OK ' + json.dumps(assets(smoke)))
        finally:
            run(['docker', 'rm', '-f', smoke])
        if not args.apply:
            log('CHECK_OK: production unchanged. After reviewing migrations and Worker requirements, add --apply.')
            return
        root = RELEASES / (metadata['version'] + '-' + time.strftime('%Y%m%dT%H%M%S') + '-' + str(os.getpid()))
        root.mkdir()
        (root / 'docker-compose.creator.before.yml').write_text(original)
        (root / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
        require(inspect('sub2api')['Id'] == old['Id'] and OVERRIDE.read_text() == original,
                'Production changed during preflight; retry after inspecting it')
        current, asset = switch_image(original, replacement, image, metadata, old, expected, root)
        result = {'version': metadata['version'], 'revision': metadata['revision'], 'image': pinned,
                  'container_id': current['Id'], 'health': 'healthy', 'creator_asset': asset,
                  'applied_migrations': sorted(expected), 'config_preserved': True, 'database_backup': False}
        (root / 'DEPLOYED_OK').write_text(json.dumps(result, indent=2) + '\n')
        log('DEPLOYMENT_COMPLETE ' + json.dumps(result))
        log('RECORD ' + str(root))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError, OSError, ValueError) as exc:
        # Do not print captured command output, which could contain private config.
        print('STOP: ' + str(exc), file=sys.stderr)
        sys.exit(1)
