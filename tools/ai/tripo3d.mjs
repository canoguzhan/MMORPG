// Kullanım: node tools/ai/tripo3d.mjs <model_adı> "<İngilizce istem>"
// Çıktı: client/public/assets/models/<model_adı>.glb (oyun bu dosyayı otomatik yükler)
import { download, poll, requestJson, requireEnv } from "./lib.mjs";

const API = "https://api.tripo3d.ai/v2/openapi";

export async function generateModel(name, prompt) {
  const headers = { Authorization: `Bearer ${requireEnv("TRIPO_API_KEY")}`, "Content-Type": "application/json" };
  const created = await requestJson(`${API}/task`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "text_to_model", prompt, texture: true, pbr: true }),
  });
  const taskId = created.data.task_id;
  console.log(`Tripo3D görevi başladı: ${taskId}`);

  const task = await poll(async () => {
    const { data } = await requestJson(`${API}/task/${taskId}`, { headers });
    console.log(`  durum: ${data.status} ${data.progress ?? ""}`);
    if (data.status === "success") return data;
    if (["failed", "cancelled", "banned", "expired"].includes(data.status)) {
      throw new Error(`Tripo3D görevi başarısız: ${data.status}`);
    }
  });

  const url = task.output?.pbr_model ?? task.output?.model;
  if (!url) throw new Error(`Model adresi bulunamadı: ${JSON.stringify(task.output)}`);
  await download(url, `client/public/assets/models/${name}.glb`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, prompt] = process.argv.slice(2);
  if (!name || !prompt) {
    console.error('Kullanım: node tools/ai/tripo3d.mjs <model_adı> "<istem>"');
    process.exit(1);
  }
  await generateModel(name, prompt);
}
