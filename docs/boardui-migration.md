# BoardUI Göçü — Plan

Karar: tasarım sistemi **BoardUI**. Tek renk kaynağı `client/src/styles/theme.css`.
Kimlik doğrulama eklenmeyecek (uygulama yalnızca yerel ağda çalışıyor).

## Faz 1 — Temel (renk + karanlık mod + temizlik)
- [x] Tek stil girdisi: `client/src/styles/globals.css` (BoardUI'nin kendi girişi; `main.tsx` buna bağlandı).
      Kullanılmayan `client/src/index.css` silindi — HSL paleti ve ikinci `.dark` bloğu onunla gitti.
      globals.css'in 1000 satırlık motion/utility katmanı (t-stagger, view-transition, shadow-*, skeleton) artık yükleniyor.
- [x] shadcn adları (`--color-muted`, `--color-border`, …) globals.css sonundaki `@theme inline` köprüsüyle
      BoardUI semantic token'larına bağlandı. Tek renk kaynağı: `styles/theme.css`.
- [x] Karanlık mod: BoardUI `ThemeToggle` bileşeni kuruldu (`components/application/theme/theme-toggle.tsx`),
      Sidebar altbilgisi + mobil başlıkta. `<html class="dark">` + view-transition ile tıklama noktasından açılma.
      İlk boyama için `index.html`'e FOUC engelleyici inline script eklendi.
      (`next-themes` gerekmedi; BoardUI toggle kendi localStorage anahtarını kullanıyor.)

## Faz 2 — Sayfaları BoardUI token'larına taşı
shadcn token sınıfları → BoardUI semantic sınıfları, sayfa sayfa:
`text-muted-foreground`→`text-text-tertiary`, `bg-muted`→`bg-background-secondary-default`,
`border-border`→`border-separator-border`, `bg-card`→`bg-background-primary-default`, …

## Faz 3 — shadcn primitiflerini BoardUI bileşenleriyle değiştir
`npx boardui add <ad> --yes` ile gerçek kaynak kurulur; sayfa çağrı yerleri güncellenir.
Sıra: button → input/select/checkbox → table → badge/chip → dialog/sheet → toast.

## Faz 4 — Kapsam dışı bırakılanlar
- Auth: yok (yerel erişim). `passport*`, `express-session` bağımlılıkları kullanılmıyor.
