import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import { HWPX_COMMAND_CATALOG } from './hwpx-command-catalog.mjs';

const CORE_ARTIFACT_FILES = Object.freeze([
  'rhwp.js',
  'rhwp.d.ts',
  'rhwp_bg.wasm',
  'rhwp_bg.wasm.d.ts',
]);

function readinessError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function readArtifactIdentity(artifactRoot) {
  const packagePath = path.join(artifactRoot, 'package.json');
  if (!existsSync(packagePath)) return path.basename(artifactRoot);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch (cause) {
    throw readinessError(
      'HWPX_CORE_ARTIFACT_INVALID',
      `Invalid RHWP package metadata: ${packagePath}.`,
      { artifactRoot, cause: cause.message },
    );
  }
  return `${String(pkg.name || path.basename(artifactRoot))}@${String(pkg.version || 'unknown')}`;
}

function documentMethodsFromClass(source) {
  const methods = new Set();
  const classMatch = String(source).match(
    /export\s+class\s+HwpDocument\s*\{([\s\S]*?)^\}/m,
  );
  if (!classMatch) return methods;
  for (const match of classMatch[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\(/gm)) {
    methods.add(match[1]);
  }
  return methods;
}

function declaredDocumentMethods(typeDeclarations) {
  return documentMethodsFromClass(typeDeclarations);
}

function executableDocumentMethods(javaScriptWrapper) {
  return documentMethodsFromClass(javaScriptWrapper);
}

function readyNativeRequirements(catalog = HWPX_COMMAND_CATALOG) {
  return catalog.flatMap(entry => entry.readiness === 'available'
    ? entry.nativeMethods.map(method => ({ op: entry.op, method }))
    : []);
}

function validateCoreArtifact(artifactRoot, options = {}) {
  const resolvedRoot = path.resolve(artifactRoot);
  const artifact = readArtifactIdentity(resolvedRoot);
  for (const fileName of CORE_ARTIFACT_FILES) {
    const filePath = path.join(resolvedRoot, fileName);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw readinessError(
        'HWPX_CORE_ARTIFACT_INCOMPLETE',
        `${artifact} is missing required artifact file ${fileName}.`,
        { artifact, artifactRoot: resolvedRoot, fileName },
      );
    }
  }
  const declaredMethods = declaredDocumentMethods(
    readFileSync(path.join(resolvedRoot, 'rhwp.d.ts'), 'utf8'),
  );
  const executableMethods = executableDocumentMethods(
    readFileSync(path.join(resolvedRoot, 'rhwp.js'), 'utf8'),
  );
  for (const requirement of readyNativeRequirements(options.catalog)) {
    const missingSurface = !declaredMethods.has(requirement.method)
      ? { label: 'TypeScript declarations', code: 'typescript-declarations' }
      : !executableMethods.has(requirement.method)
        ? { label: 'JavaScript wrapper', code: 'javascript-wrapper' }
        : null;
    if (missingSurface) {
      throw readinessError(
        'HWPX_CORE_METHOD_UNAVAILABLE',
        `${artifact} cannot execute ${requirement.op}: HwpDocument.${requirement.method} is unavailable on the ${missingSurface.label} surface.`,
        {
          artifact,
          artifactRoot: resolvedRoot,
          operation: requirement.op,
          method: requirement.method,
          surface: missingSurface.code,
        },
      );
    }
  }
  const methods = [...declaredMethods]
    .filter(method => executableMethods.has(method))
    .sort();
  return {
    ok: true,
    artifact,
    artifactRoot: resolvedRoot,
    methods,
    surfaces: {
      typescriptDeclarations: [...declaredMethods].sort(),
      javascriptWrapper: [...executableMethods].sort(),
    },
    requirements: readyNativeRequirements(options.catalog),
  };
}

function materializeCoreArtifact(sourceRoot, destinationRoot, options = {}) {
  const source = path.resolve(sourceRoot);
  const destination = path.resolve(destinationRoot);
  const readiness = validateCoreArtifact(source, options);
  const parent = path.dirname(destination);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const staging = path.join(parent, `.${path.basename(destination)}.staging-${suffix}`);
  const backup = path.join(parent, `.${path.basename(destination)}.backup-${suffix}`);
  let destinationMoved = false;
  let committed = false;
  const copyArtifact = options.copyArtifact ?? cpSync;
  const renameArtifact = options.renameArtifact ?? renameSync;
  const removeStaging = options.removeStaging ?? rmSync;
  const removeBackup = options.removeBackup ?? rmSync;
  const cleanupWarnings = [];

  mkdirSync(parent, { recursive: true });
  try {
    copyArtifact(source, staging, { recursive: true, errorOnExist: true });
    validateCoreArtifact(staging, options);
    if (existsSync(destination)) {
      renameArtifact(destination, backup);
      destinationMoved = true;
    }
    renameArtifact(staging, destination);
    committed = true;
  } catch (cause) {
    const recoveryErrors = [];
    if (destinationMoved && !committed && !existsSync(destination) && existsSync(backup)) {
      try {
        renameArtifact(backup, destination);
      } catch (recoveryCause) {
        recoveryErrors.push({
          phase: 'backup-restore',
          message: recoveryCause.message,
        });
      }
    }
    try {
      removeStaging(staging, { recursive: true, force: true });
    } catch (recoveryCause) {
      recoveryErrors.push({
        phase: 'staging-cleanup',
        message: recoveryCause.message,
      });
    }
    if (recoveryErrors.length > 0
      && cause !== null
      && (typeof cause === 'object' || typeof cause === 'function')
      && Object.isExtensible(cause)) {
      cause.recoveryErrors = recoveryErrors;
    }
    throw cause;
  }
  if (destinationMoved) {
    try {
      removeBackup(backup, { recursive: true, force: true });
    } catch (cause) {
      cleanupWarnings.push({
        code: 'HWPX_CORE_BACKUP_CLEANUP_FAILED',
        message: cause.message,
        backupPath: backup,
      });
    }
  }
  return {
    ...readiness,
    committed: true,
    cleanupWarnings,
  };
}

function formatCoreCleanupWarnings(result) {
  return (result?.cleanupWarnings ?? []).map(warning =>
    `[rhwp] warning: ${warning.code}: ${warning.message}; backup=${warning.backupPath}`);
}

export {
  CORE_ARTIFACT_FILES,
  declaredDocumentMethods,
  executableDocumentMethods,
  formatCoreCleanupWarnings,
  materializeCoreArtifact,
  readyNativeRequirements,
  validateCoreArtifact,
};
