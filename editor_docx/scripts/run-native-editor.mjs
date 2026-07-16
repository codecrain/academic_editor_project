import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_ACADEMIC_DICTIONARY_SOURCE,
  assertAcademicDictionarySynced,
} from './academic-dictionary.mjs';
import { assertSystemplateFontsSynced } from './native-systemplate-fonts.mjs';

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
  const disableCoolUserChecking = readEnv('EDITOR_DISABLE_COOL_USER_CHECKING', 'true') === 'true';
  const systemplateDir = path.join(runtimeDir, 'systemplate');
  const officeDir = readEnv('EDITOR_NATIVE_OFFICE_DIR', '/opt/collaboraoffice');
  const academicFontDir = readEnv('EDITOR_NATIVE_ACADEMIC_FONT_DIR', '/usr/local/share/fonts/tlooto-academic');
  const academicDictionarySource = readEnv(
    'EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE',
    DEFAULT_ACADEMIC_DICTIONARY_SOURCE,
  );

  mkdirSync(path.join(runtimeDir, 'child-roots'), { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  let systemplateSetupError;
  try {
    execFileSync('coolwsd-systemplate-setup', [systemplateDir, officeDir], {
      stdio: 'ignore',
    });
  } catch (error) {
    systemplateSetupError = error;
  }

  if (!existsSync(systemplateDir)) {
    throw systemplateSetupError ?? new Error(`Native editor systemplate is missing: ${systemplateDir}`);
  }

  const syncedFonts = assertSystemplateFontsSynced({
    sourceDir: academicFontDir,
    systemplateDir,
    officeDir,
  });
  const syncedDictionary = assertAcademicDictionarySynced({
    sourcePath: academicDictionarySource,
    systemplateDir,
    officeDir,
  });
  if (systemplateSetupError && (syncedFonts.count > 0 || syncedDictionary.count > 0)) {
    console.warn('[editor] systemplate refresh needs elevated permissions; verified existing academic assets instead.');
  }

  const args = [
    '--use-env-vars',
    ...(disableCoolUserChecking ? ['--disable-cool-user-checking'] : []),
    `--port=${hostPort}`,
    `--o:sys_template_path=${systemplateDir}`,
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
