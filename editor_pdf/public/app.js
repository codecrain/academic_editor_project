import * as pdfjsLib from './vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';

const { PDFDocument, StandardFonts, degrees, rgb } = globalThis.PDFLib;
const elements = Object.fromEntries([
  'documentName', 'saveState', 'openButton', 'emptyOpenButton', 'pdfFileInput', 'imageFileInput',
  'saveButton', 'undoButton', 'rotateButton', 'pageSidebar', 'thumbnailList', 'emptyState',
  'canvasScroller', 'pageShell', 'pdfCanvas', 'overlayCanvas', 'textEditor', 'previousPage',
  'nextPage', 'pageNumber', 'pageCount', 'statusMessage', 'zoomOut', 'zoomIn', 'zoomValue',
  'toolColor', 'toolSize', 'toolSizeValue', 'activeToolLabel', 'activeToolHelp', 'signatureButton',
  'signatureDialog', 'signatureCanvas', 'clearSignature', 'useSignature', 'imageButton',
].map((id) => [id, document.getElementById(id)]));

const toolMeta = {
  select: ['선택', '페이지를 확인하거나 다른 편집 도구를 선택하세요.'],
  text: ['텍스트', '페이지를 클릭하고 텍스트를 입력하세요. Ctrl+Enter로 확정합니다.'],
  highlight: ['형광펜', '강조할 영역을 드래그하세요.'],
  draw: ['그리기', '페이지 위를 드래그해 자유롭게 그리세요.'],
  'place-image': ['이미지 놓기', '페이지에서 이미지나 서명을 놓을 위치를 클릭하세요.'],
};

const state = {
  originalBytes: null,
  pdf: null,
  loadingTask: null,
  filename: 'edited.pdf',
  page: 1,
  zoom: 1,
  tool: 'select',
  changes: [],
  rotations: new Map(),
  drag: null,
  pendingImage: null,
  renderToken: 0,
  pageRotation: 0,
};

function setStatus(message, stateLabel = '') {
  elements.statusMessage.textContent = message;
  if (stateLabel) elements.saveState.textContent = stateLabel;
}

function setTool(tool) {
  state.tool = tool;
  elements.pageShell.dataset.tool = tool;
  document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
  const [label, help] = toolMeta[tool] || toolMeta.select;
  elements.activeToolLabel.textContent = label;
  elements.activeToolHelp.textContent = help;
}

function updateControls() {
  const ready = Boolean(state.pdf);
  const dirty = state.changes.length > 0 || state.rotations.size > 0;
  elements.saveButton.disabled = !ready;
  elements.undoButton.disabled = !dirty;
  elements.rotateButton.disabled = !ready;
  elements.previousPage.disabled = !ready || state.page <= 1;
  elements.nextPage.disabled = !ready || state.page >= (state.pdf?.numPages || 0);
  elements.pageNumber.disabled = !ready;
  elements.zoomOut.disabled = !ready || state.zoom <= .5;
  elements.zoomIn.disabled = !ready || state.zoom >= 2.5;
  elements.pageNumber.value = state.page;
  elements.pageNumber.max = state.pdf?.numPages || 1;
  elements.pageCount.textContent = state.pdf?.numPages || 0;
  elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  if (ready) elements.saveState.textContent = dirty ? `저장되지 않은 변경 ${state.changes.length + state.rotations.size}개` : '변경 없음';
}

function pageChanges(pageNumber = state.page) {
  return state.changes.filter((change) => change.page === pageNumber);
}

function drawOverlay(preview = null) {
  const canvas = elements.overlayCanvas;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  const items = preview ? [...pageChanges(), preview] : pageChanges();
  for (const item of items) {
    const scale = state.zoom;
    context.save();
    if (item.type === 'text') {
      context.font = `${item.fontSize * scale}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
      context.fillStyle = item.color;
      context.textBaseline = 'top';
      String(item.text).split(/\r?\n/).forEach((line, index) => context.fillText(line, item.x * scale, (item.y + index * item.fontSize * 1.32) * scale));
    } else if (item.type === 'highlight') {
      context.globalAlpha = item.opacity;
      context.fillStyle = item.color;
      context.fillRect(item.x * scale, item.y * scale, item.width * scale, item.height * scale);
    } else if (item.type === 'ink') {
      context.strokeStyle = item.color;
      context.lineWidth = item.thickness * scale;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      item.points.forEach((point, index) => index ? context.lineTo(point.x * scale, point.y * scale) : context.moveTo(point.x * scale, point.y * scale));
      context.stroke();
    } else if (item.type === 'image' && item.image) {
      context.drawImage(item.image, item.x * scale, item.y * scale, item.width * scale, item.height * scale);
      context.strokeStyle = '#2762e9';
      context.setLineDash([5, 4]);
      context.strokeRect(item.x * scale, item.y * scale, item.width * scale, item.height * scale);
    }
    context.restore();
  }
}

async function renderCurrentPage() {
  if (!state.pdf) return;
  const token = ++state.renderToken;
  setStatus(`페이지 ${state.page} 렌더링 중...`);
  const page = await state.pdf.getPage(state.page);
  const extraRotation = state.rotations.get(state.page) || 0;
  const viewport = page.getViewport({ scale: state.zoom, rotation: (page.rotate + extraRotation) % 360 });
  state.pageRotation = (page.rotate + extraRotation) % 360;
  if (token !== state.renderToken) return;
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = elements.pdfCanvas;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport, transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0] }).promise;
  if (token !== state.renderToken) return;
  elements.overlayCanvas.width = Math.floor(viewport.width);
  elements.overlayCanvas.height = Math.floor(viewport.height);
  elements.overlayCanvas.style.width = `${Math.floor(viewport.width)}px`;
  elements.overlayCanvas.style.height = `${Math.floor(viewport.height)}px`;
  drawOverlay();
  document.querySelectorAll('.thumbnail-item').forEach((item) => item.classList.toggle('active', Number(item.dataset.page) === state.page));
  updateControls();
  setStatus(`페이지 ${state.page} / ${state.pdf.numPages}`);
}

async function renderThumbnails() {
  elements.thumbnailList.replaceChildren();
  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumbnail-item';
    button.dataset.page = String(pageNumber);
    const canvas = document.createElement('canvas');
    const label = document.createElement('span');
    label.textContent = String(pageNumber);
    button.append(canvas, label);
    button.addEventListener('click', () => { state.page = pageNumber; renderCurrentPage(); });
    elements.thumbnailList.append(button);
    const page = await state.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: .18 });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
}

async function loadPdfBytes(bytes, filename, { preserveChanges = false } = {}) {
  if (state.loadingTask) await state.loadingTask.destroy();
  state.originalBytes = new Uint8Array(bytes);
  state.loadingTask = pdfjsLib.getDocument({ data: state.originalBytes.slice(), isEvalSupported: false });
  state.pdf = await state.loadingTask.promise;
  state.filename = filename.replace(/\.pdf$/i, '') + '.pdf';
  state.page = 1;
  state.zoom = 1;
  if (!preserveChanges) {
    state.changes = [];
    state.rotations.clear();
  }
  elements.documentName.textContent = state.filename;
  elements.emptyState.classList.add('hidden');
  elements.canvasScroller.classList.remove('hidden');
  await renderCurrentPage();
  renderThumbnails().catch((error) => setStatus(`미리보기 오류: ${error.message}`));
}

async function openFile(file) {
  if (!file) return;
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('PDF 파일만 열 수 있습니다.', '열기 실패');
    return;
  }
  try {
    setStatus('PDF를 여는 중...', '불러오는 중');
    await loadPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    setStatus(`PDF 열기 실패: ${error.message}`, '열기 실패');
  }
}

function canvasPoint(event) {
  const rect = elements.overlayCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / state.zoom, y: (event.clientY - rect.top) / state.zoom };
}

function addChange(change) {
  state.changes.push({ ...change, page: state.page });
  drawOverlay();
  updateControls();
}

function beginText(point) {
  const editor = elements.textEditor;
  editor.value = '';
  editor.style.left = `${point.x * state.zoom}px`;
  editor.style.top = `${point.y * state.zoom}px`;
  editor.style.fontSize = `${Number(elements.toolSize.value) * state.zoom}px`;
  editor.classList.remove('hidden');
  editor.dataset.x = String(point.x);
  editor.dataset.y = String(point.y);
  editor.focus();
}

function commitText() {
  const editor = elements.textEditor;
  if (editor.classList.contains('hidden')) return;
  const text = editor.value.trim();
  if (text) addChange({ type: 'text', x: Number(editor.dataset.x), y: Number(editor.dataset.y), text, fontSize: Number(elements.toolSize.value), color: elements.toolColor.value });
  editor.classList.add('hidden');
}

elements.overlayCanvas.addEventListener('pointerdown', (event) => {
  if (!state.pdf) return;
  if (state.pageRotation !== 0 && state.tool !== 'select') {
    setStatus('회전된 페이지의 좌표 편집은 안전을 위해 아직 차단되어 있습니다. 먼저 회전을 되돌려 주세요.', '편집 차단');
    return;
  }
  const point = canvasPoint(event);
  if (state.tool === 'text') {
    commitText();
    beginText(point);
    return;
  }
  if (state.tool === 'place-image' && state.pendingImage) {
    const width = Math.min(180, state.pendingImage.naturalWidth || 180);
    const ratio = (state.pendingImage.naturalHeight || 80) / (state.pendingImage.naturalWidth || 180);
    addChange({ type: 'image', x: point.x, y: point.y, width, height: width * ratio, dataUrl: state.pendingImage.src, image: state.pendingImage, signature: state.pendingImage.signature });
    state.pendingImage = null;
    setTool('select');
    setStatus('이미지를 배치했습니다.', '저장되지 않음');
    return;
  }
  if (!['highlight', 'draw'].includes(state.tool)) return;
  elements.overlayCanvas.setPointerCapture(event.pointerId);
  state.drag = state.tool === 'draw'
    ? { type: 'ink', points: [point], color: elements.toolColor.value, thickness: Math.max(1, Number(elements.toolSize.value) / 5) }
    : { type: 'highlight', x: point.x, y: point.y, width: 0, height: 0, color: elements.toolColor.value === '#172033' ? '#ffe066' : elements.toolColor.value, opacity: .42, origin: point };
});

elements.overlayCanvas.addEventListener('pointermove', (event) => {
  if (!state.drag) return;
  const point = canvasPoint(event);
  if (state.drag.type === 'ink') state.drag.points.push(point);
  else {
    state.drag.x = Math.min(state.drag.origin.x, point.x);
    state.drag.y = Math.min(state.drag.origin.y, point.y);
    state.drag.width = Math.abs(point.x - state.drag.origin.x);
    state.drag.height = Math.abs(point.y - state.drag.origin.y);
  }
  drawOverlay(state.drag);
});

elements.overlayCanvas.addEventListener('pointerup', () => {
  if (!state.drag) return;
  const change = state.drag;
  delete change.origin;
  state.drag = null;
  if ((change.type === 'ink' && change.points.length > 1) || (change.type === 'highlight' && change.width > 2 && change.height > 2)) addChange(change);
  else drawOverlay();
});

elements.textEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitText(); }
  if (event.key === 'Escape') { elements.textEditor.classList.add('hidden'); }
});
elements.textEditor.addEventListener('blur', commitText);

function dataUrlBytes(dataUrl) {
  const [header, payload] = dataUrl.split(',');
  return { mimeType: header.match(/^data:([^;]+)/)?.[1] || 'image/png', bytes: Uint8Array.from(atob(payload), (character) => character.charCodeAt(0)) };
}

async function rasterizeText(change) {
  const scale = 2;
  const lines = change.text.split(/\r?\n/);
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${change.fontSize * scale}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  const width = Math.max(...lines.map((line) => probe.measureText(line || ' ').width), 2);
  const lineHeight = change.fontSize * 1.32;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width + 8);
  canvas.height = Math.ceil(lineHeight * lines.length * scale + 4);
  const context = canvas.getContext('2d');
  context.font = `${change.fontSize * scale}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  context.textBaseline = 'top';
  context.fillStyle = change.color;
  lines.forEach((line, index) => context.fillText(line, 2, index * lineHeight * scale));
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width / scale, height: canvas.height / scale };
}

function colorFromHex(hex) {
  const value = hex.replace('#', '');
  return rgb(Number.parseInt(value.slice(0, 2), 16) / 255, Number.parseInt(value.slice(2, 4), 16) / 255, Number.parseInt(value.slice(4, 6), 16) / 255);
}

async function buildEditedPdf() {
  const doc = await PDFDocument.load(state.originalBytes.slice(), { updateMetadata: false });
  const pages = doc.getPages();
  let helvetica;
  for (const change of state.changes) {
    const page = pages[change.page - 1];
    const pageHeight = page.getHeight();
    if (change.type === 'text') {
      if (/^[\x00-\xff]*$/.test(change.text)) {
        helvetica ||= await doc.embedFont(StandardFonts.Helvetica);
        page.drawText(change.text, { x: change.x, y: pageHeight - change.y - change.fontSize, size: change.fontSize, font: helvetica, color: colorFromHex(change.color), lineHeight: change.fontSize * 1.32 });
      } else {
        const raster = await rasterizeText(change);
        const embedded = await doc.embedPng(dataUrlBytes(raster.dataUrl).bytes);
        page.drawImage(embedded, { x: change.x, y: pageHeight - change.y - raster.height, width: raster.width, height: raster.height });
      }
    } else if (change.type === 'highlight') {
      page.drawRectangle({ x: change.x, y: pageHeight - change.y - change.height, width: change.width, height: change.height, color: colorFromHex(change.color), opacity: change.opacity, borderWidth: 0 });
    } else if (change.type === 'ink') {
      for (let index = 1; index < change.points.length; index += 1) {
        const from = change.points[index - 1];
        const to = change.points[index];
        page.drawLine({ start: { x: from.x, y: pageHeight - from.y }, end: { x: to.x, y: pageHeight - to.y }, color: colorFromHex(change.color), thickness: change.thickness });
      }
    } else if (change.type === 'image') {
      const source = dataUrlBytes(change.dataUrl);
      const embedded = source.mimeType === 'image/jpeg' ? await doc.embedJpg(source.bytes) : await doc.embedPng(source.bytes);
      page.drawImage(embedded, { x: change.x, y: pageHeight - change.y - change.height, width: change.width, height: change.height });
    }
  }
  for (const [pageNumber, rotation] of state.rotations) {
    const page = pages[pageNumber - 1];
    page.setRotation(degrees(((page.getRotation().angle + rotation) % 360 + 360) % 360));
  }
  return new Uint8Array(await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
}

async function savePdf() {
  if (!state.pdf) return;
  try {
    commitText();
    setStatus('PDF를 저장하고 재검사하는 중...', '저장 중');
    const bytes = await buildEditedPdf();
    const verifyTask = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
    const verify = await verifyTask.promise;
    const verifiedPages = verify.numPages;
    await verifyTask.destroy();
    if (verifiedPages !== state.pdf.numPages) throw new Error('저장 후 페이지 수가 달라졌습니다.');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.filename.replace(/\.pdf$/i, '') + '-edited.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await loadPdfBytes(bytes, link.download);
    setStatus(`저장·재열기 검증 완료 (${verifiedPages}페이지)`, '저장 완료');
  } catch (error) {
    setStatus(`저장 실패: ${error.message}`, '저장 실패');
  }
}

function loadPendingImage(file, signature = false) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      image.signature = signature;
      state.pendingImage = image;
      setTool('place-image');
      setStatus(signature ? '서명을 놓을 위치를 클릭하세요.' : '이미지를 놓을 위치를 클릭하세요.');
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

let signatureDrawing = false;
let signatureLastPoint = null;
function signaturePoint(event) {
  const rect = elements.signatureCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * elements.signatureCanvas.width / rect.width, y: (event.clientY - rect.top) * elements.signatureCanvas.height / rect.height };
}
elements.signatureCanvas.addEventListener('pointerdown', (event) => { signatureDrawing = true; signatureLastPoint = signaturePoint(event); elements.signatureCanvas.setPointerCapture(event.pointerId); });
elements.signatureCanvas.addEventListener('pointermove', (event) => {
  if (!signatureDrawing) return;
  const point = signaturePoint(event);
  const context = elements.signatureCanvas.getContext('2d');
  context.strokeStyle = elements.toolColor.value;
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(signatureLastPoint.x, signatureLastPoint.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  signatureLastPoint = point;
});
elements.signatureCanvas.addEventListener('pointerup', () => { signatureDrawing = false; });
elements.clearSignature.addEventListener('click', () => elements.signatureCanvas.getContext('2d').clearRect(0, 0, elements.signatureCanvas.width, elements.signatureCanvas.height));
elements.useSignature.addEventListener('click', () => {
  const image = new Image();
  image.onload = () => { image.signature = true; state.pendingImage = image; setTool('place-image'); setStatus('서명을 놓을 위치를 클릭하세요.'); };
  image.src = elements.signatureCanvas.toDataURL('image/png');
  elements.signatureDialog.close();
});

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
elements.openButton.addEventListener('click', () => elements.pdfFileInput.click());
elements.emptyOpenButton.addEventListener('click', () => elements.pdfFileInput.click());
elements.pdfFileInput.addEventListener('change', () => openFile(elements.pdfFileInput.files[0]));
elements.imageButton.addEventListener('click', () => { if (state.pdf) elements.imageFileInput.click(); });
elements.imageFileInput.addEventListener('change', () => loadPendingImage(elements.imageFileInput.files[0]));
elements.signatureButton.addEventListener('click', () => { if (state.pdf) { elements.clearSignature.click(); elements.signatureDialog.showModal(); } });
elements.saveButton.addEventListener('click', savePdf);
elements.undoButton.addEventListener('click', () => {
  if (state.changes.length) state.changes.pop();
  else if (state.rotations.size) state.rotations.delete([...state.rotations.keys()].at(-1));
  drawOverlay(); updateControls();
});
elements.rotateButton.addEventListener('click', () => { state.rotations.set(state.page, ((state.rotations.get(state.page) || 0) + 90) % 360); renderCurrentPage(); });
elements.previousPage.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; renderCurrentPage(); } });
elements.nextPage.addEventListener('click', () => { if (state.page < state.pdf.numPages) { state.page += 1; renderCurrentPage(); } });
elements.pageNumber.addEventListener('change', () => { state.page = Math.min(state.pdf.numPages, Math.max(1, Number(elements.pageNumber.value) || 1)); renderCurrentPage(); });
elements.zoomOut.addEventListener('click', () => { state.zoom = Math.max(.5, state.zoom - .1); renderCurrentPage(); });
elements.zoomIn.addEventListener('click', () => { state.zoom = Math.min(2.5, state.zoom + .1); renderCurrentPage(); });
elements.toolSize.addEventListener('input', () => { elements.toolSizeValue.textContent = elements.toolSize.value; });
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); savePdf(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); elements.undoButton.click(); }
});
window.addEventListener('beforeunload', (event) => { if (state.changes.length || state.rotations.size) { event.preventDefault(); event.returnValue = ''; } });

setTool('select');
updateControls();
