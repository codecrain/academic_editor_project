import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function splitArgs(input) {
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;

  for (const char of String(input ?? '')) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) {
    args.push(current);
  }
  return args;
}

function main() {
  const runtimeDir = readEnv('EDITOR_NATIVE_RUNTIME_DIR', '/var/lib/academic-editor');
  const cacheDir = readEnv('EDITOR_NATIVE_CACHE_DIR', '/var/cache/academic-editor');
  const hostPort = readEnv('EDITOR_HOST_PORT', '9980');
  const extraParams = readEnv('EDITOR_EXTRA_PARAMS', '--o:ssl.enable=false --o:ssl.termination=true --o:welcome.enable=false --o:allow_update_popup=false');
  const coolwsd = readEnv('EDITOR_NATIVE_COOLWSD_BIN', '/usr/bin/coolwsd');

  mkdirSync(path.join(runtimeDir, 'child-roots'), { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  try {
    execFileSync('coolwsd-systemplate-setup', [path.join(runtimeDir, 'systemplate'), '/opt/collaboraoffice'], {
      stdio: 'ignore',
    });
  } catch {
    // The install step normally prepares the systemplate. Keep runtime startup
    // tolerant so pm2 restarts do not fail on a transient setup refresh.
  }

  const args = [
    '--use-env-vars',
    `--port=${hostPort}`,
    `--o:sys_template_path=${path.join(runtimeDir, 'systemplate')}`,
    `--o:child_root_path=${path.join(runtimeDir, 'child-roots')}`,
    '--o:file_server_root_path=/usr/share/coolwsd',
    `--o:cache_files.path=${cacheDir}`,
    '--o:logging.color=false',
    '--o:stop_on_config_change=false',
    ...splitArgs(extraParams),
  ];

  const child = spawn(coolwsd, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      domain: readEnv('EDITOR_ALLOWED_DOMAIN', '.*'),
      username: readEnv('EDITOR_ADMIN_USERNAME', 'admin'),
      password: readEnv('EDITOR_ADMIN_PASSWORD', 'document-editor-password'),
      extra_params: extraParams,
    },
  });

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
