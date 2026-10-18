// assets.json içindeki tüm varlıkları üretir. Var olan dosyalar atlanır.
// Kullanım: node tools/ai/generate-all.mjs [models|sfx|media]
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import { generateModel } from "./tripo3d.mjs";
import { soundEffect } from "./elevenlabs.mjs";
import { generate } from "./higgsfield.mjs";

const assets = JSON.parse(await readFile(resolve(ROOT, "tools/ai/assets.json"), "utf8"));
const only = process.argv[2];
const exists = (p) => existsSync(resolve(ROOT, p));

if (!only || only === "models") {
  for (const [name, { prompt, faces, rig }] of Object.entries(assets.models)) {
    if (exists(`client/public/assets/models/${name}.glb`)) continue;
    await generateModel(name, prompt, faces, rig);
    execFileSync(process.execPath, [resolve(ROOT, "tools/ai/optimize-models.mjs"), name], { stdio: "inherit" });
  }
}
if (!only || only === "sfx") {
  for (const [name, spec] of Object.entries(assets.sfx)) {
    // Değer ya tarif metnidir ya da { text, duration } (saniye) nesnesi.
    const { text, duration } = typeof spec === "string" ? { text: spec } : spec;
    if (!exists(`client/public/assets/audio/${name}.mp3`)) await soundEffect(name, text, duration);
  }
}
if (!only || only === "media") {
  for (const [name, { kind, prompt }] of Object.entries(assets.media)) {
    const ext = kind === "video" ? "mp4" : "jpg";
    if (!exists(`client/public/assets/media/${name}.${ext}`)) await generate(kind, name, prompt);
  }
}
