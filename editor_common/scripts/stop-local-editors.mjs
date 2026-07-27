import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, '..', '..');
const rhwpPm2Name = process.env.RHWP_STUDIO_PM2_NAME || 'rhwp-studio-dev';
const gatewayPm2Name = process.env.EDITOR_GATEWAY_PM2_NAME || 'academic-editor-gateway-dev';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: editorRoot,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    ...options,
  });
}

run(process.execPath, [path.resolve(editorRoot, 'editor_docx', 'scripts', 'stop-editor.mjs')], {
  shell: false,
});

run('pm2', ['delete', gatewayPm2Name]);
run('pm2', ['delete', rhwpPm2Name]);
