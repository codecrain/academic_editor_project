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

function declaredDocumentMethods(typeDeclarations) {
  const methods = new Set();
  const classMatch = String(typeDeclarations).match(
    /export\s+class\s+HwpDocument\s*\{([\s\S]*?)^\}/m,
  );
  if (!classMatch) return methods;
  for (const match of classMatch[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\(/gm)) {
    methods.add(match[1]);
  }
  return methods;
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
  const methods = declaredDocumentMethods(
    readFileSync(path.join(resolvedRoot, 'rhwp.d.ts'), 'utf8'),
  );
  for (const requirement of readyNativeRequirements(options.catalog)) {
    if (!methods.has(requirement.method)) {
      throw readinessError(
        'HWPX_CORE_METHOD_UNAVAILABLE',
        `${artifact} cannot execute ${requirement.op}: HwpDocument.${requirement.method} is unavailable.`,
        {
          artifact,
          artifactRoot: resolvedRoot,
          operation: requirement.op,
          method: requirement.method,
        },
      );
    }
  }
  return {
    ok: true,
    artifact,
    artifactRoot: resolvedRoot,
    methods: [...methods].sort(),
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
  const copyArtifact = options.copyArtifact ?? cpSync;

  mkdirSync(parent, { recursive: true });
  try {
    copyArtifact(source, staging, { recursive: true, errorOnExist: true });
    validateCoreArtifact(staging, options);
    if (existsSync(destination)) {
      renameSync(destination, backup);
      destinationMoved = true;
    }
    renameSync(staging, destination);
    if (destinationMoved) rmSync(backup, { recursive: true, force: true });
  } catch (cause) {
    rmSync(staging, { recursive: true, force: true });
    if (destinationMoved && !existsSync(destination) && existsSync(backup)) {
      renameSync(backup, destination);
    }
    throw cause;
  } finally {
    if (existsSync(backup) && existsSync(destination)) {
      rmSync(backup, { recursive: true, force: true });
    }
  }
  return readiness;
}

export {
  CORE_ARTIFACT_FILES,
  declaredDocumentMethods,
  materializeCoreArtifact,
  readyNativeRequirements,
  validateCoreArtifact,
};
