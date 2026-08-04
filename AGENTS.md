# AGENTS.md

## Proje

Web System Core — sınav kütük yönetimi, optik kodlama/okuma, etiket/tutanak üretimi ve öğrenci değerlendirme web uygulaması (Express + React/Vite + SQLite/Drizzle).

## ÇALIŞMA KAPSAMI (ÖNEMLİ)

- Şu anda **yalnızca** şu üç sayfa ile ilgili işlem yapıyoruz:
  1. **Optik Oluşturma** — `client/src/pages/optic-creation.tsx` (yeni: optik form tasarımı)
  2. **Optik Kodlama** — `client/src/pages/optic-coding-page.tsx`
  3. **Optik Okuma** — `client/src/pages/optic-reading.tsx`
- Bu sayfaların desteklediği backend/yardımcı dosyalara gerektiğinde dokunulabilir:
  - `server/routes.ts` (optics API route'ları)
  - `server/optical_processor.py` (Python görüntü işleme)
  - `client/src/components/optic/OpticCalibrationEditor.tsx`
  - `client/src/lib/optic-coding.ts`, `client/src/lib/optic-form.ts`
  - `db/optic-configs.json`, `db/optic-results.json`, `db/optic-form-designs.json`, `db/optic-readings.sqlite`
- **Diğer tüm bölümler/sayfalar (dashboard, kütük, etiket, tutanak, değerlendirme, sınav seçimi vb.) KESİNLİKLE kurcalanmayacak.**
- Kapsam dışı bir dosyada değişiklik isteniyorsa önce kullanıcıya sor.
## Nerede Kaldık / Durum

- Proje geliştirme sunucusu `npm run dev` ile çalışıyor; adres **http://localhost:5050**.
- **Yapılan (son oturum):**
  - Sol menüye "Optik Oluşturma" (`/optic-create`) eklendi; route `client/src/App.tsx`, `client/src/components/layout/Sidebar.tsx`.
  - Yeni `client/src/lib/optic-form.ts`: `OpticFormDesign` veri modeli (başlık, öğrenci bilgi alanları, ders cevap tabloları) + WYSIWYG HTML üretici `buildOpticFormHtml()`.
  - Yeni `client/src/pages/optic-creation.tsx`: form listesi → yeni form oluştur / kayıtlı formu aç → sol panel ayarlar (form adı, kağıt A4/A5, başlık, bilgi alanları, cevap tabloları), orta önizleme (mm-tabanlı), sağ yapı özeti; PDF + Yazdır (aynı HTML dizisi → birebir WYSIWYG).
  - Yeni API: `GET/POST /api/optics/form-designs`, `DELETE /api/optics/form-designs/:id` (`server/routes.ts`, dosya `db/optic-form-designs.json`).
  - `optic-coding-page.tsx` sıfırdan yeniden kuruldu (3 sütun: sol ayarlar+alan ekle, orta önizleme, sağ bileşen listesi; sürükle-bırak; Excel `extraData` sütunları + standart alanlar). **Not:** Bu sayfa hâlâ WYSIWYG çekirdeğine dayanıyor ancak kullanıcı "önce optik form oluşturma gerekir" dedi; kodlama sayfası bundan sonra oluşturulan form üzerine işlenecek şekilde revize edilebilir.
- **Sırada / kararsız:** Bileşen türleri (metin/QR/görsel vb.) henüz netleşmedi; optik okuma sayfası bu oturumda kurcalanmadı.
- Dev sunucusu Vite'ın çözemediği eski bir import hatası nedeniyle çökebilir; `npm run dev` yeniden başlatınca düzelir.
- **Node sürümü zorunlu:** Vite 7 `^20.19.0 || >=22.12.0` ister. Sistemdeki Node 20.11.1 ile dev sunucusu `crypto.hash is not a function` hatasıyla çöker. Çözüm: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` (brew `node@22`, v22.23.2) ile `npm run dev` başlat; native modüller için gerekiyorsa önce `npm rebuild better-sqlite3`.

## Çalıştırma

- Geliştirme: `npm run dev` (Express + Vite, port 5050)
- Sadece client: `npm run dev:client` (port 5001)
- Build: `npm run build`, üretim: `npm start`
- Tip kontrolü: `npm run check`
- DB şema push: `npm run db:push`
- Docker: `docker compose up --build -d`

## Optikle İlgili Mimari Özet

- **Optik Oluşturma:** Optik formun kendisi tasarlanır (kağıt A4/A5, başlık, öğrenci bilgi alanları, ders cevap tabloları/baloncuklar). `client/src/lib/optic-form.ts` → `buildOpticFormHtml()`. Kayıtlar `db/optic-form-designs.json`.
- **Optik Kodlama:** Oluşturulan/kayıtlı optik form üzerine sürükle-bırak alan yerleştirme (öğrenci adı, okul, TC no vb. Excel sütunlarından) → öğrenci başına form baskısı. `client/src/lib/optic-coding.ts` → `buildPageHtml()`.
- **Optik Okuma:** JPEG görsellerden optik alan tespiti, siyah çerçeve algılama/perspektif düzeltme, baloncuk okuma, batch işlem, QR okuma, CSV/JSON dışa aktarım. Backend işlemcisi: `server/optical_processor.py`. Kalibrasyon editörü: `client/src/components/optic/OpticCalibrationEditor.tsx`.
- **Config/veriler:** `db/optic-configs.json` (kalibrasyon konfigları), `db/optic-form-designs.json` (optik form tasarımları), `db/optic-results.json` (sonuçlar), `db/optic-readings.sqlite` (tarama oturumları: `optic_scan_sessions`, `optic_scan_answers`).
- **İlgili API route'ları:** `/api/optics/configs`, `/api/optics/form-designs`, `/api/optics/results`, `/api/optics/scans`, `/api/optics/process`, `/api/optics/detect-frame`, `/api/optics/upload`, `/api/optics/batch`.

## Kurallar

- Kod tarzını mevcut dosyalardaki patternlere uydur (önce ilgili dosyayı oku).
- Gerekmedikçe yorum satırı ekleme.
- Test/lint komutu: `npm run check` (tsc).
