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
- [x] **Radio** (`labels`, `branch-labels` renk şeması): `components/base/radio/radio`
      (`RadioGroup` + `Radio`). Renk şeması kartı korundu: `Radio` kartın tamamı olacak şekilde
      sınıflandı (`data-[selected]:border-accent-600`), nokta `[&>span:first-child]` ile sağ üste
      taşındı. `value`/`onValueChange` → `value`/`onChange`; `RadioGroupItem + sr-only + peer` hilesi gitti.
- [x] **Checkbox** (`reports`): `components/base/checkbox/checkbox` — React Aria kökü `<label>`
      olduğu için ayrı `Label htmlFor` gerekmedi; başlık + açıklama çocuk olarak verildi.
      `room-lists`teki kullanılmayan import silindi.
- [x] **Progress** (`evaluation`): `components/base/progress/progress` (`ProgressBar`);
      satır sayısı henüz bilinmiyorken `isIndeterminate` (eski 0% çubuğu yerine tarama animasyonu).
- [x] **Card** shadcn dosyası kaldı (BoardUI'de karşılığı yok) — token'ları BoardUI'ye çevrildi
      (`bg-background-primary-default`, `border-separator-border`, `text-text-tertiary`).
      Artık uygulama kodunda shadcn köprü token'ı kullanan sınıf yok; köprü yine de duruyor.
- [x] **Kullanılmayan shadcn dosyaları silindi** (53 dosya + `hooks/use-toast.ts`);
      `components/ui/` yalnızca `card.tsx` ve `table.tsx` kaldı.
- Shadcn dönemi paketleri kaldırıldı (31 `@radix-ui/*`, `class-variance-authority`,
      `@hookform/resolvers`, `tw-animate-css`, `framer-motion`, `vaul`, `cmdk`, `embla-carousel-react`,
      `sonner`, `input-otp`, `react-resizable-panels`, `react-day-picker`, `date-fns`,
      `react-hook-form`, `next-themes`, `tailwindcss-animate`).
- Hâlâ hiçbir yerden import edilmeyenler (silme onayı bekliyor): `passport`, `passport-local`,
      `express-session`, `memorystore`, `ws`, `jsqr`, `jspdf-autotable`, `zod-validation-error`,
      `@jridgewell/trace-mapping`.
- [x] Etiket ↔ alan bağı: yanındaki alanla durup bağı olmayan 18 etiket için alana `id`,
      etikete `htmlFor` üretildi (`script/migrate-boardui-label-for.cjs`; kimlik etiket metninden,
      Türkçe harfler sadeleşmiş, dosya içinde çakışma yok). `InputBase` kimliği gerçek `<input>`a
      koyduğu için ekran okuyucu artık etiketi okuyor, etikete tıklayınca alana odaklanıyor.
- [x] **Kullanıcı commit'lerinden sonra kalan ham renkler**: KPI kartı tonları (`stat-cards`
      `PLAIN_TONES`) `bg-blue-50 dark:bg-status-…` çiftleri yerine doğrudan `status-<ton>-*`
      token'larını kullanıyor; dashboard grafiğindeki `hsl(var(--border))` /
      `hsl(var(--muted-foreground))` (shadcn döneminden kalma, artık tanımsız değişkenler)
      `var(--color-separator-border)` / `var(--color-text-tertiary)` oldu; optik
      oluşturma/kodlamadaki sabit mavi sürükleme çerçeveleri accent token'larına geçti.
      Baskı HTML'indeki (`reports`, `registry-split`, `room-lists`, `optic-*`) beyaz/siyah
      değerler kâğıt çıktısı olduğu için bilinçli olarak ham bırakıldı.
- [x] **Son yerli kontroller** (`exam-selection`, `optic-creation`): uygulama kodunda native form
      öğesi kalmadı.
  - `<textarea>` → `components/base/textarea/textarea` (`Textarea`: `label`, `rows`, `isDisabled`;
    RAC `onChange` metnin kendisini verir, `e.target.value` yok).
  - Excel "Ek Sütunlar" kutucukları → `Checkbox`: kartın kendisi bileşen oldu (RAC kökü `<label>`
    olduğundan bütün kutu tıklanabilir), seçim rengi `className`le verildi.
  - Elle yazılmış `role="switch"` anahtarı → `components/base/switch/switch`
    (`isSelected`/`onChange`).
  - İki `type="range"` (yazı boyutu, harf aralığı) → `components/base/slider/slider` (`Slider`:
    `minValue`/`maxValue`/`step`, `showTooltip={false}` — sayı okuması üstteki `Label`da duruyor).
    Bileşen registry'den kuruldu: `npx boardui add slider --dir client/src --yes`.
  - "Otomatik" kutusu `<Label>` içinde iç içe `<label>` üretiyordu (geçersiz HTML); satır ikiye
    bölünüp `Label` + `Checkbox` yan yana kondu.

## Faz 4 — Kapsam dışı bırakılanlar
- Auth: yok (yerel erişim). `passport*`, `express-session` bağımlılıkları kullanılmıyor.
- `components/ui/` yalnızca `card.tsx` (BoardUI'de kart yok) ve `table.tsx` (registry `table`
  React Aria koleksiyon modeli istiyor, bu tablolar koştullu kolon + `colSpan` ile çiziliyor).
