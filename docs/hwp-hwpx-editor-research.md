# HWP/HWPX editor research

Date: 2026-06-04

## Executive summary

The safe product direction is not to force HWP/HWPX through the Collabora/LibreOffice WOPI path. Upstream Collabora advertises legacy `.hwp` as `view` only, not `edit`, and it does not advertise `.hwpx`. LibreOffice's HWP registry type maps only `.hwp`, and its hwpfilter documentation warns about newer HWP format handling risk. HWPX is a ZIP/XML OWPML package, not the same binary format as legacy HWP.

For this project, DOCX should remain on the existing Collabora/WOPI editor. HWP/HWPX should use a dedicated HWP engine/editor path. The implemented candidate is `@rhwp/editor`/`@rhwp/core`, because it can load HWPX, render it, expose editing/export APIs, and round-trip an edited HWPX sample in local testing. That route also uses the existing project file content download/replace API, so it does not need false WOPI discovery capabilities.

## Hard constraints found

- WOPI `view` is non-editable. WOPI `edit` requires update and lock support.
- Collabora Online upstream `discovery.xml` has `edit` and `view` for `.docx`, but only `view` for `.hwp`.
- The current local Collabora discovery also advertises `.hwp` only as `view`.
- LibreOffice type config for `writer_MIZI_Hwp_97` has extension `hwp` and media type `application/x-hwp`, not `hwpx`.
- Local `soffice --headless --convert-to odt sample.hwpx` failed with `source file could not be loaded`.
- The user sample HWPX is a valid ZIP/OWPML file with `mimetype=application/hwp+zip`, `Contents/content.hpf`, `Contents/header.xml`, and `Contents/section0.xml`.

## Local tool trials

- `@ssabrojs/hwpxjs@0.4.0`
  - Loaded the user sample HWPX.
  - Detected format as `hwpx`.
  - Extracted metadata and 675 characters of body text.
- `@rhwp/core@0.7.13`
  - Loaded the same sample as `sourceFormat=hwpx`.
  - Reported 1 section, 1 page, not encrypted.
  - Rendered page 0 to SVG, about 289 KB.
  - Replaced `AI 업무비서` with `AI 업무비서(Codex검증)`, exported HWPX, and reloaded the result.
  - The edited export preserved searchable replacement text, but page count changed 1 to 2 and bytes changed 107,427 to 25,265. This is good enough to justify an HWP-specific path, but not enough to claim perfect layout fidelity without more fixtures.
- `@rhwp/editor@0.7.13`
  - Provides iframe-based full HWP/HWPX editor embedding.
  - Exposes `loadFile`, `exportHwp`, `exportHwpx`, `exportHwpVerify`, `pageCount`, and `getPageSvg`.

## Primary references

- [Microsoft WOPI discovery](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/discovery): `view` is non-editable; `edit` requires update and locks.
- [Collabora Online upstream discovery.xml](https://github.com/CollaboraOnline/online/blob/main/discovery.xml): `.docx` has edit/view; `.hwp` has view only.
- [LibreOffice hwpfilter docs](https://docs.libreoffice.org/hwpfilter.html): HWP filter exists, with warning about newer format handling risk.
- [LibreOffice HWP type config](https://github.com/LibreOffice/core/blob/master/filter/source/config/fragments/types/writer_MIZI_Hwp_97.xcu): maps `writer_MIZI_Hwp_97` to `.hwp`, media type `application/x-hwp`.
- [LibreOffice HWP filter config](https://github.com/LibreOffice/core/blob/master/filter/source/config/fragments/filters/writer_MIZI_Hwp_97.xcu): uses `com.sun.comp.hwpimport.HwpImportFilter`.
- [Hancom HWPX format article](https://tech.hancom.com/hwpxformat/): HWPX is KS X 6101 OWPML, ZIP/XML package.
- [Hancom HWP/OWPML download center](https://shop.haansoft.com/support/downloadCenter/hwpOwpml): documents HWP/HWPML opening and OWPML/HWPX support history.
- [hancom-io/hwpx-owpml-model](https://github.com/hancom-io/hwpx-owpml-model): Hancom OWPML model reference implementation.
- [@rhwp/core on npm](https://www.npmjs.com/package/@rhwp/core): Rust/WASM parser/renderer package used in local tests.
- [@rhwp/editor on npm](https://www.npmjs.com/package/@rhwp/editor): iframe editor package used for the serviceV2 HWP/HWPX editor path.
- [@ssabrojs/hwpxjs on npm](https://www.npmjs.com/package/@ssabrojs/hwpxjs): parser/converter package used in local HWPX sample parsing.

## GitHub/open-source corpus

GitHub repository search was run across HWP/HWPX/Hancom/OWPML/parser/converter/editor/viewer/automation queries. It returned 343 directly filtered candidates. The following curated references exclude unrelated matches where HWP only appeared as an incidental file extension.

1. [edwardkim/rhwp](https://github.com/edwardkim/rhwp) - Rust/WASM HWP/HWPX viewer and editor.
2. [hahnlee/hwp.js](https://github.com/hahnlee/hwp.js) - HWP viewer/parser in TypeScript.
3. [chrisryugj/kordoc](https://github.com/chrisryugj/kordoc) - HWP3/HWP/HWPX/HWPML/PDF/Office to Markdown and MCP tooling.
4. [chrisryugj/Docufinder](https://github.com/chrisryugj/Docufinder) - Local HWPX/PDF/Office content search.
5. [mete0r/pyhwp](https://github.com/mete0r/pyhwp) - Python HWP v5 parser.
6. [hahnlee/hwp-rs](https://github.com/hahnlee/hwp-rs) - Rust HWP parser/tools.
7. [Indosaram/hwpers](https://github.com/Indosaram/hwpers) - Rust HWP parsing/rendering.
8. [ohah/hwpjs](https://github.com/ohah/hwpjs) - HWP parser project.
9. [openhwp/openhwp](https://github.com/openhwp/openhwp) - Library/viewer/editor project for HWP.
10. [airmang/python-hwpx](https://github.com/airmang/python-hwpx) - Python HWPX read/edit/generate/validate.
11. [airmang/hwpx-mcp-server](https://github.com/airmang/hwpx-mcp-server) - MCP server for local HWPX documents.
12. [seunghan91/mdm-desktop](https://github.com/seunghan91/mdm-desktop) - HWP/PDF/DOCX to Markdown.
13. [hallazzang/hwp5-table-extractor](https://github.com/hallazzang/hwp5-table-extractor) - HWP table extractor.
14. [hancom-io/hwpx-owpml-model](https://github.com/hancom-io/hwpx-owpml-model) - OWPML model.
15. [treesoop/hwp-mcp](https://github.com/treesoop/hwp-mcp) - MCP server built on rhwp.
16. [Steven-A3/HWPX-CLAUDE-SKILL](https://github.com/Steven-A3/HWPX-CLAUDE-SKILL) - HWPX automation skill.
17. [daje0601/hwp_to_markdown](https://github.com/daje0601/hwp_to_markdown) - HWP to Markdown.
18. [DoHyun468/claw-hwp](https://github.com/DoHyun468/claw-hwp) - HWP/HWPX read/create/edit skill built on rhwp WASM.
19. [Yoojin-nam/hwp-pipeline](https://github.com/Yoojin-nam/hwp-pipeline) - HWP processing pipeline.
20. [airmang/hwpx-plugins](https://github.com/airmang/hwpx-plugins) - HWPX automation plugins.
21. [cdpython/NewFuzzer](https://github.com/cdpython/NewFuzzer) - HWP OLE parser/fuzzer reference.
22. [HariFatherKR/hwp-parser](https://github.com/HariFatherKR/hwp-parser) - HWP parser.
23. [KimDaehyeon6873/hwp-hwpx-parser](https://github.com/KimDaehyeon6873/hwp-hwpx-parser) - Pure Python HWP/HWPX parser.
24. [vsdn/hwpConverter](https://github.com/vsdn/hwpConverter) - HWP converter.
25. [PNKmath/exam-studio](https://github.com/PNKmath/exam-studio) - HWPX exam studio.
26. [iyulab/unhwp](https://github.com/iyulab/unhwp) - Rust HWP/HWPX to Markdown/text/JSON.
27. [ai-screams/HwpForge](https://github.com/ai-screams/HwpForge) - Rust HWPX programmatic control.
28. [utilForever/hwp-rs](https://github.com/utilForever/hwp-rs) - Rust HWP parser.
29. [zzolab/hwp_automation](https://github.com/zzolab/hwp_automation) - HWP automation.
30. [hancom-io/metatag-ex](https://github.com/hancom-io/metatag-ex) - OWPML metadata extraction.
31. [kocoredisk/mydoo-viewer](https://github.com/kocoredisk/mydoo-viewer) - HWP/HWPX viewer.
32. [pitzcarraldo/pyhwp2md](https://github.com/pitzcarraldo/pyhwp2md) - HWP/HWPX to Markdown.
33. [DanMeon/rhwp-python](https://github.com/DanMeon/rhwp-python) - Python bindings for rhwp.
34. [tdh8316/hwp_editor](https://github.com/tdh8316/hwp_editor) - Cross-platform Hancom document editor.
35. [sboh1214/Hwp-Mac](https://github.com/sboh1214/Hwp-Mac) - macOS HWP editor.
36. [syehoonkim/QuickLook.Plugin.HwpViewer](https://github.com/syehoonkim/QuickLook.Plugin.HwpViewer) - HWP/HWPX QuickLook preview based on rhwp.
37. [ratiertm/hwpx-skill](https://github.com/ratiertm/hwpx-skill) - HWPX create/edit Python library.
38. [KimDaehyeon6873/hwp-hwpx-editor](https://github.com/KimDaehyeon6873/hwp-hwpx-editor) - Python HWP/HWPX editor.
39. [muin-company/handoc](https://github.com/muin-company/handoc) - TypeScript HWP/HWPX parser/writer.
40. [wavelen-jw/GovPress_PDF_MD](https://github.com/wavelen-jw/GovPress_PDF_MD) - Government HWPX/PDF to Markdown.
41. [jkf87/hwp2hwpx-python-refactor](https://github.com/jkf87/hwp2hwpx-python-refactor) - HWP to HWPX converter.
42. [fieldcure/fieldcure-document-parsers](https://github.com/fieldcure/fieldcure-document-parsers) - DOCX/HWPX/XLSX/PPTX/PDF parser.
43. [yongmmin/web-hwp-editor](https://github.com/yongmmin/web-hwp-editor) - Browser HWP/HWPX editor.
44. [newskool4d-sketch/to_hwpx.com.py](https://github.com/newskool4d-sketch/to_hwpx.com.py) - Markdown to HWPX.
45. [pureivy/hwpx-convert-skill](https://github.com/pureivy/hwpx-convert-skill) - Markdown to HWPX skill.
46. [franknoh/hwp-eqn-ts](https://github.com/franknoh/hwp-eqn-ts) - HWP and LaTeX equation parser.
47. [eeseol/hwpx-converter](https://github.com/eeseol/hwpx-converter) - HWPX to HTML converter.
48. [kwstephenkim/hwpviewer](https://github.com/kwstephenkim/hwpviewer) - Docker HWP viewer.
49. [b612nightsky/gohwp](https://github.com/b612nightsky/gohwp) - Go HWP automation.
50. [kcalvinalvin/goodhangul](https://github.com/kcalvinalvin/goodhangul) - FOSS Hangul tooling.
51. [kiju7/JDoc](https://github.com/kiju7/JDoc) - C++ PDF/Office/HWP to Markdown/text parser.
52. [twbeatles/HwpMate](https://github.com/twbeatles/HwpMate) - HWP to PDF batch converter.
53. [Leewonwoo/hwpscript](https://github.com/Leewonwoo/hwpscript) - HWP web viewer.
54. [hephaex/hwp2md](https://github.com/hephaex/hwp2md) - Rust HWP/HWPX Markdown converter.
55. [dalgona039/hop_android](https://github.com/dalgona039/hop_android) - Android HWP/HWPX viewer/editor powered by rhwp.
56. [shreyanshu09/html2hwpx](https://github.com/shreyanshu09/html2hwpx) - HTML to HWPX conversion engine.
57. [docpler/docpler-python](https://github.com/docpler/docpler-python) - Rust-powered HWP to Markdown converter.
58. [hyunsungko/Skill-MD-Converter](https://github.com/hyunsungko/Skill-MD-Converter) - HWP/PPTX/DOCX/XLSX to Markdown skill.
59. [m1ns2o/hwp-mcp-go](https://github.com/m1ns2o/hwp-mcp-go) - Go MCP server for HWP COM automation.
60. [leaf-kit/hwp2.md](https://github.com/leaf-kit/hwp2.md) - Rust HWP to Markdown.
61. [cdsassj00/claude_hwpx_skill](https://github.com/cdsassj00/claude_hwpx_skill) - HWPX generation skill.
62. [twoLoop-40/HwpAutomation](https://github.com/twoLoop-40/HwpAutomation) - HWP MCP automation.
63. [jacepark12/hwp-converter-api](https://github.com/jacepark12/hwp-converter-api) - HWP converter API.
64. [gisman/HWP-automation](https://github.com/gisman/HWP-automation) - HWP automation procedures.
65. [Seobuk/HWPX_St_Converter](https://github.com/Seobuk/HWPX_St_Converter) - HWPX style converter.
66. [jo-bata/Edit_Automation_Process](https://github.com/jo-bata/Edit_Automation_Process) - HWP edit automation process.
67. [Regentag/HangulImageViewer](https://github.com/Regentag/HangulImageViewer) - HWP embedded image viewer.
68. [jongwony/python_hwp](https://github.com/jongwony/python_hwp) - Python HWP parser.
69. [qwefgh90/jsearch](https://github.com/qwefgh90/jsearch) - Document text extraction including HWP.
70. [sanguneo/rhwptopdf](https://github.com/sanguneo/rhwptopdf) - Browser HWP/HWPX to PDF.
71. [GS-AX/doc-weaver](https://github.com/GS-AX/doc-weaver) - Local documents including HWP to Markdown.
72. [z0nam/hwp2pdf](https://github.com/z0nam/hwp2pdf) - HWP/HWPX to PDF.
73. [iyulab/system-harness](https://github.com/iyulab/system-harness) - Office/HWP document processing harness.
74. [lee775/WookViewer](https://github.com/lee775/WookViewer) - Android PDF/DOCX/PPTX/HWP viewer.
75. [zobithecat/ts-hwp-transpiler](https://github.com/zobithecat/ts-hwp-transpiler) - HWP/HWPX Markdown transpiler.
76. [psychofict/hwpkit](https://github.com/psychofict/hwpkit) - Python HWP read/fill/edit.
77. [Victor-jh/hwpx-studio](https://github.com/Victor-jh/hwpx-studio) - HWPX OWPML editor engine.
78. [shkim-shk/md2hwpx-skill](https://github.com/shkim-shk/md2hwpx-skill) - Markdown to HWPX skill.
79. [beskep/hwp-preview.yazi](https://github.com/beskep/hwp-preview.yazi) - HWP/HWPX previewer.
80. [jc-kim/hwp2md](https://github.com/jc-kim/hwp2md) - HWP to Markdown.
81. [user5365476586585/hancomdocs-on-claude-in-chrome](https://github.com/user5365476586585/hancomdocs-on-claude-in-chrome) - Hancom Docs web editor automation.
82. [UnripePlum/hihangul](https://github.com/UnripePlum/hihangul) - Local-first HWP assistant.
83. [jeongsuho-lawyer/HWPCONV](https://github.com/jeongsuho-lawyer/HWPCONV) - HWP/HWPX to Markdown/HTML.
84. [jjangkor/md-to-hwpx-claude-skill-](https://github.com/jjangkor/md-to-hwpx-claude-skill-) - Markdown to HWPX.
85. [kimyoungjin06/md-docx-hwpx-converter](https://github.com/kimyoungjin06/md-docx-hwpx-converter) - Markdown/DOCX/HWPX converter.
86. [korehan777/HWP_to_HWPX_Converter](https://github.com/korehan777/HWP_to_HWPX_Converter) - HWP to HWPX batch converter.
87. [minseo0388/hwplib-py](https://github.com/minseo0388/hwplib-py) - Python HWP extraction engine.
88. [ychoi-kr/claude-hwp-converter-skill](https://github.com/ychoi-kr/claude-hwp-converter-skill) - HWP/HWPX to plain text skill.
89. [kekero1004/RootHwpToPDF](https://github.com/kekero1004/RootHwpToPDF) - HWP to PDF software.
90. [suime/md2hwpx](https://github.com/suime/md2hwpx) - Markdown to HWPX.
91. [Seong-Myeong/hwpAutomation](https://github.com/Seong-Myeong/hwpAutomation) - HWP automation.
92. [heosd/hwpx](https://github.com/heosd/hwpx) - HWPX table to CSV.
93. [t3nderex/pyhwp5](https://github.com/t3nderex/pyhwp5) - HWP parser.
94. [damob-byun/NodeSimpleDocumentViewer](https://github.com/damob-byun/NodeSimpleDocumentViewer) - Node HWP document viewer.
95. [iamahuman/hwp80-container](https://github.com/iamahuman/hwp80-container) - Hancom Office wrapper.
96. [Team-IF/HwpViewer](https://github.com/Team-IF/HwpViewer) - HWP viewer.
97. [shurrey/hwptest](https://github.com/shurrey/hwptest) - HWP to PDF building block.
98. [cockatielsolitude897/kordoc](https://github.com/cockatielsolitude897/kordoc) - Korean office document parser/generator.
99. [mzoryy/hwpxskill](https://github.com/mzoryy/hwpxskill) - XML-preserving HWPX editing.
100. [Arunpandi77/pypandoc-hwpx](https://github.com/Arunpandi77/pypandoc-hwpx) - Word/Markdown/HTML to HWPX.
101. [talelhamdi/hwp-markdown-transpiler](https://github.com/talelhamdi/hwp-markdown-transpiler) - HWP Markdown transpiler/HWPX extractor.
102. [pblsketch/rhwp-mcp-server](https://github.com/pblsketch/rhwp-mcp-server) - MCP server powered by `@rhwp/core`.
103. [nams119/hwpx-](https://github.com/nams119/hwpx-) - HWPX image extraction/compression.
104. [gimmiee/hwp-to-pdf-on-mac](https://github.com/gimmiee/hwp-to-pdf-on-mac) - macOS HWP/HWPX to PDF.
105. [KIM3310/secure-xl2hwp-local](https://github.com/KIM3310/secure-xl2hwp-local) - Excel to Hancom converter.
106. [fakeminjun7321/hwp-to-pdf](https://github.com/fakeminjun7321/hwp-to-pdf) - HWP to PDF.
107. [minigu5/markdown_to_hwp](https://github.com/minigu5/markdown_to_hwp) - Markdown to HWPX.
108. [YeonGyu1129/pdf-to-hwpx](https://github.com/YeonGyu1129/pdf-to-hwpx) - PDF/image to HWPX app.
109. [edu-openskill/doc-mcp](https://github.com/edu-openskill/doc-mcp) - HWPX/DOCX/Excel document control.
110. [hclee-source/hwpx-proofreader](https://github.com/hclee-source/hwpx-proofreader) - Browser HWPX proofreading/formatting.
111. [kiju7/docloom](https://github.com/kiju7/docloom) - TypeScript document preview/edit including HWP/HWPX.
112. [0xAryweb3/notion-hwpx-converter](https://github.com/0xAryweb3/notion-hwpx-converter) - Notion to HWPX converter.
113. [DoHyun468/claw-hwp-automation](https://github.com/DoHyun468/claw-hwp-automation) - HWP automation.
114. [PlateerLab/document-adapter](https://github.com/PlateerLab/document-adapter) - DOCX/PPTX/HWPX editing adapter/MCP.
115. [flamingo8006/hwpx-mcp](https://github.com/flamingo8006/hwpx-mcp) - HWPX MCP.
116. [Engccer/hwpx-automation](https://github.com/Engccer/hwpx-automation) - HWPX automation.
117. [CSP927/hwp-parser](https://github.com/CSP927/hwp-parser) - HWP parser.
118. [Ryu-LegalDev/KoreanLaw-hwpx-exhibit-renumber](https://github.com/Ryu-LegalDev/KoreanLaw-hwpx-exhibit-renumber) - HWPX exhibit renumbering.
119. [kda2663-coder/hwp-viewer-for-Google-workspace](https://github.com/kda2663-coder/hwp-viewer-for-Google-workspace) - Google Workspace HWP viewer.
120. [Seooooooogi/hwpx-mcp](https://github.com/Seooooooogi/hwpx-mcp) - HWP/HWPX MCP server built on rhwp.

## Implementation decision

Use two editor tracks:

- DOCX: keep the existing Collabora/WOPI path.
- HWP/HWPX: use RHWP editor in serviceV2 and save via the existing authenticated project file content endpoint.

Do not modify Collabora discovery to claim HWP/HWPX edit support until the Collabora/LibreOffice engine can import, edit, export, and reload real HWP/HWPX fixtures without layout and content regressions.
