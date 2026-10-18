// Kullanım:
//   node tools/ai/higgsfield.mjs image <dosya_adı> "<istem>"
//   node tools/ai/higgsfield.mjs video <dosya_adı> "<istem>"
// Çıktı: client/public/assets/media/<dosya_adı>.(jpg|mp4)
import { randomUUID } from "node:crypto";
import { authHeader, download, getJob, poll, requestJson, setJob } from "./lib.mjs";

const API = "https://api.higgsfield.ai";
const ENDPOINTS = {
  image: "/higgsfield-ai/soul/v2/standard",
  video: "/kling-video/v3.0/std/text-to-video",
};

function headers() {
  return {
    ...authHeader("Authorization", ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET"], (id, secret) => `Key ${id}:${secret}`),
    "Content-Type": "application/json",
  };
}

export async function generate(kind, name, prompt) {
  const jobKey = `higgsfield:${name}`;
  let requestId = await getJob(jobKey);
  if (requestId) {
    console.log(`Higgsfield isteğine devam ediliyor: ${requestId}`);
  } else {
    const submitted = await requestJson(`${API}${ENDPOINTS[kind]}`, {
      method: "POST",
      headers: { ...headers(), "Idempotency-Key": randomUUID() },
      body: JSON.stringify(kind === "video" ? { prompt, aspect_ratio: "16:9", duration: 5 } : { prompt }),
    });
    requestId = submitted.request_id;
    await setJob(jobKey, requestId);
    console.log(`Higgsfield isteği: ${requestId}`);
  }

  const result = await poll(async () => {
    const status = await requestJson(`${API}/requests/${requestId}/status`, { headers: headers() });
    console.log(`  durum: ${status.status}`);
    if (status.status === "completed") return status;
    if (["failed", "nsfw", "canceled"].includes(status.status)) {
      await setJob(jobKey, null);
      throw new Error(`Higgsfield başarısız: ${status.status}`);
    }
  }, { everyMs: 8000 });

  const url = kind === "video" ? result.video?.url : result.images?.[0]?.url;
  if (!url) throw new Error(`Çıktı adresi bulunamadı: ${JSON.stringify(result).slice(0, 500)}`);
  await download(url, `client/public/assets/media/${name}.${kind === "video" ? "mp4" : "jpg"}`);
  await setJob(jobKey, null);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind, name, prompt] = process.argv.slice(2);
  if (!(kind in ENDPOINTS) || !name || !prompt) {
    console.error('Kullanım: node tools/ai/higgsfield.mjs image|video <ad> "<istem>"');
    process.exit(1);
  }
  await generate(kind, name, prompt);
}
