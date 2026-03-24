import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Printer, Eye, Palette, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegistry } from "@/context/RegistryContext";

const colorSchemes = [
	{ id: "blue", name: "Mavi", primary: "bg-blue-600", border: "border-blue-600", bg: "bg-blue-50", text: "text-white" },
	{ id: "orange", name: "Turuncu", primary: "bg-orange-500", border: "border-orange-500", bg: "bg-orange-50", text: "text-white" },
	{ id: "green", name: "Yeşil", primary: "bg-green-600", border: "border-green-600", bg: "bg-green-50", text: "text-white" },
	{ id: "black", name: "Siyah", primary: "bg-black", border: "border-black", bg: "bg-neutral-900", text: "text-white" },
	{ id: "yellow", name: "Sarı", primary: "bg-yellow-400", border: "border-yellow-400", bg: "bg-yellow-50", text: "text-black" },
	{ id: "none", name: "Renksiz", primary: "", border: "border-gray-300", bg: "bg-white", text: "text-black" },
];

export default function Labels() {
	const formatSchoolName = (name: string) => {
		const turkishUpperMap: Record<string, string> = {
			a: "A", ç: "Ç", d: "D", e: "E", f: "F", g: "G", ğ: "Ğ", h: "H", ı: "I",
			i: "İ", j: "J", k: "K", l: "L", m: "M", n: "N", o: "O", ö: "Ö", p: "P",
			r: "R", s: "S", ş: "Ş", t: "T", u: "U", ü: "Ü", v: "V", w: "W", x: "X",
			y: "Y", z: "Z"
		};
		const turkishLowerMap: Record<string, string> = {
			A: "a", Ç: "ç", D: "d", E: "e", F: "f", G: "g", Ğ: "ğ", H: "h", I: "ı",
			İ: "i", J: "j", K: "k", L: "l", M: "m", N: "n", O: "o", Ö: "ö", P: "p",
			R: "r", S: "s", Ş: "ş", T: "t", U: "u", Ü: "ü", V: "v", W: "w", X: "x",
			Y: "y", Z: "z"
		};

		return String(name ?? "")
			.replace(/\s+/g, " ")
			.trim()
			.split(" ")
			.map((word) => {
				if (word.length === 0) return word;
				const first = word[0];
				const rest = word.slice(1);
				const firstLower = turkishLowerMap[first] || first.toLocaleLowerCase("tr-TR");
				const firstUpper = turkishUpperMap[firstLower] || first.toLocaleUpperCase("tr-TR");
				const restLower = rest
					.split("")
					.map((c) => turkishLowerMap[c] || c.toLocaleLowerCase("tr-TR"))
					.join("");
				return firstUpper + restLower;
			})
			.join(" ");
	};

	const safe = (value: string) =>
		String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\"/g, "&quot;")
			.replace(/'/g, "&#39;");

	const [rows, setRows] = useState(8);
	const [cols, setCols] = useState(3);
	const [scheme, setScheme] = useState("blue");
	const [selectedDistrict, setSelectedDistrict] = useState("");
	const [selectedSchool, setSelectedSchool] = useState("");
	const [lessonName, setLessonName] = useState("");

	// Örnek veri, backend'den alınabilir
	// Use registry context (populated by Excel upload)
	const { districts: ctxDistricts, schools: ctxSchools, students: ctxStudents, isLoaded } = useRegistry();

	// selectedDistrict will store district id; selectedSchool will store school id
	const filteredSchools = selectedDistrict ? ctxSchools.filter(s => s.districtId === selectedDistrict) : ctxSchools;

	// A4 ölçüleri: 210mm x 297mm
	const A4_WIDTH = 210;
	const A4_HEIGHT = 297;
	const MARGIN_TOP = 8;
	const MARGIN_BOTTOM = 8;
	const MARGIN_LEFT = 0;
	const MARGIN_RIGHT = 0;
	const GRID_GAP_MM = 2;
	const horizontalGapTotal = Math.max(0, cols - 1) * GRID_GAP_MM;
	const verticalGapTotal = Math.max(0, rows - 1) * GRID_GAP_MM;
	const usableHeight = A4_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - verticalGapTotal;
	const usableWidth = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - horizontalGapTotal;

	// Etiket boyutları dinamik
	const labelHeight = usableHeight / rows;
	const labelWidth = usableWidth / cols;

	// Filtreye göre etiket verisi (okullar üzerinden)
	let filteredLabels = ctxSchools;
	if (selectedDistrict) {
		filteredLabels = filteredLabels.filter(s => s.districtId === selectedDistrict);
	}
	if (selectedSchool) {
		filteredLabels = filteredLabels.filter(s => s.id === selectedSchool);
	}

	// Her okul için bir etiket örneği
	const totalLabels = filteredLabels.length;
	const labelsPerPage = rows * cols;
	const totalPages = Math.max(1, Math.ceil(totalLabels / labelsPerPage));
	const pages = Array.from({ length: totalPages }, (_, pageIdx) => {
		const start = pageIdx * labelsPerPage;
		const end = start + labelsPerPage;
		return filteredLabels.slice(start, end);
	});

	// Sayfa kontrolü
	const [currentPage, setCurrentPage] = useState(0);
	const handlePrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
	const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
	const headerPrefix = lessonName.trim();


	function handleHtmlPrint() {
		if (!isLoaded) {
			window.alert("Henüz veri yüklenmemiş. Lütfen 'Kütük Belirleme' sayfasından Excel dosyası yükleyin.");
			return;
		}

		if (!pages || pages.length === 0) {
			window.alert("Yazdırılacak etiket bulunamadı.");
			return;
		}

		const printWindow = window.open("", "_blank", "width=1200,height=900");
		if (!printWindow) {
			window.alert("Yazdırma penceresi açılamadı. Tarayıcı engelleyicisini kontrol edin.");
			return;
		}

		printWindow.document.open();
		printWindow.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>Hazırlanıyor...</title></head><body style="font-family: Arial, sans-serif; padding: 24px;">Yazdırma sayfası hazırlanıyor...</body></html>`);
		printWindow.document.close();

		const schemeMap: Record<string, { primary: string; border: string; bg: string; text: string; muted: string }> = {
			blue: { primary: "#2563eb", border: "#2563eb", bg: "#eff6ff", text: "#ffffff", muted: "#475569" },
			orange: { primary: "#f97316", border: "#f97316", bg: "#fff7ed", text: "#ffffff", muted: "#475569" },
			green: { primary: "#16a34a", border: "#16a34a", bg: "#f0fdf4", text: "#ffffff", muted: "#475569" },
			black: { primary: "#000000", border: "#000000", bg: "#171717", text: "#ffffff", muted: "#d4d4d8" },
			yellow: { primary: "#facc15", border: "#facc15", bg: "#fefce8", text: "#111827", muted: "#475569" },
			none: { primary: "#ffffff", border: "#d1d5db", bg: "#ffffff", text: "#111827", muted: "#6b7280" },
		};

		const active = schemeMap[scheme] || schemeMap.blue;

		const sections = pages.map((_, pageIdx) => {
			const pageLabels = Array.from({ length: labelsPerPage }, (_, idx) => pages[pageIdx][idx] || null);

			const labelsHtml = pageLabels
				.map((school) => {
					if (!school) {
						return `<div style="min-height:${labelHeight}mm; min-width:${labelWidth}mm; border:1px dashed #e5e7eb; border-radius:4mm; background:#ffffff;"></div>`;
					}

					const districtName = ctxDistricts.find((d) => d.id === school.districtId)?.name || "";
					const schoolCodeText = String(school.code || "").trim();
					const schoolNameWithCode = schoolCodeText
						? `${schoolCodeText} - ${formatSchoolName(school.name)}`
						: formatSchoolName(school.name);
					const sideStripWidthMm = 6;
					const contentLeftPadMm = sideStripWidthMm + 1;
					const schoolStudents = ctxStudents.filter((st) => st.schoolId === school.id);
					const studentCount = schoolStudents.length;
					const branchCount = new Set(
						schoolStudents
							.map((st) => String(st.class ?? "").trim())
							.filter((v) => v.length > 0)
					).size;
					const labelTextColor = scheme === "black" ? "#ffffff" : "#111827";

					return `
					<div style="
						min-height:${labelHeight}mm;
						min-width:${labelWidth}mm;
						padding:${Math.max(0.5, boxPaddingMm)}mm;
						border:2px solid ${active.border};
						border-radius:3mm;
						background:${active.bg};
						position:relative;
						display:flex;
						flex-direction:column;
						justify-content:space-between;
						overflow:hidden;
						box-sizing:border-box;
					">
						<div style="position:absolute; left:0; top:0; bottom:0; width:${sideStripWidthMm}mm; border-right:1px solid #d1d5db; display:flex; align-items:center; justify-content:center; background:${active.primary};">
							<span style="writing-mode:vertical-rl; transform:rotate(180deg); text-transform:uppercase; font-weight:700; font-size:${Math.max(2.2, smallFontSizeMm)}mm; color:${scheme === "none" ? "#000000" : "#ffffff"}; line-height:1; letter-spacing:0.2mm;">${safe(districtName)}</span>
						</div>
						<div style="padding-left:${contentLeftPadMm}mm; height:100%; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between;">
						<div style="text-align:center; margin-top:${boxPaddingMm}mm; display:flex; flex-direction:column; align-items:center; gap:${Math.max(0.5, boxPaddingMm / 2)}mm;">
							${headerPrefix ? `<h3 style="margin:0; font-size:${smallFontSizeMm}mm; font-weight:700; text-transform:uppercase; color:${labelTextColor};">${safe(headerPrefix)}</h3>` : ""}
							<h2 style="
								margin:0;
								font-size:${baseFontSizeMm}mm;
								line-height:${Math.max(1, baseFontSizeMm * 1.05)}mm;
								font-weight:900;
								padding:${Math.max(0.5, boxPaddingMm)}mm;
								background:${active.primary};
								color:${active.text};
								border-radius:2mm;
								width:100%;
								box-sizing:border-box;
							">${safe(schoolNameWithCode)}</h2>
						</div>
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:${boxPaddingMm}mm; margin-top:${boxPaddingMm}mm;">
							<div style="background:#ffffff; border:1px solid #d1d5db; border-radius:2mm; text-align:center; padding:${boxPaddingMm}mm; box-sizing:border-box;">
								<p style="margin:0; font-size:${smallFontSizeMm}mm; text-transform:uppercase; color:${active.muted};">Şube Sayısı</p>
								<p style="margin:0; font-size:${baseFontSizeMm}mm; font-weight:700; color:#111827;">${branchCount}</p>
							</div>
							<div style="background:#ffffff; border:1px solid #d1d5db; border-radius:2mm; text-align:center; padding:${boxPaddingMm}mm; box-sizing:border-box;">
								<p style="margin:0; font-size:${smallFontSizeMm}mm; text-transform:uppercase; color:${active.muted};">Öğrenci Sayısı</p>
								<p style="margin:0; font-size:${baseFontSizeMm}mm; font-weight:700; color:#111827;">${studentCount}</p>
							</div>
						</div>
						</div>
					</div>`;
				})
				.join("");

			return `
				<div class="print-page" style="
					width:210mm;
					height:297mm;
					background:#ffffff;
					padding-top:${MARGIN_TOP}mm;
					padding-bottom:${MARGIN_BOTTOM}mm;
					padding-left:${MARGIN_LEFT}mm;
					padding-right:${MARGIN_RIGHT}mm;
					box-sizing:border-box;
					overflow:hidden;
				">
					<div style="
						display:grid;
						grid-template-rows:repeat(${rows}, ${labelHeight}mm);
						grid-template-columns:repeat(${cols}, ${labelWidth}mm);
						gap:${GRID_GAP_MM}mm;
						width:100%;
						height:100%;
					">
						${labelsHtml}
					</div>
				</div>
			`;
		});

		printWindow.document.open();
		printWindow.document.write(`<!doctype html>
			<html lang="tr">
			<head>
				<meta charset="utf-8" />
				<title>Okul Etiketleri</title>
				<style>
					@page { size: A4; margin: 0; }
					body { margin: 0; padding: 0; background: #fff; }
					.print-page { break-inside: avoid; page-break-inside: avoid; }
					.print-page:not(:last-child) { break-after: page; page-break-after: always; }
				</style>
			</head>
			<body>${sections.join("")}</body>
			</html>`);
		printWindow.document.close();
		printWindow.onload = () => {
			setTimeout(() => {
				printWindow.focus();
				printWindow.print();
			}, 150);
		};

		setTimeout(() => {
			try {
				printWindow.focus();
				printWindow.print();
			} catch {
				// no-op fallback
			}
		}, 500);
	}

	const currentScheme = colorSchemes.find(s => s.id === scheme) || colorSchemes[0];
	const sideStripBgMap: Record<string, string> = {
		blue: "#2563eb",
		orange: "#f97316",
		green: "#16a34a",
		black: "#000000",
		yellow: "#facc15",
		none: "#ffffff",
	};
	const sideStripBgHex = sideStripBgMap[scheme] || sideStripBgMap.blue;
	const sideStripTextColor = scheme === "none" ? "#000000" : "#ffffff";

	// Dinamik iç stil: etiket boyutlarına göre yazı ve padding ayarları (mm)
	// Küçülme gerektiğinde yazı boyutlarının otomatik küçülmesi için düşük minimumlar kullanıyoruz
	const minBaseFont = 1.5; // mm
	const minSmallFont = 1.0; // mm
	const baseFontSizeMm = Math.max(minBaseFont, Math.min(labelHeight, labelWidth) * 0.11);
	const smallFontSizeMm = Math.max(minSmallFont, baseFontSizeMm * 0.6);
	const sideStripFontSizeMm = Math.max(2.2, smallFontSizeMm);
	const boxPaddingMm = Math.max(0.6, Math.min(labelHeight, labelWidth) * 0.04);

	// adaptive font-fit: küçülmeyen durumları engellemek için DOM üzerinde kontrol edip gerekirse yazıyı kademeli küçültüyoruz
	useEffect(() => {
		// çalışması için küçük gecikme ver
		const t = setTimeout(() => {
			const pxPerMm = 96 / 25.4;
			const nameEls = document.querySelectorAll<HTMLElement>(".etiket-school-name");
			nameEls.forEach(el => {
				const parent = el.parentElement?.parentElement; // label container
				if (!parent) return;
				const availableH = parent.clientHeight - (boxPaddingMm * pxPerMm * 2) - 10; // biraz boşluk
				let fontMm = parseFloat(el.style.fontSize || "0") || baseFontSizeMm;
				let fontPx = fontMm * pxPerMm;
				el.style.whiteSpace = 'normal';
				el.style.overflow = 'hidden';
				el.style.display = '-webkit-box';
				el.style.webkitLineClamp = '3';
				el.style.webkitBoxOrient = 'vertical';
				// kademeli küçült
				while (el.scrollHeight > availableH && fontMm > 0.5) {
					fontMm = Math.max(0.5, fontMm * 0.9);
					el.style.fontSize = `${fontMm}mm`;
				}
			});
		}, 80);
		return () => clearTimeout(t);
	}, [rows, cols, pages, currentPage, baseFontSizeMm, boxPaddingMm]);

	return (
		<div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
			<div>
				<h1 className="text-3xl font-heading font-bold">Okul Etiketi Hazırlama</h1>
				<p className="text-muted-foreground mt-1">Sınav evrak poşetleri için okul etiketleri oluşturun.</p>
			</div>

			<div className="grid lg:grid-cols-3 gap-8">
				<Card className="lg:col-span-1 h-fit">
					<CardHeader>
						<CardTitle>Etiket Ayarları</CardTitle>
						<CardDescription>Sayfa düzeni ve görünüm ayarları.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label>Satır Sayısı</Label>
								<Input
									type="number"
									min="1"
									max="10"
									value={rows}
									onChange={(e) => setRows(Number(e.target.value))}
								/>
							</div>
							<div className="space-y-2">
								<Label>Sütun Sayısı</Label>
								<Input
									type="number"
									min="1"
									max="5"
									value={cols}
									onChange={(e) => setCols(Number(e.target.value))}
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4 mt-2">
							<div className="space-y-2">
								<Label>İlçe Seçimi</Label>
								<select
									className="w-full border rounded px-2 py-1"
									value={selectedDistrict}
									onChange={e => {
										setSelectedDistrict(e.target.value);
										setSelectedSchool("");
										setCurrentPage(0);
									}}
								>
									<option value="">Tüm İlçeler</option>
									{ctxDistricts.map(d => (
										<option key={d.id} value={d.id}>{d.name}</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<Label>Okul Seçimi</Label>
								<select
									className="w-full border rounded px-2 py-1"
									value={selectedSchool}
									onChange={e => { setSelectedSchool(e.target.value); setCurrentPage(0); }}
									disabled={!selectedDistrict}
								>
									<option value="">{selectedDistrict ? "Tüm Okullar" : "Önce ilçe seçin"}</option>
									{filteredSchools.map(s => (
										<option key={s.id} value={s.id}>{s.name}</option>
									))}
								</select>
							</div>
						</div>

							<div className="space-y-2 mt-2">
								<Label>Ders Adı (Opsiyonel)</Label>
								<Input
									placeholder="Örn: Matematik"
									value={lessonName}
									onChange={(e) => setLessonName(e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									Doldurulursa etiketlerde ders adı görüntülenir.
								</p>
							</div>

						<div className="space-y-3">
							<Label className="flex items-center gap-2">
								<Palette className="w-4 h-4" />
								Renk Şeması
							</Label>
							<RadioGroup
								defaultValue="blue"
								value={scheme}
								onValueChange={setScheme}
								className="grid grid-cols-3 gap-2"
							>
								{colorSchemes.map((s) => (
									<div key={s.id}>
										<RadioGroupItem value={s.id} id={s.id} className="peer sr-only" />
										<Label
											htmlFor={s.id}
											className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer transition-all"
										>
											<div className={cn("w-full h-8 rounded mb-2 border", s.primary || "bg-white", s.border)}></div>
											<span className="text-xs font-medium">{s.name}</span>
										</Label>
									</div>
								))}
							</RadioGroup>
						</div>
					</CardContent>
					<CardFooter className="flex-col gap-2">
						<Button className="w-full" size="lg" variant="outline" onClick={handleHtmlPrint}>
							<Printer className="mr-2 h-4 w-4" />
							Etiketleri HTML Yazdır
						</Button>
					</CardFooter>
				</Card>

				<div className="lg:col-span-2 flex flex-col gap-8">
					<Card className="bg-muted/30 border-dashed">
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="inline-flex items-center gap-2 flex-1 min-w-0 m-0">
								<Eye className="w-4 h-4 flex-shrink-0" />
								<span className="truncate">Önizleme</span>
							</CardTitle>
							<div className="flex gap-1 items-center flex-shrink-0">
								<button
									className="px-2 py-1 rounded border bg-white disabled:opacity-50 flex-shrink-0 flex items-center justify-center"
									onClick={handlePrevPage}
									disabled={currentPage === 0}
									aria-label="Önceki Sayfa"
								>
									<ChevronLeft className="w-4 h-4" />
								</button>
								<button
									className="px-2 py-1 rounded border bg-white disabled:opacity-50 flex-shrink-0 flex items-center justify-center"
									onClick={handleNextPage}
									disabled={currentPage === totalPages - 1}
									aria-label="Sonraki Sayfa"
								>
									<ChevronRight className="w-4 h-4" />
								</button>
							</div>
						</CardHeader>
						<CardContent className="flex items-center justify-center min-h-[500px] overflow-auto p-4">
							{!isLoaded ? (
								<div className="text-center text-muted-foreground">
									<p className="font-semibold mb-2">Henüz veri yüklenmemiş</p>
									<p className="text-sm">Lütfen 'Kütük Belirleme' sayfasından Excel dosyası yükleyin.</p>
								</div>
							) : (
								<div
									id={`etiket-preview-${currentPage}`}
								className="bg-white shadow-xl border w-[210mm] min-h-[297mm] flex flex-col"
								style={{
									paddingTop: `${MARGIN_TOP}mm`,
									paddingBottom: `${MARGIN_BOTTOM}mm`,
									paddingLeft: `${MARGIN_LEFT}mm`,
									paddingRight: `${MARGIN_RIGHT}mm`,
								}}
							>
								<div
										className="grid w-full h-full"
									style={{
										gridTemplateRows: `repeat(${rows}, ${labelHeight}mm)`,
											gridTemplateColumns: `repeat(${cols}, ${labelWidth}mm)`,
											gap: `${GRID_GAP_MM}mm`,
									}}
								>
									{pages[currentPage].map((school) => {
										const districtName = ctxDistricts.find(d => d.id === school.districtId)?.name || "";
										const sideStripWidthMm = 6;
										const contentLeftPadMm = sideStripWidthMm + 1;
										const schoolStudents = ctxStudents.filter((st) => st.schoolId === school.id);
										const studentCount = schoolStudents.length;
										const branchCount = new Set(
											schoolStudents
												.map((st) => String(st.class ?? "").trim())
												.filter((v) => v.length > 0)
										).size;
										return (
										<div
											key={school.id}
											className={cn(
												"border-2 rounded-lg flex flex-col justify-between relative overflow-hidden",
												currentScheme.border,
												currentScheme.bg
											)}
												style={{ minHeight: `${labelHeight}mm`, minWidth: `${labelWidth}mm`, padding: `${Math.max(0.5, boxPaddingMm)}mm` }}
										>
													<div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${sideStripWidthMm}mm`, borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sideStripBgHex }}>
														<span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textTransform: 'uppercase', fontWeight: 700, fontSize: `${sideStripFontSizeMm}mm`, color: sideStripTextColor, lineHeight: 1, letterSpacing: '0.2mm' }}>
															{districtName}
														</span>
													</div>
													<div style={{ paddingLeft: `${contentLeftPadMm}mm`, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
													<div style={{ textAlign: 'center', marginTop: `${boxPaddingMm}mm`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${Math.max(0.5, boxPaddingMm / 2)}mm` }}>
													{headerPrefix ? (
														<h3 className="font-bold uppercase" style={{ fontSize: `${smallFontSizeMm}mm`, margin: 0, color: scheme === "black" ? "#ffffff" : "#111827" }}>
															{headerPrefix}
														</h3>
													) : null}
												<h2 className={cn("font-black rounded etiket-school-name", currentScheme.primary, currentScheme.text)} style={{ fontSize: `${baseFontSizeMm}mm`, padding: `${Math.max(0.5, boxPaddingMm)}mm`, margin: 0, lineHeight: `${Math.max(1, baseFontSizeMm * 1.05)}mm` }}>
													{`${school.code ? `${school.code} - ` : ""}${formatSchoolName(school.name)}`}
													</h2>
												</div>
												<div className="grid grid-cols-2" style={{ gap: `${boxPaddingMm}mm`, marginTop: `${boxPaddingMm}mm` }}>
													<div className="bg-white rounded border text-center" style={{ padding: `${boxPaddingMm}mm` }}>
														<p className="text-muted-foreground uppercase" style={{ fontSize: `${smallFontSizeMm}mm`, margin: 0 }}>Şube Sayısı</p>
														<p className="font-bold" style={{ fontSize: `${baseFontSizeMm}mm`, margin: 0 }}>{branchCount}</p>
													</div>
													<div className="bg-white rounded border text-center" style={{ padding: `${boxPaddingMm}mm` }}>
														<p className="text-muted-foreground uppercase" style={{ fontSize: `${smallFontSizeMm}mm`, margin: 0 }}>Öğrenci Sayısı</p>
														<p className="font-bold" style={{ fontSize: `${baseFontSizeMm}mm`, margin: 0 }}>{studentCount}</p>
													</div>
												</div>
													</div>
										</div>
										);
									})}
								</div>
								</div>
							)}  
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}


