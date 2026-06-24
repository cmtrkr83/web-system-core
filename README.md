# Web System Core

Sınav kütük yönetimi, optik okuma/kodlama, etiket/tutanak üretimi ve öğrenci değerlendirme için geliştirilmiş web uygulaması.

## Özellikler

### Sınav Yönetimi
- Sınav oluşturma, seçme ve silme
- Her sınava otomatik benzersiz **sinavid** (#XXXXXX) atanır
- Son seçilen sınav localStorage ile hatırlanır

### Kütük Yükleme (İki Mod)
- **Şablon Kütük (Varsayılan):** Yapılandırılmış Excel dosyalarından ilçe, okul ve öğrenci verilerini otomatik sütun tanıma ile içe aktarır
- **Serbest Excel:** Herhangi bir formattaki Excel dosyasını esnek sütun eşleştirme ile yükler. Yalnızca öğrenci adı/soyadı zorunludur; ilçe/okul alanları otomatik varsayılan değerlerle doldurulur
- İsteğe bağlı özel gereksinimli filtreleme

### Kütük Bölme
- İlçe bazlı okul/şube/öğrenci dağılımını tablo ve PDF olarak görüntüleme
- Toplu PDF indirme
- HTML yazdırma

### Salon Listesi
- İlçe/okul filtresiyle salon yoklama listeleri oluşturma
- jsPDF ile PDF çıktısı

### Okul Etiketi ve Şube Etiketi
- Renk şeması seçenekli (Mavi, Turuncu, Yeşil, Gri, Sarı, Renksiz)
- Sayfa düzeni (satır/sütun sayısı) ayarlanabilir
- Ders adı ekleme desteği
- HTML yazdırma çıktısı

### Teslim Tutanakları
- İlçe ve okul bazlı teslim dökümleri
- Boş şablon seçeneği
- Çok sayfalı PDF çıktısı (html2canvas + jsPDF)

### Optik Kodlama
- PDF şablon yükleme
- Sürükle-bırak ile alan yerleştirme (öğrenci adı, okul, TC no, vb.)
- A4/A5 kağıt boyutu desteği
- Optik form baskısı

### Optik Okuma (Görüntü İşleme)
- JPEG görsellerden optik cevap alanı tespiti
- Siyah çerçeve algılama ve perspektif düzeltme
- Baloncuk okuma (dolu/boş tespiti)
- Toplu işlem (batch) desteği
- Eşik değeri ayarlama
- QR kod okuma
- CSV ve JSON sonuç dışa aktarımı
- Python `optical_processor.py` arka uç işlemcisi

### Değerlendirme
- CSV dosyasından öğrenci cevaplarını yükleme
- Cevap anahtarı karşılaştırması
- Doğru/yanlış/boş istatistikleri

### Kullanıcı Geri Bildirimi
- Tüm sayfalarda işlem sonuçları sağ alt köşede toast bildirimleri ile gösterilir
- Hata, başarı ve uyarı mesajları tutarlı Toast bileşeni ile kullanıcıya iletilir

## Teknoloji

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React 18 + Vite + TypeScript
- **Veritabanı:** SQLite (better-sqlite3) + Drizzle ORM
- **UI:** Tailwind CSS + shadcn/ui + Radix UI
- **PDF:** jsPDF + html2canvas
- **Excel:** SheetJS (xlsx)
- **Görsel İşleme:** Python + OpenCV (optical_processor.py)
- **State:** React Context API
- **Routing:** wouter

## Proje Yapısı

```
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # UI bileşenleri
│   │   │   ├── ui/          # shadcn/ui bileşenleri
│   │   │   ├── layout/      # Sidebar, DashboardLayout
│   │   │   └── optic/       # Optik kalibrasyon editörü
│   │   ├── context/         # RegistryContext (küresel state)
│   │   ├── hooks/           # useToast, custom hooklar
│   │   ├── lib/             # queryClient, optic yardımcıları
│   │   └── pages/           # Sayfalar
│   │       ├── exam-selection.tsx   # Başlangıç sayfası
│   │       ├── dashboard.tsx        # Genel bakış
│   │       ├── registry-split.tsx   # Kütük bölme
│   │       ├── room-lists.tsx       # Salon listesi
│   │       ├── labels.tsx           # Okul etiketi
│   │       ├── branch-labels.tsx    # Şube etiketi
│   │       ├── reports.tsx          # Teslim tutanağı
│   │       ├── optic-coding-page.tsx # Optik kodlama
│   │       ├── optic-reading.tsx     # Optik okuma
│   │       └── evaluation.tsx       # Değerlendirme
│   └── index.html
├── server/                  # Express backend
│   ├── index.ts             # Sunucu giriş noktası
│   ├── routes.ts            # API route'ları
│   ├── storage.ts           # Veritabanı işlemleri
│   ├── static.ts            # Statik dosya sunumu
│   ├── vite.ts              # Vite geliştirme entegrasyonu
│   └── optical_processor.py # Python görsel işleme
├── shared/                  # Ortak tipler ve şemalar
│   └── schema.ts            # Drizzle şema tanımları
├── db/                      # Veritabanı ve yapılandırma dosyaları
│   ├── local.db             # SQLite veritabanı
│   ├── optic-configs.json   # Optik yapılandırmaları
│   ├── optic-results.json   # Optik okuma sonuçları
│   ├── optic-readings.sqlite # Optik tarama oturumları
│   └── optic_uploads/       # Yüklenen görseller
├── drizzle.config.ts        # Drizzle konfigürasyonu
├── docker-compose.yml       # Docker compose
├── Dockerfile               # Multi-stage build
└── vite.config.ts           # Vite yapılandırması
```

## Gereksinimler

- Node.js 20+
- npm
- Python 3.9+ (optik okuma için, isteğe bağlı)

## Yerel Kurulum

1. Bağımlılıkları yükleyin:

```bash
npm install
```

2. Geliştirme sunucusunu başlatın:

```bash
npm run dev
```

Uygulama varsayılan olarak http://localhost:5050 adresinde çalışır.

## Build ve Çalıştırma

```bash
npm run build
npm start
```

## Veritabanı

- SQLite dosyası: `./db/local.db`
- Tablolar: `exams`, `registry_districts`, `registry_schools`, `registry_students`, `registry_meta`
- Optik okuma: `optic_readings.sqlite` (tablolar: `optic_scan_sessions`, `optic_scan_answers`)
- Şema güncelleme:

```bash
npm run db:push
```

## API Route'ları

| Metot | Route | Açıklama |
|-------|-------|----------|
| GET | `/api/exams` | Tüm sınavları listeler |
| POST | `/api/exams` | Yeni sınav oluşturur |
| PUT | `/api/exams/:id/activate` | Sınavı aktifleştirir |
| DELETE | `/api/exams/:id` | Sınavı ve ilişkili verileri siler |
| GET | `/api/registry` | Kütük verilerini getirir |
| POST | `/api/registry/replace` | Kütük verilerini değiştirir |
| POST | `/api/registry/clear` | Kütük verilerini temizler |
| GET | `/api/optics/configs` | Optik yapılandırmaları listeler |
| POST | `/api/optics/configs` | Optik yapılandırma kaydeder |
| GET | `/api/optics/results` | Optik sonuçları listeler |
| POST | `/api/optics/results` | Optik sonuç kaydeder |
| POST | `/api/optics/scans` | Tarama oturumu kaydeder |
| GET | `/api/optics/scans` | Tarama oturumlarını listeler |
| POST | `/api/optics/process` | Görsel işleme başlatır |
| POST | `/api/optics/detect-frame` | Çerçeve tespiti yapar |
| POST | `/api/optics/upload` | Dosya yükler |
| POST | `/api/optics/batch` | Toplu işlem yapar |

## Docker ile Çalıştırma

### Build ve ayağa kaldırma

```bash
docker compose up --build -d
```

### Logları takip etme

```bash
docker compose logs -f
```

### Durdurma

```bash
docker compose down
```

Konteyner içinde uygulama 5050 portunda çalışır. Host erişimi varsayılan olarak http://localhost:5050 şeklindedir.

## Docker Yapılandırması

- Dockerfile çok aşamalı (builder + runner) yapı kullanır.
- docker-compose üretim modunda runner hedefini kullanır.
- PORT ortam değişkeni 5050 olarak ayarlıdır.
- APP_PORT ile host portu değiştirilebilir:

```bash
APP_PORT=8080 docker compose up --build -d
```

- db klasörü volume olarak bağlanır; veriler konteyner yeniden başlasa da korunur.

## Portainer ile Deploy

- **Git üzerinden deploy (önerilen):** Portainer > Stacks > Add stack > "Repository" ile GitHub repo URL'sini girin ve `portainer-stack.yml` dosya yolunu seçin.
- **Image ile deploy:** Önce Docker Hub/registry'e `cmtrkr83/web-system-core:latest` etiketli bir image push edin. Ardından Portainer'da `portainer-stack.yml` dosyasını kullanarak stack oluşturun.
- **Doğrudan compose build:** Portainer'da repository'den compose dosyasını kullanırken build gerektiren bir yapı varsa Portainer'ın build yetkilerini ve Docker daemon yapılandırmasını kontrol edin.

Dosyalar:
- [docker-compose.yml](docker-compose.yml)
- [portainer-stack.yml](portainer-stack.yml)
