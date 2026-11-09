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

- [x] 372 sınıf, 11 sayfa (`script/migrate-boardui-tokens.py`, AST ile doğrulandı).
- [x] Durum renkleri (green/red/amber/emerald/blue/violet) → `status-*` / `state-success-*` tokenları.
      Kalan ham palet sınıfları yalnızca baskı çıktısında (labels, branch-labels, optic-creation önizlemesi) — bilinçli.
- [x] `dark:` override'ları kaldırıldı (tokenlar `.dark` ile kendini çeviriyor).

## Faz 3 — shadcn primitiflerini BoardUI bileşenleriyle değiştir
`npx boardui add <ad> --yes --dir client/src` ile gerçek kaynak kurulur; çağrı yerleri AST codemod'larıyla taşınır
(regex JSX'e güvenilmez — `script/migrate-boardui-*.cjs` her dosyayı yazmadan önce yeniden ayrıştırıp doğrular).

- [x] **Button** (52 kullanım): variant/size eşlemesi, ikonlar `leadingIcon`/`trailingIcon`,
      `iconOnly` + aria-label, 18 ana eylem `variant="primary"`.
- [x] **Input** (27 alan): `InputBase` — genişlik `fieldClassName`e, tipografi `className`a,
      `h-7`/`h-8` → `size="small"`. value/onChange semantiği korundu.
- [x] **Badge → Chip** (11 durum etiketi): `variant="bold|subtle|caption"` + `color` paleti.
- [x] **Table** (6 rapor tablosu): BoardUI'nin registry tablosu React Aria koleksiyon modeli
      (Column/Row/Cell) istiyor; koştullu kolon kullanan bu tablolar o modele girmedi.
      `components/ui/table.tsx` BoardUI token'larıyla yeniden stillendirildi
      (ölçü/renkler `globals.css`'teki `.bui-table` ile birebir), kurulduktan sonra kullanılmayan
      `components/base/table/` silindi.
- [ ] Select (12) — BoardUI Select'in API'si farklı (RAC `Select.Button/Popover/Item`), elle taşınmalı.
- [ ] Label (51) — BoardUI Label'ı TextField bağlamında çalışır; ya `<Input label>` ile birleşir ya kalır.
- [ ] Toast (`hooks/use-toast` + `ui/toaster` → BoardUI `toast`), Dialog (2), Sheet (2), Tooltip (2), Separator, Skeleton.

## Faz 4 — Kapsam dışı bırakılanlar
- Auth: yok (yerel erişim). `passport*`, `express-session` bağımlılıkları kullanılmıyor.
- `components/ui/*` dosyaları henüz silinmiyor: `alert-dialog`, `input-group`, `pagination`,
  `sidebar`, `calendar`, `carousel` içinde hâlâ `ui/button` import'u var (kullanılmıyorlar ama
  Faz 3 tamamlanana dek köprü onları taşıyor).
