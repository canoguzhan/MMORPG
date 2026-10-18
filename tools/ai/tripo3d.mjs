// Kullanım: node tools/ai/tripo3d.mjs <model_adı> "<İngilizce istem>" [üçgen_sınırı] [biped|quadruped]
// Çıktı: client/public/assets/models/<model_adı>.glb (oyun bu dosyayı otomatik yükler)
import { authHeader, download, getJob, poll, requestJson, setJob } from "./lib.mjs";

const API = "https://api.tripo3d.ai/v2/openapi";

// İskelet türüne göre Tripo animasyon hazır ayarları. Görev başına en fazla 5 animasyon.
// v1.0 iskeleti yalnızca insansı (biped) destekler; dört ayaklı için v2.5 gerekir ve
// onda tek hazır animasyon yürümedir (oyun saldırı ve ölümü kodla canlandırır).
const RIGS = {
  biped: {
    model_version: "v1.0-20240301",
    animations: ["preset:idle", "preset:walk", "preset:run", "preset:slash", "preset:fall"],
  },
  quadruped: { model_version: "v2.5-20260210", animations: ["preset:quadruped:walk"] },
};

const headers = () => ({
  ...authHeader("Authorization", ["TRIPO_API_KEY"], (key) => `Bearer ${key}`),
  "Content-Type": "application/json",
});

// Görevi başlatır (ya da jobs.json'daki yarım kalmış göreve devam eder) ve bitmesini bekler.
async function runTask(jobKey, body) {
  let taskId = await getJob(jobKey);
  if (taskId) {
    console.log(`Tripo3D görevine devam ediliyor (${body.type}): ${taskId}`);
  } else {
    const created = await requestJson(`${API}/task`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    taskId = created.data.task_id;
    await setJob(jobKey, taskId);
    console.log(`Tripo3D görevi başladı (${body.type}): ${taskId}`);
  }
  const task = await poll(async () => {
    const { data } = await requestJson(`${API}/task/${taskId}`, { headers: headers() });
    console.log(`  durum: ${data.status} ${data.progress ?? ""}`);
    if (data.status === "success") return data;
    if (["failed", "cancelled", "banned", "expired"].includes(data.status)) {
      await setJob(jobKey, null);
      throw new Error(`Tripo3D görevi başarısız (${body.type}): ${data.status} ${data.error_code ?? ""}`);
    }
  });
  return { taskId, output: task.output ?? {} };
}

// faces: modelin üçgen sınırı. Sahnede çok kopyası olan nesneler (ağaç gibi) düşük tutulmalı;
// Tripo varsayılanı 150-400 bin üçgen üretir, tarayıcı için fazla.
// rig: "biped" ya da "quadruped" verilirse model iskeletlenir ve animasyonlarıyla kaydedilir.
export async function generateModel(name, prompt, faces, rig) {
  const keys = [`tripo:${name}`, `tripo-rig:${name}`, `tripo-anim:${name}`];
  const model = await runTask(keys[0], { type: "text_to_model", prompt, texture: true, pbr: true, face_limit: faces });
  let url = model.output.pbr_model ?? model.output.model;

  if (rig) {
    const { model_version, animations } = RIGS[rig];
    const rigged = await runTask(keys[1], {
      type: "animate_rig", original_model_task_id: model.taskId, out_format: "glb", rig_type: rig, spec: "tripo", model_version,
    });
    const animated = await runTask(keys[2], {
      type: "animate_retarget", original_model_task_id: rigged.taskId, out_format: "glb", bake_animation: true, animations,
    });
    url = animated.output.model;
  }

  if (!url) throw new Error(`Model adresi bulunamadı (${name})`);
  await download(url, `client/public/assets/models/${name}.glb`);
  for (const key of keys) await setJob(key, null);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, prompt, faces, rig] = process.argv.slice(2);
  if (!name || !prompt || (rig && !(rig in RIGS))) {
    console.error('Kullanım: node tools/ai/tripo3d.mjs <model_adı> "<istem>" [üçgen_sınırı] [biped|quadruped]');
    process.exit(1);
  }
  await generateModel(name, prompt, faces ? Number(faces) : undefined, rig);
}
