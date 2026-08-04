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
  - **Bu oturum:** Önizlemeye sürüklenebilir overlay'ler eklendi (bilgi alanları 1mm snap, cevap tabloları 5mm snap `GRID_SNAP_MM`; `optic-creation.tsx` → `overlays`, `dragState`, `onOverlayPointer*`). `AnswerGrid.xMm/yMm` + `computeGridPlacements`, `computeAnswerRegionTop`, `gridColumnWidth`, `gridHeightMm` (`optic-form.ts`). CEVAPLAR başlığı ayrı mutlak eleman; her grid kendi konumunda.
  - **Bu oturum:** Tekdüze baloncuk ızgarası — `NUM_COL_MM` 6→5 (5mm katı) ve `LEFT_MARGIN_MM` 12→10, böylece ders grid baloncukları ile sayısal alan baloncukları aynı x-mod-5 hizasına düşer; A4 varsayılan x'leri (10, 110) 5mm ızgarasına oturur. Sayısal alan overlay'i `GRID_SNAP_MM` kullanır (metin alanları 1mm).
- **Sırada / kararsız:** Bileşen türleri (metin/QR/görsel vb.) henüz netleşmedi; optik okuma sayfası bu oturumda kurcalanmadı.
- Dev sunucusu Vite'ın çözemediği eski bir import hatası nedeniyle çökebilir; `npm run dev` yeniden başlatınca düzelir.

## PLAN: Referans Noktalı Optik Okuma Sistemi (henüz DENENMEDİ)

Kullanıcı, optik formu ve okumayı **sıfırdan** kuruyor; okuma motoru artık `optical_processor.py`'nin eski siyah-çerçeve algısına bağlı değil, bizim tasarımımızdaki referans noktalarına dayanacak. Adımlar:

1. **Manifest üretimi:** Form üretilirken HTML yanında bir JSON manifest çıkarılacak: her baloncuğun beklenen merkezi (mm, sayfa sol-üstüne göre), ders blok rect'leri, referans işaret koordinatları. (`buildOpticFormManifest()` gibi — HTML + JSON birlikte.)
2. **Kalıcı referans işaretler:** Her köşede siyah dolu kare (5mm×5mm), 4 köşe karesi dikdörtgen hizasında (aynı satır/sütun); **sol üstte 1 fazla kare** (aynı satırda, 8mm sağda) ters sayfa/yön tespiti için → toplam 5 kare. Koordinatlar (merkez): sol üst (6.5,6.5)+(14.5,6.5), sağ üst (204.5,6.5), sol alt (6.5,291.5), sağ alt (204.5,291.5). **Neon yeşil değil**, baskıya uygun koyu renk. Neon yeşil `+` işaretleri yalnızca editörde baloncuk merkez hizasını doğrulamak için geçici.
3. **Okuma akışı (OpenCV):**
   - Taramada referans kareleri bul (contour → bbox merkezleri)
   - Şablondaki beklenen karelerle eşleştir (sol üst 2 + sağ alt 2 = 4 nokta)
   - `getPerspectiveTransform` / `findHomography` + RANSAC ile H matrisi (çarpıklık + eğim + ölçek + kayma tek matriste)
   - Her beklenen baloncuk merkezini H ile tarama koordinatına dönüştür
   - Daire içi koyu piksel oranı → dolu/boş → A/B/C/D
4. **Sağlamlaştırma:** İşaret hasarlıysa tüm baloncuk merkezleri Hough dairesi ile bulunup RANSAC'la ızgaraya oturtulur (self-calibration). DPI farkı H içinde yok edilir.
5. **Cevap alanı:** "CEVAPLAR" başlığı varsayılan olarak sayfa yüksekliğinin %40'ından (118.8mm, A4) başlar (`computeAnswerRegionTop`: %40 ↔ başlık bloğu ↔ bilgi alanları altı + 6mm, en büyüğü). **Cevap tabloları artık bireysel taşınabilir** (`AnswerGrid.xMm/yMm`): her grid `position:absolute` ile kendi `xMm/yMm` konumuna oturur; sürüklemede **5mm ızgara yakalaması** (`GRID_SNAP_MM`) baloncuk/alt-satır hizasını korur; varsayılan yerleşim `computeGridPlacements` (CEVAPLAR altından satır/kolon akışı, satır yüksekliği = satırdaki en yüksek grid). Okuma manifesti her grid'in rect'ini ayrı ayrı kaydeder. Referans kareler bu layout'u ETKİLEMEZ (`position:absolute`, kutu sınırları dışında).

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
