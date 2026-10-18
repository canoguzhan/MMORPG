// assets.json içindeki tüm varlıkları üretir. Var olan dosyalar atlanır.
// Kullanım: node tools/ai/generate-all.mjs [models|sfx|media]
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./lib.mjs";
import { generateModel } from "./tripo3d.mjs";
import { soundEffect } from "./elevenlabs.mjs";
import { generate } from "./higgsfield.mjs";

const assets = JSON.parse(await readFile(resolve(ROOT, "tools/ai/assets.json"), "utf8"));
const only = process.argv[2];
const exists = (p) => existsSync(resolve(ROOT, p));

if (!only || only === "models") {
  for (const [name, prompt] of Object.entries(assets.models)) {
    if (!exists(`client/public/assets/models/${name}.glb`)) await generateModel(name, prompt);
  }
}
if (!only || only === "sfx") {
  for (const [name, text] of Object.entries(assets.sfx)) {
    if (!exists(`client/public/assets/audio/${name}.mp3`)) await soundEffect(name, text);
  }
}
if (!only || only === "media") {
  for (const [name, { kind, prompt }] of Object.entries(assets.media)) {
    const ext = kind === "video" ? "mp4" : "jpg";
    if (!exists(`client/public/assets/media/${name}.${ext}`)) await generate(kind, name, prompt);
  }
}
