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
    def test_current_catbee_node_uses_only_registered_compose_project(self):
        host = server.CATBEE_PRODUCTION_HOST
        with patch.object(server.socket, 'gethostname', return_value=host):
            production = load('server')
        self.assertIn(host, production.HOSTS)
        self.assertEqual(production.APP_SERVICE, 'app')
        self.assertEqual(production.COMPOSE, ['docker', 'compose', '-p', 'catbee-production',
                                             '-f', '/root/catbee-production/compose.json'])
        labels = {'com.docker.compose.project': 'catbee-production',
                  'com.docker.compose.service': 'app',
                  'com.docker.compose.project.working_dir': str(production.DEPLOY),
                  'com.docker.compose.project.config_files': str(production.OVERRIDE)}
        production.validate_production_project({'Config': {'Labels': labels}})
        for label in labels:
            wrong = dict(labels, **{label: 'wrong'})
            with self.subTest(label=label), self.assertRaisesRegex(RuntimeError, 'registered production'):
                production.validate_production_project({'Config': {'Labels': wrong}})

    def test_json_replacement_changes_only_application_image(self):
        with patch.object(server.socket, 'gethostname', return_value=server.CATBEE_PRODUCTION_HOST):
            production = load('server')
        config = {'services': {'app': {'image': OLD, 'container_name': 'sub2api', 'environment': {'EXAMPLE': OLD}},
                               'postgres': {'image': 'postgres:18'}, 'redis': {'image': 'redis:8'}},
                  'networks': {'default': {'name': 'catbee-network'}}}
        original = json.dumps(config)
        config['services']['app']['image'] = NEW
        self.assertEqual(json.loads(production.replace_json_image(original, OLD, NEW)), config)
        with self.assertRaisesRegex(RuntimeError, 'Unexpected image entry for Compose service app'):
            production.replace_json_image(original, NEW, OLD)
        with self.assertRaisesRegex(RuntimeError, 'Unexpected image entry for Compose service app'):
            production.replace_json_image(json.dumps({'services': {'sub2api': {'image': OLD}}}), OLD, NEW)
        with self.assertRaisesRegex(RuntimeError, 'Duplicate key'):
            production.replace_json_image('{"services": {}, "services": {}}', OLD, NEW)

    def test_consolidated_node_uses_application_project_not_database_project(self):
        with patch.object(server.socket, 'gethostname', return_value=server.CONSOLIDATED_HOST):
            consolidated = load('server')
        self.assertIn(server.CONSOLIDATED_HOST, consolidated.HOSTS)
        self.assertEqual(consolidated.APP_SERVICE, 'sub2api')
        self.assertEqual(consolidated.DEPLOY, Path('/root/catbee-app'))
        self.assertEqual(consolidated.COMPOSE,
                         ['docker', 'compose', '-f', '/root/catbee-app/docker-compose.yml',
                          '-f', '/root/catbee-app/docker-compose.creator.yml'])
        consolidated.validate_current_image(server.CONSOLIDATED_HOST, OLD)
        with self.assertRaises(RuntimeError):
            consolidated.validate_current_image(server.CONSOLIDATED_HOST, server.LEFT_LEGACY_IMAGE)
        with patch.object(server.socket, 'gethostname', return_value=server.NEW_HOST):
            application = load('server')
        self.assertEqual(application.DEPLOY, Path('/root/sub2api-deploy'))

    def test_legacy_image_only_allowed_on_registered_left_node(self):
        server.validate_current_image(server.LEFT_HOST, server.LEFT_LEGACY_IMAGE)
        for host in [server.HOST, server.LEFT_HOST]:
            server.validate_current_image(host, OLD)
        for host, ref in [(server.HOST, server.LEFT_LEGACY_IMAGE),
                          (server.LEFT_HOST, 'ghcr.io/ranxi2001/sub2api:latest'),
                          (server.LEFT_HOST, OLD + 'junk')]:
            with self.assertRaises(RuntimeError):
                server.validate_current_image(host, ref)

    def test_shared_network_companion_requires_review(self):
        server.validate_companions({'sub2api': {}, 'redis': {}})
        with self.assertRaisesRegex(RuntimeError, 'Shared-network companion'):
            server.validate_companions({'prism-adapter': {'network_mode': 'service:sub2api'}})
        with patch.object(server.socket, 'gethostname', return_value=server.CATBEE_PRODUCTION_HOST):
            production = load('server')
        for mode in ('service:app', 'container:sub2api'):
            with self.subTest(mode=mode), self.assertRaisesRegex(RuntimeError, 'Shared-network companion'):
                production.validate_companions({'companion': {'network_mode': mode}})

    def test_official_return_only_accepts_reviewed_digest_on_left(self):
        server.validate_current_image(server.LEFT_HOST, server.LEFT_OFFICIAL_IMAGE)
        for host, ref in [(server.HOST, server.LEFT_OFFICIAL_IMAGE),
                          (server.LEFT_HOST, 'ghcr.io/wei-shaw/sub2api:latest'),
                          (server.LEFT_HOST, server.LEFT_OFFICIAL_IMAGE[:-1] + '0')]:
            with self.subTest(host=host, ref=ref), self.assertRaises(RuntimeError):
                server.validate_current_image(host, ref)
        with self.assertRaises(RuntimeError):
            server.validate_image_ref(server.LEFT_OFFICIAL_IMAGE)

    def test_migration_compatibility_preserves_extra_history_and_rejects_changes(self):
        applied = {'001_common.sql': 'a' * 64, '242_official_only.sql': 'b' * 64}
        target = {'001_common.sql': 'a' * 64, '296_new.sql': 'c' * 64}
        server.validate_migration_compatibility(applied, target)
        with self.assertRaisesRegex(RuntimeError, '001_common.sql'):
            server.validate_migration_compatibility(applied, dict(target, **{'001_common.sql': 'd' * 64}))

    def test_reject_untrusted_or_mutable_image(self):
        for ref in ['ghcr.io/ranxi2001/sub2api:2.10.4', server.REPOSITORY + ':latest',
                    server.REPOSITORY + ':2.10.4-creator.1;id', server.REPOSITORY + '@sha256:abc']:
            with self.subTest(ref=ref), self.assertRaises(RuntimeError):
                server.validate_image_ref(ref)
        self.assertEqual(server.validate_image_ref(NEW), NEW)
        server.validate_image_ref(server.REPOSITORY + ':2.10.4-creator.1')
        server.validate_image_ref(server.REPOSITORY + ':2.22.0-creator.3.0')

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

    def test_production_recreate_and_rollback_target_only_app_service(self):
        with patch.object(server.socket, 'gethostname', return_value=server.CATBEE_PRODUCTION_HOST):
            production = load('server')
        old = {'Image': 'old-id'}
        with tempfile.TemporaryDirectory() as tmp:
            override = Path(tmp) / 'compose.json'
            override.write_text('old config')
            with patch.object(production, 'OVERRIDE', override), patch.object(production, 'run', return_value='') as run, \
                 patch.object(production, 'validate_running', side_effect=RuntimeError('health failed')), \
                 patch.object(production, 'wait_healthy', return_value=old), \
                 patch.object(production, 'config_signature', return_value={}):
                with self.assertRaisesRegex(RuntimeError, 'health failed'):
                    production.switch_image('old config', 'new config', {}, {}, old, {}, Path(tmp))
            self.assertEqual(override.read_text(), 'old config')
            ups = [call.args[0] for call in run.call_args_list if 'up' in call.args[0]]
            self.assertEqual(ups, [production.COMPOSE + ['up', '-d', '--no-deps', '--pull', 'never', 'app']] * 2)

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
            version.write_text('9.0.0-creator.3.0\n')
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
            self.assertEqual((candidate / 'backend/cmd/server/VERSION').read_text(), '9.0.1-creator.3.0\n')
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
