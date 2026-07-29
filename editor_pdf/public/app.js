import EmbedPDF from './vendor/embedpdf/embedpdf.js';

const elementIds = [
  'pdfViewer', 'runtimeStatus', 'bootError', 'bootErrorMessage', 'objectEditorButton', 'editPdfButton',
  'objectEditor', 'closeObjectEditor', 'editorEmpty', 'editorBody', 'loadObjectsButton',
  'refreshObjectsButton', 'objectCount', 'fontCount', 'objectSearch', 'objectList',
  'textEditorForm', 'textValue', 'fontFamily', 'fontSize', 'fontColor', 'fontOpacity',
  'imageEditorForm', 'imageFile', 'matrixA', 'matrixD', 'matrixE', 'matrixF',
  'genericEditor', 'genericObjectInfo', 'panelStatus', 'objectMode', 'advancedMode',
  'advancedToolForm', 'advancedTool', 'advancedToolHelp', 'advancedFields', 'commandCatalog',
  'qualityAuditButton', 'compareButton', 'reportDialog', 'reportTitle', 'reportSummary',
  'reportBody', 'closeReportDialog',
  'canvasOverlay', 'selectionToolbar', 'textQuickControls', 'quickFontFamily', 'quickFontSize',
  'quickFontColor', 'replaceImageButton', 'openPropertiesButton', 'deleteSelectedButton',
  'quickImageFile', 'panelTitle',
];
const elements = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));

const state = {
  registry: null,
  documentManager: null,
  exporter: null,
  sessionId: null,
  revision: null,
  inventory: null,
  catalog: null,
  selected: null,
  objectType: 'text',
  editedBuffer: null,
  reopening: false,
  editMode: 'select',
  inlineEditing: false,
  overlayFrame: 0,
  overlayGeometry: '',
};

function failBoot(error) {
  const message = error instanceof Error ? error.message : String(error);
  elements.runtimeStatus.textContent = 'PDF 편집 엔진 시작 실패';
  elements.bootErrorMessage.textContent = message;
  elements.bootError.hidden = false;
  console.error('Academic PDF Editor startup failed.', error);
}

function setPanelStatus(message, kind = '') {
  elements.panelStatus.textContent = message;
  elements.panelStatus.dataset.kind = kind;
}

function showReport(title, summary, content) {
  elements.reportTitle.textContent = title;
  elements.reportSummary.textContent = summary;
  elements.reportBody.replaceChildren(content);
  elements.reportDialog.showModal();
}

function issueList(quality) {
  const list = document.createElement('ul');
  list.className = 'report-issues';
  for (const issue of quality.issues || []) {
    const item = document.createElement('li');
    item.dataset.severity = issue.severity;
    const label = document.createElement('strong');
    label.textContent = issue.severity === 'error' ? '오류' : issue.severity === 'warning' ? '확인 필요' : '정보';
    const message = document.createElement('span');
    message.textContent = issue.message;
    item.append(label, message);
    list.append(item);
  }
  if (!list.children.length) {
    const item = document.createElement('li');
    item.dataset.severity = 'success';
    item.textContent = '저장·재열기, 접근성, 인쇄 전 검사에서 발견된 문제가 없습니다.';
    list.append(item);
  }
  return list;
}

function taskPromise(task) {
  return typeof task?.toPromise === 'function' ? task.toPromise() : Promise.resolve(task);
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))));
  }
  return btoa(chunks.join(''));
}

function base64ToBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || `PDF API 요청 실패 (${response.status})`);
  return result;
}

async function currentBuffer() {
  if (state.editedBuffer) return state.editedBuffer.slice(0);
  if (!state.exporter) throw new Error('열린 PDF가 없습니다.');
  return taskPromise(state.exporter.saveAsCopy());
}

async function beginObjectSession() {
  setPanelStatus('PDF 구조와 객체를 분석하는 중…');
  const active = state.documentManager?.getActiveDocument();
  if (!active) throw new Error('먼저 PDF 파일을 열어주세요.');
  const buffer = await currentBuffer();
  const opened = await api('/pdf/api/documents/open', {
    filename: active.name || 'document.pdf',
    source: { bytesBase64: bytesToBase64(buffer) },
  });
  state.sessionId = opened.documentId;
  state.revision = opened.revision;
  state.editedBuffer = buffer;
  await Promise.all([refreshInventory(), loadCommandCatalog()]);
  elements.editorEmpty.hidden = true;
  elements.editorBody.hidden = false;
}

async function refreshInventory() {
  if (!state.sessionId) return beginObjectSession();
  state.inventory = await api(`/pdf/api/documents/${state.sessionId}/object/inventory`, {});
  state.revision = state.inventory.revision;
  elements.objectCount.textContent = `객체 ${state.inventory.pageObjectCount}개 · 본문 ${state.inventory.textObjectCount}개`;
  elements.fontCount.textContent = `오픈 폰트 ${state.inventory.fonts.length}개`;
  const previousFont = elements.fontFamily.value;
  elements.fontFamily.replaceChildren(...state.inventory.fonts.map((font) => {
    const option = document.createElement('option');
    option.value = font.id;
    option.dataset.family = font.label;
    option.textContent = `${font.label} ${font.style || ''} · ${font.license}`.replace(/\s+/g, ' ');
    return option;
  }));
  if ([...elements.fontFamily.options].some((option) => option.value === previousFont)) {
    elements.fontFamily.value = previousFont;
  }
  const previousQuickFont = elements.quickFontFamily.value;
  elements.quickFontFamily.replaceChildren(...[...elements.fontFamily.options].map((source) => source.cloneNode(true)));
  if ([...elements.quickFontFamily.options].some((option) => option.value === previousQuickFont)) {
    elements.quickFontFamily.value = previousQuickFont;
  }
  if (state.selected) {
    const refreshedSelection = state.inventory.pageObjects.find((object) => (
      object.page === state.selected.page
      && object.objectIndex === state.selected.objectIndex
      && object.type === state.selected.type
    ));
    state.selected = refreshedSelection || null;
    if (refreshedSelection) selectObject(refreshedSelection);
  }
  renderObjectList();
  scheduleCanvasOverlay();
  setPanelStatus('PDF 편집 도구를 사용할 수 있습니다.', 'success');
}

async function loadCommandCatalog() {
  state.catalog = await api(`/pdf/api/documents/${state.sessionId}/commands/catalog`, {});
  const groups = new Map();
  for (const command of state.catalog.commands) {
    if (!groups.has(command.category)) groups.set(command.category, []);
    groups.get(command.category).push(command.op);
  }
  elements.commandCatalog.replaceChildren(...[...groups.entries()].map(([category, commands]) => {
    const section = document.createElement('section');
    const heading = document.createElement('strong');
    heading.textContent = category;
    const body = document.createElement('p');
    body.textContent = commands.join(' · ');
    section.append(heading, body);
    return section;
  }));
}

function filteredObjects() {
  const query = elements.objectSearch.value.trim().toLocaleLowerCase('ko');
  return (state.inventory?.pageObjects || []).filter((object) => {
    if (state.objectType !== 'all' && object.type !== state.objectType) return false;
    return !query
      || String(object.text || '').toLocaleLowerCase('ko').includes(query)
      || String(object.page).includes(query);
  });
}

function renderObjectList() {
  elements.objectList.replaceChildren();
  const objects = filteredObjects();
  if (!objects.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = '조건에 맞는 객체가 없습니다.';
    elements.objectList.append(empty);
    return;
  }
  for (const object of objects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `object-card${state.selected?.id === object.id ? ' is-selected' : ''}`;
    const label = object.type === 'text'
      ? (object.text || '(빈 텍스트)').replace(/\s+/g, ' ').slice(0, 80)
      : object.type === 'image' ? '이미지 객체' : `${object.type} 객체`;
    button.innerHTML = '<span class="object-page"></span><strong></strong><small></small>';
    button.querySelector('.object-page').textContent = `${object.page}쪽 · #${object.objectIndex}`;
    button.querySelector('strong').textContent = label;
    button.querySelector('small').textContent = object.type === 'text'
      ? `${object.fontFamily || '폰트 미상'} · ${Number(object.fontSize || 0).toFixed(1)}pt`
      : `${Math.round(object.editorBounds?.width || 0)} × ${Math.round(object.editorBounds?.height || 0)}`;
    button.addEventListener('click', () => selectObject(object));
    elements.objectList.append(button);
  }
}

function selectObject(object) {
  state.selected = object;
  renderObjectList();
  elements.textEditorForm.hidden = object.type !== 'text';
  elements.imageEditorForm.hidden = object.type !== 'image';
  elements.genericEditor.hidden = ['text', 'image'].includes(object.type);
  if (object.type === 'text') {
    elements.textValue.value = object.text || '';
    const options = [...elements.fontFamily.options];
    const familyOption = options.find((option) => option.dataset.family === object.fontFamily && /\bRegular\b/.test(option.textContent))
      || options.find((option) => option.dataset.family === 'Noto Sans KR' && /\bRegular\b/.test(option.textContent))
      || options[0];
    elements.fontFamily.value = familyOption?.value || '';
    elements.fontSize.value = object.fontSize || 12;
    elements.fontColor.value = object.fillColor?.hex || '#172033';
    elements.fontOpacity.value = ((object.fillColor?.a ?? 255) / 255).toFixed(2);
    elements.quickFontFamily.value = elements.fontFamily.value;
    elements.quickFontSize.value = object.fontSize || 12;
    elements.quickFontColor.value = object.fillColor?.hex || '#172033';
  } else if (object.type === 'image') {
    elements.imageFile.value = '';
    elements.matrixA.value = object.matrix?.a ?? '';
    elements.matrixD.value = object.matrix?.d ?? '';
    elements.matrixE.value = object.matrix?.e ?? '';
    elements.matrixF.value = object.matrix?.f ?? '';
  } else {
    elements.genericObjectInfo.textContent = `${object.page}쪽의 ${object.type} 객체 (#${object.objectIndex})`;
  }
  renderCanvasObjects();
  positionSelectionToolbar();
}

function renderedPages() {
  const host = elements.pdfViewer.querySelector('embedpdf-container');
  const root = host?.shadowRoot;
  if (!root) return [];
  const viewerRect = elements.pdfViewer.getBoundingClientRect();
  const candidates = [...root.querySelectorAll('#document-content img')]
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 120 && rect.height > 120;
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
  return candidates.map((image, index) => {
    const rect = image.getBoundingClientRect();
    const pageNode = image.closest('[data-page-index], [data-page-number]');
    const page = Number(pageNode?.dataset.pageNumber)
      || Number(pageNode?.dataset.pageIndex) + 1
      || index + 1;
    return {
      page,
      left: rect.left - viewerRect.left,
      top: rect.top - viewerRect.top,
      width: rect.width,
      height: rect.height,
    };
  });
}

function objectScreenRect(object) {
  const rendered = renderedPages().find((page) => page.page === object.page);
  const source = state.inventory?.pages?.find((page) => page.page === object.page);
  const bounds = object.editorBounds;
  if (!rendered || !source || !bounds) return null;
  return {
    left: rendered.left + (bounds.x / source.width) * rendered.width,
    top: rendered.top + (bounds.y / source.height) * rendered.height,
    width: Math.max(4, (bounds.width / source.width) * rendered.width),
    height: Math.max(8, (bounds.height / source.height) * rendered.height),
    scaleX: rendered.width / source.width,
    scaleY: rendered.height / source.height,
  };
}

function positionSelectionToolbar() {
  if (!state.selected) {
    elements.selectionToolbar.hidden = true;
    return;
  }
  const rect = objectScreenRect(state.selected);
  if (!rect) {
    elements.selectionToolbar.hidden = true;
    return;
  }
  elements.textQuickControls.hidden = state.selected.type !== 'text';
  elements.replaceImageButton.hidden = state.selected.type !== 'image';
  elements.selectionToolbar.hidden = false;
  const toolbarWidth = elements.selectionToolbar.offsetWidth || 320;
  elements.selectionToolbar.style.left = `${Math.max(8, Math.min(rect.left, elements.pdfViewer.clientWidth - toolbarWidth - 8))}px`;
  elements.selectionToolbar.style.top = `${Math.max(8, rect.top - 48)}px`;
}

function beginImageDrag(event, object, hitbox) {
  if (event.button !== 0 || object.type !== 'image') return;
  if (state.selected?.id !== object.id) {
    selectObject(object);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  selectObject(object);
  const startX = event.clientX;
  const startY = event.clientY;
  const screen = objectScreenRect(object);
  const startMatrix = { ...object.matrix };
  hitbox.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    hitbox.style.transform = `translate(${moveEvent.clientX - startX}px, ${moveEvent.clientY - startY}px)`;
    elements.selectionToolbar.hidden = true;
  };
  const finish = async (upEvent) => {
    hitbox.removeEventListener('pointermove', move);
    hitbox.removeEventListener('pointerup', finish);
    hitbox.style.transform = '';
    if (!screen) return;
    const dx = (upEvent.clientX - startX) / screen.scaleX;
    const dy = (upEvent.clientY - startY) / screen.scaleY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      positionSelectionToolbar();
      return;
    }
    try {
      setPanelStatus('이미지 위치를 변경하는 중…');
      await applyCommands([{
        op: 'object.transform',
        page: object.page,
        objectIndex: object.objectIndex,
        objectId: object.id,
        matrix: { ...startMatrix, e: Number(startMatrix.e) + dx, f: Number(startMatrix.f) - dy },
      }], { inspectObject: true });
      setPanelStatus('이미지 위치 변경과 재열기 검증이 완료되었습니다.', 'success');
    } catch (error) {
      setPanelStatus(error.message, 'error');
    }
  };
  hitbox.addEventListener('pointermove', move);
  hitbox.addEventListener('pointerup', finish);
}

function renderCanvasObjects() {
  if (state.inlineEditing) return;
  state.overlayGeometry = renderedPages().map((page) => (
    `${page.page}:${page.left.toFixed(1)}:${page.top.toFixed(1)}:${page.width.toFixed(1)}:${page.height.toFixed(1)}`
  )).join('|');
  elements.canvasOverlay.replaceChildren();
  if (!state.inventory) return;
  for (const object of state.inventory.pageObjects || []) {
    if (!['text', 'image'].includes(object.type)) continue;
    if (state.editMode === 'text' && object.type !== 'text') continue;
    if (state.editMode === 'image' && object.type !== 'image') continue;
    const rect = objectScreenRect(object);
    if (!rect) continue;
    const hitbox = document.createElement('button');
    hitbox.type = 'button';
    hitbox.className = `object-hitbox${state.selected?.id === object.id ? ' is-selected' : ''}`;
    hitbox.dataset.type = object.type;
    hitbox.title = object.type === 'text' ? '클릭하여 선택, 더블클릭하여 직접 편집' : '클릭하여 선택, 드래그하여 이동';
    Object.assign(hitbox.style, {
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    });
    hitbox.addEventListener('click', (event) => {
      event.stopPropagation();
      selectObject(object);
    });
    hitbox.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      if (object.type === 'text') beginInlineTextEdit(object);
    });
    hitbox.addEventListener('pointerdown', (event) => beginImageDrag(event, object, hitbox));
    elements.canvasOverlay.append(hitbox);
  }
  positionSelectionToolbar();
}

function scheduleCanvasOverlay() {
  cancelAnimationFrame(state.overlayFrame);
  state.overlayFrame = requestAnimationFrame(renderCanvasObjects);
}

function beginInlineTextEdit(object) {
  const rect = objectScreenRect(object);
  if (!rect) return;
  state.inlineEditing = true;
  elements.selectionToolbar.hidden = true;
  elements.canvasOverlay.replaceChildren();
  const editor = document.createElement('textarea');
  editor.className = 'inline-text-editor';
  editor.value = object.text || '';
  editor.setAttribute('aria-label', '페이지에서 텍스트 직접 편집');
  Object.assign(editor.style, {
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${Math.max(90, rect.width)}px`,
    height: `${Math.max(28, rect.height + 8)}px`,
    fontFamily: `"${object.fontFamily || 'Noto Sans KR'}", sans-serif`,
    fontSize: `${Math.max(10, (object.fontSize || 12) * rect.scaleY)}px`,
    color: object.fillColor?.hex || '#172033',
  });
  let completed = false;
  const finish = async (save) => {
    if (completed) return;
    completed = true;
    const text = editor.value;
    editor.remove();
    state.inlineEditing = false;
    if (!save || text === object.text) {
      renderCanvasObjects();
      return;
    }
    try {
      setPanelStatus('페이지에서 수정한 본문을 저장하는 중…');
      await applyCommands([{
        op: 'text.replaceObject',
        page: object.page,
        objectIndex: object.objectIndex,
        objectId: object.id,
        expectedText: object.text,
        text,
        fontFamily: elements.quickFontFamily.value || elements.fontFamily.value,
        fontSize: Number(elements.quickFontSize.value || object.fontSize || 12),
        color: elements.quickFontColor.value || object.fillColor?.hex || '#172033',
        opacity: (object.fillColor?.a ?? 255) / 255,
      }], { inspectObject: true });
      setPanelStatus('본문 수정과 저장·재열기 검증이 완료되었습니다.', 'success');
    } catch (error) {
      setPanelStatus(error.message, 'error');
      renderCanvasObjects();
    }
  };
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finish(true);
    }
  });
  editor.addEventListener('blur', () => finish(true));
  elements.canvasOverlay.append(editor);
  editor.focus();
  editor.select();
}

async function inspectSelected() {
  if (!state.selected) throw new Error('수정할 객체를 선택하세요.');
  const inspected = await api(`/pdf/api/documents/${state.sessionId}/target/inspect`, {
    locations: [{ page: state.selected.page, objectId: state.selected.id, objectIndex: state.selected.objectIndex }],
  });
  return inspected.targets[0];
}

async function applyCommands(commands, { inspectObject = false } = {}) {
  if (!state.sessionId) await beginObjectSession();
  if (inspectObject) await inspectSelected();
  const result = await api(`/pdf/api/documents/${state.sessionId}/commands/apply`, {
    baseRevision: state.revision,
    commands,
  });
  state.revision = result.revision;
  await syncEditedPdf();
  await refreshInventory();
}

async function syncEditedPdf() {
  const quality = await api(`/pdf/api/documents/${state.sessionId}/quality/check`, { baseRevision: state.revision });
  if (!quality.ok) throw new Error(quality.issues?.map((issue) => issue.message).join(' · ') || 'PDF 저장 검사에 실패했습니다.');
  const saved = await api(`/pdf/api/documents/${state.sessionId}/documents/save-buffer`, {
    baseRevision: state.revision,
    filename: 'academic-edited.pdf',
  });
  state.editedBuffer = base64ToBuffer(saved.bytesBase64);
  const activeId = state.documentManager.getActiveDocumentId();
  state.reopening = true;
  try {
    if (activeId) await taskPromise(state.documentManager.closeDocument(activeId));
    const opened = await taskPromise(state.documentManager.openDocumentBuffer({
      buffer: state.editedBuffer.slice(0),
      name: saved.filename,
      autoActivate: true,
    }));
    if (opened?.task) await taskPromise(opened.task);
  } finally {
    state.reopening = false;
  }
}

async function fileBase64(file) {
  return bytesToBase64(await file.arrayBuffer());
}

const field = (name, label, type = 'text', value = '', extra = {}) => ({ name, label, type, value, ...extra });
const advancedTools = [
  { op: 'ocr.recognize', label: '스캔 문서 OCR', help: '선택한 페이지를 서버 내부에서 한글·영문으로 인식해 검색·복사 가능한 보이지 않는 텍스트 계층을 추가합니다. 이미 본문 텍스트가 있는 페이지는 기본적으로 건너뜁니다.', fields: [
    field('pages', '페이지(쉼표, 비우면 전체)'), field('languages', '언어(쉼표)', 'text', 'kor,eng'),
    field('dpi', '인식 해상도(DPI)', 'number', 180), field('minimumConfidence', '최소 신뢰도', 'number', 35),
    field('force', '기존 텍스트 페이지도 강제 인식', 'checkbox'),
  ] },
  { op: 'text.replaceAll', label: '본문 일괄 바꾸기', help: '선택 페이지의 실제 텍스트 객체를 찾아 모두 바꿉니다. 대소문자 옵션과 임베드할 오픈 폰트를 지정할 수 있습니다.', danger: true, fields: [
    field('find', '찾을 문자열'), field('replace', '바꿀 문자열'), field('pages', '페이지(쉼표, 비우면 전체)'),
    field('caseSensitive', '대소문자 구분', 'checkbox', true), field('fontFamily', '교체 폰트(비우면 기존 폰트)', 'text', ''),
  ] },
  { op: 'comment.add', label: '메모 주석', help: '작성자와 내용을 가진 표준 PDF 메모 주석을 추가합니다.', fields: [
    field('page', '페이지', 'number', 1), field('x', 'X', 'number', 72), field('y', 'Y', 'number', 160),
    field('text', '메모 내용', 'textarea'), field('author', '작성자', 'text', 'Reviewer'),
    field('icon', '아이콘', 'select', 'Comment', { options: ['Comment', 'Key', 'Note', 'Help', 'NewParagraph', 'Paragraph', 'Insert'] }),
    field('color', '색상', 'color', '#ffd166'), field('open', '처음부터 열기', 'checkbox'),
  ] },
  { op: 'textMarkup.add', label: '텍스트 마크업 주석', help: '지정 영역에 하이라이트·밑줄·물결 밑줄·취소선 표준 주석을 추가합니다.', fields: [
    field('page', '페이지', 'number', 1), field('x', 'X', 'number', 72), field('y', 'Y', 'number', 120),
    field('width', '너비', 'number', 180), field('height', '높이', 'number', 18),
    field('style', '종류', 'select', 'highlight', { options: ['highlight', 'underline', 'squiggly', 'strikeout'] }),
    field('color', '색상', 'color', '#ffe066'), field('text', '주석 내용'),
  ] },
  { op: 'redaction.apply', label: '영구 마스킹', help: '지정 영역과 겹치는 실제 PDF 객체를 제거하고 불투명 사각형으로 덮습니다.', danger: true, fields: [
    field('page', '페이지', 'number', 1), field('regions', '영역 JSON', 'textarea', '[{"x":72,"y":120,"width":180,"height":24}]'),
    field('color', '마스킹 색상', 'color', '#000000'), field('overlayText', '표시 문구', 'text', '삭제됨'),
  ] },
  { op: 'watermark.add', label: '텍스트 워터마크', help: '선택 페이지에 회전된 반투명 워터마크를 추가합니다.', fields: [
    field('text', '워터마크 문구'), field('pages', '페이지(쉼표, 비우면 전체)'), field('fontSize', '크기', 'number', 54),
    field('rotation', '회전 각도', 'number', -35), field('opacity', '불투명도', 'number', 0.18, { step: 0.01 }), field('color', '색상', 'color', '#667085'),
  ] },
  { op: 'background.set', label: '페이지 배경', help: '기존 내용 뒤에 불투명 배경색을 추가합니다.', fields: [
    field('pages', '페이지(쉼표, 비우면 전체)'), field('color', '배경색', 'color', '#fff9e6'),
  ] },
  { op: 'headerFooter.add', label: '머리말·꼬리말', help: '{page}와 {pages} 자리표시자를 사용할 수 있습니다.', fields: [
    field('headerLeft', '왼쪽 머리말'), field('headerCenter', '가운데 머리말'), field('headerRight', '오른쪽 머리말'),
    field('footerLeft', '왼쪽 꼬리말'), field('footerCenter', '가운데 꼬리말'), field('footerRight', '오른쪽 꼬리말', '{page} / {pages}'),
    field('pages', '페이지(쉼표, 비우면 전체)'), field('fontSize', '크기', 'number', 9), field('margin', '여백', 'number', 24),
  ] },
  { op: 'bates.add', label: 'Bates 번호', help: '법률·감사 문서용 연속 식별번호를 추가합니다.', fields: [
    field('prefix', '접두어', 'text', 'CASE-'), field('suffix', '접미어'), field('start', '시작 번호', 'number', 1),
    field('digits', '자릿수', 'number', 6), field('pages', '페이지(쉼표, 비우면 전체)'),
    field('position', '위치', 'select', 'bottom-right', { options: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] }),
  ] },
  { op: 'page.extract', label: '선택 페이지만 추출', help: '입력한 순서대로 페이지만 남깁니다.', danger: true, fields: [field('pages', '남길 페이지', 'text', '1')] },
  { op: 'page.replace', label: '페이지 교체', help: '다른 PDF의 한 페이지로 현재 페이지를 교체합니다.', danger: true, fields: [
    field('page', '교체할 페이지', 'number', 1), field('sourcePage', '원본 PDF 페이지', 'number', 1), field('sourceFile', '원본 PDF', 'file-pdf'),
  ] },
  { op: 'page.setBoxes', label: '페이지 박스 설정', help: 'Media/Crop/Bleed/Trim/ArtBox를 정확한 좌표로 설정합니다.', fields: [
    field('page', '페이지', 'number', 1), field('boxes', '박스 JSON', 'textarea', '{"crop":{"x":0,"y":0,"width":595.28,"height":841.89}}'),
  ] },
  { op: 'page.resize', label: '페이지 크기 변경', help: '페이지 크기를 바꾸고 기존 내용과 주석을 비율 유지로 함께 맞출 수 있습니다.', fields: [
    field('page', '페이지', 'number', 1), field('width', '너비(pt)', 'number', 595.28), field('height', '높이(pt)', 'number', 841.89),
    field('scaleContent', '내용·주석 함께 축척', 'checkbox', true), field('preserveAspectRatio', '가로세로 비율 유지', 'checkbox', true),
    field('centerContent', '내용 가운데 배치', 'checkbox', true),
  ] },
  { op: 'page.setLabels', label: '논리적 페이지 번호', help: '표지·로마 숫자·본문 번호처럼 PDF 탐색기에 표시되는 논리적 페이지 라벨 구간을 설정합니다.', fields: [
    field('segments', '라벨 구간 JSON', 'textarea', '[{"page":1,"style":"roman-lower","prefix":"","start":1},{"page":3,"style":"decimal","prefix":"","start":1}]'),
  ] },
  { op: 'document.merge', label: 'PDF 병합', help: '다른 PDF의 모든 페이지를 현재 문서에 삽입합니다.', fields: [
    field('insertAt', '삽입 위치', 'number', 9999), field('sourceFile', '병합할 PDF', 'file-pdf'),
  ] },
  { op: 'document.setInitialView', label: '초기 보기 설정', help: '문서를 열 때 표시할 탐색 패널, 창 맞춤, 제목 표시, 읽기 방향과 인쇄 배율을 설정합니다.', fields: [
    field('pageMode', '탐색 패널', 'select', 'outlines', { options: ['none', 'outlines', 'thumbnails', 'fullscreen', 'attachments'] }),
    field('displayDocTitle', '창에 문서 제목 표시', 'checkbox', true), field('fitWindow', '첫 페이지에 창 맞춤', 'checkbox', true),
    field('centerWindow', '창 가운데 배치', 'checkbox', true), field('hideToolbar', '뷰어 도구 모음 숨김', 'checkbox'),
    field('hideMenubar', '메뉴 모음 숨김', 'checkbox'), field('hideWindowUI', '창 UI 숨김', 'checkbox'),
    field('readingDirection', '읽기 방향', 'select', 'left-to-right', { options: ['left-to-right', 'right-to-left'] }),
    field('printScaling', '인쇄 배율', 'select', 'app-default', { options: ['app-default', 'none'] }),
  ] },
  { op: 'link.add', label: '외부 링크', help: '페이지의 직사각형 영역에 안전한 URL 링크를 추가합니다.', fields: [
    field('page', '페이지', 'number', 1), field('x', 'X', 'number', 72), field('y', 'Y', 'number', 120),
    field('width', '너비', 'number', 160), field('height', '높이', 'number', 18), field('url', 'URL', 'url', ''),
  ] },
  { op: 'bookmark.add', label: '책갈피', help: '페이지로 이동하는 최상위 책갈피를 추가합니다.', fields: [
    field('title', '책갈피 제목'), field('page', '페이지', 'number', 1),
  ] },
  { op: 'form.addTextField', label: '텍스트 양식 필드', help: '편집 가능한 AcroForm 텍스트 필드를 추가합니다.', fields: [
    field('name', '필드 이름', 'text', 'field.text'), field('page', '페이지', 'number', 1),
    field('x', 'X', 'number', 72), field('y', 'Y', 'number', 120), field('width', '너비', 'number', 180), field('height', '높이', 'number', 24),
    field('value', '초기값'), field('multiline', '여러 줄', 'checkbox'), field('required', '필수 입력', 'checkbox'),
  ] },
  { op: 'form.addCheckBox', label: '체크박스 양식 필드', help: 'AcroForm 체크박스를 추가합니다.', fields: [
    field('name', '필드 이름', 'text', 'field.check'), field('page', '페이지', 'number', 1),
    field('x', 'X', 'number', 72), field('y', 'Y', 'number', 120), field('width', '너비', 'number', 18), field('height', '높이', 'number', 18),
    field('checked', '선택 상태', 'checkbox'),
  ] },
  { op: 'form.addDropdown', label: '드롭다운 양식 필드', help: '선택 옵션을 가진 AcroForm 드롭다운을 추가합니다.', fields: [
    field('name', '필드 이름', 'text', 'field.select'), field('page', '페이지', 'number', 1),
    field('x', 'X', 'number', 72), field('y', 'Y', 'number', 120), field('width', '너비', 'number', 180), field('height', '높이', 'number', 24),
    field('options', '옵션(줄바꿈으로 구분)', 'textarea', '승인\n반려'), field('selected', '초기 선택', 'text', '승인'),
  ] },
  { op: 'form.remove', label: '양식 필드 삭제', help: '정확한 필드 이름으로 AcroForm 필드를 제거합니다.', danger: true, fields: [field('name', '필드 이름')] },
  { op: 'metadata.set', label: '문서 속성', help: '제목·작성자·주제·키워드·언어를 설정합니다.', fields: [
    field('title', '제목'), field('author', '작성자'), field('subject', '주제'), field('keywords', '키워드(쉼표 구분)'), field('language', '언어', 'text', 'ko-KR'),
  ] },
  { op: 'attachment.add', label: '첨부파일 추가', help: '파일을 PDF 내부 첨부파일로 저장합니다.', fields: [
    field('name', '저장 이름'), field('attachmentFile', '첨부파일', 'file-any'),
  ] },
  { op: 'attachment.remove', label: '첨부파일 삭제', help: '정확한 이름의 PDF 첨부파일을 제거합니다.', danger: true, fields: [field('name', '첨부파일 이름')] },
  { op: 'document.flattenAll', label: '양식·주석 평탄화', help: '양식과 주석을 정적 페이지 콘텐츠로 변환합니다.', danger: true, fields: [] },
  { op: 'document.sanitize', label: '문서 위생 검사·제거', help: '메타데이터·첨부파일·JavaScript·OpenAction·양식·주석을 제거합니다.', danger: true, fields: [] },
  { op: 'document.optimize', label: '무손실 최적화', help: '객체 스트림과 압축 스트림으로 PDF 구조를 다시 씁니다.', fields: [] },
  { op: 'security.encrypt', label: 'AES-256 암호화', help: '열기 암호와 소유자 암호, 문서 권한을 설정합니다.', fields: [
    field('userPassword', '열기 암호', 'password'), field('ownerPassword', '소유자 암호', 'password'),
    field('allowPrint', '인쇄 허용', 'checkbox', true), field('allowCopy', '복사 허용', 'checkbox', false),
  ] },
  { op: 'security.remove', label: '암호화 설정 해제', help: '현재 편집 세션에 설정한 출력 암호화를 해제합니다.', fields: [] },
  { op: 'signature.addDigital', label: '인증서 전자서명', help: 'PKCS#12 인증서로 최종 PAdES 서명하며 이후 세션이 봉인됩니다.', danger: true, fields: [
    field('p12File', 'P12/PFX 인증서', 'file-p12'), field('password', '인증서 암호', 'password'),
    field('reason', '서명 사유'), field('location', '위치'),
  ] },
];

function renderAdvancedTool() {
  const tool = advancedTools.find((candidate) => candidate.op === elements.advancedTool.value) || advancedTools[0];
  elements.advancedToolHelp.textContent = tool.help;
  elements.advancedFields.replaceChildren(...tool.fields.map((definition) => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = definition.label;
    let input;
    if (definition.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else if (definition.type === 'select') {
      input = document.createElement('select');
      input.replaceChildren(...definition.options.map((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        return option;
      }));
    } else {
      input = document.createElement('input');
      input.type = definition.type.startsWith('file-') ? 'file' : definition.type;
      if (definition.type === 'file-pdf') input.accept = 'application/pdf';
      if (definition.type === 'file-p12') input.accept = '.p12,.pfx,application/x-pkcs12';
      if (definition.step) input.step = definition.step;
    }
    input.name = definition.name;
    if (definition.type === 'checkbox') input.checked = Boolean(definition.value);
    else if (!definition.type.startsWith('file-')) input.value = definition.value ?? '';
    label.append(caption, input);
    return label;
  }));
}

function parsePages(value) {
  const text = String(value || '').trim();
  return text ? text.split(',').map((part) => Number(part.trim())) : undefined;
}

async function buildAdvancedCommand(tool, formData) {
  const values = {};
  for (const definition of tool.fields) {
    const input = elements.advancedFields.querySelector(`[name="${definition.name}"]`);
    if (definition.type === 'checkbox') values[definition.name] = input.checked;
    else if (definition.type.startsWith('file-')) values[definition.name] = input.files[0];
    else if (definition.type === 'number') values[definition.name] = Number(input.value);
    else values[definition.name] = input.value;
  }
  const command = { op: tool.op };
  for (const [key, value] of Object.entries(values)) {
    if (key === 'sourceFile') command.sourceBytesBase64 = value ? await fileBase64(value) : '';
    else if (key === 'attachmentFile') {
      if (!value) throw new Error('첨부할 파일을 선택하세요.');
      command.bytesBase64 = await fileBase64(value);
      command.mimeType = value.type || 'application/octet-stream';
      if (!values.name) command.name = value.name;
    } else if (key === 'p12File') {
      if (!value) throw new Error('P12/PFX 인증서를 선택하세요.');
      command.p12BytesBase64 = await fileBase64(value);
    } else if (key === 'regions' || key === 'boxes' || key === 'segments') {
      try { command[key] = JSON.parse(value); } catch { throw new Error(`${key} JSON 형식이 올바르지 않습니다.`); }
    } else if (key === 'pages') command.pages = parsePages(value);
    else if (key === 'languages') command.languages = value.split(',').map((language) => language.trim().toLowerCase()).filter(Boolean);
    else if (key === 'options') command.options = value.split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
    else if (key === 'keywords') {
      command.metadata = { ...(command.metadata || {}), keywords: value.split(',').map((word) => word.trim()).filter(Boolean) };
    } else if (['title', 'author', 'subject', 'language'].includes(key) && tool.op === 'metadata.set') {
      command.metadata = { ...(command.metadata || {}), [key]: value };
    } else if (key === 'allowPrint') {
      command.permissions = { ...(command.permissions || {}), print: value };
    } else if (key === 'allowCopy') {
      command.permissions = { ...(command.permissions || {}), copy: value };
    } else if (value !== '' && value !== undefined) command[key] = value;
  }
  if (tool.op === 'page.replace' || tool.op === 'document.merge') {
    if (!command.sourceBytesBase64) throw new Error('원본 PDF 파일을 선택하세요.');
  }
  return command;
}

function openToolPanel(mode = 'advanced') {
  elements.objectEditor.hidden = false;
  elements.objectEditorButton.setAttribute('aria-expanded', 'true');
  const tab = document.querySelector(`.editor-mode-tab[data-editor-mode="${mode}"]`);
  tab?.click();
}

elements.objectEditorButton.addEventListener('click', () => {
  const willOpen = elements.objectEditor.hidden;
  elements.objectEditor.hidden = !willOpen;
  elements.objectEditorButton.setAttribute('aria-expanded', String(willOpen));
});
elements.closeObjectEditor.addEventListener('click', () => {
  elements.objectEditor.hidden = true;
  elements.objectEditorButton.setAttribute('aria-expanded', 'false');
});
elements.loadObjectsButton.addEventListener('click', () => beginObjectSession().catch((error) => setPanelStatus(error.message, 'error')));
elements.editPdfButton.addEventListener('click', async () => {
  try {
    if (!state.sessionId) await beginObjectSession();
    state.editMode = 'select';
    document.querySelector('[data-edit-mode="select"]')?.click();
    setPanelStatus('페이지에서 텍스트를 더블클릭하거나 이미지를 드래그해 편집하세요.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
    openToolPanel('advanced');
  }
});
elements.closeReportDialog.addEventListener('click', () => elements.reportDialog.close());
elements.qualityAuditButton.addEventListener('click', async () => {
  try {
    if (!state.sessionId) await beginObjectSession();
    const quality = await api(`/pdf/api/documents/${state.sessionId}/quality/check`, { baseRevision: state.revision });
    showReport(
      '품질·접근성 검사',
      `페이지 ${quality.pageCount}개 · ${quality.issues?.length || 0}개 항목`,
      issueList(quality),
    );
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});
elements.compareButton.addEventListener('click', async () => {
  try {
    if (!state.sessionId) await beginObjectSession();
    const comparison = await api(`/pdf/api/documents/${state.sessionId}/quality/render-compare`, {
      baseRevision: state.revision,
      pages: [1],
    });
    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    for (const [label, rendered] of [['원본', comparison.baseline], ['현재 편집본', comparison.current]]) {
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `${label} · 1페이지`;
      const image = document.createElement('img');
      const page = rendered.pages[0];
      image.alt = `${label} PDF 1페이지 렌더`;
      image.src = `data:${page.mimeType};base64,${page.bytesBase64}`;
      figure.append(caption, image);
      grid.append(figure);
    }
    showReport('원본 비교', '같은 렌더러·해상도로 만든 1페이지 원본/현재 편집본입니다.', grid);
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});
elements.refreshObjectsButton.addEventListener('click', () => refreshInventory().catch((error) => setPanelStatus(error.message, 'error')));
elements.objectSearch.addEventListener('input', renderObjectList);

document.querySelectorAll('[data-edit-mode]').forEach((button) => button.addEventListener('click', async () => {
  try {
    if (!state.sessionId) await beginObjectSession();
    state.editMode = button.dataset.editMode;
    document.querySelectorAll('[data-edit-mode]').forEach((candidate) => candidate.classList.toggle('is-active', candidate === button));
    renderCanvasObjects();
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}));

document.querySelectorAll('[data-open-tool]').forEach((button) => button.addEventListener('click', async () => {
  try {
    if (!state.sessionId) await beginObjectSession();
    openToolPanel('advanced');
    elements.advancedTool.value = button.dataset.openTool;
    renderAdvancedTool();
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}));

document.querySelectorAll('[data-activate-mode="comment"]').forEach((button) => button.addEventListener('click', async () => {
  try {
    if (!state.sessionId) await beginObjectSession();
    openToolPanel('advanced');
    elements.advancedTool.value = 'comment.add';
    renderAdvancedTool();
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}));

elements.canvasOverlay.addEventListener('click', (event) => {
  if (event.target !== elements.canvasOverlay) return;
  state.selected = null;
  elements.selectionToolbar.hidden = true;
  renderCanvasObjects();
});

async function applyQuickTextStyle() {
  if (state.selected?.type !== 'text') return;
  const object = state.selected;
  try {
    setPanelStatus('본문 서식을 적용하는 중…');
    await applyCommands([{
      op: 'text.replaceObject',
      page: object.page,
      objectIndex: object.objectIndex,
      objectId: object.id,
      expectedText: object.text,
      text: object.text,
      fontFamily: elements.quickFontFamily.value,
      fontSize: Number(elements.quickFontSize.value),
      color: elements.quickFontColor.value,
      opacity: (object.fillColor?.a ?? 255) / 255,
    }], { inspectObject: true });
    setPanelStatus('본문 서식 변경과 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}

elements.quickFontFamily.addEventListener('change', applyQuickTextStyle);
elements.quickFontSize.addEventListener('change', applyQuickTextStyle);
elements.quickFontColor.addEventListener('change', applyQuickTextStyle);
elements.openPropertiesButton.addEventListener('click', () => openToolPanel('objects'));
elements.deleteSelectedButton.addEventListener('click', () => document.querySelector('[data-delete-object]')?.click());
elements.replaceImageButton.addEventListener('click', () => elements.quickImageFile.click());
elements.quickImageFile.addEventListener('change', async () => {
  const file = elements.quickImageFile.files[0];
  if (!file || state.selected?.type !== 'image') return;
  const object = state.selected;
  try {
    setPanelStatus('페이지의 이미지를 교체하는 중…');
    await applyCommands([{
      op: 'image.replaceObject',
      page: object.page,
      objectIndex: object.objectIndex,
      objectId: object.id,
      mimeType: file.type,
      bytesBase64: await fileBase64(file),
    }], { inspectObject: true });
    setPanelStatus('이미지 교체와 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  } finally {
    elements.quickImageFile.value = '';
  }
});

window.addEventListener('resize', scheduleCanvasOverlay);
setInterval(() => {
  if (!state.inventory || state.inlineEditing) return;
  const geometry = renderedPages().map((page) => (
    `${page.page}:${page.left.toFixed(1)}:${page.top.toFixed(1)}:${page.width.toFixed(1)}:${page.height.toFixed(1)}`
  )).join('|');
  if (geometry !== state.overlayGeometry) scheduleCanvasOverlay();
}, 300);

document.querySelectorAll('.editor-mode-tab').forEach((tab) => tab.addEventListener('click', () => {
  const advanced = tab.dataset.editorMode === 'advanced';
  elements.objectMode.hidden = advanced;
  elements.advancedMode.hidden = !advanced;
  document.querySelectorAll('.editor-mode-tab').forEach((candidate) => {
    const active = candidate === tab;
    candidate.classList.toggle('is-active', active);
    candidate.setAttribute('aria-selected', String(active));
  });
}));

document.querySelectorAll('.object-tab').forEach((tab) => tab.addEventListener('click', () => {
  state.objectType = tab.dataset.objectType;
  document.querySelectorAll('.object-tab').forEach((candidate) => {
    const active = candidate === tab;
    candidate.classList.toggle('is-active', active);
    candidate.setAttribute('aria-selected', String(active));
  });
  state.selected = null;
  renderObjectList();
  elements.textEditorForm.hidden = true;
  elements.imageEditorForm.hidden = true;
  elements.genericEditor.hidden = true;
}));

elements.textEditorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    setPanelStatus('본문과 폰트를 PDF에 임베드하는 중…');
    await applyCommands([{
      op: 'text.replaceObject',
      page: state.selected.page,
      objectIndex: state.selected.objectIndex,
      objectId: state.selected.id,
      expectedText: state.selected.text,
      text: elements.textValue.value,
      fontFamily: elements.fontFamily.value,
      fontSize: Number(elements.fontSize.value),
      color: elements.fontColor.value,
      opacity: Number(elements.fontOpacity.value),
    }], { inspectObject: true });
    setPanelStatus('본문 수정과 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});

elements.imageEditorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const commands = [];
    const file = elements.imageFile.files[0];
    if (file) commands.push({
      op: 'image.replaceObject',
      page: state.selected.page,
      objectIndex: state.selected.objectIndex,
      objectId: state.selected.id,
      mimeType: file.type,
      bytesBase64: await fileBase64(file),
    });
    const current = state.selected.matrix;
    const matrix = {
      ...current,
      a: Number(elements.matrixA.value),
      d: Number(elements.matrixD.value),
      e: Number(elements.matrixE.value),
      f: Number(elements.matrixF.value),
    };
    if (Object.keys(matrix).some((key) => Number(matrix[key]) !== Number(current[key]))) {
      commands.push({
        op: 'object.transform',
        page: state.selected.page,
        objectIndex: state.selected.objectIndex,
        objectId: state.selected.id,
        matrix,
      });
    }
    if (!commands.length) throw new Error('교체 이미지나 변경된 위치·크기를 입력하세요.');
    setPanelStatus('이미지 객체를 수정하는 중…');
    await applyCommands(commands, { inspectObject: true });
    setPanelStatus('이미지 수정과 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});

document.querySelectorAll('[data-delete-object]').forEach((button) => button.addEventListener('click', async () => {
  if (!state.selected || !window.confirm('선택한 PDF 객체를 삭제할까요?')) return;
  try {
    setPanelStatus('객체를 삭제하는 중…');
    await applyCommands([{
      op: 'object.delete',
      page: state.selected.page,
      objectIndex: state.selected.objectIndex,
      objectId: state.selected.id,
    }], { inspectObject: true });
    state.selected = null;
    elements.textEditorForm.hidden = true;
    elements.imageEditorForm.hidden = true;
    elements.genericEditor.hidden = true;
    setPanelStatus('객체 삭제와 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}));

elements.advancedTool.replaceChildren(...advancedTools.map((tool) => {
  const option = document.createElement('option');
  option.value = tool.op;
  option.textContent = tool.label;
  return option;
}));
elements.advancedTool.addEventListener('change', renderAdvancedTool);
renderAdvancedTool();

elements.advancedToolForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const tool = advancedTools.find((candidate) => candidate.op === elements.advancedTool.value);
  if (tool.danger && !window.confirm(`${tool.label} 작업을 적용할까요? 저장 후 되돌리려면 원본을 다시 열어야 합니다.`)) return;
  try {
    setPanelStatus(`${tool.label} 작업을 적용하고 검증하는 중…`);
    const command = await buildAdvancedCommand(tool, new FormData(elements.advancedToolForm));
    await applyCommands([command]);
    setPanelStatus(`${tool.label} 작업과 저장·재열기 검증이 완료되었습니다.`, 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});

try {
  const viewer = EmbedPDF.init({
    type: 'container',
    target: elements.pdfViewer,
    worker: true,
    tabBar: 'always',
    annotations: { annotationAuthor: 'Academic Editor', selectAfterCreate: true },
    export: { defaultFileName: 'academic-edited.pdf' },
    permissions: { enforceDocumentPermissions: true },
    theme: {
      preference: 'light',
      light: { accent: { primary: '#4f46e5', primaryHover: '#4338ca', primaryActive: '#3730a3', primaryLight: '#eef2ff', primaryForeground: '#ffffff' } },
    },
  });

  viewer.registry.then((registry) => {
    state.registry = registry;
    state.documentManager = registry.getPlugin('document-manager')?.provides();
    state.exporter = registry.getPlugin('export')?.provides();
    state.documentManager?.onDocumentOpened((documentState) => {
      elements.runtimeStatus.textContent = `${documentState.name || 'PDF'} · PDFium 편집 준비 완료`;
      if (!state.reopening) {
        const previousSessionId = state.sessionId;
        const previousRevision = state.revision;
        if (previousSessionId && previousRevision) {
          api(`/pdf/api/documents/${previousSessionId}/documents/discard`, { baseRevision: previousRevision }).catch(() => {});
        }
        Object.assign(state, {
          sessionId: null,
          revision: null,
          inventory: null,
          catalog: null,
          selected: null,
          editedBuffer: null,
        });
        elements.editorEmpty.hidden = false;
        elements.editorBody.hidden = true;
      }
    });
    state.documentManager?.onDocumentClosed(() => {
      if (!state.reopening) elements.runtimeStatus.textContent = 'PDFium 편집 준비 완료';
    });
    state.documentManager?.onDocumentError((event) => {
      elements.runtimeStatus.textContent = `PDF 열기 실패: ${event?.message || '알 수 없는 오류'}`;
    });
    elements.runtimeStatus.textContent = 'PDFium 편집 준비 완료';
  }).catch(failBoot);

  window.academicPdfEditor = Object.freeze({ engine: 'PDFium', version: '2.14.4', viewer, registry: viewer.registry });
} catch (error) {
  failBoot(error);
}
