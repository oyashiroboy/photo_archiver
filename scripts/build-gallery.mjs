import archiver from "archiver";
import sharp from "sharp";
import { createWriteStream } from "fs";
import { access } from "fs/promises";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { dirname, extname, join, relative } from "path";

const DEFAULT_CONFIG_PATH = "config/gallery.config.json";

function toPosixPath(p) {
  return p.replace(/\\/g, "/");
}

function toSectionFolder(folder) {
  return folder.replace(/^IMG\//, "").replace(/^\/+/, "");
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function parseArgs() {
  const configIndex = process.argv.indexOf("--config");
  if (configIndex !== -1 && process.argv[configIndex + 1]) {
    return { configPath: process.argv[configIndex + 1] };
  }
  return { configPath: DEFAULT_CONFIG_PATH };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listImagesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listImagesRecursive(fullPath)));
      continue;
    }

    if (/\.(jpe?g|png)$/i.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function getThumbRelFromOriginalRel(originalRel) {
  return originalRel.replace(/\.(jpe?g|png)$/i, ".webp");
}

async function transformToLight(srcAbs, dstAbs, cfgImage) {
  const ext = extname(srcAbs).toLowerCase();
  const pipeline = sharp(srcAbs)
    .resize({
      width: cfgImage.lightShortSide,
      height: cfgImage.lightShortSide,
      fit: "outside",
      withoutEnlargement: true,
    })
    .toColorspace("srgb")
    .withIccProfile("srgb");

  if (ext === ".png") {
    await pipeline.png({ compressionLevel: 9 }).toFile(dstAbs);
    return;
  }

  await pipeline
    .jpeg({
      quality: cfgImage.lightJpegQuality,
      mozjpeg: true,
      chromaSubsampling: "4:2:0",
    })
    .toFile(dstAbs);
}

async function transformToThumb(srcAbs, dstAbs, cfgImage) {
  await sharp(srcAbs)
    .resize({ width: cfgImage.thumbWidth, withoutEnlargement: true })
    .webp({ quality: cfgImage.thumbWebpQuality })
    .toFile(dstAbs);
}

async function buildZip(outputPath, srcDir, files, compressionLevel = 0) {
  const output = createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: compressionLevel } });

  const done = new Promise((resolve, reject) => {
    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
  });

  archive.pipe(output);
  for (const relFile of files) {
    archive.file(join(srcDir, relFile), { name: relFile });
  }
  await archive.finalize();
  return done;
}

function roundMb(bytes) {
  return Math.max(0, Math.round(bytes / 1024 / 1024));
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function runBatch(items, limit, worker) {
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    await Promise.all(chunk.map(worker));
  }
}

async function main() {
  const { configPath } = parseArgs();
  const configRaw = await readFile(configPath, "utf8");
  const config = JSON.parse(configRaw);

  ensureArray(config.tabs, "tabs");

  const usedTabIds = new Set();
  const usedSectionIds = new Set();
  for (const tab of config.tabs) {
    if (!tab?.id) throw new Error("tabs[].id is required");
    if (usedTabIds.has(tab.id)) throw new Error(`Duplicate tab id: ${tab.id}`);
    usedTabIds.add(tab.id);
    ensureArray(tab.sections, `tabs[${tab.id}].sections`);
    for (const section of tab.sections) {
      if (!section?.id) throw new Error(`tabs[${tab.id}].sections[].id is required`);
      if (usedSectionIds.has(section.id)) throw new Error(`Duplicate section id: ${section.id}`);
      usedSectionIds.add(section.id);
    }
  }

  const paths = config.paths;
  const image = config.image;
  const zipCfg = config.zip;

  const maxZipSize = (zipCfg.maxSizeMiB ?? 25) * 1024 * 1024;
  const recompressLevel = zipCfg.recompressLevel ?? 9;
  const batch = image.batch ?? 4;

  await rm(paths.lightRoot, { recursive: true, force: true });
  await rm(paths.thumbRoot, { recursive: true, force: true });
  await rm(paths.zipRoot, { recursive: true, force: true });

  await mkdir(paths.lightRoot, { recursive: true });
  await mkdir(paths.thumbRoot, { recursive: true });
  await mkdir(paths.zipRoot, { recursive: true });

  const tabsOut = [];
  const zipWarnings = [];
  let totalOriginal = 0;
  let totalLight = 0;
  let totalThumb = 0;
  let totalCount = 0;

  for (const tab of config.tabs) {
    const sectionsOut = [];

    for (const section of tab.sections) {
      const sectionFolder = toSectionFolder(section.folder);
      const srcSectionDir = join(paths.originalRoot, sectionFolder);

      if (!(await fileExists(srcSectionDir))) {
        console.warn(`SKIP: missing folder ${toPosixPath(srcSectionDir)}`);
        sectionsOut.push({
          id: section.id,
          title: section.title,
          folder: `IMG/${toPosixPath(sectionFolder)}`,
          files: [],
          lightSizeMB: 0,
          zipName: section.zipEnabled === false ? "" : `${section.id}.zip`,
          isOral: !!section.isOral,
        });
        continue;
      }

      const originalsAbs = await listImagesRecursive(srcSectionDir);
      originalsAbs.sort((a, b) => a.localeCompare(b, "ja"));

      let sectionOriginalSize = 0;
      let sectionLightSize = 0;
      let sectionThumbSize = 0;

      await runBatch(originalsAbs, batch, async (srcAbs) => {
        const relInsideSection = toPosixPath(relative(srcSectionDir, srcAbs));
        const relOriginal = toPosixPath(join(sectionFolder, relInsideSection));
        const relThumb = toPosixPath(join(sectionFolder, getThumbRelFromOriginalRel(relInsideSection)));

        const dstLightAbs = join(paths.lightRoot, relOriginal);
        const dstThumbAbs = join(paths.thumbRoot, relThumb);

        await mkdir(dirname(dstLightAbs), { recursive: true });
        await mkdir(dirname(dstThumbAbs), { recursive: true });

        await transformToLight(srcAbs, dstLightAbs, image);
        await transformToThumb(srcAbs, dstThumbAbs, image);

        const [srcStat, lightStat, thumbStat] = await Promise.all([
          stat(srcAbs),
          stat(dstLightAbs),
          stat(dstThumbAbs),
        ]);

        sectionOriginalSize += srcStat.size;
        sectionLightSize += lightStat.size;
        sectionThumbSize += thumbStat.size;
      });

      const files = originalsAbs.map((srcAbs) => {
        const relInsideSection = toPosixPath(relative(srcSectionDir, srcAbs));
        return relInsideSection;
      });

      let zipName = "";
      if (section.zipEnabled !== false && files.length > 0) {
        zipName = `${section.id}.zip`;
        const zipPath = join(paths.zipRoot, zipName);
        let zipSize = await buildZip(zipPath, join(paths.lightRoot, sectionFolder), files, 0);

        if (zipSize > maxZipSize) {
          console.log(`  ${zipName} ${fmtMb(zipSize)} > ${zipCfg.maxSizeMiB}MiB, recompressing...`);
          zipSize = await buildZip(zipPath, join(paths.lightRoot, sectionFolder), files, recompressLevel);
        }

        if (zipSize > maxZipSize) {
          zipWarnings.push(`${zipName} is ${fmtMb(zipSize)} and exceeds ${zipCfg.maxSizeMiB}MiB`);
        }
      }

      totalOriginal += sectionOriginalSize;
      totalLight += sectionLightSize;
      totalThumb += sectionThumbSize;
      totalCount += files.length;

      sectionsOut.push({
        id: section.id,
        title: section.title,
        folder: `IMG/${toPosixPath(sectionFolder)}`,
        files,
        lightSizeMB: roundMb(sectionLightSize),
        zipName,
        isOral: !!section.isOral,
      });
    }

    tabsOut.push({
      id: tab.id,
      label: tab.label,
      descriptionHtml: tab.descriptionHtml ?? "",
      sections: sectionsOut,
    });
  }

  const galleryData = {
    generatedAt: new Date().toISOString(),
    site: config.site,
    tabs: tabsOut,
    summary: {
      imageCount: totalCount,
      originalMB: roundMb(totalOriginal),
      lightMB: roundMb(totalLight),
      thumbMB: roundMb(totalThumb),
      lightReductionPercent:
        totalOriginal > 0 ? Number(((1 - totalLight / totalOriginal) * 100).toFixed(1)) : 0,
      thumbReductionPercent:
        totalOriginal > 0 ? Number(((1 - totalThumb / totalOriginal) * 100).toFixed(1)) : 0,
      zipWarnings,
    },
  };

  await mkdir(dirname(paths.galleryDataPath), { recursive: true });
  await writeFile(paths.galleryDataPath, `${JSON.stringify(galleryData, null, 2)}\n`, "utf8");

  console.log("Build complete.");
  console.log(`  Images: ${totalCount}`);
  console.log(`  Original: ${roundMb(totalOriginal)} MB`);
  console.log(`  Light: ${roundMb(totalLight)} MB (${galleryData.summary.lightReductionPercent}% reduction)`);
  console.log(`  Thumb: ${roundMb(totalThumb)} MB (${galleryData.summary.thumbReductionPercent}% reduction)`);

  if (zipWarnings.length) {
    console.log("ZIP warnings:");
    for (const warning of zipWarnings) {
      console.log(`  - ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
