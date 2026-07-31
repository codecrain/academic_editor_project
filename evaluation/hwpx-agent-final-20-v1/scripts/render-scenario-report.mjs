import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const outputPath = process.argv[2] || path.join(rootDirectory, "HWPX_AGENT_SCENARIO_REPORT.md");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
const scenarios = (await readFile(path.join(rootDirectory, "scenarios.jsonl"), "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const attachmentManifest = await readJson(path.join(rootDirectory, "attachments.json"));
const attachmentsById = new Map(attachmentManifest.attachments.map((attachment) => [attachment.id, attachment]));

const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const lines = [
  "# HWPX Agent final 20 validation report v1",
  "",
  "> **CANONICAL — CURRENT**",
  ">",
  "> This is the lossless readable view of the only authoritative HWPX Agent validation inputs and completion criteria.",
  "> Deterministic oracle replay is an editor-engine gate only; it is not an HWPX Agent pass.",
  "",
  "This file is a mechanical rendering of the checked-in scenario, attachment, and gold JSON. It adds no interpretation or acceptance criteria.",
  "",
  `- Scenario source: \`scenarios.jsonl\` (${scenarios.length} cases)`,
  "- Attachment source: `attachments.json`",
  "- Completion-criteria source: `gold/HWPX-PS-*.json`",
  "",
  "## Cases",
  "",
  ...scenarios.map((scenario) => `- [${scenario.id} — ${scenario.title}](#${scenario.id.toLowerCase()})`),
];

for (const scenario of scenarios) {
  const gold = await readJson(path.join(rootDirectory, "gold", `${scenario.id}.json`));
  const attachmentDefinitions = scenario.attachments.map((attachmentId) => {
    const attachment = attachmentsById.get(attachmentId);
    if (!attachment) {
      throw new Error(`${scenario.id} references unknown attachment ${attachmentId}`);
    }
    return attachment;
  });

  lines.push(
    "",
    `## ${scenario.id}`,
    "",
    `### Input — scenario original (${scenario.title})`,
    "",
    json(scenario),
    "",
    "### Input — attachment definitions original",
    "",
    json(attachmentDefinitions),
    "",
    "### Completion criteria — gold original",
    "",
    json(gold),
  );
}

await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${outputPath}\n`);
