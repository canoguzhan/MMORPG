// Tripo3D modelleri ~10-20 MB gelir; web için meshopt sıkıştırması ve 1024 px WebP doku
// uygular (genelde 10 kat küçülür). Üçgen sayısı üretimde assets.json'daki "faces" ile sınırlanır.
// Dosyanın üzerine yazar.
// Kullanım: node tools/ai/optimize-models.mjs [model_adı ...]
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib.mjs";

const dir = resolve(ROOT, "client/public/assets/models");
const names = process.argv.slice(2);
const files = names.length ? names.map((n) => `${n}.glb`) : readdirSync(dir).filter((f) => f.endsWith(".glb"));

for (const file of files) {
  const path = resolve(dir, file);
  execFileSync(
    "npx",
    ["-y", "@gltf-transform/cli@4.5.1", "optimize", path, path,
      "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "false"],
    { stdio: "inherit" },
  );
  console.log(`Küçültüldü: ${file}`);
}
