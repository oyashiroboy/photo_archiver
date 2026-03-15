import { readFile, writeFile } from "fs/promises";

const CONFIG_PATH = "config/gallery.config.json";
const BASE_WRANGLER_PATH = "wrangler.toml";
const OUTPUT_WRANGLER_PATH = ".wrangler.generated.toml";

function setNameInToml(tomlText, workerName) {
  const quotedName = `name = "${workerName.replace(/"/g, "\\\"")}"`;

  if (/^name\s*=\s*".*"\s*$/m.test(tomlText)) {
    return tomlText.replace(/^name\s*=\s*".*"\s*$/m, quotedName);
  }

  return `${quotedName}\n${tomlText}`;
}

async function main() {
  const [configRaw, wranglerRaw] = await Promise.all([
    readFile(CONFIG_PATH, "utf8"),
    readFile(BASE_WRANGLER_PATH, "utf8"),
  ]);

  const config = JSON.parse(configRaw);
  const workerName = config?.deploy?.workerName;

  if (!workerName || typeof workerName !== "string") {
    throw new Error("config/gallery.config.json: deploy.workerName is required");
  }

  const generatedToml = setNameInToml(wranglerRaw, workerName.trim());
  await writeFile(OUTPUT_WRANGLER_PATH, generatedToml, "utf8");

  console.log(`Generated ${OUTPUT_WRANGLER_PATH} with name=${workerName.trim()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
