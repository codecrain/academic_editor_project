import {
  ActiveSelection,
  Canvas,
  Ellipse,
  FabricText,
  Group,
  Line,
  PencilBrush,
  Rect,
  Triangle,
  loadSVGFromString,
  util,
} from '/image/vendor/fabric.mjs';

const canvas = new Canvas('canvas', {
  backgroundColor: '#ffffff',
  preserveObjectStacking: true,
  selection: true,
});
canvas.freeDrawingBrush = new PencilBrush(canvas);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const statusNode = $('#status');
const layersNode = $('#layers');
const historyNode = $('#history-list');
const fillInput = $('#fill');
const strokeInput = $('#stroke');
const strokeWidthInput = $('#stroke-width');
const zoomInput = $('#zoom');
const zoomValue = $('#zoom-value');
const selectionToolbar = $('#selection-toolbar');
const undoStack = [];
const redoStack = [];
const historyLabels = [];
const toolLabels = {
  select: '선택 도구',
  draw: '연필 도구',
  rect: '사각형 도구',
  ellipse: '타원 도구',
  triangle: '삼각형 도구',
  line: '선분 도구',
  text: '문자 도구',
};
let restoring = false;
let tool = 'select';
let startPoint = null;
let draft = null;

function setStatus(message, error = false) {
  statusNode.textContent = message;
  statusNode.style.color = error ? 'var(--danger)' : '';
}

function makeIconButton(icon, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  const glyph = document.createElement('i');
  glyph.className = `ph ph-${icon}`;
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  return button;
}

function objectName(object, index) {
  return object.name || object.text || toolLabels[object.type] || object.type || `오브젝트 ${index + 1}`;
}

function currentObject() {
  return canvas.getActiveObject();
}

function setNumber(selector, value) {
  const input = $(selector);
  if (input) input.value = Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '';
}

function syncInspector() {
  const active = currentObject();
  selectionToolbar.hidden = !active;
  const disabled = !active;
  for (const selector of [
    '#object-x', '#object-y', '#object-width', '#object-height',
    '#prop-x', '#prop-y', '#prop-width', '#prop-height', '#prop-angle', '#prop-opacity',
  ]) {
    $(selector).disabled = disabled;
  }
  if (!active) {
    for (const selector of [
      '#object-x', '#object-y', '#object-width', '#object-height',
      '#prop-x', '#prop-y', '#prop-width', '#prop-height', '#prop-angle', '#prop-opacity',
    ]) $(selector).value = '';
    return;
  }
  const x = Number(active.left) || 0;
  const y = Number(active.top) || 0;
  const width = typeof active.getScaledWidth === 'function' ? active.getScaledWidth() : Number(active.width) || 0;
  const height = typeof active.getScaledHeight === 'function' ? active.getScaledHeight() : Number(active.height) || 0;
  setNumber('#object-x', x);
  setNumber('#object-y', y);
  setNumber('#object-width', width);
  setNumber('#object-height', height);
  setNumber('#prop-x', x);
  setNumber('#prop-y', y);
  setNumber('#prop-width', width);
  setNumber('#prop-height', height);
  setNumber('#prop-angle', Number(active.angle) || 0);
  setNumber('#prop-opacity', (Number(active.opacity) || 0) * 100);
  if (typeof active.fill === 'string' && /^#[0-9a-f]{6}$/i.test(active.fill)) $('#prop-fill').value = active.fill;
  if (typeof active.stroke === 'string' && /^#[0-9a-f]{6}$/i.test(active.stroke)) $('#prop-stroke').value = active.stroke;
}

function renderLayers() {
  layersNode.replaceChildren();
  const selected = new Set(canvas.getActiveObjects());
  const objects = canvas.getObjects();
  objects.forEach((object, index) => {
    const item = document.createElement('li');
    if (selected.has(object)) item.classList.add('selected');

    const visibility = makeIconButton(object.visible === false ? 'eye-slash' : 'eye', '표시 전환');
    visibility.onclick = () => {
      object.set('visible', object.visible === false);
      canvas.requestRenderAll();
      commit('표시 상태 변경');
    };

    const label = document.createElement('span');
    label.textContent = objectName(object, index);
    label.title = label.textContent;
    label.onclick = () => {
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      renderLayers();
      syncInspector();
    };

    const locked = Boolean(object.lockMovementX);
    const lock = makeIconButton(locked ? 'lock' : 'lock-open', '잠금 전환');
    lock.onclick = () => {
      const next = !object.lockMovementX;
      object.set({
        lockMovementX: next,
        lockMovementY: next,
        lockScalingX: next,
        lockScalingY: next,
        lockRotation: next,
      });
      canvas.requestRenderAll();
      renderLayers();
      commit(next ? '오브젝트 잠금' : '오브젝트 잠금 해제');
    };

    item.append(visibility, label, lock);
    layersNode.append(item);
  });
  $('#object-count').textContent = `오브젝트 ${objects.length}개`;
  syncInspector();
}

function snapshot() {
  return JSON.stringify(canvas.toJSON(['name']));
}

function renderHistory() {
  historyNode.replaceChildren();
  historyLabels.forEach((label, index) => {
    const item = document.createElement('li');
    item.textContent = label;
    if (index === historyLabels.length - 1) item.classList.add('current');
    historyNode.append(item);
  });
}

function commit(label = '편집') {
  if (restoring) return;
  const value = snapshot();
  if (undoStack.at(-1) !== value) {
    undoStack.push(value);
    historyLabels.push(label);
  }
  if (undoStack.length > 100) {
    undoStack.shift();
    historyLabels.shift();
  }
  redoStack.length = 0;
  renderLayers();
  renderHistory();
  $('.dirty-indicator').hidden = false;
}

async function restore(value) {
  restoring = true;
  await canvas.loadFromJSON(value);
  canvas.requestRenderAll();
  restoring = false;
  renderLayers();
  renderHistory();
}

async function undo() {
  if (undoStack.length < 2) return;
  redoStack.push({ value: undoStack.pop(), label: historyLabels.pop() });
  await restore(undoStack.at(-1));
  setStatus('실행을 취소했습니다.');
}

async function redo() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  undoStack.push(entry.value);
  historyLabels.push(entry.label);
  await restore(entry.value);
  setStatus('작업을 다시 실행했습니다.');
}

function style() {
  return {
    fill: fillInput.value,
    stroke: strokeInput.value,
    strokeWidth: Number(strokeWidthInput.value) || 0,
  };
}

function updateColorPreview() {
  $('#fill-preview').style.background = fillInput.value;
  $('#stroke-preview').style.background = strokeInput.value;
}

function setTool(next) {
  tool = next;
  canvas.isDrawingMode = next === 'draw';
  canvas.selection = next === 'select';
  canvas.defaultCursor = next === 'select' ? 'default' : 'crosshair';
  canvas.freeDrawingBrush.color = strokeInput.value;
  canvas.freeDrawingBrush.width = Number(strokeWidthInput.value) || 1;
  $$('[data-tool]').forEach((button) => {
    const active = button.dataset.tool === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#active-tool-name').textContent = toolLabels[next] || next;
  setStatus(`${toolLabels[next] || next} 선택됨`);
}

function createShape(kind, left, top) {
  const common = { left, top, width: 1, height: 1, name: toolLabels[kind], ...style() };
  if (kind === 'rect') return new Rect(common);
  if (kind === 'ellipse') return new Ellipse({ ...common, rx: 1, ry: 1 });
  if (kind === 'triangle') return new Triangle(common);
  if (kind === 'line') return new Line([left, top, left + 1, top + 1], { ...style(), name: toolLabels[kind] });
  return null;
}

canvas.on('mouse:down', ({ scenePoint }) => {
  if (tool === 'text') {
    const object = new FabricText('텍스트', {
      left: scenePoint.x,
      top: scenePoint.y,
      fontSize: 36,
      fontFamily: 'Pretendard, sans-serif',
      name: '텍스트',
      ...style(),
    });
    canvas.add(object);
    canvas.setActiveObject(object);
    setTool('select');
    commit('텍스트 추가');
    return;
  }
  if (!['rect', 'ellipse', 'triangle', 'line'].includes(tool)) return;
  startPoint = scenePoint;
  draft = createShape(tool, scenePoint.x, scenePoint.y);
  canvas.add(draft);
});

canvas.on('mouse:move', ({ scenePoint }) => {
  if (!draft || !startPoint) return;
  if (tool === 'line') {
    draft.set({ x2: scenePoint.x, y2: scenePoint.y });
  } else {
    const left = Math.min(startPoint.x, scenePoint.x);
    const top = Math.min(startPoint.y, scenePoint.y);
    const width = Math.abs(scenePoint.x - startPoint.x);
    const height = Math.abs(scenePoint.y - startPoint.y);
    if (tool === 'ellipse') draft.set({ left, top, rx: width / 2, ry: height / 2 });
    else draft.set({ left, top, width, height });
  }
  draft.setCoords();
  canvas.requestRenderAll();
});

canvas.on('mouse:up', () => {
  if (!draft) return;
  const createdTool = tool;
  canvas.setActiveObject(draft);
  draft = null;
  startPoint = null;
  setTool('select');
  commit(`${toolLabels[createdTool]} 추가`);
});

canvas.on('object:modified', () => commit('오브젝트 변형'));
canvas.on('object:added', renderLayers);
canvas.on('object:removed', renderLayers);
canvas.on('selection:created', renderLayers);
canvas.on('selection:updated', renderLayers);
canvas.on('selection:cleared', renderLayers);
canvas.on('path:created', () => commit('연필 경로 추가'));

function download(name, data, type) {
  const link = document.createElement('a');
  link.download = name;
  link.href = URL.createObjectURL(new Blob([data], { type }));
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function downloadUrl(name, url) {
  const link = document.createElement('a');
  link.download = name;
  link.href = url;
  link.click();
}

async function openFile(file) {
  const text = await file.text();
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
    const parsed = await loadSVGFromString(text);
    const object = util.groupSVGElements(parsed.objects, parsed.options);
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.add(object);
    canvas.setActiveObject(object);
  } else {
    await restore(text);
  }
  $('#document-name').textContent = file.name;
  commit(`${file.name} 열기`);
  setStatus(`${file.name} 파일을 열었습니다.`);
}

async function groupSelection() {
  const active = canvas.getActiveObject();
  if (!(active instanceof ActiveSelection)) return;
  canvas.setActiveObject(active.toGroup());
  commit('오브젝트 그룹');
}

async function ungroupSelection() {
  const active = canvas.getActiveObject();
  if (!(active instanceof Group)) return;
  canvas.setActiveObject(active.toActiveSelection());
  commit('그룹 해제');
}

const actions = {
  new: () => {
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    $('#document-name').textContent = '제목 없음.svg';
    commit('새 문서');
    setStatus('새 벡터 문서를 만들었습니다.');
  },
  'save-project': () => {
    download('vector-project.json', snapshot(), 'application/json');
    $('.dirty-indicator').hidden = true;
    setStatus('편집 프로젝트를 저장했습니다.');
  },
  'export-svg': () => {
    download('vector-artwork.svg', canvas.toSVG(), 'image/svg+xml');
    setStatus('SVG를 내보냈습니다.');
  },
  'export-png': () => {
    downloadUrl('vector-artwork.png', canvas.toDataURL({ format: 'png', multiplier: 1 }));
    setStatus('PNG를 내보냈습니다.');
  },
  duplicate: async () => {
    const active = currentObject();
    if (!active) return;
    const clone = await active.clone();
    clone.set({ left: (active.left || 0) + 20, top: (active.top || 0) + 20 });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    commit('오브젝트 복제');
  },
  group: groupSelection,
  ungroup: ungroupSelection,
  front: () => {
    const active = currentObject();
    if (active) {
      canvas.bringObjectToFront(active);
      commit('맨 앞으로 이동');
    }
  },
  back: () => {
    const active = currentObject();
    if (active) {
      canvas.sendObjectToBack(active);
      commit('맨 뒤로 이동');
    }
  },
  delete: () => {
    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects.length) return;
    canvas.remove(...activeObjects);
    canvas.discardActiveObject();
    commit('오브젝트 삭제');
  },
  undo,
  redo,
};

function setZoom(value) {
  const percent = Math.max(10, Math.min(400, Math.round(value)));
  zoomInput.value = String(percent);
  zoomValue.value = `${percent}%`;
  canvas.setZoom(percent / 100);
  canvas.requestRenderAll();
}

function fitCanvas() {
  const stage = $('#stage');
  const availableWidth = Math.max(100, stage.clientWidth - 140);
  const availableHeight = Math.max(100, stage.clientHeight - 140);
  setZoom(Math.min(100, (availableWidth / canvas.width) * 100, (availableHeight / canvas.height) * 100));
}

const views = {
  fit: fitCanvas,
  actual: () => setZoom(100),
  'zoom-in': () => setZoom(Number(zoomInput.value) + 10),
  'zoom-out': () => setZoom(Number(zoomInput.value) - 10),
  panels: () => document.body.classList.toggle('panels-hidden'),
};

function runAction(name) {
  const action = actions[name];
  if (action) Promise.resolve(action()).catch((error) => setStatus(error.message, true));
  $$('details[open]').forEach((details) => { details.open = false; });
}

$$('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
$$('[data-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.action)));
$$('[data-view]').forEach((button) => button.addEventListener('click', () => views[button.dataset.view]?.()));

$('#open-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) openFile(file).catch((error) => setStatus(error.message, true));
});

zoomInput.addEventListener('input', () => setZoom(Number(zoomInput.value)));

for (const input of [fillInput, strokeInput, strokeWidthInput, $('#prop-fill'), $('#prop-stroke')]) {
  input.addEventListener('input', () => {
    if (input === $('#prop-fill')) fillInput.value = input.value;
    if (input === $('#prop-stroke')) strokeInput.value = input.value;
    updateColorPreview();
    const active = currentObject();
    if (active) {
      active.set(style());
      canvas.requestRenderAll();
      commit('모양 변경');
    }
  });
}

const transformBindings = [
  ['#object-x', 'left'], ['#prop-x', 'left'],
  ['#object-y', 'top'], ['#prop-y', 'top'],
  ['#prop-angle', 'angle'], ['#prop-opacity', 'opacity'],
  ['#object-width', 'width'], ['#prop-width', 'width'],
  ['#object-height', 'height'], ['#prop-height', 'height'],
];
for (const [selector, property] of transformBindings) {
  $(selector).addEventListener('change', (event) => {
    const active = currentObject();
    if (!active) return;
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    if (property === 'width' && active.width) active.set('scaleX', value / active.width);
    else if (property === 'height' && active.height) active.set('scaleY', value / active.height);
    else if (property === 'opacity') active.set(property, Math.max(0, Math.min(100, value)) / 100);
    else active.set(property, value);
    active.setCoords();
    canvas.requestRenderAll();
    commit('정밀 변형');
  });
}

$$('[data-panel-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    $$('[data-panel-tab]').forEach((tab) => tab.setAttribute('aria-selected', String(tab === button)));
    $$('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.panelTab));
  });
});

$('.collapse-inspector').addEventListener('click', () => document.body.classList.toggle('inspector-collapsed'));

$('#workspace-select').addEventListener('change', (event) => {
  if (event.target.value === 'photo' || event.target.value === 'paint') window.location.href = '../';
  if (event.target.value === 'export') {
    $$('[data-panel-tab]').find((tab) => tab.dataset.panelTab === 'properties')?.click();
    setStatus('내보내기 명령은 파일 메뉴와 오른쪽 위 버튼에서 사용할 수 있습니다.');
  }
});

const commandItems = [
  ...Object.entries(toolLabels).map(([id, label]) => ({ label, hint: id.toUpperCase(), run: () => setTool(id) })),
  { label: '새 문서', hint: 'Ctrl N', run: actions.new },
  { label: '파일 열기', hint: 'Ctrl O', run: () => $('#open-file').click() },
  { label: '편집 프로젝트 저장', hint: 'Ctrl S', run: actions['save-project'] },
  { label: 'SVG 내보내기', hint: '', run: actions['export-svg'] },
  { label: 'PNG 내보내기', hint: '', run: actions['export-png'] },
  { label: '실행 취소', hint: 'Ctrl Z', run: undo },
  { label: '다시 실행', hint: 'Ctrl Shift Z', run: redo },
  { label: '오브젝트 복제', hint: 'Ctrl D', run: actions.duplicate },
  { label: '화면에 맞추기', hint: 'Ctrl 0', run: fitCanvas },
  { label: '패널 표시/숨기기', hint: 'Tab', run: views.panels },
];

function renderCommandResults(query = '') {
  const results = $('#command-results');
  const normalized = query.trim().toLowerCase();
  const matches = commandItems.filter((item) => item.label.toLowerCase().includes(normalized)).slice(0, 10);
  results.replaceChildren();
  for (const item of matches) {
    const button = document.createElement('button');
    const label = document.createElement('span');
    label.textContent = item.label;
    const hint = document.createElement('kbd');
    hint.textContent = item.hint;
    button.append(label, hint);
    button.onclick = () => {
      Promise.resolve(item.run()).catch((error) => setStatus(error.message, true));
      $('#command-search').value = '';
      results.hidden = true;
    };
    results.append(button);
  }
  results.hidden = !matches.length;
}

$('#command-search').addEventListener('focus', (event) => renderCommandResults(event.target.value));
$('#command-search').addEventListener('input', (event) => renderCommandResults(event.target.value));
$('#command-search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('#command-results').hidden = true;
    event.currentTarget.blur();
  } else if (event.key === 'Enter') {
    const first = $('#command-results button');
    if (first) first.click();
  }
});

window.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.command-search, .command-results')) $('#command-results').hidden = true;
});

window.addEventListener('keydown', (event) => {
  const editable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'k') {
    event.preventDefault();
    $('#command-search').focus();
    renderCommandResults($('#command-search').value);
  } else if (modifier && key === 'z') {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if (modifier && key === 's') {
    event.preventDefault();
    actions['save-project']();
  } else if (modifier && key === 'd') {
    event.preventDefault();
    actions.duplicate();
  } else if (modifier && key === 'g') {
    event.preventDefault();
    event.shiftKey ? ungroupSelection() : groupSelection();
  } else if (modifier && key === '0') {
    event.preventDefault();
    fitCanvas();
  } else if (event.key === 'Tab' && !editable) {
    event.preventDefault();
    views.panels();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && !editable) {
    actions.delete();
  } else if (!modifier && !editable) {
    const shortcuts = { v: 'select', p: 'draw', r: 'rect', e: 'ellipse', l: 'line', t: 'text' };
    if (shortcuts[key]) setTool(shortcuts[key]);
  }
});

window.addEventListener('resize', () => {
  if (Number(zoomInput.value) < 100) fitCanvas();
});

commit('새 문서');
setTool('select');
updateColorPreview();
setZoom(100);
fitCanvas();
$('.dirty-indicator').hidden = true;
setStatus('준비됨 — 모든 편집과 내보내기는 이 브라우저에서 처리됩니다.');
