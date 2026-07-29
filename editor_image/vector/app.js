import {
  ActiveSelection,
  Canvas,
  Ellipse,
  FabricImage,
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
const statusNode = document.getElementById('status');
const layersNode = document.getElementById('layers');
const fillInput = document.getElementById('fill');
const strokeInput = document.getElementById('stroke');
const strokeWidthInput = document.getElementById('stroke-width');
const undoStack = [];
const redoStack = [];
let restoring = false;
let tool = 'select';
let startPoint = null;
let draft = null;

function status(message, error = false) {
  statusNode.textContent = message;
  statusNode.style.color = error ? '#fca5a5' : '#93c5fd';
}

function objectName(object, index) {
  return object.name || object.text || object.type || `Object ${index + 1}`;
}

function renderLayers() {
  layersNode.replaceChildren();
  const selected = new Set(canvas.getActiveObjects());
  canvas.getObjects().forEach((object, index) => {
    const item = document.createElement('li');
    if (selected.has(object)) item.classList.add('selected');
    const visibility = document.createElement('button');
    visibility.textContent = object.visible === false ? '○' : '●';
    visibility.title = 'Toggle visibility';
    visibility.onclick = () => { object.set('visible', object.visible === false); canvas.requestRenderAll(); commit(); };
    const label = document.createElement('span');
    label.textContent = objectName(object, index);
    label.onclick = () => { canvas.setActiveObject(object); canvas.requestRenderAll(); renderLayers(); };
    const lock = document.createElement('button');
    lock.textContent = object.lockMovementX ? '🔒' : '🔓';
    lock.title = 'Toggle lock';
    lock.onclick = () => {
      const next = !object.lockMovementX;
      object.set({ lockMovementX: next, lockMovementY: next, lockScalingX: next, lockScalingY: next, lockRotation: next });
      canvas.requestRenderAll();
      renderLayers();
      commit();
    };
    item.append(visibility, label, lock);
    layersNode.append(item);
  });
}

function snapshot() {
  return JSON.stringify(canvas.toJSON(['name']));
}

function commit() {
  if (restoring) return;
  const value = snapshot();
  if (undoStack.at(-1) !== value) undoStack.push(value);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  renderLayers();
}

async function restore(value) {
  restoring = true;
  await canvas.loadFromJSON(value);
  canvas.requestRenderAll();
  restoring = false;
  renderLayers();
}

async function undo() {
  if (undoStack.length < 2) return;
  redoStack.push(undoStack.pop());
  await restore(undoStack.at(-1));
}

async function redo() {
  if (!redoStack.length) return;
  const value = redoStack.pop();
  undoStack.push(value);
  await restore(value);
}

function style() {
  return { fill: fillInput.value, stroke: strokeInput.value, strokeWidth: Number(strokeWidthInput.value) || 0 };
}

function setTool(next) {
  tool = next;
  canvas.isDrawingMode = next === 'draw';
  canvas.selection = next === 'select';
  canvas.defaultCursor = next === 'select' ? 'default' : 'crosshair';
  canvas.freeDrawingBrush.color = strokeInput.value;
  canvas.freeDrawingBrush.width = Number(strokeWidthInput.value) || 1;
  document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === next));
}

function createShape(kind, left, top) {
  const common = { left, top, width: 1, height: 1, ...style() };
  if (kind === 'rect') return new Rect(common);
  if (kind === 'ellipse') return new Ellipse({ ...common, rx: 1, ry: 1 });
  if (kind === 'triangle') return new Triangle(common);
  if (kind === 'line') return new Line([left, top, left + 1, top + 1], style());
  return null;
}

canvas.on('mouse:down', ({ scenePoint }) => {
  if (tool === 'text') {
    const object = new FabricText('Text', { left: scenePoint.x, top: scenePoint.y, fontSize: 36, ...style() });
    canvas.add(object);
    canvas.setActiveObject(object);
    setTool('select');
    commit();
    return;
  }
  if (!['rect', 'ellipse', 'triangle', 'line'].includes(tool)) return;
  startPoint = scenePoint;
  draft = createShape(tool, scenePoint.x, scenePoint.y);
  canvas.add(draft);
});

canvas.on('mouse:move', ({ scenePoint }) => {
  if (!draft || !startPoint) return;
  if (tool === 'line') draft.set({ x2: scenePoint.x, y2: scenePoint.y });
  else {
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
  canvas.setActiveObject(draft);
  draft = null;
  startPoint = null;
  setTool('select');
  commit();
});

canvas.on('object:modified', commit);
canvas.on('object:added', renderLayers);
canvas.on('object:removed', renderLayers);
canvas.on('selection:created', renderLayers);
canvas.on('selection:updated', renderLayers);
canvas.on('selection:cleared', renderLayers);
canvas.on('path:created', commit);

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
  commit();
  status(`Opened ${file.name}.`);
}

async function groupSelection() {
  const active = canvas.getActiveObject();
  if (!(active instanceof ActiveSelection)) return;
  canvas.setActiveObject(active.toGroup());
  commit();
}

async function ungroupSelection() {
  const active = canvas.getActiveObject();
  if (!(active instanceof Group)) return;
  canvas.setActiveObject(active.toActiveSelection());
  commit();
}

const actions = {
  new: () => { canvas.clear(); canvas.backgroundColor = '#ffffff'; commit(); },
  'save-project': () => download('vector-project.json', snapshot(), 'application/json'),
  'export-svg': () => download('vector-artwork.svg', canvas.toSVG(), 'image/svg+xml'),
  'export-png': () => downloadUrl('vector-artwork.png', canvas.toDataURL({ format: 'png', multiplier: 1 })),
  duplicate: async () => {
    const active = canvas.getActiveObject();
    if (!active) return;
    const clone = await active.clone();
    clone.set({ left: (active.left || 0) + 20, top: (active.top || 0) + 20 });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    commit();
  },
  group: groupSelection,
  ungroup: ungroupSelection,
  front: () => { const active = canvas.getActiveObject(); if (active) { canvas.bringObjectToFront(active); commit(); } },
  back: () => { const active = canvas.getActiveObject(); if (active) { canvas.sendObjectToBack(active); commit(); } },
  delete: () => { canvas.remove(...canvas.getActiveObjects()); canvas.discardActiveObject(); commit(); },
  undo,
  redo,
};

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => actions[button.dataset.action]?.()));
document.getElementById('open-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) openFile(file).catch((error) => status(error.message, true));
});
document.getElementById('zoom').addEventListener('input', (event) => {
  canvas.setZoom(Number(event.target.value) / 100);
  canvas.requestRenderAll();
});
for (const input of [fillInput, strokeInput, strokeWidthInput]) {
  input.addEventListener('input', () => {
    const active = canvas.getActiveObject();
    if (active) {
      active.set(style());
      canvas.requestRenderAll();
      commit();
    }
  });
}
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    (event.shiftKey ? redo() : undo());
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) actions.delete();
  }
});

commit();
setTool('select');
status('Ready. All vector editing and exports stay in this browser.');
