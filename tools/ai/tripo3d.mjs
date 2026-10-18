// Kullanım: node tools/ai/tripo3d.mjs <model_adı> "<İngilizce istem>" [üçgen_sınırı]
// Çıktı: client/public/assets/models/<model_adı>.glb (oyun bu dosyayı otomatik yükler)
import { authHeader, download, getJob, poll, requestJson, setJob } from "./lib.mjs";

const API = "https://api.tripo3d.ai/v2/openapi";

// faces: modelin üçgen sınırı. Sahnede çok kopyası olan nesneler (ağaç gibi) düşük tutulmalı;
// Tripo varsayılanı 150-400 bin üçgen üretir, tarayıcı için fazla.
export async function generateModel(name, prompt, faces) {
  const headers = {
    ...authHeader("Authorization", ["TRIPO_API_KEY"], (key) => `Bearer ${key}`),
    "Content-Type": "application/json",
  };
  const jobKey = `tripo:${name}`;
  let taskId = await getJob(jobKey);
  if (taskId) {
    console.log(`Tripo3D görevine devam ediliyor: ${taskId}`);
  } else {
    const created = await requestJson(`${API}/task`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "text_to_model", prompt, texture: true, pbr: true, face_limit: faces }),
    });
    taskId = created.data.task_id;
    await setJob(jobKey, taskId);
    console.log(`Tripo3D görevi başladı: ${taskId}`);
  }

  const task = await poll(async () => {
    const { data } = await requestJson(`${API}/task/${taskId}`, { headers });
    console.log(`  durum: ${data.status} ${data.progress ?? ""}`);
    if (data.status === "success") return data;
    if (["failed", "cancelled", "banned", "expired"].includes(data.status)) {
      await setJob(jobKey, null);
      throw new Error(`Tripo3D görevi başarısız: ${data.status}`);
    }
  });

  const url = task.output?.pbr_model ?? task.output?.model;
  if (!url) throw new Error(`Model adresi bulunamadı: ${JSON.stringify(task.output)}`);
  await download(url, `client/public/assets/models/${name}.glb`);
  await setJob(jobKey, null);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, prompt, faces] = process.argv.slice(2);
  if (!name || !prompt) {
    console.error('Kullanım: node tools/ai/tripo3d.mjs <model_adı> "<istem>"');
    process.exit(1);
  }
  await generateModel(name, prompt, faces ? Number(faces) : undefined);
}
