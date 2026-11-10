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
- [x] **Table** (6 rapor tablosu): registry'nin `table` bileşeni React Aria koleksiyon modeli
      (Column/Row/Cell) istiyor; bu tablolar ise koştullu kolon listesi ve hücre `colSpan` ile
      çiziliyor — deklaratif koleksiyona sığmadı (yapay bir `columns` dizisi + `Fragment key`
      denendi, `TableCell` RAC `Cell` olduğu için geçersiz çocuk üretiyor).
      `components/ui/table.tsx` BoardUI token'larıyla yeniden stillendirildi
      (ölçü/renkler `globals.css`'teki `.bui-table` ile birebir), kurulduktan sonra kullanılmayan
      `components/base/table/` silindi.
- [x] **Select** (12 seçim): `components/base/select/select` (`Select` + `SelectItem`, React Aria).
      Bileşik yapı düz API'ye çevrildi (`script/migrate-boardui-select.cjs`): `SelectTrigger`/`SelectValue`/
      `SelectContent` kaldırıldı, `value`→`selectedKey`, `onValueChange`→`onSelectionChange` (RAC `Key`
      döndürür → elle `String(key)`), `SelectItem value=`→`id=`, `disabled`→`isDisabled`,
      `h-7/h-8`→`size="sm"`, `SelectValue placeholder`→kökte `placeholder`.
      Eski tetikleyici giydirme sınıfları (`h-11 rounded-xl bg-background-full …`) silindi;
      boyutu ve yüzeyi bileşen kendi veriyor. `script/format-jsx-elements.cjs` taşınan blokları
      yeniden biçimlendiriyor (proje formatlayıcısı yok).
      Yerel bir rötuş: `SelectValue`'a `data-placeholder:text-text-tertiary` eklendi.
- [x] **Label** (51 etiket, 9 sayfa): `components/base/input/label` (React Aria `Label`, `isRequired`
      ile yıldızı kendisi çizer). shadcn'in `text-xs`/`flex items-center gap-2` gibi yinelemeleri
      BoardUI tipilerine çevrildi: `text-xs`→`text-caption-1-medium`, `text-xs font-semibold`→
      `text-caption-1-semibold`; `flex items-center` zaten bileşende var, sınıfardan silindi.
      `Sınav Adı *` gibi elle yazılan yıldızlar `isRequired` oldu.
- [x] **Yerli `<select>`ler** (9 adet, optik oluşturma + kodlama): shadcn değillerdi ama tasarımı
      hiç yoktu (`h-9 … border … bg-transparent`); BoardUI `Select`e çevrildi. Boş `value=""`
      seçenekleri RAC anahtarı olamadığı için ya `placeholder`a (form seçimi) ya `FREE_FIELD`
      gibi bir bekçi anahtara (alan bağlama) dönüştürüldü.
- [x] **Toast** (82 çağrı, 10 sayfa): `hooks/use-toast` + `ui/toaster` → BoardUI `toast`
      (`script/migrate-boardui-toast.cjs`). `toast({ title, description, variant: "destructive" })`
      → `toast.error(...)`, `status: "success"` → `toast.success(...)`, diğerleri `toast(...)`;
      `useToast()` kancaları kaldırıldı. `App.tsx`'teki `Toaster` eski 3 sn süreyi korur
      (`duration={3000}`) ve Türkçe erişilebilirlik etiketleri alır.
- [x] **Düğme rengi kararı (kullanıcı isteği)**: sistem genelinde düğmeler `variant="ghost"`
      (açık mavi zemin + koyu yazı, `--color-button-ghost-*`). İstisnalar:
      il genel durum tablosundaki "HTML Yazdır" düğmeleri `secondary` kaldı.
      Kullanıcının "eski hâli daha güzeldi" dediği düğmeler `secondary` + eski sınıflarına döndü:
      başlangıç sınav kartı sil, `registry-split` İl Raporu / Tüm İlçeler, `room-lists`/`labels`/
      `branch-labels` sağ üst ok düğmeleri, `optic-creation` sil/Aç. Sil düğmelerinin ikonu kırmızı
      (`text-text-error-primary`), "Aç" yeşil tonda (`text-status-lime-text`).
- [x] **Dialog → Modal** (2 şaşırtmacalı `Dialog`, `exam-selection`): `components/base/modal/modal`
      (`Modal` + `ModalHeader` + `ModalBody`). Modal kontrollü kullanılıyor (`isOpen`/`onOpenChange`),
      tetikleyici `ModalTrigger` yerine düz `onClick` — tetikleyici karttı, `Pressable` sarmalı gerekmedi.
      Boş durumda ikinci bir `Dialog` daha açılıyordu (aynı `open` durumu → üst üste iki katman);
      tek `Modal`'a indirildi, buton yalnızca `setOpen(true)` yapıyor. Panel `size="xl"`, kaydırma `ModalBody`de.
- [x] **Sheet → Drawer** (`components/layout/Sidebar`): `components/base/drawer/drawer`,
      `placement="start"`. Masaüstü `aside` ile mobil çekmecenin içeriği `SidebarContent`te toplandı
      (aynı başlık/menü/sürüm + tema anahtarı); `onNavigate` bağlantıya basınca çekmeceyi kapatıyor.
- [x] **Tooltip**: hiçbir yerde tooltip yoktu, sadece `App.tsx`te sağlayıcı duruyordu — kaldırıldı.
- [x] **Separator → Divider** (`evaluation`): `components/base/divider/divider`.
- [x] **Alert**: `optic-reading`deki tek hata kutusu token'lı satır içi panele çevrildi
      (`bg-notification-error-background/50` + `border-border-error-default/30`), `evaluation`daki
      kullanılmayan import silindi.
- Kalan `components/ui/*` kullanımı: `card` (12), `table` (3, bilinçli), `radio-group` (2),
      `checkbox` (1 dosyada 2), `progress` (1).
- Artık hiçbir yerden import edilmeyen (onay bekleyen) shadcn dosyaları: `select`, `label`,
      `toast`, `toaster`, `hooks/use-toast`, `dialog`, `sheet`, `tooltip`, `separator`, `alert`,
      `field`, `form`.
- Not: `components/ui/select.tsx` ve `hooks/use-toast.ts` artık hiçbir yerden import edilmiyor;
      Faz 3 bitince silinecek.
- Bilinen açık (göçten önce de böyleydi): 22 etiket alanla yan yana duruyor ama `htmlFor`/`id`
      bağı yok — ekran okuyucu etiketi okumuyor. Doğru çözümü BoardUI'nin bileşik `Input label=`
      kullanımı; toplu geçiş ayrı bir iş.

## Faz 4 — Kapsam dışı bırakılanlar
- Auth: yok (yerel erişim). `passport*`, `express-session` bağımlılıkları kullanılmıyor.
- `components/ui/*` dosyaları henüz silinmiyor: `alert-dialog`, `input-group`, `pagination`,
  `sidebar`, `calendar`, `carousel` içinde hâlâ `ui/button` import'u var (kullanılmıyorlar ama
  Faz 3 tamamlanana dek köprü onları taşıyor).
