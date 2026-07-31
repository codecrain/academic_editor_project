import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const legacyRoot = path.resolve(root, "..", "legacy", "hwpx-public-sector-v1-retired-80");

export const selectedScenarioIds = [
  "HWPX-PS-001",
  "HWPX-PS-013",
  "HWPX-PS-025",
  "HWPX-PS-031",
  "HWPX-PS-043",
  "HWPX-PS-052",
  "HWPX-PS-054",
  "HWPX-PS-061",
  "HWPX-PS-064",
  "HWPX-PS-067",
  "HWPX-PS-070",
  "HWPX-PS-073",
  "HWPX-PS-076",
  "HWPX-PS-079",
  "HWPX-PS-081",
  "HWPX-PS-082",
  "HWPX-PS-085",
  "HWPX-PS-088",
  "HWPX-PS-091",
  "HWPX-PS-100",
];

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const readJsonl = async (filePath) => (await fs.readFile(filePath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
const exists = async (filePath) => fs.access(filePath).then(() => true, () => false);
const writeJson = (filePath, value) => fs.writeFile(
  filePath,
  `${JSON.stringify(value, null, 2)}\n`,
  "utf8",
);
const writeJsonl = (filePath, values) => fs.writeFile(
  filePath,
  `${values.map((value) => JSON.stringify(value)).join("\n")}\n`,
  "utf8",
);

await fs.mkdir(path.join(legacyRoot, "gold"), { recursive: true });
await fs.mkdir(path.join(legacyRoot, "results"), { recursive: true });

const activeScenarios = await readJsonl(path.join(root, "scenarios.jsonl"));
const retiredScenarioPath = path.join(legacyRoot, "scenarios.jsonl");
const retiredScenarios = await exists(retiredScenarioPath)
  ? await readJsonl(retiredScenarioPath)
  : [];
const allScenariosById = new Map(
  [...activeScenarios, ...retiredScenarios].map((scenario) => [scenario.id, scenario]),
);
if (allScenariosById.size !== 100) {
  throw new Error(`Expected the original 100 unique scenarios, got ${allScenariosById.size}.`);
}

const selectedIds = new Set(selectedScenarioIds);
const selectedScenarios = selectedScenarioIds.map((id) => {
  const scenario = allScenariosById.get(id);
  if (!scenario) throw new Error(`Missing selected scenario ${id}.`);
  return scenario;
});
const retiredScenariosNext = [...allScenariosById.values()]
  .filter((scenario) => !selectedIds.has(scenario.id))
  .sort((left, right) => left.id.localeCompare(right.id));
if (selectedScenarios.length !== 20 || retiredScenariosNext.length !== 80) {
  throw new Error("Final/legacy split must be exactly 20/80.");
}

await writeJsonl(path.join(root, "scenarios.jsonl"), selectedScenarios);
await writeJsonl(retiredScenarioPath, retiredScenariosNext);

const activeAttachmentPayload = await readJson(path.join(root, "attachments.json"));
const retiredAttachmentPath = path.join(legacyRoot, "attachments.json");
const retiredAttachmentPayload = await exists(retiredAttachmentPath)
  ? await readJson(retiredAttachmentPath)
  : { attachments: [] };
const allAttachmentsById = new Map(
  [...activeAttachmentPayload.attachments, ...retiredAttachmentPayload.attachments]
    .map((attachment) => [attachment.id, attachment]),
);
const referencedAttachmentIds = new Set(selectedScenarios.flatMap((scenario) => scenario.attachments));
const selectedAttachments = [...allAttachmentsById.values()]
  .filter((attachment) => referencedAttachmentIds.has(attachment.id));
const retiredAttachments = [...allAttachmentsById.values()]
  .filter((attachment) => !referencedAttachmentIds.has(attachment.id));
if (selectedAttachments.length !== 11 || retiredAttachments.length !== 2) {
  throw new Error(
    `Final/legacy attachment split must be exactly 11/2, got ${selectedAttachments.length}/${retiredAttachments.length}.`,
  );
}

await writeJson(path.join(root, "attachments.json"), {
  version: "2.0.0",
  generatedAt: "2026-07-30",
  attachmentCount: selectedAttachments.length,
  attachments: selectedAttachments,
});
await writeJson(retiredAttachmentPath, {
  status: "legacy-prohibited",
  canonicalContract: "../hwpx-agent-final-20-v1",
  attachmentCount: retiredAttachments.length,
  attachments: retiredAttachments,
});

for (const scenario of retiredScenariosNext) {
  const source = path.join(root, "gold", `${scenario.id}.json`);
  const destination = path.join(legacyRoot, "gold", `${scenario.id}.json`);
  if (await exists(source)) await fs.rename(source, destination);
}
for (const scenario of selectedScenarios) {
  const destination = path.join(root, "gold", `${scenario.id}.json`);
  const source = path.join(legacyRoot, "gold", `${scenario.id}.json`);
  if (!await exists(destination) && await exists(source)) await fs.rename(source, destination);
  if (!await exists(destination)) throw new Error(`Missing selected gold record ${scenario.id}.`);
}

const resultsRoot = path.join(root, "results");
if (await exists(resultsRoot)) {
  for (const name of await fs.readdir(resultsRoot)) {
    const source = path.join(resultsRoot, name);
    const destination = path.join(legacyRoot, "results", name);
    if (!await exists(destination)) await fs.rename(source, destination);
  }
}

const manifestPath = path.join(root, "manifest.json");
const manifest = await readJson(manifestPath);
const sourceFormats = [...new Set(selectedAttachments.map((attachment) => (
  path.extname(attachment.path).slice(1).toLowerCase()
)))].sort();
const questionLengths = selectedScenarios.map((scenario) => scenario.question.length);
delete manifest.encryptedPackageAudit;
manifest.version = "2.0.0";
manifest.generatedAt = "2026-07-30";
manifest.scenarioCount = selectedScenarios.length;
manifest.editCount = selectedScenarios.filter((scenario) => scenario.mode === "edit").length;
manifest.generationCount = selectedScenarios.filter((scenario) => scenario.mode === "generation").length;
manifest.minQuestionLength = Math.min(...questionLengths);
manifest.maxQuestionLength = Math.max(...questionLengths);
manifest.domains = [...new Set(selectedScenarios.map((scenario) => scenario.domain))].sort();
manifest.sourceFormats = sourceFormats;
manifest.attachmentCount = selectedAttachments.length;
manifest.authority.scope = "hwpx-agent-final-20-validation-contract";
manifest.authority.selectedScenarioIds = selectedScenarioIds;
manifest.authority.selectionPolicy = [
  "retain known deterministic replay failures",
  "retain prior incomplete rerun case HWPX-PS-081",
  "maximize complex edit coverage: image replacement, pagination, formula traps, atomic rollback, large legacy HWP",
  "retain template-based generation coverage",
];
manifest.authority.legacyArchive = "../legacy/hwpx-public-sector-v1-retired-80";
await writeJson(manifestPath, manifest);

console.log(JSON.stringify({
  ok: true,
  selected: selectedScenarios.length,
  retired: retiredScenariosNext.length,
  edit: manifest.editCount,
  generation: manifest.generationCount,
  attachments: selectedAttachments.length,
  selectedScenarioIds,
}));
