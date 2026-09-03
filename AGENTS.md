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
- **Yapılan (son oturumlar):**
  - **Optik Kodlama PDF çökmesi çözüldü:** 784 öğrenci için `Array.join: Invalid string length` hatasıydı. `createPdfFromPages` artık jsPDF yerine **pdf-lib** kullanıyor (`client/src/lib/optic-coding.ts`: `PDFDocument.create()` + `embedJpg` + byte-bazlı `pdfDoc.save()` → string sınırı yok). 784 öğrenci → 616MB PDF, 425s, başarılı. Sayfa önbelleği eski bundle'ı gösterebilir; Cmd+Shift+R önerilir.
  - Sol menüye "Optik Oluşturma" (`/optic-create`) eklendi; route `client/src/App.tsx`, `client/src/components/layout/Sidebar.tsx`.
  - Yeni `client/src/lib/optic-form.ts`: `OpticFormDesign` veri modeli (başlık, öğrenci bilgi alanları, ders cevap tabloları) + WYSIWYG HTML üretici `buildOpticFormHtml()`.
  - Yeni `client/src/pages/optic-creation.tsx`: form listesi → yeni form oluştur / kayıtlı formu aç → sol panel ayarlar (form adı, kağıt A4/A5, başlık, bilgi alanları, cevap tabloları), orta önizleme (mm-tabanlı), sağ yapı özeti; PDF + Yazdır (aynı HTML dizisi → birebir WYSIWYG).
  - Yeni API: `GET/POST /api/optics/form-designs`, `DELETE /api/optics/form-designs/:id` (`server/routes.ts`, dosya `db/optic-form-designs.json`).
  - `optic-coding-page.tsx` sıfırdan yeniden kuruldu (3 sütun: sol ayarlar+alan ekle, orta önizleme, sağ bileşen listesi; sürükle-bırak; Excel `extraData` sütunları + standart alanlar). Sayısal alan başlığına değer basımı (4mm font), önizleme sadeleştirme (sadece seçili öğede çerçeve). **Not:** Kodlama sayfası WYSIWYG çekirdeğine dayanıyor; "önce optik form oluşturma gerekir" kararı gereği ileride oluşturulan form üzerine işlenecek şekilde revize edilebilir.
  - **Optik okuma v2 (yeni):** `buildOpticFormManifest` → **v2** manifest (referans kareleri sayfa kenarına göre düzeltildi; `fields`: numeric/booklet alanların baloncuk merkezleri eklendi). `server/optical_processor.py`'ye **`read` modu** eklendi: 5 köşe referans karesi tespiti → RANSAC homografi (mm→px) → baloncuk merkezlerinden disk örnekleme → TC/kitapçık/sınav ID + tüm ders cevapları + güven skoru + overlay. QR `cv2.QRCodeDetector` ile okunuyor (pyzbar yedek). Yeni endpoint **`POST /api/optics/read`** (body: `{manifest, files:[path]}`). `optic_scan_sessions`'a `tc_no`, `booklet`, `exam_id`, `confidence` sütunları eklendi (migration ile). `optic-reading.tsx` yeniden yazıldı: form tasarımı seçimi, çoklu JPEG/PDF yükleme, toplu okuma, güven ızgarası, elle düzeltme (select), CSV, DB kaydı.
  - **QR kod basımı (kodlama sayfası):** Excel sütunlarındaki her satıra QR butonu eklendi; seçilen sütunun değeri her öğrenciye QR olarak basılıyor. `qrcode` paketi ile 600px PNG data-URL (modül cache'i). `OpticFormOverlay.kind: "text"|"qr"` + `qrSizeMm`; `buildOpticFormHtml` QR'ı `<img>` olarak basar (boş değer → kesik çerçeve). Kodlama sayfasında konum sürükleme, boyut köşe tutamacı (nwse) + sağ panel "QR Boyutu" girişi. Overlay üretimi async oldu (preview state'e taşındı; export/print `Promise.all` ile).
- **Sırada / kararsız:** QR, kodlama sayfasından serbest konumlandırılabilen bir bileşen olarak basılabiliyor; okuma tarafı görüntüdeki herhangi bir QR'ı `cv2.QRCodeDetector` ile zaten okuyor. Form tasarımına (optic-creation) kalıcı QR bileşeni eklenmesi hâlâ açık (ayrı akış). Python'da cv2'li yorumlayıcı `/usr/local/bin/python3` (3.12); server bunu otomatik buluyor (`OPTIC_PYTHON` env ile override). Gerçek tarama görselleriyle doğrulama bekliyor; sentetik testler (300/200dpi, 1.4° döndürme + ölçek) %100 doğru.
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
- **Optik Okuma:** JPEG görsellerden optik alan tespiti, referans kareleriyle homografi düzeltme, baloncuk okuma, batch işlem, QR okuma, CSV/JSON dışa aktarım. `client/src/lib/optic-form.ts` → `buildOpticFormManifest()` (baloncuk merkezleri mm cinsinden) → `server/optical_processor.py` `read` modu (referans karesi tespiti → homografi → disk örneklemesi → cevap/güven + overlay). Eski Hough tabanlı okuma (`detect_frame`/`process`/`batch` modları) hâlâ duruyor ama artık kullanılmıyor. Kalibrasyon editörü: `client/src/components/optic/OpticCalibrationEditor.tsx`.
- **Config/veriler:** `db/optic-configs.json` (kalibrasyon konfigları), `db/optic-form-designs.json` (optik form tasarımları), `db/optic-results.json` (sonuçlar), `db/optic-readings.sqlite` (tarama oturumları: `optic_scan_sessions` + `tc_no`/`booklet`/`exam_id`/`confidence`, `optic_scan_answers`).
- **İlgili API route'ları:** `/api/optics/configs`, `/api/optics/form-designs`, `/api/optics/results`, `/api/optics/scans`, `/api/optics/read` (manifest tabanlı, yeni), `/api/optics/upload`, ayrıca eski `/api/optics/process`, `/api/optics/detect-frame`, `/api/optics/batch`.

## Kurallar

- Kod tarzını mevcut dosyalardaki patternlere uydur (önce ilgili dosyayı oku).
- Gerekmedikçe yorum satırı ekleme.
- Test/lint komutu: `npm run check` (tsc).
