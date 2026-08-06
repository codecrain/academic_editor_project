import EmbedPDF from './vendor/embedpdf/embedpdf.js';
import { applyTranslations, localizeTool, setLocale, t } from './i18n.js';

const elementIds = [
  'pdfViewer', 'runtimeStatus', 'bootError', 'bootErrorMessage', 'objectEditorButton', 'editPdfButton',
  'objectEditor', 'closeObjectEditor', 'editorEmpty', 'editorBody', 'loadObjectsButton',
  'refreshObjectsButton', 'objectCount', 'fontCount', 'objectSearch', 'objectList',
  'textEditorForm', 'textValue', 'fontFamily', 'fontSize', 'fontColor', 'fontOpacity',
  'imageEditorForm', 'imageFile', 'matrixA', 'matrixD', 'matrixE', 'matrixF',
  'genericEditor', 'genericObjectInfo', 'panelStatus', 'objectMode', 'advancedMode',
  'advancedToolForm', 'advancedTool', 'advancedToolHelp', 'advancedFields', 'commandCatalog',
  'quickToolGrid',
  'qualityAuditButton', 'compareButton', 'reportDialog', 'reportTitle', 'reportSummary',
  'reportBody', 'closeReportDialog',
  'advancedConfirm', 'advancedConfirmTitle', 'advancedConfirmMessage', 'advancedConfirmCancel', 'advancedConfirmCancelButton', 'advancedConfirmApply',
  'settingsButton', 'settingsMenu', 'closeSettingsButton', 'canvasOverlay', 'selectionToolbar', 'textQuickControls', 'quickFontFamily', 'quickFontSize',
  'quickFontColor', 'replaceImageButton', 'openPropertiesButton', 'deleteSelectedButton',
  'quickImageFile', 'commentComposer', 'commentText', 'commentSave', 'commentCancel', 'commentCancelButton',
  'redactionConfirm', 'redactionConfirmCancel', 'redactionConfirmCancelButton', 'redactionConfirmApply',
  'panelTitle', 'editHint', 'editHintText', 'imageChooseButton', 'topModeLabel', 'savePdfButton', 'languageSelect',
];
const elements = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));
applyTranslations();

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
  editMode: 'text',
  inlineEditing: false,
  overlayFrame: 0,
  overlayGeometry: '',
  sessionPromise: null,
  documentGeneration: 0,
  textPreviews: new Map(),
  pendingSave: false,
  textGroups: new Map(),
  pendingComment: null,
  pendingImage: null,
  imageFilePurpose: null,
  redactionDrag: null,
  pendingRedaction: null,
  pendingAdvancedTool: null,
  pendingConfirmationAction: null,
  modeActivation: 0,
  objectDrag: null,
  clipboard: null,
};

let markEditorBridgeReady;
const editorBridgeReady = new Promise((resolve) => {
  markEditorBridgeReady = resolve;
});

function failBoot(error) {
  const message = error instanceof Error ? error.message : String(error);
  elements.runtimeStatus.textContent = t('status.engineFailed');
  elements.bootErrorMessage.textContent = message;
  elements.bootError.hidden = false;
  console.error('tlooto PDF startup failed.', error);
}

function setPanelStatus(message, kind = '') {
  elements.panelStatus.textContent = message;
  elements.panelStatus.dataset.kind = kind;
}

function markPendingSave(pending = true) {
  state.pendingSave = pending;
  elements.savePdfButton.disabled = !state.sessionId;
  elements.savePdfButton.dataset.dirty = String(pending);
  elements.savePdfButton.title = pending ? t('status.savePending') : t('status.saveCurrent');
}

function localizedIssueMessage(issue) {
  const message = t(`issue.${issue.code}`, {
    message: issue.message,
    pages: (issue.pages || []).join(', '),
    count: issue.objects?.length || 0,
    markers: (issue.markers || []).join(', '),
  });
  return message.startsWith('issue.') ? issue.message : message;
}

function showReport(title, summary, content) {
  elements.reportTitle.textContent = title;
  elements.reportSummary.textContent = summary;
  elements.reportBody.replaceChildren(content);
  elements.reportDialog.showModal();
}

function closeAdvancedConfirmation() {
  state.pendingAdvancedTool = null;
  state.pendingConfirmationAction = null;
  if (elements.advancedConfirm.open) elements.advancedConfirm.close();
}

function showAdvancedConfirmation({ tool = null, message, action }) {
  const localizedTool = tool ? localizeTool(tool) : null;
  state.pendingAdvancedTool = tool?.op || null;
  state.pendingConfirmationAction = action;
  elements.advancedConfirmTitle.textContent = t('advancedConfirm.title');
  elements.advancedConfirmMessage.textContent = message || t('advancedConfirm.message', { label: localizedTool.label });
  if (!elements.advancedConfirm.open) elements.advancedConfirm.showModal();
  elements.advancedConfirmApply.focus({ preventScroll: true });
}

function issueList(quality) {
  const list = document.createElement('ul');
  list.className = 'report-issues';
  for (const issue of quality.issues || []) {
    const item = document.createElement('li');
    item.dataset.severity = issue.severity;
    const label = document.createElement('strong');
    label.textContent = issue.severity === 'error' ? t('quality.error') : issue.severity === 'warning' ? t('quality.warning') : t('quality.info');
    const message = document.createElement('span');
    message.textContent = localizedIssueMessage(issue);
    item.append(label, message);
    list.append(item);
  }
  if (!list.children.length) {
    const item = document.createElement('li');
    item.dataset.severity = 'success';
    item.textContent = t('quality.clean');
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
  const payload = await response.text();
  let result;
  try {
    result = JSON.parse(payload);
  } catch {
    if (!response.ok) throw new Error(payload || t('status.apiRequestFailed', { status: response.status }));
    throw new Error(t('status.invalidApiResponse', { status: response.status }));
  }
  if (!response.ok || result.ok === false) throw new Error(result.message || t('status.apiRequestFailed', { status: response.status }));
  return result;
}

async function currentBuffer() {
  if (state.editedBuffer) return state.editedBuffer.slice(0);
  if (!state.exporter) throw new Error(t('status.noOpenPdf'));
  return taskPromise(state.exporter.saveAsCopy());
}

async function beginObjectSession() {
  if (state.sessionId) return;
  if (state.sessionPromise) return state.sessionPromise;
  const generation = state.documentGeneration;
  state.sessionPromise = (async () => {
    setPanelStatus(t('status.analyze'));
    const active = state.documentManager?.getActiveDocument();
    if (!active) throw new Error(t('status.openPdfFirst'));
    const buffer = await currentBuffer();
    const opened = await api('/pdf/api/documents/open', {
      filename: active.name || 'document.pdf',
      source: { bytesBase64: bytesToBase64(buffer) },
    });
    if (generation !== state.documentGeneration) {
      api(`/pdf/api/documents/${opened.documentId}/documents/discard`, { baseRevision: opened.revision }).catch(() => {});
      return;
    }
    state.sessionId = opened.documentId;
    state.revision = opened.revision;
    state.editedBuffer = buffer;
    await Promise.all([refreshInventory(), loadCommandCatalog()]);
    markPendingSave(false);
    elements.editorEmpty.hidden = true;
    elements.editorBody.hidden = false;
  })();
  try {
    await state.sessionPromise;
  } finally {
    state.sessionPromise = null;
  }
}

function replyToEditorHost(event, id, result, error) {
  if (!event.source || !event.origin || event.origin === 'null') return;
  event.source.postMessage({ type: 'rhwp-response', id, result, error }, event.origin);
}

function suppressLocalPdfOpenUi() {
  const roots = [document];
  for (const element of document.querySelectorAll('*')) {
    if (element.shadowRoot) roots.push(element.shadowRoot);
  }
  for (const root of roots) {
    for (const button of root.querySelectorAll('button')) {
      if (button.textContent?.trim() !== 'Open Document') continue;
      const panel = button.parentElement;
      if (panel) panel.hidden = true;
    }
  }
}

// EmbedPDF renders its empty-document panel after initialization. This editor is
// embedded, so only the host application is allowed to select a document.
new MutationObserver(suppressLocalPdfOpenUi).observe(document.body, { childList: true, subtree: true });
setInterval(suppressLocalPdfOpenUi, 250);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

async function loadDocumentFromHost(params = {}) {
  const rawBytes = params.data;
  const buffer = rawBytes instanceof ArrayBuffer
    ? rawBytes
    : ArrayBuffer.isView(rawBytes)
      ? rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength)
      : Array.isArray(rawBytes)
        ? new Uint8Array(rawBytes).buffer
        : null;
  if (!buffer) throw new Error('A PDF ArrayBuffer is required.');
  if (!state.documentManager) throw new Error('PDF editor is not ready.');
  const activeId = state.documentManager.getActiveDocumentId();
  state.reopening = true;
  try {
    if (activeId) await taskPromise(state.documentManager.closeDocument(activeId));
    const opened = await taskPromise(state.documentManager.openDocumentBuffer({
      buffer,
      name: String(params.fileName || 'document.pdf'),
      autoActivate: true,
    }));
    if (opened?.task) await taskPromise(opened.task);
  } finally {
    state.reopening = false;
  }
}

function reflectEditMode(mode) {
  state.editMode = mode;
  document.querySelector('.tool-rail')?.setAttribute('data-mode', mode);
  elements.canvasOverlay?.setAttribute('data-mode', mode);
  if (elements.imageChooseButton) elements.imageChooseButton.hidden = mode !== 'image' || Boolean(state.pendingImage);
  elements.canvasOverlay?.setAttribute('data-image-placement', String(Boolean(state.pendingImage && mode === 'image')));
  if (elements.topModeLabel) elements.topModeLabel.textContent = t(`mode.${mode}`);
  document.querySelectorAll('[data-edit-mode]').forEach((candidate) => {
    const active = candidate.dataset.editMode === mode;
    candidate.classList.toggle('is-active', active);
    candidate.setAttribute('aria-pressed', String(active));
  });
  const editing = ['text', 'image', 'select'].includes(mode) && Boolean(state.sessionId);
  elements.editPdfButton.classList.toggle('is-active', editing);
  elements.editPdfButton.setAttribute('aria-pressed', String(editing));
}

function showEditHint(message, stateName = 'ready') {
  elements.editHintText.textContent = message;
  elements.editHint.dataset.state = stateName;
  elements.editHint.hidden = false;
}

function hideEditHint() {
  elements.editHint.hidden = true;
}

function cancelImagePlacement() {
  state.pendingImage = null;
  state.imageFilePurpose = null;
  elements.quickImageFile.value = '';
  elements.canvasOverlay.dataset.imagePlacement = 'false';
}

function cancelDirectInteraction({ clearSelection: shouldClearSelection = false } = {}) {
  closeCommentComposer();
  clearRedactionRegion();
  cancelImagePlacement();
  if (shouldClearSelection) clearSelection({ render: false });
}

function modeHintKey(mode) {
  return {
    select: 'hint.select',
    text: 'hint.ready',
    image: 'hint.image',
    comment: 'hint.comment',
    redaction: 'hint.redaction',
  }[mode] || 'hint.ready';
}

async function activateEditMode(mode = 'text', { announce = true } = {}) {
  const activation = ++state.modeActivation;
  clearSelection({ render: false });
  cancelDirectInteraction();
  reflectEditMode(mode);
  if (!state.sessionId) {
    elements.editPdfButton.classList.add('is-loading');
    showEditHint(t('hint.loading'), 'loading');
    try {
      await beginObjectSession();
    } finally {
      elements.editPdfButton.classList.remove('is-loading');
    }
    if (activation !== state.modeActivation) return;
    reflectEditMode(mode);
  }
  if (activation !== state.modeActivation) return;
  renderCanvasObjects();
  if (!announce) return;
  if (mode === 'select') hideEditHint();
  else showEditHint(t(modeHintKey(mode)));
}

const quickFontFamilyNames = [
  'Noto Sans KR', 'Noto Serif KR', 'Nanum Myeongjo', 'Pretendard',
  'Carlito', 'Caladea', 'Liberation Sans', 'Liberation Serif',
  'Liberation Mono', 'DejaVu Sans',
];

function renderQuickFontFamilyOptions(preserveValues = []) {
  const options = [...elements.fontFamily.options];
  const preserve = new Set(preserveValues.filter(Boolean));
  const preferredValues = new Set();

  for (const family of quickFontFamilyNames) {
    const familyOptions = options.filter((option) => option.dataset.family === family);
    const preferred = familyOptions.find((option) => /\bRegular\b/.test(option.textContent))
      || familyOptions.find((option) => /\bVariable\b/.test(option.textContent))
      || familyOptions[0];
    if (preferred) preferredValues.add(preferred.value);
  }

  const quickOptions = options.filter((option) => (
    preferredValues.has(option.value) || preserve.has(option.value)
  ));
  elements.quickFontFamily.replaceChildren(...quickOptions.map((option) => option.cloneNode(true)));
  const selectedValue = [...preserve].find((value) => (
    [...elements.quickFontFamily.options].some((option) => option.value === value)
  ));
  if (selectedValue) elements.quickFontFamily.value = selectedValue;
}

async function refreshInventory() {
  if (!state.sessionId) return beginObjectSession();
  state.inventory = await api(`/pdf/api/documents/${state.sessionId}/object/inventory`, {});
  state.revision = state.inventory.revision;
  elements.objectCount.textContent = t('objects.count', { pageCount: state.inventory.pageObjectCount, textCount: state.inventory.textObjectCount });
  elements.fontCount.textContent = t('fonts.count', { count: state.inventory.fonts.length });
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
  renderQuickFontFamilyOptions([previousQuickFont]);
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
  setPanelStatus(t('status.toolsReady'), 'success');
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
    heading.textContent = t(`category.${category}`);
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
    empty.textContent = t('status.noMatchingObjects');
    elements.objectList.append(empty);
    return;
  }
  for (const object of objects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `object-card${state.selected?.id === object.id ? ' is-selected' : ''}`;
    const label = object.type === 'text'
      ? (object.text || t('status.emptyText')).replace(/\s+/g, ' ').slice(0, 80)
      : object.type === 'image' ? t('objects.image') : t('status.objectType', { type: object.type });
    button.innerHTML = '<span class="object-page"></span><strong></strong><small></small>';
    button.querySelector('.object-page').textContent = t('status.pageObject', { page: object.page, index: object.objectIndex });
    button.querySelector('strong').textContent = label;
    button.querySelector('small').textContent = object.type === 'text'
      ? `${object.fontFamily || t('status.unknownFont')} · ${Number(object.fontSize || 0).toFixed(1)}pt`
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
    renderQuickFontFamilyOptions([elements.fontFamily.value]);
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
    elements.genericObjectInfo.textContent = t('status.pageTypeObject', { page: object.page, type: object.type, index: object.objectIndex });
  }
  renderCanvasObjects();
  positionSelectionToolbar();
}

function clearSelection({ render = true } = {}) {
  state.selected = null;
  elements.selectionToolbar.hidden = true;
  elements.textEditorForm.hidden = true;
  elements.imageEditorForm.hidden = true;
  elements.genericEditor.hidden = true;
  if (render) renderCanvasObjects();
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
      image,
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

function pagePointAtClient(clientX, clientY) {
  const viewerRect = elements.pdfViewer.getBoundingClientRect();
  const pointX = clientX - viewerRect.left;
  const pointY = clientY - viewerRect.top;
  const rendered = renderedPages().find((page) => (
    pointX >= page.left && pointX <= page.left + page.width
      && pointY >= page.top && pointY <= page.top + page.height
  ));
  const source = state.inventory?.pages?.find((page) => page.page === rendered?.page);
  if (!rendered || !source) return null;
  const screenX = Math.max(0, Math.min(rendered.width, pointX - rendered.left));
  const screenY = Math.max(0, Math.min(rendered.height, pointY - rendered.top));
  return {
    page: rendered.page,
    x: (screenX / rendered.width) * source.width,
    y: (screenY / rendered.height) * source.height,
    screenX: rendered.left + screenX,
    screenY: rendered.top + screenY,
    pageLeft: rendered.left,
    pageTop: rendered.top,
    scaleX: rendered.width / source.width,
    scaleY: rendered.height / source.height,
  };
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t('error.invalidImage')));
    };
    image.src = url;
  });
}

async function placePendingImage(point) {
  const file = state.pendingImage;
  const source = state.inventory?.pages?.find((page) => page.page === point.page);
  if (!file || !source) return;
  try {
    setPanelStatus(t('status.imagePreparing'));
    const natural = await imageDimensions(file);
    const maxWidth = Math.min(180, source.width * 0.35);
    const maxHeight = source.height * 0.35;
    const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
    const width = Math.max(24, natural.width * scale);
    const height = Math.max(24, natural.height * scale);
    const x = Math.max(0, Math.min(source.width - width, point.x - width / 2));
    const y = Math.max(0, Math.min(source.height - height, point.y - height / 2));
    await applyCommands([{
      op: 'image.add',
      page: point.page,
      x,
      y,
      width,
      height,
      mimeType: file.type || 'image/png',
      bytesBase64: await fileBase64(file),
    }]);
    state.pendingImage = null;
    elements.canvasOverlay.dataset.imagePlacement = 'false';
    reflectEditMode('select');
    hideEditHint();
    setPanelStatus(t('status.imageAdded'), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}

function closeCommentComposer() {
  state.pendingComment = null;
  elements.commentComposer.hidden = true;
  elements.commentText.value = '';
}

function showCommentComposer(point) {
  state.pendingComment = point;
  elements.selectionToolbar.hidden = true;
  elements.commentComposer.hidden = false;
  const composerWidth = Math.min(300, Math.max(240, elements.pdfViewer.clientWidth - 24));
  elements.commentComposer.style.width = `${composerWidth}px`;
  const left = Math.max(10, Math.min(point.screenX + 12, elements.pdfViewer.clientWidth - composerWidth - 10));
  const top = Math.max(10, Math.min(point.screenY + 12, elements.pdfViewer.clientHeight - 190));
  elements.commentComposer.style.left = `${left}px`;
  elements.commentComposer.style.top = `${top}px`;
  elements.commentText.focus({ preventScroll: true });
}

async function saveDirectComment() {
  const point = state.pendingComment;
  const text = elements.commentText.value.trim();
  if (!point || !text) {
    elements.commentText.focus({ preventScroll: true });
    return;
  }
  try {
    setPanelStatus(t('status.commentSaving'));
    closeCommentComposer();
    await applyCommands([{
      op: 'comment.add',
      page: point.page,
      x: point.x,
      y: point.y,
      width: 24,
      height: 24,
      text,
      author: 'Reviewer',
      icon: 'Comment',
      color: '#ffd166',
      open: false,
    }]);
    reflectEditMode('select');
    hideEditHint();
    setPanelStatus(t('status.commentSaved'), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}

function clearRedactionRegion() {
  state.redactionDrag = null;
  state.pendingRedaction = null;
  elements.canvasOverlay.querySelector('.direct-region')?.remove();
  elements.redactionConfirm.hidden = true;
}

function showRedactionConfirmation(screenRegion) {
  const viewerRect = elements.pdfViewer.getBoundingClientRect();
  const panelWidth = 286;
  const left = Math.max(8, Math.min(screenRegion.left, elements.pdfViewer.clientWidth - panelWidth - 8));
  const top = Math.max(8, Math.min(screenRegion.top + screenRegion.height + 10, elements.pdfViewer.clientHeight - 142));
  elements.redactionConfirm.style.left = `${left}px`;
  elements.redactionConfirm.style.top = `${top}px`;
  elements.redactionConfirm.hidden = false;
  elements.redactionConfirmApply.focus({ preventScroll: true });
}

function drawRedactionRegion(start, end) {
  const left = Math.min(start.screenX, end.screenX);
  const top = Math.min(start.screenY, end.screenY);
  const width = Math.abs(end.screenX - start.screenX);
  const height = Math.abs(end.screenY - start.screenY);
  let region = elements.canvasOverlay.querySelector('.direct-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'direct-region';
    elements.canvasOverlay.append(region);
  }
  Object.assign(region.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  return { left, top, width, height };
}

async function applyDirectRedaction() {
  const pending = state.pendingRedaction;
  if (!pending) return;
  try {
    setPanelStatus(t('status.redactionApplying'));
    clearRedactionRegion();
    await applyCommands([{
      op: 'redaction.apply',
      page: pending.page,
      regions: [pending.region],
      color: '#000000',
      overlayText: t('directRedaction.overlayText'),
    }]);
    reflectEditMode('select');
    hideEditHint();
    setPanelStatus(t('status.redactionApplied'), 'success');
  } catch (error) {
    clearRedactionRegion();
    setPanelStatus(error.message, 'error');
  }
}

function handleRedactionPointerDown(event) {
  if (state.editMode !== 'redaction' || event.button !== 0) return;
  const point = pagePointAtClient(event.clientX, event.clientY);
  if (!point) return;
  event.preventDefault();
  state.pendingRedaction = null;
  state.redactionDrag = { pointerId: event.pointerId, start: point, current: point };
  elements.canvasOverlay.setPointerCapture?.(event.pointerId);
  drawRedactionRegion(point, point);
}

function handleRedactionPointerMove(event) {
  if (!state.redactionDrag || state.redactionDrag.pointerId !== event.pointerId) return;
  const point = pagePointAtClient(event.clientX, event.clientY);
  if (!point || point.page !== state.redactionDrag.start.page) return;
  state.redactionDrag.current = point;
  drawRedactionRegion(state.redactionDrag.start, point);
}

async function handleRedactionPointerUp(event) {
  if (!state.redactionDrag || state.redactionDrag.pointerId !== event.pointerId) return;
  const drag = state.redactionDrag;
  const point = pagePointAtClient(event.clientX, event.clientY) || drag.current;
  state.redactionDrag = null;
  elements.canvasOverlay.releasePointerCapture?.(event.pointerId);
  if (!point || point.page !== drag.start.page) {
    clearRedactionRegion();
    return;
  }
  const screenRegion = drawRedactionRegion(drag.start, point);
  if (screenRegion.width < 8 || screenRegion.height < 8) {
    clearRedactionRegion();
    return;
  }
  const region = {
    x: Math.min(drag.start.x, point.x),
    y: Math.min(drag.start.y, point.y),
    width: Math.abs(point.x - drag.start.x),
    height: Math.abs(point.y - drag.start.y),
  };
  state.pendingRedaction = { page: drag.start.page, region };
  showRedactionConfirmation(screenRegion);
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

function viewerScroller() {
  const host = elements.pdfViewer.querySelector('embedpdf-container');
  const root = host?.shadowRoot;
  const candidates = [elements.pdfViewer, ...[...(root?.querySelectorAll('*') || [])]];
  return candidates.find((candidate) => {
    const style = getComputedStyle(candidate);
    return candidate.scrollHeight > candidate.clientHeight + 2 && /(auto|scroll)/.test(style.overflowY);
  }) || elements.pdfViewer;
}

function autoScrollDuringDrag(clientY) {
  const scroller = viewerScroller();
  const rect = elements.pdfViewer.getBoundingClientRect();
  const edge = 56;
  const distanceTop = clientY - rect.top;
  const distanceBottom = rect.bottom - clientY;
  let delta = 0;
  if (distanceTop < edge) delta = -Math.ceil((edge - Math.max(0, distanceTop)) * 0.34);
  if (distanceBottom < edge) delta = Math.ceil((edge - Math.max(0, distanceBottom)) * 0.34);
  if (!delta) return 0;
  const previous = scroller.scrollTop;
  scroller.scrollTop += delta;
  return scroller.scrollTop - previous;
}

function beginImageDrag(event, object, hitbox) {
  if (!['select', 'image'].includes(state.editMode) || event.button !== 0 || object.type !== 'image') return;
  event.preventDefault();
  event.stopPropagation();
  selectObject(object);
  const startX = event.clientX;
  const startY = event.clientY;
  const screen = objectScreenRect(object);
  const startMatrix = { ...object.matrix };
  state.objectDrag = { pointerId: event.pointerId, hitbox, startX, startY, autoScrollY: 0 };
  hitbox.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    const autoScrollY = autoScrollDuringDrag(moveEvent.clientY);
    state.objectDrag.autoScrollY += autoScrollY;
    hitbox.style.transform = `translate(${moveEvent.clientX - startX}px, ${moveEvent.clientY - startY + state.objectDrag.autoScrollY}px)`;
    elements.selectionToolbar.hidden = true;
  };
  const finish = async (upEvent) => {
    hitbox.removeEventListener('pointermove', move);
    hitbox.removeEventListener('pointerup', finish);
    hitbox.removeEventListener('pointercancel', cancel);
    hitbox.removeEventListener('lostpointercapture', cancel);
    hitbox.style.transform = '';
    const drag = state.objectDrag;
    state.objectDrag = null;
    if (!screen) return;
    const dx = (upEvent.clientX - startX) / screen.scaleX;
    const dy = (upEvent.clientY - startY + (drag?.autoScrollY || 0)) / screen.scaleY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      positionSelectionToolbar();
      return;
    }
    try {
      setPanelStatus(t('status.imageMoving'));
      await applyCommands([{
        op: 'object.transform',
        page: object.page,
        objectIndex: object.objectIndex,
        objectId: object.id,
        matrix: { ...startMatrix, e: Number(startMatrix.e) + dx, f: Number(startMatrix.f) - dy },
      }], { inspectObject: true });
      setPanelStatus(t('status.imageMoved'), 'success');
    } catch (error) {
      setPanelStatus(error.message, 'error');
    }
  };
  const cancel = () => {
    hitbox.removeEventListener('pointermove', move);
    hitbox.removeEventListener('pointerup', finish);
    hitbox.removeEventListener('pointercancel', cancel);
    hitbox.removeEventListener('lostpointercapture', cancel);
    hitbox.style.transform = '';
    state.objectDrag = null;
    positionSelectionToolbar();
  };
  hitbox.addEventListener('pointermove', move);
  hitbox.addEventListener('pointerup', finish);
  hitbox.addEventListener('pointercancel', cancel);
  hitbox.addEventListener('lostpointercapture', cancel);
}

function renderCanvasObjects() {
  if (state.inlineEditing || state.objectDrag) return;
  state.overlayGeometry = renderedPages().map((page) => (
    `${page.page}:${page.left.toFixed(1)}:${page.top.toFixed(1)}:${page.width.toFixed(1)}:${page.height.toFixed(1)}`
  )).join('|');
  elements.canvasOverlay.replaceChildren();
  if (!state.inventory) return;
  if (['comment', 'redaction'].includes(state.editMode)) return;
  if (state.editMode === 'image' && state.pendingImage) return;
  for (const object of state.inventory.pageObjects || []) {
    if (!['text', 'image'].includes(object.type)) continue;
    if (state.editMode === 'text' && object.type !== 'text') continue;
    if (state.editMode === 'image' && object.type !== 'image') continue;
    const continuation = [...state.textGroups.values()].some((group) => (
      group.page === object.page
      && group.objectIndices.slice(1).includes(object.objectIndex)
    ));
    if (continuation) continue;
    const rect = objectScreenRect(object);
    if (!rect) continue;
    const preview = state.textPreviews.get(`${object.page}:${object.objectIndex}`);
    if (object.type === 'text' && preview) {
      const previewElement = document.createElement('div');
      previewElement.className = 'text-object-preview';
      previewElement.textContent = preview.text;
      Object.assign(previewElement.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${preview.screenWidth}px`,
        minHeight: `${rect.height}px`,
        background: preview.background,
        color: preview.color,
        fontFamily: `"${preview.fontFamily}", sans-serif`,
        fontSize: `${preview.screenFontSize}px`,
        lineHeight: String(preview.lineHeightRatio),
      });
      elements.canvasOverlay.append(previewElement);
    }
    const hitbox = document.createElement('button');
    hitbox.type = 'button';
    hitbox.className = `object-hitbox${state.selected?.id === object.id ? ' is-selected' : ''}`;
    hitbox.dataset.type = object.type;
    hitbox.title = object.type === 'text' ? t('status.textObjectHint') : t('status.imageObjectHint');
    Object.assign(hitbox.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${preview?.screenWidth || rect.width}px`,
      height: `${preview ? Math.max(rect.height, preview.screenHeight) : rect.height}px`,
    });
    hitbox.addEventListener('click', (event) => {
      event.stopPropagation();
      if (object.type === 'text' && state.editMode === 'text') {
        selectObject(object);
        beginInlineTextEdit(object, event);
      } else {
        selectObject(object);
      }
    });
    hitbox.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      if (object.type === 'text' && state.editMode !== 'text') beginInlineTextEdit(object, event);
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

function sampleObjectBackground(object) {
  const rendered = renderedPages().find((page) => page.page === object.page);
  const source = state.inventory?.pages?.find((page) => page.page === object.page);
  const bounds = object.editorBounds;
  if (!rendered?.image || !source || !bounds) return '#ffffff';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = rendered.image.naturalWidth;
    canvas.height = rendered.image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(rendered.image, 0, 0);
    const scaleX = canvas.width / source.width;
    const scaleY = canvas.height / source.height;
    const x1 = bounds.x * scaleX;
    const y1 = bounds.y * scaleY;
    const x2 = (bounds.x + bounds.width) * scaleX;
    const y2 = (bounds.y + bounds.height) * scaleY;
    const insetX = Math.max(2, Math.min(8, (x2 - x1) * 0.08));
    const insetY = Math.max(2, Math.min(8, (y2 - y1) * 0.16));
    const points = [
      [x1 + insetX, y1 - 3], [(x1 + x2) / 2, y1 - 3], [x2 - insetX, y1 - 3],
      [x1 + insetX, y2 + 3], [(x1 + x2) / 2, y2 + 3], [x2 - insetX, y2 + 3],
      [x1 - 3, y1 + insetY], [x1 - 3, (y1 + y2) / 2], [x1 - 3, y2 - insetY],
      [x2 + 3, y1 + insetY], [x2 + 3, (y1 + y2) / 2], [x2 + 3, y2 - insetY],
    ];
    const samples = points.map(([x, y]) => {
      const pixel = context.getImageData(
        Math.max(0, Math.min(canvas.width - 1, Math.round(x))),
        Math.max(0, Math.min(canvas.height - 1, Math.round(y))),
        1,
        1,
      ).data;
      return [pixel[0], pixel[1], pixel[2]];
    });
    const median = (channel) => samples
      .map((sample) => sample[channel])
      .sort((left, right) => left - right)[Math.floor(samples.length / 2)];
    return `rgb(${median(0)} ${median(1)} ${median(2)})`;
  } catch {
    return '#ffffff';
  }
}

function selectedFontLabel(select, fallback = 'Noto Sans KR') {
  return select.selectedOptions[0]?.dataset.family || fallback;
}

function stageTextPreview(object, {
  text = object.text || '',
  color = object.fillColor?.hex || '#172033',
  fontFamily = object.fontFamily || 'Noto Sans KR',
  fontSize,
  screenWidth,
  background,
} = {}) {
  const rect = objectScreenRect(object);
  if (!rect) return;
  const screenFontSize = fontSize
    ? Math.max(7, Number(fontSize) * rect.scaleY)
    : Math.max(9, Math.min(72, rect.height * 0.9));
  const lineHeightRatio = 1.2;
  const width = screenWidth || Math.max(rect.width, state.textPreviews.get(`${object.page}:${object.objectIndex}`)?.screenWidth || 0);
  state.textPreviews.set(`${object.page}:${object.objectIndex}`, {
    text,
    background: background || sampleObjectBackground(object),
    color,
    fontFamily,
    screenFontSize,
    screenWidth: width,
    screenHeight: Math.max(rect.height, String(text).split('\n').length * screenFontSize * lineHeightRatio),
    lineHeightRatio,
  });
}

function wrapTextForWidth(value, editor, maximumWidth) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const style = getComputedStyle(editor);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const fits = (text) => context.measureText(text).width <= maximumWidth;
  const wrapParagraph = (paragraph) => {
    if (!paragraph || fits(paragraph)) return [paragraph];
    const tokens = paragraph.match(/\s+|[^\s]+/gu) || [];
    const lines = [];
    let line = '';
    for (const token of tokens) {
      const candidate = `${line}${token}`;
      if (line && !fits(candidate)) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
      if (!fits(line)) {
        let segment = '';
        for (const character of Array.from(line)) {
          if (segment && !fits(`${segment}${character}`)) {
            lines.push(segment);
            segment = character;
          } else {
            segment += character;
          }
        }
        line = segment;
      }
    }
    lines.push(line.trimEnd());
    return lines;
  };
  return String(value).split(/\r?\n/u).flatMap(wrapParagraph).join('\n');
}

function beginInlineTextEdit(object, pointerEvent) {
  const rect = objectScreenRect(object);
  if (!rect) return;
  const previewKey = `${object.page}:${object.objectIndex}`;
  const existingPreview = state.textPreviews.get(previewKey);
  const existingGroup = state.textGroups.get(previewKey);
  const editingText = existingPreview?.text || existingGroup?.text || object.text || '';
  const renderedPage = renderedPages().find((page) => page.page === object.page);
  const availableWidth = renderedPage
    ? Math.max(100, renderedPage.left + renderedPage.width - rect.left - 18)
    : 480;
  const screenWidth = Math.min(availableWidth, Math.max(180, rect.width + 10));
  const screenFontSize = Math.max(9, Math.min(72, rect.height * 0.9));
  const background = sampleObjectBackground(object);
  state.inlineEditing = true;
  elements.editHint.hidden = true;
  elements.selectionToolbar.hidden = true;
  elements.canvasOverlay.replaceChildren();
  const shell = document.createElement('div');
  shell.className = 'inline-edit-shell';
  shell.style.setProperty('--inline-edit-background', background);
  Object.assign(shell.style, {
    left: `${rect.left - 5}px`,
    top: `${rect.top - 4}px`,
    width: `${screenWidth}px`,
    minHeight: `${Math.max(30, rect.height + 8)}px`,
  });
  const editor = document.createElement('textarea');
  editor.className = 'inline-text-editor';
  editor.value = editingText;
  editor.setAttribute('aria-label', t('inline.editorAria'));
  Object.assign(editor.style, {
    height: `${Math.max(28, rect.height + 6)}px`,
    fontFamily: `"${object.fontFamily || 'Noto Sans KR'}", sans-serif`,
    fontSize: `${screenFontSize}px`,
    color: object.fillColor?.hex || '#172033',
  });
  const actions = document.createElement('div');
  actions.className = `inline-edit-actions${rect.top < 48 ? ' is-below' : ''}`;
  actions.setAttribute('role', 'toolbar');
  actions.setAttribute('aria-label', t('inline.actionsAria'));
  actions.innerHTML = `
    <span class="inline-edit-label"><i class="ti ti-text-size" aria-hidden="true"></i> ${t('inline.editorLabel')}</span>
    <button type="button" class="inline-edit-action inline-edit-cancel" aria-label="${t('inline.cancel')}" title="${t('inline.cancelTitle')}"><i class="ti ti-x" aria-hidden="true"></i></button>
    <button type="button" class="inline-edit-action is-primary inline-edit-save" aria-label="${t('inline.save')}" title="${t('inline.saveTitle')}"><i class="ti ti-check" aria-hidden="true"></i></button>
  `;
  shell.append(editor, actions);
  const resizeEditor = () => {
    editor.style.height = 'auto';
    const height = Math.max(rect.height + 6, Math.min(360, editor.scrollHeight + 2));
    editor.style.height = `${height}px`;
    shell.style.minHeight = `${height + 2}px`;
  };
  editor.addEventListener('input', resizeEditor);
  let completed = false;
  const finish = async (save) => {
    if (completed) return;
    completed = true;
    const rawText = editor.value;
    const text = wrapTextForWidth(rawText, editor, Math.max(40, editor.clientWidth - 10));
    const sourcePage = state.inventory?.pages?.find((page) => page.page === object.page);
    const sourceWidth = sourcePage && renderedPage ? ((screenWidth - 10) / renderedPage.width) * sourcePage.width : object.editorBounds?.width;
    const lineHeightRatio = 1.2;
    const screenHeight = Math.max(rect.height, text.split('\n').length * screenFontSize * lineHeightRatio);
    shell.remove();
    state.inlineEditing = false;
    if (!save || rawText === editingText) {
      renderCanvasObjects();
      return;
    }
    try {
      setPanelStatus(t('status.inlineSaving'));
      state.textPreviews.set(previewKey, {
        text,
        background,
        color: elements.quickFontColor.value || object.fillColor?.hex || '#172033',
        fontFamily: object.fontFamily || 'Noto Sans KR',
        screenFontSize,
        screenWidth,
        screenHeight,
        lineHeightRatio,
      });
      const continuationObjects = (existingGroup?.objectIndices || []).slice(1)
        .map((objectIndex) => state.inventory.pageObjects.find((candidate) => (
          candidate.page === object.page && candidate.objectIndex === objectIndex
        )))
        .filter(Boolean)
        .sort((left, right) => right.objectIndex - left.objectIndex);
      const commands = [{
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
        maxWidth: sourceWidth,
        lineHeight: Number(elements.quickFontSize.value || object.fontSize || 12) * lineHeightRatio,
        removeFollowingObjects: continuationObjects.map((continuation) => ({
          objectIndex: continuation.objectIndex,
          objectId: continuation.id,
        })),
      }];
      await applyCommands(commands, { inspectTargets: [object, ...continuationObjects], syncViewer: false });
      const lineCount = text.split('\n').length;
      if (lineCount > 1) {
        state.textGroups.set(previewKey, {
          page: object.page,
          text,
          objectIndices: Array.from({ length: lineCount }, (_value, index) => object.objectIndex + index),
        });
      } else {
        state.textGroups.delete(previewKey);
      }
      setPanelStatus(t('status.inlineSaved'), 'success');
    } catch (error) {
      state.textPreviews.delete(previewKey);
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
  actions.addEventListener('pointerdown', (event) => event.preventDefault());
  actions.querySelector('.inline-edit-cancel').addEventListener('click', () => finish(false));
  actions.querySelector('.inline-edit-save').addEventListener('click', () => finish(true));
  elements.canvasOverlay.append(shell);
  editor.focus({ preventScroll: true });
  resizeEditor();
  const relativeX = pointerEvent
    ? Math.max(0, Math.min(rect.width, pointerEvent.clientX - elements.pdfViewer.getBoundingClientRect().left - rect.left))
    : rect.width;
  const caret = Math.round((relativeX / Math.max(1, rect.width)) * editor.value.length);
  editor.setSelectionRange(caret, caret);
}

async function inspectSelected() {
  if (!state.selected) throw new Error(t('status.selectObject'));
  return inspectObjects([state.selected]).then((targets) => targets[0]);
}

async function inspectObjects(objects) {
  const inspected = await api(`/pdf/api/documents/${state.sessionId}/target/inspect`, {
    locations: objects.map((object) => ({
      page: object.page,
      objectId: object.id,
      objectIndex: object.objectIndex,
    })),
  });
  return inspected.targets;
}

async function applyCommands(commands, { inspectObject = false, inspectTargets = [], syncViewer = true } = {}) {
  if (!state.sessionId) await beginObjectSession();
  if (inspectTargets.length) {
    await inspectObjects(inspectTargets);
  } else if (inspectObject) {
    await inspectSelected();
  }
  const result = await api(`/pdf/api/documents/${state.sessionId}/commands/apply`, {
    baseRevision: state.revision,
    commands,
  });
  state.revision = result.revision;
  if (syncViewer) {
    await syncEditedPdf();
  } else {
    state.editedBuffer = null;
    markPendingSave(true);
  }
  await refreshInventory();
}

async function saveEditedPdf({ download = true } = {}) {
  if (!state.sessionId) await beginObjectSession();
  const quality = await api(`/pdf/api/documents/${state.sessionId}/quality/check`, { baseRevision: state.revision });
  if (!quality.ok) throw new Error(quality.issues?.map((issue) => issue.message).join(' · ') || t('status.qualityFailed'));
  const saved = await api(`/pdf/api/documents/${state.sessionId}/documents/save-buffer`, {
    baseRevision: state.revision,
    filename: 'academic-edited.pdf',
  });
  state.editedBuffer = base64ToBuffer(saved.bytesBase64);
  markPendingSave(false);
  if (download) {
    const url = URL.createObjectURL(new Blob([state.editedBuffer], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = saved.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return saved;
}

async function syncEditedPdf() {
  const quality = await api(`/pdf/api/documents/${state.sessionId}/quality/check`, { baseRevision: state.revision });
  if (!quality.ok) throw new Error(quality.issues?.map((issue) => issue.message).join(' · ') || t('status.qualityFailed'));
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
  state.textPreviews.clear();
  state.textGroups.clear();
  markPendingSave(false);
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
  const localizedTool = localizeTool(tool);
  elements.advancedToolHelp.textContent = localizedTool.help;
  elements.advancedFields.replaceChildren(...localizedTool.fields.map((definition) => {
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
         option.textContent = definition.optionLabels?.[value] || value;
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
      if (!value) throw new Error(t('error.chooseAttachment'));
      command.bytesBase64 = await fileBase64(value);
      command.mimeType = value.type || 'application/octet-stream';
      if (!values.name) command.name = value.name;
    } else if (key === 'p12File') {
      if (!value) throw new Error(t('error.chooseCertificate'));
      command.p12BytesBase64 = await fileBase64(value);
    } else if (key === 'regions' || key === 'boxes' || key === 'segments') {
      try { command[key] = JSON.parse(value); } catch { throw new Error(t('error.invalidJson', { key })); }
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
    if (!command.sourceBytesBase64) throw new Error(t('error.chooseSourcePdf'));
  }
  return command;
}

function openToolPanel(mode = 'advanced') {
  elements.objectEditor.hidden = false;
  elements.objectEditorButton.setAttribute('aria-expanded', 'true');
  const tab = document.querySelector(`.editor-mode-tab[data-editor-mode="${mode}"]`);
  tab?.click();
}

const quickToolDefinitions = [
  ['ocr.recognize', 'ti-scan'],
  ['text.replaceAll', 'ti-replace'],
  ['watermark.add', 'ti-watermark'],
  ['page.extract', 'ti-files'],
  ['page.resize', 'ti-resize'],
  ['form.addTextField', 'ti-forms'],
  ['metadata.set', 'ti-file-description'],
  ['document.sanitize', 'ti-shield-check'],
];

function renderQuickTools() {
  elements.quickToolGrid.replaceChildren(...quickToolDefinitions.map(([op, icon]) => {
    const tool = advancedTools.find((candidate) => candidate.op === op);
    const localizedTool = localizeTool(tool);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-tool-card';
    button.dataset.tool = op;
    button.setAttribute('aria-label', localizedTool.label);
    button.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i><strong></strong>`;
    button.querySelector('strong').textContent = localizedTool.label;
    button.addEventListener('click', () => {
      const picker = document.querySelector('.advanced-tool-picker');
      if (picker) picker.open = true;
      elements.advancedTool.value = op;
      renderAdvancedTool();
      elements.advancedFields.querySelector('input, textarea, select')?.focus({ preventScroll: true });
    });
    return button;
  }));
}

function setSettingsOpen(open) {
  if (!open && elements.settingsMenu.contains(document.activeElement)) elements.settingsButton.focus({ preventScroll: true });
  elements.settingsMenu.hidden = !open;
  elements.settingsButton.setAttribute('aria-expanded', String(open));
  if (open) elements.languageSelect.focus({ preventScroll: true });
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

async function imageClipboardPayload(object) {
  const rendered = renderedPages().find((page) => page.page === object.page);
  const source = state.inventory?.pages?.find((page) => page.page === object.page);
  const bounds = object.editorBounds;
  if (!rendered?.image || !source || !bounds) throw new Error(t('error.copyImageUnavailable'));
  const scaleX = rendered.image.naturalWidth / source.width;
  const scaleY = rendered.image.naturalHeight / source.height;
  const width = Math.max(1, Math.round(bounds.width * scaleX));
  const height = Math.max(1, Math.round(bounds.height * scaleY));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(rendered.image, Math.round(bounds.x * scaleX), Math.round(bounds.y * scaleY), width, height, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(t('error.copyImageUnavailable'))), 'image/png'));
  return { blob, width: bounds.width, height: bounds.height };
}

async function copySelectedObject() {
  const object = state.selected;
  if (!object) return;
  if (object.type === 'text') {
    state.clipboard = { type: 'text', text: object.text || '', page: object.page, bounds: object.editorBounds, fontFamily: object.fontFamily, fontSize: object.fontSize, color: object.fillColor?.hex };
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(object.text || '').catch(() => {});
  } else if (object.type === 'image') {
    const image = await imageClipboardPayload(object);
    state.clipboard = { type: 'image', page: object.page, bounds: object.editorBounds, ...image };
  } else {
    throw new Error(t('error.copyObjectUnavailable'));
  }
  setPanelStatus(t('status.objectCopied'), 'success');
}

async function pasteCopiedObject() {
  const clipboard = state.clipboard;
  if (!clipboard) return;
  const page = state.selected?.page || clipboard.page;
  const pageInfo = state.inventory?.pages?.find((candidate) => candidate.page === page);
  if (!pageInfo) return;
  const bounds = clipboard.bounds || { x: 48, y: 96, width: 144, height: 24 };
  const x = Math.max(0, Math.min(pageInfo.width - bounds.width, bounds.x + 14));
  const y = Math.max(0, Math.min(pageInfo.height - bounds.height, bounds.y + 14));
  if (clipboard.type === 'text') {
    await applyCommands([{
      op: 'text.add', page, x, y, text: clipboard.text,
      fontFamily: clipboard.fontFamily || 'Noto Sans KR', fontSize: clipboard.fontSize || 12, color: clipboard.color || '#172033',
    }]);
  } else if (clipboard.type === 'image') {
    await applyCommands([{
      op: 'image.add', page, x, y, width: bounds.width, height: bounds.height,
      mimeType: 'image/png', bytesBase64: await fileBase64(clipboard.blob),
    }]);
  }
  setPanelStatus(t('status.objectPasted'), 'success');
}

async function nudgeSelectedImage(deltaX, deltaY) {
  const object = state.selected;
  if (object?.type !== 'image') return;
  await applyCommands([{
    op: 'object.transform', page: object.page, objectIndex: object.objectIndex, objectId: object.id,
    matrix: { ...object.matrix, e: Number(object.matrix.e) + deltaX, f: Number(object.matrix.f) - deltaY },
  }], { inspectObject: true });
  setPanelStatus(t('status.imageMoved'), 'success');
}

elements.objectEditorButton.addEventListener('click', () => {
  setSettingsOpen(false);
  const willOpen = elements.objectEditor.hidden;
  elements.objectEditor.hidden = !willOpen;
  elements.objectEditorButton.setAttribute('aria-expanded', String(willOpen));
});
elements.settingsButton.addEventListener('click', () => setSettingsOpen(elements.settingsMenu.hidden));
elements.closeSettingsButton.addEventListener('click', () => setSettingsOpen(false));
document.addEventListener('click', (event) => {
  if (elements.settingsMenu.hidden) return;
  if (!elements.settingsMenu.contains(event.target) && !elements.settingsButton.contains(event.target)) setSettingsOpen(false);
});
document.addEventListener('keydown', (event) => {
  const editing = isEditableTarget(event.target);
  const modifier = event.ctrlKey || event.metaKey;
  if (event.key === 'Escape') {
    state.modeActivation += 1;
    let handled = false;
    if (!elements.settingsMenu.hidden) {
      setSettingsOpen(false);
      handled = true;
    }
    if (!elements.commentComposer.hidden || state.pendingImage || state.pendingRedaction || state.redactionDrag || elements.canvasOverlay.querySelector('.direct-region')) {
      cancelDirectInteraction({ clearSelection: true });
      reflectEditMode('select');
      renderCanvasObjects();
      handled = true;
    }
    if (state.selected) {
      clearSelection();
      handled = true;
    }
    if (handled) {
      hideEditHint();
      event.preventDefault();
    }
    return;
  }
  if (editing) return;
  if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!elements.savePdfButton.disabled) elements.savePdfButton.click();
    return;
  }
  if (modifier && event.key.toLowerCase() === 'c' && state.selected) {
    event.preventDefault();
    void copySelectedObject().catch((error) => setPanelStatus(error.message, 'error'));
    return;
  }
  if (modifier && event.key.toLowerCase() === 'x' && state.selected) {
    event.preventDefault();
    const selected = state.selected;
    void copySelectedObject().then(() => deleteSelectedObject(selected)).catch((error) => setPanelStatus(error.message, 'error'));
    return;
  }
  if (modifier && event.key.toLowerCase() === 'v' && state.clipboard) {
    event.preventDefault();
    void pasteCopiedObject().catch((error) => setPanelStatus(error.message, 'error'));
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
    event.preventDefault();
    void deleteSelectedObject(state.selected);
    return;
  }
  const nudge = event.shiftKey ? 10 : 1;
  const offsets = { ArrowLeft: [-nudge, 0], ArrowRight: [nudge, 0], ArrowUp: [0, -nudge], ArrowDown: [0, nudge] };
  if (offsets[event.key] && state.selected?.type === 'image') {
    event.preventDefault();
    void nudgeSelectedImage(...offsets[event.key]).catch((error) => setPanelStatus(error.message, 'error'));
  }
});
elements.languageSelect.addEventListener('change', () => {
  setLocale(elements.languageSelect.value);
  applyTranslations();
  renderAdvancedToolOptions();
  renderQuickTools();
  renderAdvancedTool();
  renderObjectList();
  reflectEditMode(state.editMode);
  if (state.sessionId && !elements.editHint.hidden) showEditHint(t(modeHintKey(state.editMode)), elements.editHint.dataset.state || 'ready');
  if (state.inventory) {
    elements.objectCount.textContent = t('objects.count', { pageCount: state.inventory.pageObjectCount, textCount: state.inventory.textObjectCount });
    elements.fontCount.textContent = t('fonts.count', { count: state.inventory.fonts.length });
    setPanelStatus(t('status.toolsReady'), 'success');
  }
});
elements.closeObjectEditor.addEventListener('click', () => {
  elements.objectEditor.hidden = true;
  elements.objectEditorButton.setAttribute('aria-expanded', 'false');
});
elements.loadObjectsButton.addEventListener('click', () => beginObjectSession().catch((error) => setPanelStatus(error.message, 'error')));
elements.editPdfButton.addEventListener('click', async () => {
  try {
    await activateEditMode('text');
    setPanelStatus(t('status.pageTextHint'), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
    showEditHint(error.message, 'error');
    openToolPanel('advanced');
  }
});
elements.closeReportDialog.addEventListener('click', () => elements.reportDialog.close());
elements.savePdfButton.addEventListener('click', async () => {
  try {
    elements.savePdfButton.disabled = true;
    setPanelStatus(t('status.saving'));
    await saveEditedPdf({ download: true });
    setPanelStatus(t('status.saved'), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  } finally {
    elements.savePdfButton.disabled = !state.sessionId;
  }
});
elements.qualityAuditButton.addEventListener('click', async () => {
  setSettingsOpen(false);
  try {
    if (!state.sessionId) await beginObjectSession();
    const quality = await api(`/pdf/api/documents/${state.sessionId}/quality/check`, { baseRevision: state.revision });
    showReport(
      t('report.quality'),
      t('report.qualitySummary', { pages: quality.pageCount, issues: quality.issues?.length || 0 }),
      issueList(quality),
    );
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});
elements.compareButton.addEventListener('click', async () => {
  setSettingsOpen(false);
  try {
    if (!state.sessionId) await beginObjectSession();
    const comparison = await api(`/pdf/api/documents/${state.sessionId}/quality/render-compare`, {
      baseRevision: state.revision,
      pages: [1],
    });
    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    for (const [labelKey, rendered] of [['report.original', comparison.baseline], ['report.current', comparison.current]]) {
      const label = t(labelKey);
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = t('report.page', { label });
      const image = document.createElement('img');
      const page = rendered.pages[0];
      image.alt = t('report.pageAlt', { label });
      image.src = `data:${page.mimeType};base64,${page.bytesBase64}`;
      figure.append(caption, image);
      grid.append(figure);
    }
    showReport(t('report.compare'), t('report.compareSummary'), grid);
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});
elements.refreshObjectsButton.addEventListener('click', () => refreshInventory().catch((error) => setPanelStatus(error.message, 'error')));
elements.objectSearch.addEventListener('input', renderObjectList);

document.querySelectorAll('[data-edit-mode]').forEach((button) => button.addEventListener('click', async () => {
  try {
    await activateEditMode(button.dataset.editMode);
  } catch (error) {
    setPanelStatus(error.message, 'error');
    showEditHint(error.message, 'error');
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

elements.commentSave.addEventListener('click', () => saveDirectComment());
elements.commentCancel.addEventListener('click', closeCommentComposer);
elements.commentCancelButton.addEventListener('click', closeCommentComposer);
elements.commentText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    saveDirectComment();
  }
});
elements.redactionConfirmApply.addEventListener('click', () => { void applyDirectRedaction(); });
elements.redactionConfirmCancel.addEventListener('click', clearRedactionRegion);
elements.redactionConfirmCancelButton.addEventListener('click', clearRedactionRegion);

elements.canvasOverlay.addEventListener('pointerdown', handleRedactionPointerDown);
elements.canvasOverlay.addEventListener('pointermove', handleRedactionPointerMove);
elements.canvasOverlay.addEventListener('pointerup', (event) => handleRedactionPointerUp(event));
elements.canvasOverlay.addEventListener('click', (event) => {
  if (state.editMode === 'image' && state.pendingImage && event.target === elements.canvasOverlay) {
    const point = pagePointAtClient(event.clientX, event.clientY);
    if (point) {
      event.preventDefault();
      void placePendingImage(point);
    }
    return;
  }
  if (state.editMode === 'comment' && event.target === elements.canvasOverlay) {
    const point = pagePointAtClient(event.clientX, event.clientY);
    if (point) {
      event.preventDefault();
      showCommentComposer(point);
    }
    return;
  }
  if (event.target === elements.canvasOverlay && state.editMode !== 'redaction') clearSelection();
});

elements.pdfViewer.addEventListener('pointerdown', (event) => {
  if (['comment', 'redaction'].includes(state.editMode)) return;
  const path = event.composedPath();
  if (path.includes(elements.canvasOverlay) || path.includes(elements.selectionToolbar) || path.includes(elements.commentComposer)) return;
  clearSelection();
}, true);

async function applyQuickTextStyle() {
  if (state.selected?.type !== 'text') return;
  const object = state.selected;
  const previewKey = `${object.page}:${object.objectIndex}`;
  try {
    setPanelStatus(t('status.textStyleApplying'));
    stageTextPreview(object, {
      fontFamily: selectedFontLabel(elements.quickFontFamily, object.fontFamily),
      fontSize: Number(elements.quickFontSize.value),
      color: elements.quickFontColor.value,
    });
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
    }], { inspectObject: true, syncViewer: false });
    setPanelStatus(t('status.textStyleApplied'), 'success');
  } catch (error) {
    state.textPreviews.delete(previewKey);
    setPanelStatus(error.message, 'error');
    renderCanvasObjects();
  }
}

elements.quickFontFamily.addEventListener('change', applyQuickTextStyle);
elements.quickFontSize.addEventListener('change', applyQuickTextStyle);
elements.quickFontColor.addEventListener('change', applyQuickTextStyle);
elements.openPropertiesButton.addEventListener('click', () => openToolPanel('objects'));
elements.deleteSelectedButton.addEventListener('click', () => document.querySelector('[data-delete-object]')?.click());
elements.imageChooseButton.addEventListener('click', () => {
  state.imageFilePurpose = 'insert';
  elements.quickImageFile.click();
});
elements.replaceImageButton.addEventListener('click', () => {
  state.imageFilePurpose = 'replace';
  elements.quickImageFile.click();
});
elements.quickImageFile.addEventListener('change', async () => {
  const file = elements.quickImageFile.files[0];
  const purpose = state.imageFilePurpose;
  state.imageFilePurpose = null;
  if (!file) return;
  if (purpose === 'insert') {
    state.pendingImage = file;
    elements.canvasOverlay.dataset.imagePlacement = 'true';
    renderCanvasObjects();
    showEditHint(t('directImage.placeHint'));
    setPanelStatus(t('status.imagePreparing'));
    elements.quickImageFile.value = '';
    return;
  }
  if (purpose !== 'replace' || state.selected?.type !== 'image') {
    elements.quickImageFile.value = '';
    return;
  }
  const object = state.selected;
  try {
    setPanelStatus(t('status.imageReplacing'));
    await applyCommands([{
      op: 'image.replaceObject',
      page: object.page,
      objectIndex: object.objectIndex,
      objectId: object.id,
      mimeType: file.type,
      bytesBase64: await fileBase64(file),
    }], { inspectObject: true });
    setPanelStatus(t('status.imageReplaced'), 'success');
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
  const object = state.selected;
  const previewKey = `${object.page}:${object.objectIndex}`;
  try {
    setPanelStatus(t('status.textEmbedding'));
    stageTextPreview(object, {
      text: elements.textValue.value,
      fontFamily: selectedFontLabel(elements.fontFamily, object.fontFamily),
      fontSize: Number(elements.fontSize.value),
      color: elements.fontColor.value,
    });
    await applyCommands([{
      op: 'text.replaceObject',
      page: object.page,
      objectIndex: object.objectIndex,
      objectId: object.id,
      expectedText: object.text,
      text: elements.textValue.value,
      fontFamily: elements.fontFamily.value,
      fontSize: Number(elements.fontSize.value),
      color: elements.fontColor.value,
      opacity: Number(elements.fontOpacity.value),
      lineHeight: Number(elements.fontSize.value) * 1.2,
    }], { inspectObject: true, syncViewer: false });
    setPanelStatus(t('status.inlineSaved'), 'success');
  } catch (error) {
    state.textPreviews.delete(previewKey);
    setPanelStatus(error.message, 'error');
    renderCanvasObjects();
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
    if (!commands.length) throw new Error(t('error.imageChange'));
    setPanelStatus(t('status.imageEditing'));
    await applyCommands(commands, { inspectObject: true });
    setPanelStatus(t('status.imageEdited'), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
});

async function deleteSelectedObject(selected) {
  try {
    setPanelStatus(t('status.objectDeleting'));
    await applyCommands([{
      op: 'object.delete',
      page: selected.page,
      objectIndex: selected.objectIndex,
      objectId: selected.id,
    }], { inspectObject: true });
    state.selected = null;
    elements.textEditorForm.hidden = true;
    elements.imageEditorForm.hidden = true;
    elements.genericEditor.hidden = true;
    setPanelStatus(t('status.objectDeleted'), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}

function requestDeleteSelectedObject() {
  const selected = state.selected;
  if (!selected) return;
  showAdvancedConfirmation({ message: t('confirm.deleteObject'), action: () => deleteSelectedObject(selected) });
}

document.querySelectorAll('[data-delete-object]').forEach((button) => button.addEventListener('click', requestDeleteSelectedObject));

function renderAdvancedToolOptions() {
  const selectedValue = elements.advancedTool.value || advancedTools[0]?.op;
  elements.advancedTool.replaceChildren(...advancedTools.map((tool) => {
    const localizedTool = localizeTool(tool);
    const option = document.createElement('option');
    option.value = tool.op;
    option.textContent = localizedTool.label;
    return option;
  }));
  if (advancedTools.some((tool) => tool.op === selectedValue)) elements.advancedTool.value = selectedValue;
}

renderAdvancedToolOptions();
renderQuickTools();
elements.advancedTool.addEventListener('change', renderAdvancedTool);
renderAdvancedTool();

async function applyAdvancedTool(rawTool) {
  const tool = localizeTool(rawTool);
  try {
    setPanelStatus(t('status.toolApplying', { label: tool.label }));
    const command = await buildAdvancedCommand(tool, new FormData(elements.advancedToolForm));
    await applyCommands([command]);
    setPanelStatus(t('status.toolApplied', { label: tool.label }), 'success');
  } catch (error) {
    setPanelStatus(error.message, 'error');
  }
}

elements.advancedToolForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const rawTool = advancedTools.find((candidate) => candidate.op === elements.advancedTool.value);
  if (!rawTool) return;
  if (rawTool.danger) {
    showAdvancedConfirmation({ tool: rawTool, action: () => applyAdvancedTool(rawTool) });
    return;
  }
  void applyAdvancedTool(rawTool);
});

elements.advancedConfirmApply.addEventListener('click', () => {
  const action = state.pendingConfirmationAction;
  closeAdvancedConfirmation();
  if (action) void action();
});
elements.advancedConfirmCancel.addEventListener('click', closeAdvancedConfirmation);
elements.advancedConfirmCancelButton.addEventListener('click', closeAdvancedConfirmation);
elements.advancedConfirm.addEventListener('close', () => {
  state.pendingAdvancedTool = null;
  state.pendingConfirmationAction = null;
});

try {
  const viewer = EmbedPDF.init({
    type: 'container',
    target: elements.pdfViewer,
    worker: true,
    // This editor is embedded by a host application. The host supplies documents
    // through the generic postMessage bridge, so EmbedPDF's local "Open document"
    // tab is intentionally not exposed.
    tabBar: 'never',
    annotations: { annotationAuthor: 'tlooto PDF', selectAfterCreate: true },
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
    markEditorBridgeReady();
    state.documentManager?.onDocumentOpened((documentState) => {
      if (state.reopening) {
        elements.runtimeStatus.textContent = t('status.textClick', { name: documentState.name || 'PDF' });
        return;
      }
      elements.runtimeStatus.textContent = t('status.bodyPreparing', { name: documentState.name || 'PDF' });
      state.documentGeneration += 1;
      state.modeActivation += 1;
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
        sessionPromise: null,
        pendingComment: null,
        pendingImage: null,
        imageFilePurpose: null,
        pendingRedaction: null,
        redactionDrag: null,
        objectDrag: null,
        clipboard: null,
      });
      cancelDirectInteraction();
      state.textPreviews.clear();
      state.textGroups.clear();
      markPendingSave(false);
      elements.editorEmpty.hidden = false;
      elements.editorBody.hidden = true;
      reflectEditMode('text');
      queueMicrotask(() => {
        activateEditMode('text').then(() => {
          elements.runtimeStatus.textContent = t('status.textClick', { name: documentState.name || 'PDF' });
          setPanelStatus(t('status.bodyReady'), 'success');
        }).catch((error) => {
          elements.editPdfButton.classList.remove('is-loading');
          elements.editHint.hidden = true;
          elements.runtimeStatus.textContent = t('status.bodyFailed', { name: documentState.name || 'PDF' });
          setPanelStatus(error.message, 'error');
        });
      });
    });
    state.documentManager?.onDocumentClosed(() => {
      if (!state.reopening) {
        state.documentGeneration += 1;
        state.modeActivation += 1;
        const closedSessionId = state.sessionId;
        const closedRevision = state.revision;
        if (closedSessionId && closedRevision) {
          api(`/pdf/api/documents/${closedSessionId}/documents/discard`, { baseRevision: closedRevision }).catch(() => {});
        }
        state.sessionPromise = null;
        state.sessionId = null;
        state.revision = null;
        state.inventory = null;
        state.catalog = null;
        state.selected = null;
        state.editedBuffer = null;
        state.pendingComment = null;
        state.pendingImage = null;
        state.imageFilePurpose = null;
        state.pendingRedaction = null;
        state.redactionDrag = null;
        state.objectDrag = null;
        state.clipboard = null;
        state.textPreviews.clear();
        state.textGroups.clear();
        markPendingSave(false);
        elements.canvasOverlay.replaceChildren();
        elements.selectionToolbar.hidden = true;
        cancelDirectInteraction();
        hideEditHint();
        elements.editPdfButton.classList.remove('is-active', 'is-loading');
        elements.editPdfButton.setAttribute('aria-pressed', 'false');
        elements.runtimeStatus.textContent = t('status.engineReady');
      }
    });
    state.documentManager?.onDocumentError((event) => {
      elements.runtimeStatus.textContent = t('status.openFailed', { message: event?.message || t('status.unknownError') });
    });
    elements.runtimeStatus.textContent = t('status.engineReady');
  }).catch(failBoot);

  window.academicPdfEditor = Object.freeze({ engine: 'PDFium', version: '2.14.4', viewer, registry: viewer.registry });
} catch (error) {
  failBoot(error);
}

// Public embedding contract. A host can inject a file as bytes and retrieve the
// current PDF without this editor knowing anything about that host's API or storage.
window.addEventListener('message', async (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || message.type !== 'rhwp-request' || !message.method) return;
  try {
    await editorBridgeReady;
    if (message.method === 'ready') {
      replyToEditorHost(event, message.id, true);
      return;
    }
    if (message.method === 'loadFile') {
      await loadDocumentFromHost(message.params);
      replyToEditorHost(event, message.id, true);
      return;
    }
    if (message.method === 'exportPdf') {
      const buffer = state.sessionId ? (await saveEditedPdf({ download: false }), await currentBuffer()) : await currentBuffer();
      replyToEditorHost(event, message.id, Array.from(new Uint8Array(buffer)));
      return;
    }
    replyToEditorHost(event, message.id, undefined, `Unknown method: ${message.method}`);
  } catch (error) {
    replyToEditorHost(event, message.id, undefined, error instanceof Error ? error.message : String(error));
  }
});
