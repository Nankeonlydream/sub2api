import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load('server')
metadata = load('release_metadata')
upstream = load('upstream')
OLD = server.REPOSITORY + '@sha256:' + 'a' * 64
NEW = server.REPOSITORY + '@sha256:' + 'b' * 64


class UpgradeTests(unittest.TestCase):
    def test_reject_untrusted_or_mutable_image(self):
        for ref in ['ghcr.io/ranxi2001/sub2api:2.10.4', server.REPOSITORY + ':latest',
                    server.REPOSITORY + ':2.10.4-creator.1;id', server.REPOSITORY + '@sha256:abc']:
            with self.subTest(ref=ref), self.assertRaises(RuntimeError):
                server.validate_image_ref(ref)
        self.assertEqual(server.validate_image_ref(NEW), NEW)
        server.validate_image_ref(server.REPOSITORY + ':2.10.4-creator.1')

    def test_replacement_preserves_other_compose_fields(self):
        source = 'services:\n  sub2api:\n    image: ' + OLD + '\n    restart: always\n'
        result = server.replace_image(source, OLD, NEW)
        self.assertEqual(result, source.replace(OLD, NEW))
        with self.assertRaises(RuntimeError):
            server.replace_image(source, NEW, OLD)
        with self.assertRaises(RuntimeError):
            server.replace_image(source + source, OLD, NEW)

    def test_metadata_revision_and_migrations_are_validated(self):
        data = {'version': '2.10.4-creator.1', 'revision': 'c' * 40,
                'migrations': {'272_example.sql': 'd' * 64}}
        image = {'Architecture': 'amd64', 'Config': {'Labels': {'org.opencontainers.image.revision': 'c' * 40}}}
        server.validate_metadata(data, image)
        for modified in [dict(data, revision='e' * 40), dict(data, version='../../bad'),
                         dict(data, migrations={'../../bad.sql': 'd' * 64})]:
            with self.assertRaises(RuntimeError):
                server.validate_metadata(modified, image)

    def test_metadata_uses_migration_runner_whitespace_normalization(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'backend/cmd/server').mkdir(parents=True)
            (root / 'backend/migrations').mkdir()
            (root / 'backend/cmd/server/VERSION').write_text('2.10.4-creator.1\n')
            (root / 'backend/migrations/272_example.sql').write_text('\nSELECT 1;\n')
            with patch.object(metadata.subprocess, 'check_output', return_value='c' * 40 + '\n'):
                result = metadata.generate(root)
            self.assertEqual(result['migrations']['272_example.sql'], server.hashlib.sha256(b'SELECT 1;').hexdigest())

    def test_rollback_restores_old_override_on_failed_health(self):
        old = {'Image': 'old-id'}
        with tempfile.TemporaryDirectory() as tmp:
            override = Path(tmp) / 'override.yml'
            override.write_text('old config')
            calls = []
            with patch.object(server, 'OVERRIDE', override), \
                 patch.object(server, 'run', side_effect=lambda args: calls.append(args) or ''), \
                 patch.object(server, 'validate_running', side_effect=RuntimeError('health failed')), \
                 patch.object(server, 'wait_healthy', return_value=old), \
                 patch.object(server, 'config_signature', return_value={}):
                with self.assertRaisesRegex(RuntimeError, 'health failed'):
                    server.switch_image('old config', 'new config', {}, {}, old, {}, Path(tmp))
            self.assertEqual(override.read_text(), 'old config')
            self.assertEqual(sum('--no-deps' in c for c in calls), 2)

    def test_switch_preserves_new_override_on_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            override = Path(tmp) / 'override.yml'
            override.write_text('old config')
            with patch.object(server, 'OVERRIDE', override), patch.object(server, 'run', return_value=''), \
                 patch.object(server, 'validate_running', return_value=({}, {})):
                server.switch_image('old config', 'new config', {}, {}, {}, {}, Path(tmp))
            self.assertEqual(override.read_text(), 'new config')

    def test_prepare_isolated_merge_and_version_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / 'source'
            source.mkdir()
            def git(where, *args):
                return subprocess.check_output(['git', *args], cwd=where, stderr=subprocess.STDOUT, text=True)
            git(source, 'init', '-b', 'main')
            git(source, 'config', 'user.name', 'Upgrade test')
            git(source, 'config', 'user.email', 'test@example.invalid')
            (source / 'backend/cmd/server').mkdir(parents=True)
            version = source / 'backend/cmd/server/VERSION'
            version.write_text('9.0.0\n')
            git(source, 'add', '.')
            git(source, 'commit', '-m', 'base')
            git(source, 'checkout', '-b', upstream.BASE)
            version.write_text('9.0.0-creator.1\n')
            (source / 'creator.txt').write_text('keep creator')
            git(source, 'add', '.')
            git(source, 'commit', '-m', 'custom')
            git(source, 'checkout', 'main')
            version.write_text('9.0.1\n')
            git(source, 'add', '.')
            git(source, 'commit', '-m', 'upstream')
            git(source, 'tag', 'v9.0.1')
            checkout = root / 'checkout'
            git(root, 'clone', '-b', upstream.BASE, str(source), str(checkout))
            git(checkout, 'config', 'user.name', 'Upgrade test')
            git(checkout, 'config', 'user.email', 'test@example.invalid')
            before = git(checkout, 'rev-parse', 'HEAD')
            with patch.object(upstream, 'UPSTREAM', str(source)):
                upstream.prepare(checkout, {'tag_name': 'v9.0.1', 'html_url': 'https://example.invalid', 'body': 'fixture'})
            candidate = root / 'sub2api-creator-v9.0.1'
            self.assertEqual((candidate / 'creator.txt').read_text(), 'keep creator')
            self.assertEqual((candidate / 'backend/cmd/server/VERSION').read_text(), '9.0.1-creator.1\n')
            self.assertEqual(git(checkout, 'rev-parse', 'HEAD'), before)
            self.assertEqual(git(candidate, 'diff', '--name-only', '--diff-filter=U'), '')
            self.assertTrue((root / 'creator-upgrade-v9.0.1.json').exists())

    def test_wrong_host_stops_before_docker(self):
        with patch.object(server.sys, 'argv', ['server.py', '--status']), \
             patch.object(server.os, 'geteuid', return_value=0), \
             patch.object(server.socket, 'gethostname', return_value='left-node'), \
             patch.object(server, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'Wrong host'):
                server.main()
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
