import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BUILD_BASE_MARKER = '.academic-editor-base-path';

export function normalizeStudioBasePath(value) {
  const raw = String(value || '/hwpx/').trim() || '/hwpx/';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

export function inspectStudioBuild(studioRoot, requestedBasePath) {
  const basePath = normalizeStudioBasePath(requestedBasePath);
  const distRoot = path.resolve(studioRoot, 'dist');
  const indexPath = path.resolve(distRoot, 'index.html');
  const markerPath = path.resolve(distRoot, BUILD_BASE_MARKER);
  const manifestPath = path.resolve(distRoot, 'manifest.webmanifest');
  if (!existsSync(indexPath)) {
    return { ok: false, reason: 'missing-index', basePath };
  }
  if (!existsSync(markerPath)) {
    return { ok: false, reason: 'missing-base-marker', basePath };
  }
  const builtBasePath = normalizeStudioBasePath(readFileSync(markerPath, 'utf8'));
  if (builtBasePath !== basePath) {
    return { ok: false, reason: 'base-marker-mismatch', basePath, builtBasePath };
  }

  const html = readFileSync(indexPath, 'utf8');
  const rootRelativeAssets = [...html.matchAll(/(?:src|href)=["'](\/[^"']*)["']/gi)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith('//'));
  const outsideBase = rootRelativeAssets.filter((url) => !url.startsWith(basePath));
  if (outsideBase.length > 0) {
    return { ok: false, reason: 'asset-outside-base', basePath, outsideBase };
  }
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: 'missing-manifest', basePath };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'invalid-manifest', basePath };
  }
  const manifestPaths = [
    manifest.start_url,
    manifest.scope,
    ...(Array.isArray(manifest.file_handlers)
      ? manifest.file_handlers.map((handler) => handler?.action)
      : []),
  ];
  if (manifestPaths.some((value) => value !== basePath)) {
    return { ok: false, reason: 'manifest-base-mismatch', basePath, manifestPaths };
  }
  return { ok: true, reason: 'ready', basePath, builtBasePath };
}

export function writeStudioBuildMarker(studioRoot, basePath) {
  const markerPath = path.resolve(studioRoot, 'dist', BUILD_BASE_MARKER);
  writeFileSync(markerPath, `${normalizeStudioBasePath(basePath)}\n`, 'utf8');
}
