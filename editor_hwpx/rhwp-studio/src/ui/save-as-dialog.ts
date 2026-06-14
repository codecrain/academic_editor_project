/**
 * 다른 이름으로 저장 대화상자
 *
 * 새 문서 저장 시 파일 이름을 입력받는다.
 * showSaveAs() 헬퍼로 간단히 사용 가능.
 */
import { ModalDialog } from './dialog';

class SaveAsDialog extends ModalDialog {
  private defaultName: string;
  private extension: '.hwp' | '.hwpx';
  private input!: HTMLInputElement;
  private formatSelect: HTMLSelectElement | null = null;
  private resolve!: (value: string | null) => void;

  constructor(
    defaultName: string,
    extension: '.hwp' | '.hwpx' = '.hwp',
    private options: { allowFormatChoice?: boolean } = {},
  ) {
    super('다른 이름으로 저장', 380);
    this.defaultName = defaultName;
    this.extension = extension;
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.style.padding = '16px 20px';

    const label = document.createElement('label');
    label.textContent = '파일 이름(N):';
    label.style.display = 'block';
    label.style.marginBottom = '6px';
    label.style.fontSize = '13px';
    body.appendChild(label);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.value = this.defaultName;
    this.input.style.width = '100%';
    this.input.style.boxSizing = 'border-box';
    this.input.style.height = '26px';
    this.input.style.padding = '2px 6px';
    this.input.style.border = '1px solid #b4b4b4';
    this.input.style.fontSize = '13px';
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.onConfirm();
        this.hide();
      }
    });
    body.appendChild(this.input);

    if (this.options.allowFormatChoice) {
      const formatLabel = document.createElement('label');
      formatLabel.textContent = '파일 형식(T):';
      formatLabel.style.display = 'block';
      formatLabel.style.marginTop = '12px';
      formatLabel.style.marginBottom = '6px';
      formatLabel.style.fontSize = '13px';
      body.appendChild(formatLabel);

      this.formatSelect = document.createElement('select');
      this.formatSelect.style.width = '100%';
      this.formatSelect.style.boxSizing = 'border-box';
      this.formatSelect.style.height = '28px';
      this.formatSelect.style.border = '1px solid #b4b4b4';
      this.formatSelect.style.fontSize = '13px';
      this.formatSelect.innerHTML = [
        '<option value=".hwpx">HWPX 문서 (*.hwpx)</option>',
        '<option value=".hwp">HWP 문서 (*.hwp)</option>',
      ].join('');
      this.formatSelect.value = this.extension;
      this.formatSelect.addEventListener('change', () => {
        const nextExtension = this.selectedExtension();
        this.input.value = /\.(hwp|hwpx)$/i.test(this.input.value)
          ? this.input.value.replace(/\.(hwp|hwpx)$/i, nextExtension)
          : this.input.value + nextExtension;
      });
      body.appendChild(this.formatSelect);
    }

    return body;
  }

  private selectedExtension(): '.hwp' | '.hwpx' {
    return this.formatSelect?.value === '.hwpx' ? '.hwpx' : '.hwp';
  }

  protected onConfirm(): void {
    const name = this.input.value.trim();
    if (!name) return;
    const extension = this.options.allowFormatChoice ? this.selectedExtension() : this.extension;
    const fileName = /\.(hwp|hwpx)$/i.test(name)
      ? name.replace(/\.(hwp|hwpx)$/i, extension)
      : name + extension;
    this.resolve(fileName);
  }

  override hide(): void {
    this.resolve(null);
    super.hide();
  }

  showAsync(): Promise<string | null> {
    return new Promise((resolve) => {
      let resolved = false;
      this.resolve = (v: string | null) => {
        if (!resolved) {
          resolved = true;
          resolve(v);
        }
      };
      super.show();
      requestAnimationFrame(() => {
        this.input.focus();
        this.input.select();
      });
    });
  }
}

/** 파일 이름 입력 대화상자를 표시하고 사용자가 입력한 파일 이름을 반환한다. 취소 시 null. */
export function showSaveAs(
  defaultName: string,
  extension: '.hwp' | '.hwpx' = '.hwp',
  options: { allowFormatChoice?: boolean } = {},
): Promise<string | null> {
  return new SaveAsDialog(defaultName, extension, options).showAsync();
}
