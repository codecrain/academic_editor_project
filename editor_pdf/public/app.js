import EmbedPDF from './vendor/embedpdf/embedpdf.js';

const elements = Object.fromEntries([
  'pdfViewer', 'runtimeStatus', 'bootError', 'bootErrorMessage', 'objectEditorButton',
  'objectEditor', 'closeObjectEditor', 'editorEmpty', 'editorBody', 'loadObjectsButton',
  'refreshObjectsButton', 'objectCount', 'fontCount', 'objectSearch', 'objectList',
  'textEditorForm', 'textValue', 'fontFamily', 'fontSize', 'fontColor', 'fontOpacity',
  'imageEditorForm', 'imageFile', 'matrixA', 'matrixD', 'matrixE', 'matrixF',
  'genericEditor', 'genericObjectInfo', 'panelStatus',
].map((id) => [id, document.getElementById(id)]));

const state = {
  registry: null,
  documentManager: null,
  exporter: null,
  sessionId: null,
  revision: null,
  inventory: null,
  selected: null,
  objectType: 'text',
  editedBuffer: null,
  reopening: false,
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

function taskPromise(task) {
  return typeof task?.toPromise === 'function' ? task.toPromise() : Promise.resolve(task);
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + size, bytes.length))));
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
  setPanelStatus('PDF 객체와 폰트를 분석하는 중…');
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
  await refreshInventory();
  elements.editorEmpty.hidden = true;
  elements.editorBody.hidden = false;
}

async function refreshInventory() {
  if (!state.sessionId) return beginObjectSession();
  state.inventory = await api(`/pdf/api/documents/${state.sessionId}/object/inventory`, {});
  state.revision = state.inventory.revision;
  elements.objectCount.textContent = `객체 ${state.inventory.pageObjectCount}개 · 본문 ${state.inventory.textObjectCount}개`;
  elements.fontCount.textContent = `임베드 폰트 ${state.inventory.fonts.length}개`;
  const previousFont = elements.fontFamily.value;
  elements.fontFamily.replaceChildren(...state.inventory.fonts.map((font) => {
    const option = document.createElement('option');
    option.value = font.id;
    option.dataset.family = font.label;
    option.textContent = `${font.label} ${font.style || ''} · ${font.license}`.replace(/\s+/g, ' ');
    return option;
  }));
  if ([...elements.fontFamily.options].some((option) => option.value === previousFont)) elements.fontFamily.value = previousFont;
  renderObjectList();
  setPanelStatus('객체를 선택해 수정할 수 있습니다.', 'success');
}

function filteredObjects() {
  const query = elements.objectSearch.value.trim().toLocaleLowerCase('ko');
  return (state.inventory?.pageObjects || []).filter((object) => {
    if (state.objectType !== 'all' && object.type !== state.objectType) return false;
    return !query || String(object.text || '').toLocaleLowerCase('ko').includes(query) || String(object.page).includes(query);
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
    button.dataset.objectId = object.id;
    const label = object.type === 'text'
      ? (object.text || '(빈 텍스트)').replace(/\s+/g, ' ').slice(0, 80)
      : object.type === 'image' ? '이미지 객체' : `${object.type} 객체`;
    button.innerHTML = `<span class="object-page">${object.page}쪽 · #${object.objectIndex}</span><strong></strong><small></small>`;
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
  } else if (object.type === 'image') {
    elements.imageFile.value = '';
    elements.matrixA.value = object.matrix?.a ?? '';
    elements.matrixD.value = object.matrix?.d ?? '';
    elements.matrixE.value = object.matrix?.e ?? '';
    elements.matrixF.value = object.matrix?.f ?? '';
  } else {
    elements.genericObjectInfo.textContent = `${object.page}쪽의 ${object.type} 객체 (#${object.objectIndex})`;
  }
}

async function inspectSelected() {
  if (!state.selected) throw new Error('수정할 객체를 선택하세요.');
  const inspected = await api(`/pdf/api/documents/${state.sessionId}/target/inspect`, {
    locations: [{ page: state.selected.page, objectId: state.selected.id, objectIndex: state.selected.objectIndex }],
  });
  return inspected.targets[0];
}

async function applyCommands(commands) {
  await inspectSelected();
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
  if (!quality.ok) throw new Error(quality.issues?.map((issue) => issue.message).join(' · ') || 'PDF 품질 검사에 실패했습니다.');
  const saved = await api(`/pdf/api/documents/${state.sessionId}/documents/save-buffer`, {
    baseRevision: state.revision,
    filename: 'academic-edited.pdf',
  });
  state.editedBuffer = base64ToBuffer(saved.bytesBase64);
  const activeId = state.documentManager.getActiveDocumentId();
  state.reopening = true;
  if (activeId) await taskPromise(state.documentManager.closeDocument(activeId));
  const opened = await taskPromise(state.documentManager.openDocumentBuffer({
    buffer: state.editedBuffer.slice(0),
    name: saved.filename,
    autoActivate: true,
  }));
  if (opened?.task) await taskPromise(opened.task);
  state.reopening = false;
}

async function fileBase64(file) {
  return bytesToBase64(await file.arrayBuffer());
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
elements.refreshObjectsButton.addEventListener('click', () => refreshInventory().catch((error) => setPanelStatus(error.message, 'error')));
elements.objectSearch.addEventListener('input', renderObjectList);

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
    }]);
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
    if (file) {
      commands.push({
        op: 'image.replaceObject',
        page: state.selected.page,
        objectIndex: state.selected.objectIndex,
        objectId: state.selected.id,
        mimeType: file.type,
        bytesBase64: await fileBase64(file),
      });
    }
    const current = state.selected.matrix;
    const matrix = { ...current, a: Number(elements.matrixA.value), d: Number(elements.matrixD.value), e: Number(elements.matrixE.value), f: Number(elements.matrixF.value) };
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
    await applyCommands(commands);
    setPanelStatus('이미지 수정과 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});

document.querySelectorAll('[data-delete-object]').forEach((button) => button.addEventListener('click', async () => {
  if (!state.selected || !window.confirm('선택한 PDF 객체를 삭제할까요?')) return;
  try {
    setPanelStatus('객체를 삭제하는 중…');
    await applyCommands([{ op: 'object.delete', page: state.selected.page, objectIndex: state.selected.objectIndex, objectId: state.selected.id }]);
    state.selected = null;
    elements.textEditorForm.hidden = true;
    elements.imageEditorForm.hidden = true;
    elements.genericEditor.hidden = true;
    setPanelStatus('객체 삭제와 재열기 검증이 완료되었습니다.', 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}));

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
        state.sessionId = null;
        state.revision = null;
        state.inventory = null;
        state.selected = null;
        state.editedBuffer = null;
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
