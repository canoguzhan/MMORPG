# Dünya ve Haritalar

> Harita ilerlemesi Metin2'deki sırayı örnek alır (krallık köyleri, ortak vadi, çöl, karlı dağ, ateş bölgesi, zindanlar). Yerleşimler, isimler ve çizimler projeye özgüdür; hiçbir harita birebir kopyalanmaz.

## Harita Sırası

| # | Harita | Seviye | Tür | Notlar |
|---|---|---|---|---|
| 1 | **Kızılbayır Köyü / Altınkoru Köyü / Gökdeniz Köyü** | 1-15 | Krallık başlangıcı | Her krallığın kendi köyü. Demirci, tüccar, depo, öğretmenler. Çevresinde ilk taşlar ve kurt, yaban domuzu benzeri canavarlar. |
| 2 | **Krallık Ovaları** (her krallık için bir tane) | 10-25 | Açık alan | Köyden çıkıştaki büyük ova. Haydut kampları, küçük taşlar. |
| 3 | **Sessiz Vadi** | 20-35 | Ortak alan (PvP) | Üç krallığın sınırının buluştuğu vadi. Krallık savaşları burada başlar. Ortada yıkık bir Sarkan heykeli. |
| 4 | **Yanık Kumlar Çölü** | 30-45 | Açık alan | Kum fırtınaları, akrep ve mumya tarzı canavarlar, kayıp kervan görev zinciri. |
| 5 | **Buzdişi Dağı** | 45-60 | Açık alan | Karlı yamaçlar, buz trolleri, Sarkan tapınağı. |
| 6 | **Kor Ovası** | 60-75 | Açık alan | Lav nehirleri, ateş iblisleri, büyük taşların yoğun düştüğü bölge. |
| 7 | **Kızıl Orman** | 70-90 | Açık alan | Kararmış ağaç ruhları, ağır bosslar. |

## Zindanlar

| Zindan | Seviye | Konsept |
|---|---|---|
| **Ağörücü İnleri** | 35-55 | Dev örümcek benzeri yaratıklarla dolu mağara katları; sonunda Ağ Ana boss'u. |
| **Sürgün Kulesi** | 40-75 | Kat kat çıkılan kule; her katta farklı görev (tüm canavarları öldür, doğru taşı kır, anahtar bul). Tepede Solgun Hükümdar'ın gölgesi. |
| **Buz Mahzeni** | 55-70 | Buzdişi Dağı'nın altında, zamana karşı yarışılan zindan. |

## Harita Üretim Yaklaşımı

- Zemin (terrain): yükseklik haritası + doku karışımı, Three.js içinde parça parça (chunk) yüklenir.
- Binalar, ağaçlar, kayalar, canavarlar: Tripo3D ile üretilen GLB modeller (`tools/ai/tripo3d.mjs`).
- Her haritanın ambiyans sesi ve müziği: ElevenLabs (`tools/ai/elevenlabs.mjs`).
- Haritaya giriş ara sahneleri ve konsept görselleri: Higgsfield (`tools/ai/higgsfield.mjs`).
- Görsel stil: yarı gerçekçi, sıcak renkli, Doğu Asya ve Orta Asya karışımı bir fantastik dünya (Metin2 hissine yakın ama kendi tasarımımız).
