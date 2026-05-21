# Web System Core

Sınav kütük yönetimi, etiket/tutanak üretimi ve optik kodlama çıktısı için geliştirilmiş web uygulaması.

## Özellikler

- Kütük Belirleme
  - Excel dosyasından ilçe, okul ve öğrenci verilerini içe aktarır.
  - Sütun eşleştirme ile farklı başlıklara uyum sağlar.
  - İsteğe bağlı özel filtreleme (ör. zihinsel/kademe kayıtları hariç).
- Kütük Bölme
  - İlçe/okul/şube bazında öğrenci dağılımını düzenler.
- Salon Listesi
  - Sınav salon listeleri oluşturur.
- Okul Etiketi ve Şube Etiketi
  - PDF çıktı üretir.
  - Filtreleme ve sayfa yerleşimi seçenekleri sunar.
- Teslim Tutanakları
  - İlçe-okul bazlı teslim dökümleri üretir.
- Optik Kodlama
  - Excel eşleşmelerinden alanları otomatik getirir.
  - Alan bazlı TXT/OMR yazdırma ve sürükle-bırak yerleşim desteği sağlar.

## Teknoloji

- Node.js + Express (API)
- React + Vite (UI)
- SQLite (better-sqlite3) + Drizzle ORM

## Gereksinimler

- Node.js 20+
- npm

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

- SQLite dosyası: ./db/local.db
- Şema güncelleme:

```bash
npm run db:push
```

## Docker ile Çalıştırma

### 1) Build ve ayağa kaldırma

```bash
docker compose up --build -d
```

### 2) Logları takip etme

```bash
docker compose logs -f
```

### 3) Durdurma

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

- **Git üzerinden deploy (önerilen):** Portainer > Stacks > Add stack > "Repository" ile GitHub repo URL'sini girin ve `portainer-stack.yml` dosya yolunu seçin. Bu durumda Portainer varsayılan olarak `image` alanını çekmeye çalışır; eğer `build` isterseniz compose dosyasını doğrudan kullanabilirsiniz.
- **Image ile deploy:** Önce Docker Hub/registry'e `cmtrkr83/web-system-core:latest` etiketli bir image push edin. Ardından Portainer'da `portainer-stack.yml` dosyasını kullanarak stack oluşturun.
- **Doğrudan compose build:** Portainer'da repository'den compose dosyasını kullanırken build gerektiren bir yapı varsa Portainer'ın build yetkilerini ve Docker daemon yapılandırmasını kontrol edin.

Örnek: GitHub'dan direkt deploy yapmak için `portainer-stack.yml` yolunu belirtin.

Dosyalar:
- [docker-compose.yml](docker-compose.yml)
- [portainer-stack.yml](portainer-stack.yml)

