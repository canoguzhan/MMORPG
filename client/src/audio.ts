// ElevenLabs ile üretilen sesler public/assets/audio/<isim>.mp3 altındadır.
// Dosya yoksa ya da tarayıcı çalmaya izin vermezse oyun sessiz devam eder.

function load(name: string, volume: number, loop = false) {
  const audio = new Audio(`/assets/audio/${name}.mp3`);
  audio.volume = volume;
  audio.loop = loop;
  return audio;
}

const effects = {
  sword_hit: load("sword_hit", 0.5),
  stone_fall: load("stone_fall", 0.7),
  level_up: load("level_up", 0.6),
};
const ambience = load("village_ambience", 0.25, true);

export function playSfx(name: keyof typeof effects) {
  const sound = effects[name].cloneNode() as HTMLAudioElement;
  sound.volume = effects[name].volume;
  sound.play().catch(() => {});
}

export function startAmbience() {
  ambience.play().catch(() => {});
}
