export type HwpxControlCounts = Record<string, number>;

const HWPX_SECTION_PATTERN = /^Contents\/section\d+\.xml$/u;
const CRITICAL_CONTROL_TAGS = Object.freeze([
  ['picture', 'hp:pic'],
  ['table', 'hp:tbl'],
  ['container', 'hp:container'],
  ['shapeComment', 'hp:shapeComment'],
  ['rectangle', 'hp:rect'],
  ['ellipse', 'hp:ellipse'],
  ['polygon', 'hp:polygon'],
  ['curve', 'hp:curve'],
  ['arc', 'hp:arc'],
  ['line', 'hp:line'],
  ['equation', 'hp:equation'],
  ['ole', 'hp:ole'],
  ['chart', 'hp:chart'],
  ['header', 'hp:header'],
  ['footer', 'hp:footer'],
  ['footnote', 'hp:footNote'],
  ['endnote', 'hp:endNote'],
] as const);

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const lowerBound = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new Error('HWPX 저장 검증 실패: ZIP central directory를 찾을 수 없습니다.');
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function listZipEntryNames(bytes: Uint8Array): string[] {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const totalEntries = readUint16(bytes, eocdOffset + 10);
  let offset = readUint32(bytes, eocdOffset + 16);
  const decoder = new TextDecoder('utf-8');
  const names: string[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) {
      throw new Error('HWPX 저장 검증 실패: 잘못된 ZIP central directory entry입니다.');
    }
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

async function readZipEntry(bytes: Uint8Array, targetName: string): Promise<Uint8Array> {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const totalEntries = readUint16(bytes, eocdOffset + 10);
  let offset = readUint32(bytes, eocdOffset + 16);
  const decoder = new TextDecoder('utf-8');

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) {
      throw new Error('HWPX 저장 검증 실패: 잘못된 ZIP central directory entry입니다.');
    }
    const method = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localOffset = readUint32(bytes, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name === targetName) {
      if (readUint32(bytes, localOffset) !== 0x04034b50) {
        throw new Error(`HWPX 저장 검증 실패: ${targetName} local entry가 잘못되었습니다.`);
      }
      const localNameLength = readUint16(bytes, localOffset + 26);
      const localExtraLength = readUint16(bytes, localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      const expanded = method === 0
        ? new Uint8Array(compressed)
        : method === 8
          ? await inflateRaw(compressed)
          : null;
      if (!expanded) {
        throw new Error(`HWPX 저장 검증 실패: 지원하지 않는 ZIP 압축 방식 ${method}입니다.`);
      }
      if (expanded.length !== uncompressedSize) {
        throw new Error(`HWPX 저장 검증 실패: ${targetName} 압축 해제 크기가 일치하지 않습니다.`);
      }
      return expanded;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`HWPX 저장 검증 실패: ${targetName} 엔트리가 없습니다.`);
}

function countTag(xml: string, tag: string): number {
  return xml.match(new RegExp(`<${tag}\\b`, 'gu'))?.length ?? 0;
}

export async function hwpxControlCounts(bytes: Uint8Array): Promise<HwpxControlCounts> {
  const sectionPaths = listZipEntryNames(bytes)
    .filter(name => HWPX_SECTION_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right));
  if (sectionPaths.length === 0) {
    throw new Error('HWPX 저장 검증 실패: section XML이 없습니다.');
  }
  const decoder = new TextDecoder('utf-8');
  const sectionXmls = await Promise.all(
    sectionPaths.map(async name => decoder.decode(await readZipEntry(bytes, name))),
  );
  return Object.fromEntries(CRITICAL_CONTROL_TAGS.map(([name, tag]) => [
    name,
    sectionXmls.reduce((sum, xml) => sum + countTag(xml, tag), 0),
  ]));
}

export function assertControlCountsPreserved(
  source: HwpxControlCounts,
  candidate: HwpxControlCounts,
): void {
  const losses = Object.keys(source)
    .filter(name => (candidate[name] ?? 0) < source[name])
    .map(name => `${name} ${source[name]}→${candidate[name] ?? 0}`);
  if (losses.length > 0) {
    throw new Error(
      `HWPX 안전 저장이 중단되었습니다. 직렬화 과정에서 문서 개체가 손실됩니다: ${losses.join(', ')}. ` +
      '이 문서는 preserve-package REST/MCP 편집 경로를 사용하세요.',
    );
  }
}

export async function assertHwpxSaveIntegrity(
  sourceBytes: Uint8Array,
  candidateBytes: Uint8Array,
): Promise<void> {
  if (sourceBytes.length === 0) return;
  const [sourceCounts, candidateCounts] = await Promise.all([
    hwpxControlCounts(sourceBytes),
    hwpxControlCounts(candidateBytes),
  ]);
  assertControlCountsPreserved(sourceCounts, candidateCounts);
}
