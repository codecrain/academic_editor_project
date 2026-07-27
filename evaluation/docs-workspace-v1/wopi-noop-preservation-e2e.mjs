import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function expectOk(response, label) {
  if (response.ok) {
    return response;
  }
  throw new Error(`${label} failed with HTTP ${response.status}: ${await response.text()}`);
}

const [gatewayOriginRaw, sourcePathRaw, normalizedCandidatePathRaw, outputPathRaw] =
  process.argv.slice(2);
if (!gatewayOriginRaw || !sourcePathRaw || !normalizedCandidatePathRaw) {
  throw new Error(
    'Usage: node wopi-noop-preservation-e2e.mjs <gateway-origin> <source.docx> <normalized-candidate.docx> [report.json]',
  );
}

const gatewayOrigin = new URL(gatewayOriginRaw).origin;
const sourcePath = path.resolve(sourcePathRaw);
const normalizedCandidatePath = path.resolve(normalizedCandidatePathRaw);
const sourceBytes = await readFile(sourcePath);
const normalizedCandidateBytes = await readFile(normalizedCandidatePath);
let documentId = '';

try {
  const upload = await expectOk(
    await fetch(`${gatewayOrigin}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-File-Name': 'qa-noop-source.docx',
        'X-Document-Title': 'QA no-op preservation',
      },
      body: sourceBytes,
    }),
    'document upload',
  );
  const uploaded = await upload.json();
  documentId = uploaded.documentId;

  const sessionResponse = await expectOk(
    await fetch(`${gatewayOrigin}/api/documents/${documentId}/session`, { method: 'POST' }),
    'session creation',
  );
  const session = await sessionResponse.json();
  const publicWopiUrl = new URL(session.formParameters.wopi_src);
  const localOrigin = new URL(gatewayOrigin);
  publicWopiUrl.protocol = localOrigin.protocol;
  publicWopiUrl.host = localOrigin.host;
  publicWopiUrl.searchParams.set('access_token', session.formParameters.access_token);

  const beforeInfoResponse = await expectOk(await fetch(publicWopiUrl), 'CheckFileInfo before save');
  const beforeInfo = await beforeInfoResponse.json();
  const lockId = `docs-qa-noop-${Date.now()}`;
  await expectOk(
    await fetch(publicWopiUrl, {
      method: 'POST',
      headers: {
        'X-WOPI-Override': 'LOCK',
        'X-WOPI-Lock': lockId,
      },
    }),
    'WOPI lock',
  );

  const contentsUrl = new URL(publicWopiUrl);
  contentsUrl.pathname = `${contentsUrl.pathname}/contents`;
  const putResponse = await expectOk(
    await fetch(contentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-WOPI-Lock': lockId,
        'X-COOL-WOPI-IsModifiedByUser': 'false',
        'X-COOL-WOPI-IsAutosave': 'false',
      },
      body: normalizedCandidateBytes,
    }),
    'unmodified PutFile',
  );

  const download = await expectOk(
    await fetch(`${gatewayOrigin}/api/documents/${documentId}/download`),
    'document download',
  );
  const downloadedBytes = Buffer.from(await download.arrayBuffer());
  const afterInfoResponse = await expectOk(await fetch(publicWopiUrl), 'CheckFileInfo after save');
  const afterInfo = await afterInfoResponse.json();
  const sourceHash = sha256(sourceBytes);
  const normalizedCandidateHash = sha256(normalizedCandidateBytes);
  const downloadedHash = sha256(downloadedBytes);
  const report = {
    schemaVersion: 1,
    executedAt: new Date().toISOString(),
    gatewayOrigin,
    documentId,
    request: {
      isModifiedByUser: false,
      sourceBytes: sourceBytes.length,
      normalizedCandidateBytes: normalizedCandidateBytes.length,
    },
    oracle: {
      sourceSha256: sourceHash,
      normalizedCandidateSha256: normalizedCandidateHash,
      downloadedSha256: downloadedHash,
      originalBytesPreserved: downloadedHash === sourceHash,
      normalizedCandidateRejected: downloadedHash !== normalizedCandidateHash,
      versionPreserved:
        beforeInfo.Version === afterInfo.Version &&
        putResponse.headers.get('x-wopi-itemversion') === beforeInfo.Version,
    },
  };
  report.ok = Object.values(report.oracle).slice(-3).every(Boolean);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPathRaw) {
    await writeFile(path.resolve(outputPathRaw), serialized, 'utf8');
  }
  process.stdout.write(serialized);
  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  if (documentId) {
    await fetch(`${gatewayOrigin}/api/documents/${documentId}`, { method: 'DELETE' }).catch(
      () => {},
    );
  }
}
