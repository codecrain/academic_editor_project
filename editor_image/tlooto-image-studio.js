(() => {
  const params = new URLSearchParams(window.location.search);
  const saveUrl = params.get('save');
  const projectSaveUrl = params.get('projectSave');

  function icon(name) {
    const node = document.createElement('i');
    node.className = `ph ph-${name}`;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function status(message, isError = false) {
    for (const node of [
      document.getElementById('tlooto-image-save-status'),
      document.getElementById('tlooto-raster-status'),
    ]) {
      if (!node) continue;
      node.textContent = message;
      node.dataset.error = String(isError);
    }
  }

  async function saveCurrentCanvas() {
    if (!saveUrl) throw new Error('이 세션에는 이미지 저장 위치가 없습니다.');
    const canvas = document.getElementById('canvas_minipaint');
    if (!canvas) throw new Error('이미지 캔버스가 아직 준비되지 않았습니다.');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('현재 캔버스를 PNG로 인코딩할 수 없습니다.');
    const bytesBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('인코딩한 PNG를 읽을 수 없습니다.'));
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
      reader.readAsDataURL(blob);
    });
    const response = await fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bytesBase64 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `이미지 저장 실패 (${response.status})`);
    status(`평면 PNG 저장 완료 · ${payload.byteLength.toLocaleString()}바이트`);
  }

  async function saveLayeredProject() {
    if (!projectSaveUrl) throw new Error('이 세션에는 편집 프로젝트 저장 위치가 없습니다.');
    if (!window.FileSave || typeof window.FileSave.export_as_json !== 'function') {
      throw new Error('레이어 문서 모델이 아직 준비되지 않았습니다.');
    }
    const response = await fetch(projectSaveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: window.FileSave.export_as_json(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `프로젝트 저장 실패 (${response.status})`);
    status(`편집 프로젝트 저장 완료 · ${payload.byteLength.toLocaleString()}바이트`);
  }

  function createActionButton({ id, text, iconName, className = '', title, action }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = `tlooto-action ${className}`.trim();
    button.title = title;
    button.append(icon(iconName));
    const label = document.createElement('span');
    label.textContent = text;
    button.append(label);
    button.addEventListener('click', async () => {
      button.disabled = true;
      status('저장 중…');
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

  function createWorkspaceSwitch() {
    const group = document.createElement('nav');
    group.className = 'tlooto-workspace-switch';
    group.setAttribute('aria-label', '편집 모드');
    const raster = document.createElement('a');
    raster.href = './';
    raster.className = 'active';
    raster.setAttribute('aria-current', 'page');
    raster.append(icon('image'));
    raster.append('래스터');
    const vector = document.createElement('a');
    vector.href = 'vector/';
    vector.append(icon('vector-three'));
    vector.append('벡터');
    group.append(raster, vector);
    return group;
  }

  function enhanceTools() {
    const names = {
      select: '선택 도구',
      selection: '선택 영역',
      brush: '브러시',
      pencil: '연필',
      pick_color: '스포이드',
      erase: '지우개',
      magic_erase: '매직 지우개',
      fill: '채우기',
      shape: '도형',
      text: '문자',
      gradient: '그라디언트',
      clone: '복제 도장',
      crop: '자르기',
      blur: '흐림',
      sharpen: '선명하게',
      desaturate: '채도 제거',
      bulge_pinch: '볼록/오목',
      animation: '애니메이션',
    };
    const breaks = new Set(['selection', 'shape', 'text', 'clone', 'crop', 'blur', 'animation']);
    for (const item of document.querySelectorAll('#tools_container .item')) {
      const key = [...item.classList].find((className) => names[className]);
      if (!key) continue;
      const original = item.title ? ` · ${item.title}` : '';
      item.dataset.tooltip = `${names[key]}${original}`;
      item.title = names[key];
      item.setAttribute('aria-label', names[key]);
      item.setAttribute('role', 'button');
      if (breaks.has(key)) item.classList.add('tool-break-before');
    }
  }

  function createInspectorNavigation() {
    const sidebar = document.querySelector('.sidebar_right');
    if (!sidebar) return;
    const navigation = document.createElement('div');
    navigation.className = 'tlooto-inspector-tabs';
    navigation.setAttribute('role', 'tablist');
    navigation.setAttribute('aria-label', '오른쪽 패널');
    const targets = [
      ['속성', '#details_base'],
      ['레이어', '.block.layers'],
      ['색상', '.block.colors'],
      ['탐색', '.block.preview'],
    ];
    targets.forEach(([label, selector], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
      button.textContent = label;
      button.addEventListener('click', () => {
        navigation.querySelectorAll('[role=tab]').forEach((tab) => {
          tab.setAttribute('aria-selected', String(tab === button));
        });
        sidebar.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navigation.append(button);
    });
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'tlooto-panel-collapse';
    collapse.title = '패널 접기';
    collapse.setAttribute('aria-label', '패널 접기');
    collapse.append(icon('caret-double-right'));
    collapse.addEventListener('click', () => document.body.classList.toggle('tlooto-panels-collapsed'));
    navigation.append(collapse);
    sidebar.prepend(navigation);

    const titles = [
      ['#details_base h2', '속성'],
      ['.block.colors h2', '색상'],
      ['.block.layers h2', '레이어'],
      ['.block.preview h2', '탐색기'],
      ['#info_base h2', '문서 정보'],
    ];
    for (const [selector, label] of titles) {
      const node = sidebar.querySelector(selector);
      if (node) node.textContent = label;
    }
  }

  function buildCommandSearch(host) {
    const wrapper = document.createElement('label');
    wrapper.className = 'tlooto-command-search';
    wrapper.append(icon('magnifying-glass'));
    const input = document.createElement('input');
    input.id = 'tlooto-command-input';
    input.type = 'search';
    input.placeholder = '도구와 명령 검색…';
    input.autocomplete = 'off';
    const shortcut = document.createElement('kbd');
    shortcut.textContent = 'Ctrl K';
    wrapper.append(input, shortcut);

    const results = document.createElement('div');
    results.id = 'tlooto-command-results';
    results.className = 'tlooto-command-results';
    results.hidden = true;
    document.body.append(results);

    function commands() {
      const menuCommands = [...document.querySelectorAll('#main_menu .menu_dropdown a')]
        .map((element) => ({
          name: element.querySelector('.name')?.textContent?.trim() || element.textContent.trim(),
          shortcut: element.querySelector('.shortcut')?.textContent?.trim() || '',
          target: element,
        }))
        .filter((item) => item.name);
      const toolCommands = [...document.querySelectorAll('#tools_container .item')].map((element) => ({
        name: element.dataset.tooltip || element.title,
        shortcut: '',
        target: element,
      }));
      return [...toolCommands, ...menuCommands];
    }

    function render() {
      const query = input.value.trim().toLowerCase();
      const matches = commands().filter((item) => item.name.toLowerCase().includes(query)).slice(0, 12);
      results.replaceChildren();
      matches.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        const name = document.createElement('span');
        name.textContent = item.name;
        const hint = document.createElement('kbd');
        hint.textContent = item.shortcut;
        button.append(name, hint);
        button.onclick = () => {
          item.target.click();
          input.value = '';
          results.hidden = true;
        };
        results.append(button);
      });
      results.hidden = !matches.length;
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        results.hidden = true;
        input.blur();
      } else if (event.key === 'Enter') {
        results.querySelector('button')?.click();
      }
    });
    window.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.tlooto-command-search, .tlooto-command-results')) results.hidden = true;
    });
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.focus();
        render();
      } else if (event.key === 'Tab' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        document.body.classList.toggle('tlooto-focus-mode');
      }
    });
    host.append(wrapper);
  }

  function buildApplicationShell() {
    document.body.classList.add('tlooto-pro-editor');
    const mainMenu = document.getElementById('main_menu');
    if (!mainMenu) return;

    const brand = document.createElement('a');
    brand.className = 'tlooto-brand';
    brand.href = './';
    brand.setAttribute('aria-label', 'Tlooto Image Studio');
    const brandMark = document.createElement('span');
    brandMark.textContent = 'T';
    const brandName = document.createElement('strong');
    brandName.textContent = 'Image Studio';
    brand.append(brandMark, brandName);
    mainMenu.prepend(brand);
    buildCommandSearch(mainMenu);

    const workspace = document.createElement('label');
    workspace.className = 'tlooto-workspace-picker';
    const workspaceLabel = document.createElement('span');
    workspaceLabel.textContent = '작업 영역';
    const workspaceSelect = document.createElement('select');
    [
      ['photo', '사진'],
      ['design', '디자인'],
      ['paint', '페인팅'],
      ['export', '내보내기'],
    ].forEach(([value, label]) => workspaceSelect.add(new Option(label, value)));
    workspaceSelect.addEventListener('change', () => {
      if (workspaceSelect.value === 'design') window.location.href = 'vector/';
      if (workspaceSelect.value === 'export') status('오른쪽 위 내보내기 버튼으로 PNG를 저장할 수 있습니다.');
    });
    workspace.append(workspaceLabel, workspaceSelect);
    mainMenu.append(workspace);

    const actions = document.createElement('div');
    actions.className = 'tlooto-top-actions';
    if (projectSaveUrl) {
      actions.append(createActionButton({
        id: 'tlooto-image-save-project',
        text: '프로젝트 저장',
        iconName: 'floppy-disk',
        title: '레이어와 편집 정보를 유지해 저장',
        action: saveLayeredProject,
      }));
    }
    if (saveUrl) {
      actions.append(createActionButton({
        id: 'tlooto-image-save',
        text: '내보내기',
        iconName: 'export',
        className: 'primary',
        title: '현재 결과를 평면 PNG로 저장',
        action: saveCurrentCanvas,
      }));
    }
    mainMenu.append(actions);

    const submenu = document.querySelector('.submenu');
    const logo = submenu?.querySelector('.logo');
    if (logo) {
      logo.textContent = '제목 없음.png';
      logo.removeAttribute('href');
      logo.classList.add('tlooto-document-tab');
    }
    if (submenu) submenu.prepend(createWorkspaceSwitch());

    const liveStatus = document.createElement('span');
    liveStatus.id = 'tlooto-image-save-status';
    liveStatus.setAttribute('aria-live', 'polite');
    actions.prepend(liveStatus);

    const footer = document.createElement('footer');
    footer.className = 'tlooto-status-bar';
    const rasterStatus = document.createElement('span');
    rasterStatus.id = 'tlooto-raster-status';
    rasterStatus.textContent = '준비됨';
    const center = document.createElement('span');
    center.textContent = '래스터 편집 · 로컬 처리';
    const hint = document.createElement('span');
    hint.textContent = 'Tab 패널 숨기기 · Ctrl K 명령 검색';
    footer.append(rasterStatus, center, hint);
    document.body.append(footer);
  }

  window.addEventListener('load', () => {
    buildApplicationShell();
    enhanceTools();
    createInspectorNavigation();
    status('준비됨 — 모든 편집은 이 브라우저에서 로컬로 처리됩니다.');
  });
})();
