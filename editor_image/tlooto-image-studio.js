(() => {
  const params = new URLSearchParams(window.location.search);
  const saveUrl = params.get('save');
  const projectSaveUrl = params.get('projectSave');
  if (!saveUrl) return;

  function status(message, isError = false) {
    const node = document.getElementById('tlooto-image-save-status');
    if (node) {
      node.textContent = message;
      node.style.color = isError ? '#b42318' : '#1a7f37';
    }
  }

  async function saveCurrentCanvas() {
    const canvas = document.getElementById('canvas_minipaint');
    if (!canvas) throw new Error('The image canvas is not ready yet.');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The browser could not encode the current canvas as PNG.');
    const bytesBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read the encoded PNG.'));
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
      reader.readAsDataURL(blob);
    });
    const response = await fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bytesBase64 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Save failed (${response.status}).`);
    status(`Saved ${payload.byteLength.toLocaleString()} bytes as a flattened PNG.`);
  }

  async function saveLayeredProject() {
    if (!projectSaveUrl) throw new Error('This session does not provide layered-project storage.');
    if (!window.FileSave || typeof window.FileSave.export_as_json !== 'function') {
      throw new Error('The layered document model is not ready yet.');
    }
    const response = await fetch(projectSaveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: window.FileSave.export_as_json(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Layered save failed (${response.status}).`);
    status(`Saved editable project (${payload.byteLength.toLocaleString()} bytes).`);
  }

  function createActionButton({ id, text, title, action }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', async () => {
      button.disabled = true;
      status('Saving…');
      try {
        await action();
      } catch (error) {
        status(error instanceof Error ? error.message : String(error), true);
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  window.addEventListener('load', () => {
    const controls = document.querySelector('.logo')?.parentElement;
    if (!controls) return;
    const projectButton = createActionButton({
      id: 'tlooto-image-save-project',
      text: 'Save editable project',
      title: 'Save all editable layers, text, shapes, guides, and image data',
      action: saveLayeredProject,
    });
    const imageButton = createActionButton({
      id: 'tlooto-image-save',
      text: 'Save flattened image',
      title: 'Save the current flattened PNG to this local image session',
      action: saveCurrentCanvas,
    });
    const message = document.createElement('span');
    message.id = 'tlooto-image-save-status';
    message.style.cssText = 'margin-left:8px;font-size:12px';
    controls.append(projectButton, imageButton, message);
  });
})();
