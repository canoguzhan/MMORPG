import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Anahtarlar yalnızca ortam değişkenlerinden okunur; asla dosyaya yazılmaz. */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} ortam değişkeni tanımlı değil.`);
    process.exit(1);
  }
  return value;
}

export async function requestJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

export async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İndirme başarısız (${res.status}): ${url}`);
  await saveBytes(outPath, Buffer.from(await res.arrayBuffer()));
}

export async function saveBytes(outPath, bytes) {
  const full = resolve(ROOT, outPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
  console.log(`Kaydedildi: ${outPath}`);
}

export async function poll(fn, { everyMs = 5000, timeoutMs = 15 * 60_000 } = {}) {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result !== undefined) return result;
    if (Date.now() - start > timeoutMs) throw new Error("Zaman aşımı");
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
