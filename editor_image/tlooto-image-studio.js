(() => {
  const params = new URLSearchParams(window.location.search);
  const saveUrl = params.get('save');
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
    status(`Saved ${payload.byteLength.toLocaleString()} bytes as PNG.`);
  }

  window.addEventListener('load', () => {
    const controls = document.querySelector('.logo')?.parentElement;
    if (!controls) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'tlooto-image-save';
    button.textContent = 'Save image';
    button.title = 'Save the current flattened PNG to this local image session';
    button.addEventListener('click', async () => {
      button.disabled = true;
      status('Saving…');
      try {
        await saveCurrentCanvas();
      } catch (error) {
        status(error instanceof Error ? error.message : String(error), true);
      } finally {
        button.disabled = false;
      }
    });
    const message = document.createElement('span');
    message.id = 'tlooto-image-save-status';
    message.style.cssText = 'margin-left:8px;font-size:12px';
    controls.append(button, message);
  });
})();
