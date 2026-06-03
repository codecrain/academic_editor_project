import { spawnSync } from 'node:child_process';

const containerName =
  process.env.EDITOR_CONTAINER_NAME || 'academic-editor-local';

function dockerInfo(command) {
  const result = spawnSync(command[0], [...command.slice(1), 'info', '--format', '{{.ServerVersion}}'], {
    stdio: 'ignore',
    timeout: 2_000,
  });
  return result.status === 0;
}

const dockerCommand =
  dockerInfo(['docker']) || process.platform === 'win32'
    ? ['docker']
    : dockerInfo(['sudo', '-n', 'docker'])
      ? ['sudo', '-n', 'docker']
      : ['docker'];

const result = spawnSync(dockerCommand[0], [...dockerCommand.slice(1), 'rm', '-f', containerName], {
  stdio: 'inherit',
  encoding: 'utf8',
});

process.exit(result.status ?? 1);
