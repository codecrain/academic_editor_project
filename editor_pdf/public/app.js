import EmbedPDF from './vendor/embedpdf/embedpdf.js';

const target = document.getElementById('pdfViewer');
const runtimeStatus = document.getElementById('runtimeStatus');
const bootError = document.getElementById('bootError');
const bootErrorMessage = document.getElementById('bootErrorMessage');

function failBoot(error) {
  const message = error instanceof Error ? error.message : String(error);
  runtimeStatus.textContent = '편집 엔진 시작 실패';
  bootErrorMessage.textContent = message;
  bootError.hidden = false;
  console.error('Academic PDF Editor startup failed.', error);
}

try {
  const viewer = EmbedPDF.init({
    type: 'container',
    target,
    worker: true,
    tabBar: 'always',
    annotations: {
      annotationAuthor: 'Academic Editor',
      selectAfterCreate: true,
    },
    export: {
      defaultFileName: 'academic-edited.pdf',
    },
    permissions: {
      enforceDocumentPermissions: true,
    },
    theme: {
      preference: 'light',
      light: {
        accent: {
          primary: '#4f46e5',
          primaryHover: '#4338ca',
          primaryActive: '#3730a3',
          primaryLight: '#eef2ff',
          primaryForeground: '#ffffff',
        },
      },
    },
  });

  viewer.registry.then((registry) => {
    const documentManager = registry.getPlugin('document-manager')?.provides();
    documentManager?.onDocumentOpened((documentState) => {
      runtimeStatus.textContent = `${documentState.name || 'PDF'} · PDFium 편집 준비 완료`;
    });
    documentManager?.onDocumentClosed(() => {
      runtimeStatus.textContent = 'PDFium 편집 준비 완료';
    });
    documentManager?.onDocumentError((event) => {
      runtimeStatus.textContent = `PDF 열기 실패: ${event?.error?.message || '알 수 없는 오류'}`;
    });
    runtimeStatus.textContent = 'PDFium 편집 준비 완료';
  }).catch(failBoot);

  window.academicPdfEditor = Object.freeze({
    engine: 'PDFium',
    version: '2.14.4',
    viewer,
    registry: viewer.registry,
  });
} catch (error) {
  failBoot(error);
}
