import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FONT_EXTENSIONS = new Set(['.otf', '.ttc', '.ttf']);

export function collectFontManifest(rootDir) {
  if (!rootDir || !existsSync(rootDir)) {
    return [];
  }

  const manifest = [];
  const visit = (currentDir, relativeDir = '') => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      if (!FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const stats = statSync(absolutePath);
      manifest.push(`${relativePath.replaceAll('\\', '/')}|${stats.size}`);
    }
  };

  visit(rootDir);
  return manifest.sort();
}

export function resolveSystemplateFontDir(systemplateDir, sourceDir) {
  const normalizedSource = path.resolve(sourceDir);
  const sourceRoot = path.parse(normalizedSource).root;
  return path.join(systemplateDir, path.relative(sourceRoot, normalizedSource));
}

export function assertSystemplateFontsSynced({
  sourceDir,
  systemplateDir,
  officeDir = '/opt/collaboraoffice',
}) {
  const sourceManifest = collectFontManifest(sourceDir);
  if (sourceManifest.length === 0) {
    return { count: 0, targetDir: null };
  }

  const targetDir = resolveSystemplateFontDir(systemplateDir, sourceDir);
  const targetManifest = collectFontManifest(targetDir);
  if (sourceManifest.length !== targetManifest.length ||
      sourceManifest.some((entry, index) => entry !== targetManifest[index])) {
    throw new Error(
      `Native editor systemplate fonts are stale: ${sourceDir} -> ${targetDir}. ` +
      `Run "sudo coolwsd-systemplate-setup ${systemplateDir} ${officeDir}" before starting the editor.`,
    );
  }

  return { count: sourceManifest.length, targetDir };
}
