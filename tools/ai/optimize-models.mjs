// Tripo3D modelleri ~10-20 MB ve 150-400 bin üçgen gelir (iskeletleme de üçgen ekler).
// Web için meshopt sıkıştırması, 1024 px WebP doku uygular ve modeli assets.json'daki
// "faces" sınırına kadar sadeleştirir (genelde 20-50 kat küçülür). Dosyanın üzerine yazar.
// Kullanım: node tools/ai/optimize-models.mjs [model_adı ...]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib.mjs";

const CLI = ["-y", "@gltf-transform/cli@4.5.1"];
const dir = resolve(ROOT, "client/public/assets/models");
const { models } = JSON.parse(readFileSync(resolve(ROOT, "tools/ai/assets.json"), "utf8"));
const names = process.argv.slice(2);
const files = names.length ? names.map((n) => `${n}.glb`) : readdirSync(dir).filter((f) => f.endsWith(".glb"));

function triangleCount(path) {
  const csv = execFileSync("npx", [...CLI, "inspect", path, "--format", "csv"], { encoding: "utf8" });
  const meshes = csv.split("MESHES")[1].split("MATERIALS")[0];
  // Satır: #,name,mode,meshPrimitives,glPrimitives,...
  return meshes
    .split("\n")
    .filter((line) => /^\d+,/.test(line))
    .reduce((sum, line) => sum + Number(line.split(",")[4]), 0);
}

for (const file of files) {
  const path = resolve(dir, file);
  const faces = models[file.replace(/\.glb$/, "")]?.faces;
  const tris = triangleCount(path);
  const ratio = faces && tris > faces ? (faces / tris).toFixed(4) : null;
  execFileSync(
    "npx",
    [...CLI, "optimize", path, path, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024",
      ...(ratio ? ["--simplify-ratio", ratio, "--simplify-error", "0.01"] : ["--simplify", "false"])],
    { stdio: "inherit" },
  );
  console.log(`Küçültüldü: ${file} (${tris} üçgen${ratio ? ` → ~${faces}` : ""})`);
}
