# MMORPG

Tarayıcıda oynanan, Metin2 tarzı oynanıştan esinlenen özgün bir 3D MMORPG.

- **İstemci:** Three.js (Vite)
- **Sunucu:** Node.js + Colyseus
- **Görsel ve ses üretimi:** Tripo3D (3D modeller), ElevenLabs (ses), Higgsfield (video ve görseller)

Oyundaki hikaye, isimler, haritalar ve tüm görseller bu projeye özgüdür; Metin2'ye ait telifli hiçbir içerik kullanılmaz.

## Çalıştırma

Node.js 20 veya üstü gerekir.

```bash
npm run install:all
npm run server   # ws://localhost:2567
npm run client   # http://localhost:5173
```

Tarayıcıda iki sekme açarak çok oyunculuyu deneyebilirsin. Kontroller: WASD hareket, sağ tık sürükle kamera, sol tık hedef seç ve saldır, Boşluk en yakın düşmana saldır, Enter sohbet.

## AI ile varlık üretimi

Anahtarlar yalnızca ortam değişkenlerinden okunur (`.env.example`'a bak). Hiçbir anahtarı repoya yazma.

```bash
npm run assets                                   # tools/ai/assets.json içindeki her şeyi üretir
node tools/ai/tripo3d.mjs warrior "<istem>"      # tek bir 3D model
node tools/ai/elevenlabs.mjs sfx sword_hit "<tarif>"
node tools/ai/higgsfield.mjs video intro "<istem>"
```

Üretilen modeller `client/public/assets/models/<ad>.glb` altına iner ve oyun onları otomatik yükler; dosya yoksa yer tutucu şekiller görünür.

## Belgeler

- [Hikaye](docs/HIKAYE.md)
- [Dünya ve haritalar](docs/DUNYA_VE_HARITALAR.md)
- [Oyun tasarımı ve MVP](docs/OYUN_TASARIMI.md)
