# Web System Core

Sınav kütük yönetimi, etiket ve tutanak oluşturma için geliştirilmiş web uygulaması.

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
