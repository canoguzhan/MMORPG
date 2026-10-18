import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Anahtarlar ortam değişkenlerinden okunur; asla dosyaya yazılmaz.
 * Değişken yoksa başlık eklenmez: Claude ortamındaki "gizli anahtar" (network secret)
 * ayarı, isteğe yetki başlığını yolda kendisi ekler.
 */
export function authHeader(name, envNames, format) {
  const values = envNames.map((n) => process.env[n]);
  if (values.some((v) => !v)) return {};
  return { [name]: format(...values) };
}

export async function requestJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

export async function download(url, outPath) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    const host = new URL(url).host;
    throw new Error(`İndirilemedi (${host}); ağ ayarlarında bu alan adına izin verilmiş mi? ${err.cause?.message ?? err.message}`);
  }
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

// Üretim işi tamamlanıp indirme başarısız olursa (ör. ağ kısıtı) iş kimliği burada saklanır;
// betik tekrar çalıştırıldığında yeni kredi harcamadan aynı işin sonucunu indirir.
const JOBS = resolve(ROOT, "tools/ai/jobs.json");

async function readJobs() {
  try {
    return JSON.parse(await readFile(JOBS, "utf8"));
  } catch {
    return {};
  }
}

export async function getJob(key) {
  return (await readJobs())[key];
}

export async function setJob(key, id) {
  const jobs = await readJobs();
  if (id) jobs[key] = id;
  else delete jobs[key];
  await writeFile(JOBS, JSON.stringify(jobs, null, 2) + "\n");
}
