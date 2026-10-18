# Oyun Tasarımı

## Sınıflar

Her sınıfın iki uzmanlık dalı vardır (Sv. 5'te seçilir).

| Sınıf | Silah | Dal 1 | Dal 2 |
|---|---|---|---|
| **Savaşçı** | Kılıç, iki elli kılıç | Demir Beden (savunma) | Öfke Yolu (saldırı) |
| **Gölge** | Hançer, yay | Sessiz Bıçak (yakın, suikast) | Kartal Gözü (uzak, okçu) |
| **Kanbağı** | Kılıç + kara büyü | Lanet Kılıcı (yakın büyü) | Karanlık Ruh (uzak büyü) |
| **Rüzgar Kâhini** | Yelpaze, çan | Fırtına (hasar) | Şifa (destek) |

## Temel Sistemler

- **Dövüş:** Hack-and-slash; sol tık ile normal saldırı kombosu, 1-4 tuşlarıyla beceriler. Sunucu yetkili (server-authoritative): hasar ve menzil sunucuda hesaplanır.
- **Kara Göktaşları (metin taşları):** Haritada belirli aralıklarla belirir, kırılana kadar çevresine Kararmış çağırır. Kırılınca deneyim, para ve nadir eşya düşürür.
- **Yükseltme (+0 → +9):** Demirci Kuzgun'da yapılır. Her seviyede başarı şansı düşer, malzeme ve para gerekir. Başarısızlıkta eşya bir seviye düşer ya da (yüksek seviyelerde) kırılır. Koruma kâğıdı ile kırılma önlenir.
- **Efsunlar (bonuslar):** Ekipmana rastgele 1-5 bonus (kritik şans, canavara karşı güç, HP, vs.). Efsun nesnesiyle yeniden çevrilir.
- **Envanter ve depo:** 5x9'luk sayfalar, sürükle-bırak.
- **Görevler:** Ana hikaye zinciri + günlük taş avı görevleri.
- **Parti:** 8 kişiye kadar, deneyim paylaşımı.
- **Lonca:** Lonca seviyesi, lonca savaşları, lonca arazisi (sonraki aşama).
- **Krallık savaşı:** Sessiz Vadi'de haftalık etkinlik.
- **Binek:** At (Sv. 25+), sonraki aşamada.
- **Ticaret:** Oyuncular arası takas ve pazar tezgâhı.

## MVP (ilk oynanabilir sürüm)

- Bir krallık köyü haritası ve çevresi
- İki sınıf: Savaşçı ve Gölge
- Hareket, normal saldırı, iki beceri
- Kara Göktaşı + Kararmış canavarlar, deneyim ve seviye
- Envanter, ekipman, +9'a kadar yükseltme
- Sohbet, haritada 20-50 eşzamanlı oyuncu
- Hesap ve karakter kaydı (PostgreSQL)

## Teknik Mimari

```
client/  Three.js + Vite   → tarayıcı, render, giriş, arayüz
server/  Node + Colyseus   → oda başına harita, yetkili oyun mantığı
tools/ai Node betikleri    → Tripo3D / ElevenLabs / Higgsfield ile varlık üretimi
```

- Her harita bir Colyseus odası. Sunucu 20 Hz ile durum günceller, istemci ara değer (interpolation) yapar.
- Kalıcı veriler (hesap, karakter, envanter) ileride PostgreSQL'e, oturum ve önbellek Redis'e.
- API anahtarları yalnızca ortam değişkenlerinden okunur: `TRIPO_API_KEY`, `ELEVENLABS_API_KEY`, `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET`.
