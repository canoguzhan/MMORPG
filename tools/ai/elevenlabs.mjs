// Kullanım:
//   node tools/ai/elevenlabs.mjs sfx <dosya_adı> "<ses efekti tarifi>"
//   node tools/ai/elevenlabs.mjs tts <dosya_adı> <voice_id> "<seslendirilecek metin>"
// Çıktı: client/public/assets/audio/<dosya_adı>.mp3
import { authHeader, saveBytes } from "./lib.mjs";

const API = "https://api.elevenlabs.io/v1";

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      ...authHeader("xi-api-key", ["ELEVENLABS_API_KEY"], (key) => key),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${path} → ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function soundEffect(name, text, durationSeconds) {
  const audio = await post("/sound-generation", { text, duration_seconds: durationSeconds });
  await saveBytes(`client/public/assets/audio/${name}.mp3`, audio);
}

export async function speech(name, voiceId, text) {
  const audio = await post(`/text-to-speech/${voiceId}`, { text, model_id: "eleven_multilingual_v2" });
  await saveBytes(`client/public/assets/audio/${name}.mp3`, audio);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, name, ...rest] = process.argv.slice(2);
  if (mode === "sfx" && name && rest[0]) await soundEffect(name, rest[0]);
  else if (mode === "tts" && name && rest[0] && rest[1]) await speech(name, rest[0], rest[1]);
  else {
    console.error("Kullanım: elevenlabs.mjs sfx <ad> \"<tarif>\" | tts <ad> <voice_id> \"<metin>\"");
    process.exit(1);
  }
}
