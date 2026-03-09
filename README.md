# Web System Core

Sınav kütük yönetimi, etiket ve tutanak oluşturma için geliştirilmiş web uygulaması.

## Özellikler

- **Kütük Belirleme**: Excel dosyasından ilçe, okul ve öğrenci verilerini otomatik içe aktarma
  - Özel öğrenci filtreleme (zihinsel engelli öğrenciler varsayılan olarak hariç tutulur)
  - "Kademe" geçen okullar otomatik olarak filtrelenir
- **Kütük Bölme**: Öğrenci kayıtlarını bölme ve düzenleme
- **Salon Listesi**: Sınav salonları için liste oluşturma
- **Okul Etiketi**: Okullara gidecek evrak poşetleri için etiket basımı (PDF)
  - İlçe, kurum kodu, okul adı, şube sayısı, öğrenci sayısı bilgileri
  - Özelleştirilebilir sayfa düzeni (satır/sütun)
  - 6 farklı renk şeması
- **Şube Etiketi**: Şubelere gidecek evrak poşetleri için etiket basımı (PDF)
  - İlçe, kurum kodu, okul adı, şube adı, öğrenci sayısı bilgileri
  - Özelleştirilebilir sayfa düzeni
  - İlçe ve okul bazlı filtreleme
- **Teslim Tutanağı**: İlçe ve okul bazlı teslim tutanakları oluşturma (PDF)
  - Otomatik sayfalama (10 okul/sayfa)
  - Türkçe karakter desteği

## Gereksinimler

- Node.js 20+
- npm

## Kurulum

```bash
npm install
```

## Geliştirme Ortamı

```bash
npm run dev
```

Uygulama varsayılan olarak `http://localhost:5000` üzerinde çalışır.

## Production Build

```bash
npm run build
npm start
```

## Veritabanı

Proje SQLite kullanır.

- Dosya yolu: `./db/local.db`
- Şema güncelleme:

```bash
npm run db:push
```

## Docker ile Çalıştırma

### Build + Run

```bash
docker compose up --build -d
```

### Logları İzleme

```bash
docker compose logs -f
```

### Durdurma

```bash
docker compose down
```

Uygulama konteyner içinde `5000` portunda çalışır ve hostta `http://localhost:5000` üzerinden erişilir.
