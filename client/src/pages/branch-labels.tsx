import { useState, useEffect } from "react";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { InputBase as Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Select, SelectItem } from "@/components/base/select/select";
import { Printer, Eye, Palette, ChevronLeft, ChevronRight, MapPin, School, Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegistry } from "@/context/RegistryContext";
import { toast } from "@/components/base/toast/toast";

const colorSchemes = [
	{ id: "blue", name: "Mavi", primary: "bg-blue-200", border: "border-blue-300", bg: "bg-blue-50", text: "text-blue-900" },
	{ id: "orange", name: "Turuncu", primary: "bg-orange-200", border: "border-orange-300", bg: "bg-orange-50", text: "text-orange-900" },
	{ id: "green", name: "Yeşil", primary: "bg-green-200", border: "border-green-300", bg: "bg-green-50", text: "text-green-900" },
	{ id: "black", name: "Gri", primary: "bg-gray-300", border: "border-gray-400", bg: "bg-gray-50", text: "text-gray-800" },
	{ id: "yellow", name: "Sarı", primary: "bg-yellow-200", border: "border-yellow-300", bg: "bg-yellow-50", text: "text-yellow-900" },
	{ id: "none", name: "Renksiz", primary: "", border: "border-gray-300", bg: "bg-white", text: "text-black" },
];

interface Branch {
	id: string; // unique ID for branch (schoolId_className)
	districtId: string;
	districtName: string;
	schoolId: string;
	schoolName: string;
	schoolCode: string;
	branchName: string;
	studentCount: number;
}

export default function BranchLabels() {
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

	const { districts: ctxDistricts, schools: ctxSchools, students: ctxStudents, isLoaded } = useRegistry();

	// Etiket Boyutları
	const A4_WIDTH = 210;
	const A4_HEIGHT = 297;
	const MARGIN_TOP = 8;
	const MARGIN_BOTTOM = 8;
	const MARGIN_LEFT = 1;
	const MARGIN_RIGHT = 1;
	const GRID_GAP_MM = 2;
	const horizontalGapTotal = Math.max(0, cols - 1) * GRID_GAP_MM;
	const verticalGapTotal = Math.max(0, rows - 1) * GRID_GAP_MM;
	const usableHeight = A4_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - verticalGapTotal;
	const usableWidth = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - horizontalGapTotal;

	const labelHeight = usableHeight / rows;
	const labelWidth = usableWidth / cols;

	// Şubeleri oluştur: Seçili okullardaki öğrencileri şubelerine göre grupla
	const branches: Branch[] = [];
	const branchMap = new Map<string, { districtId: string; districtName: string; schoolId: string; schoolName: string; schoolCode: string; branchName: string; count: number }>();

	// Filtrelme: Seçili okulları belirle
	let filteredSchools = ctxSchools;
	if (selectedDistrict) {
		filteredSchools = filteredSchools.filter(s => s.districtId === selectedDistrict);
	}
	if (selectedSchool) {
		filteredSchools = filteredSchools.filter(s => s.id === selectedSchool);
	}

	// Şube haritası oluştur
	filteredSchools.forEach(school => {
		const schoolStudents = ctxStudents.filter(st => st.schoolId === school.id);
		const district = ctxDistricts.find(d => d.id === school.districtId);
		
		// Her uniq sınıfa (şube) göre grupla
		const uniqueBranches = new Set<string>(
			schoolStudents
				.map(st => String(st.class ?? "").trim())
				.filter(v => v.length > 0)
		);

		uniqueBranches.forEach(branchName => {
			const branchKey = `${school.id}_${branchName}`;
			const branchStudents = schoolStudents.filter(st => String(st.class ?? "").trim() === branchName);
			branchMap.set(branchKey, {
				districtId: school.districtId,
				districtName: district?.name || "",
				schoolId: school.id,
				schoolName: school.name,
				schoolCode: school.code,
				branchName: branchName,
				count: branchStudents.length,
			});
		});
	});

	// Branch array'ine dönüştür
	branchMap.forEach((data, key) => {
		branches.push({
			id: key,
			districtId: data.districtId,
			districtName: data.districtName,
			schoolId: data.schoolId,
			schoolName: data.schoolName,
			schoolCode: data.schoolCode,
			branchName: data.branchName,
			studentCount: data.count,
		});
	});

	// Sayfa oluştur
	const labelsPerPage = rows * cols;
	const totalLabels = branches.length;
	const totalPages = Math.max(1, Math.ceil(totalLabels / labelsPerPage));
	const pages = Array.from({ length: totalPages }, (_, pageIdx) => {
		const start = pageIdx * labelsPerPage;
		const end = start + labelsPerPage;
		return branches.slice(start, end);
	});

	const [currentPage, setCurrentPage] = useState(0);
	const handlePrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
	const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
	const headerPrefix = lessonName.trim();

	function handleHtmlPrint() {
		if (!isLoaded) {
			toast.error("Veri yüklenmemiş", { description: "Lütfen Başlangıç sayfasından Excel dosyası yükleyin." });
			return;
		}

		if (!pages || pages.length === 0) {
			toast.error("Etiket bulunamadı", { description: "Yazdırılacak etiket bulunamadı." });
			return;
		}

		const schemeMap: Record<string, { primary: string; border: string; bg: string; text: string; muted: string }> = {
			blue: { primary: "#bfdbfe", border: "#93c5fd", bg: "#eff6ff", text: "#1e3a8a", muted: "#475569" },
			orange: { primary: "#fed7aa", border: "#fdba74", bg: "#fff7ed", text: "#7c2d12", muted: "#475569" },
			green: { primary: "#bbf7d0", border: "#86efac", bg: "#f0fdf4", text: "#14532d", muted: "#475569" },
			black: { primary: "#d1d5db", border: "#9ca3af", bg: "#f9fafb", text: "#111827", muted: "#6b7280" },
			yellow: { primary: "#fef08a", border: "#fde047", bg: "#fefce8", text: "#713f12", muted: "#475569" },
			none: { primary: "#ffffff", border: "#d1d5db", bg: "#ffffff", text: "#111827", muted: "#6b7280" },
		};

		const active = schemeMap[scheme] || schemeMap.blue;

		const sections = pages.map((_, pageIdx) => {
			const pageLabels = Array.from({ length: labelsPerPage }, (_, idx) => pages[pageIdx][idx] || null);

			const labelsHtml = pageLabels
				.map((branch) => {
					if (!branch) {
						return `<div style="min-height:${labelHeight}mm; min-width:${labelWidth}mm; border:1px dashed #e5e7eb; border-radius:4mm; background:#ffffff;"></div>`;
					}

					const branchHeader = headerPrefix;
					const schoolCodeText = String(branch.schoolCode || "").trim();
					const schoolNameWithCode = schoolCodeText
						? `${schoolCodeText} - ${branch.schoolName}`
						: branch.schoolName;
					const sideStripWidthMm = 6;
					const contentLeftPadMm = sideStripWidthMm + 1;
					const labelTextColor = scheme === "black" ? "#ffffff" : "#111827";
					const schoolFontSizeMm = fitLabelFontSize(schoolNameWithCode);

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
									<span style="writing-mode:vertical-rl; transform:rotate(180deg); text-transform:uppercase; font-weight:700; font-size:${Math.max(2.2, smallFontSizeMm)}mm; color:${active.text}; line-height:1; letter-spacing:0.2mm;">${safe(branch.districtName)}</span>
						</div>
						<div style="min-width:0; width:100%; max-width:100%; padding-left:${contentLeftPadMm}mm; height:100%; box-sizing:border-box; display:grid; grid-template-rows:minmax(0,1fr) minmax(${Math.max(10, innerHeightMm * 0.36)}mm, 36%); gap:${boxPaddingMm}mm;">
						<div style="min-height:0; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:${Math.max(0.5, boxPaddingMm / 2)}mm;">
							${branchHeader ? `<h3 style="margin:0; font-size:${smallFontSizeMm}mm; font-weight:700; text-transform:uppercase; color:${labelTextColor};">${safe(branchHeader)}</h3>` : ""}
							<h2 style="
								margin:0;
								font-size:${schoolFontSizeMm}mm;
								line-height:${Math.max(1.2, schoolFontSizeMm * 1.12)}mm;
								overflow-wrap:anywhere;
								word-break:break-word;
								font-weight:900;
								padding:${Math.max(0.5, boxPaddingMm)}mm;
								background:#ffffff;
								color:#111827;
								border:1px solid #d1d5db;
								border-radius:2mm;
								min-width:0;
								height:100%;
								min-height:0;
								display:flex;
								align-items:center;
								justify-content:center;
								width:100%;
								max-width:100%;
								box-sizing:border-box;
							">${safe(schoolNameWithCode)}</h2>
						</div>
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:${boxPaddingMm}mm;">
							<div style="height:100%; min-width:0; min-height:0; overflow:hidden; display:flex; flex-direction:column; justify-content:center; background:#ffffff; border:1px solid #d1d5db; border-radius:2mm; text-align:center; padding:${boxPaddingMm}mm; box-sizing:border-box;">
								<p style="margin:0; font-size:${infoLabelFontSizeMm}mm; line-height:1.1; text-transform:uppercase; color:${active.muted};">Şube Adı</p>
								<p style="margin:0; font-size:${branchValueFontSizeMm}mm; line-height:1.1; font-weight:700; color:#111827;">${safe(branch.branchName)}</p>
							</div>
							<div style="height:100%; min-width:0; min-height:0; overflow:hidden; display:flex; flex-direction:column; justify-content:center; background:#ffffff; border:1px solid #d1d5db; border-radius:2mm; text-align:center; padding:${boxPaddingMm}mm; box-sizing:border-box;">
								<p style="margin:0; font-size:${infoLabelFontSizeMm}mm; line-height:1.1; text-transform:uppercase; color:${active.muted};">Öğrenci Sayısı</p>
								<p style="margin:0; font-size:${infoValueFontSizeMm}mm; line-height:1.1; font-weight:700; color:#111827;">${branch.studentCount}</p>
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

		const printWindow = window.open("", "_blank", "width=1200,height=900");
		if (!printWindow) {
			toast.error("Pencere açılamadı", { description: "Yazdırma penceresi açılamadı. Tarayıcı engelleyicisini kontrol edin." });
			return;
		}

		printWindow.document.write(`<!doctype html>
			<html lang="tr">
			<head>
				<meta charset="utf-8" />
				<title>Şube Etiketleri</title>
				<style>
					@page { size: A4; margin: 0; }
					html { color-scheme: light; }
					body { margin: 0; padding: 0; background: #fff; color: #111827; color-scheme: light; }
					.print-page { break-inside: avoid; page-break-inside: avoid; }
					.print-page:not(:last-child) { break-after: page; page-break-after: always; }
				</style>
			</head>
			<body>${sections.join("")}</body>
			</html>`);
		printWindow.document.close();
		printWindow.focus();
		try {
			printWindow.print();
		} catch {
			toast.error("Hata", { description: "Yazdırma sırasında hata oluştu." });
		}
		toast.success("Başarılı", { description: "Yazdırma sayfası hazırlandı." });
	}

	const currentScheme = colorSchemes.find(s => s.id === scheme) || colorSchemes[0];
	const sideStripBgMap: Record<string, string> = {
		blue: "#bfdbfe",
		orange: "#fed7aa",
		green: "#bbf7d0",
		black: "#d1d5db",
		yellow: "#fef08a",
		none: "#ffffff",
	};
	const sideStripTextColorMap: Record<string, string> = {
		blue: "#1e3a8a",
		orange: "#7c2d12",
		green: "#14532d",
		black: "#111827",
		yellow: "#713f12",
		none: "#000000",
	};
	const sideStripBgHex = sideStripBgMap[scheme] || sideStripBgMap.blue;
	const sideStripTextColor = sideStripTextColorMap[scheme] || "#111827";
	const infoLabelTextColor = scheme === "black" || scheme === "none" ? "#6b7280" : "#475569";

	const minBaseFont = 1.5;
	const minSmallFont = 1.0;
	const labelMinDimension = Math.min(labelHeight, labelWidth);
	const baseFontSizeMm = Math.max(minBaseFont, Math.min(6.5, labelMinDimension * 0.11));
	const smallFontSizeMm = Math.max(minSmallFont, Math.min(3.2, baseFontSizeMm * 0.58));
	const sideStripFontSizeMm = Math.max(2.2, smallFontSizeMm);
	const branchNameFontSizeMm = Math.max(1.0, Math.min(3.8, baseFontSizeMm - 0.7));
	const boxPaddingMm = Math.max(0.6, Math.min(2.5, labelMinDimension * 0.025));
	const innerHeightMm = Math.max(1, labelHeight - boxPaddingMm * 2);
	const infoCellHeightMm = Math.max(1, innerHeightMm * 0.36);
	const infoLabelFontSizeMm = Math.max(smallFontSizeMm, Math.min(4.5, infoCellHeightMm * 0.16));
	const infoValueFontSizeMm = Math.max(baseFontSizeMm, Math.min(10, infoCellHeightMm * 0.34));
	const branchValueFontSizeMm = Math.max(branchNameFontSizeMm, Math.min(6, infoCellHeightMm * 0.22));
	const fitLabelFontSize = (text: string) => {
		const availableWidth = Math.max(20, labelWidth - 14);
		const availableHeight = Math.max(12, labelHeight * 0.36);
		let fontSize = baseFontSizeMm;
		while (fontSize > minBaseFont) {
			const charsPerLine = Math.max(1, Math.floor(availableWidth / (fontSize * 0.52)));
			const lineCount = Math.ceil(text.length / charsPerLine);
			if (lineCount <= 3 && lineCount * fontSize * 1.12 <= availableHeight) break;
			fontSize = Math.max(minBaseFont, fontSize - 0.2);
		}
		return fontSize;
	};

	useEffect(() => {
		const t = setTimeout(() => {
			const pxPerMm = 96 / 25.4;
			const nameEls = document.querySelectorAll<HTMLElement>(".etiket-branch-name");
			nameEls.forEach(el => {
				const parent = el.parentElement?.parentElement;
				if (!parent) return;
				const availableH = parent.clientHeight - (boxPaddingMm * pxPerMm * 2) - 10;
				let fontMm = parseFloat(el.style.fontSize || "0") || baseFontSizeMm;
				let fontPx = fontMm * pxPerMm;
				el.style.whiteSpace = 'normal';
				el.style.overflow = 'hidden';
				el.style.maxHeight = `${availableH}px`;
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
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div>
				<h1 className="text-title-1-semibold text-text-primary">Şube Etiketi Hazırlama</h1>
				<p className="text-text-tertiary mt-1">Sınav evrak poşetleri için şube etiketleri oluşturun.</p>
				</div>
				<div className="inline-flex w-fit items-center gap-2 rounded-full border border-accent-600/15 bg-accent-600/5 px-3 py-1.5 text-xs font-medium text-accent-600"><Tags className="h-3.5 w-3.5" />{totalPages} sayfa</div>
			</div>

			<div className="grid lg:grid-cols-3 gap-8">
				<Card className="lg:col-span-1 h-fit overflow-hidden rounded-2xl border-separator-border/70 shadow-sm">
					<CardHeader className="border-b border-separator-border/60 bg-background-secondary-default/20 pb-5">
						<div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-600/10 text-accent-600"><Tags className="h-5 w-5" /></div><div><CardTitle className="text-base">Etiket Ayarları</CardTitle>
						<CardDescription>Sayfa düzeni ve görünüm ayarları.</CardDescription>
						</div></div>
					</CardHeader>
					<CardContent className="space-y-5 p-5">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="satir-sayisi">Satır Sayısı</Label>
								<Input
									id="satir-sayisi"
									type="number"
									min="1"
									max="10"
									value={rows}
									onChange={(e) => setRows(Number(e.target.value))}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="sutun-sayisi">Sütun Sayısı</Label>
								<Input
									id="sutun-sayisi"
									type="number"
									min="1"
									max="5"
									value={cols}
									onChange={(e) => setCols(Number(e.target.value))}
								/>
							</div>
						</div>

						<div className="grid gap-4 mt-2">
							<div className="space-y-2.5"><Label className="gap-2 text-caption-1-semibold uppercase tracking-wide text-text-tertiary"><MapPin className="h-3.5 w-3.5 text-accent-600" />İlçe Seçimi</Label>
								<Select
									selectedKey={selectedDistrict || "all"}
									onSelectionChange={(key) => { const v = String(key); setSelectedDistrict(v === "all" ? "" : v); setSelectedSchool(""); setCurrentPage(0); }}
									placeholder="İlçe seçin"
								>
									<SelectItem id="all">Tüm İlçeler</SelectItem>{ctxDistricts.map(d => <SelectItem key={d.id} id={d.id}>{d.name}</SelectItem>)}
								</Select>
							</div>
							<div className="space-y-2.5"><Label className="gap-2 text-caption-1-semibold uppercase tracking-wide text-text-tertiary"><School className="h-3.5 w-3.5 text-accent-600" />Okul Seçimi</Label>
								<Select
									selectedKey={selectedSchool || "all"}
									onSelectionChange={(key) => { const v = String(key); setSelectedSchool(v === "all" ? "" : v); setCurrentPage(0); }}
									isDisabled={!selectedDistrict}
									placeholder={selectedDistrict ? "Okul seçin" : "Önce ilçe seçin"}
								>
									<SelectItem id="all">Tüm Okullar</SelectItem>{ctxSchools.filter(s => s.districtId === selectedDistrict).map(s => <SelectItem key={s.id} id={s.id}>{s.name}</SelectItem>)}
								</Select>
							</div>
						</div>

								<div className="space-y-2 mt-2">
									<Label htmlFor="ders-adi-opsiyonel">Ders Adı (Opsiyonel)</Label>
									<Input
										id="ders-adi-opsiyonel"
										placeholder="Örn: Matematik"
										value={lessonName}
										onChange={(e) => setLessonName(e.target.value)}
									/>
									<p className="text-xs text-text-tertiary">
										Doldurulursa etiketlerde ders adı görüntülenir.
									</p>
								</div>

						<div className="space-y-3">
							<Label className="gap-2">
								<Palette className="w-4 h-4" />
								Renk Şeması
							</Label>
							<div role="group" aria-label="Renk şeması" className="grid grid-cols-3 gap-2">
								{colorSchemes.map((s) => (
									<button
										key={s.id}
										type="button"
										aria-pressed={scheme === s.id}
										aria-label={s.name}
										onClick={() => setScheme(s.id)}
										className={cn(
											"relative flex w-full flex-col items-stretch gap-0 rounded-2lg border-2 bg-background-primary-default p-2 transition-colors hover:bg-background-primary-hover",
											scheme === s.id ? "border-accent-600" : "border-border-button-default",
										)}
									>
										<span className={cn("mb-2 block h-8 w-full rounded border", s.primary || "bg-white", s.border)} />
										<span className="block text-caption-1-medium">{s.name}</span>
									</button>
								))}
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex-col gap-2 border-t border-separator-border/60 bg-background-secondary-default/10 p-5">
						<Button className="w-full rounded-xl" size="medium" onClick={handleHtmlPrint} variant="ghost" leadingIcon={Printer}>
							
							Etiketleri HTML Yazdır
						</Button>
					</CardFooter>
				</Card>

				<div className="lg:col-span-2 flex flex-col gap-8">
					<Card className="overflow-hidden rounded-2xl border-separator-border/70 bg-background-secondary-default/20 shadow-sm">
						<CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-separator-border/60 pb-4">
							<CardTitle className="inline-flex items-center gap-2 flex-1 min-w-0 m-0">
								<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600/10 text-accent-600"><Eye className="w-4 h-4 flex-shrink-0" /></span>
								<span className="truncate">Önizleme</span>
							</CardTitle>
							<div className="flex items-center gap-1 rounded-xl border border-separator-border/70 bg-background-full p-1 shadow-sm">
								<Button variant="secondary" className="rounded-lg text-text-tertiary hover:bg-background-secondary-default disabled:opacity-40"
									onClick={handlePrevPage}
									disabled={currentPage === 0}
									aria-label="Önceki Sayfa" iconOnly leadingIcon={ChevronLeft}
								></Button><span className="min-w-[58px] text-center text-xs font-medium tabular-nums text-text-tertiary">{currentPage + 1} / {totalPages}</span><Button variant="secondary" className="rounded-lg text-text-tertiary hover:bg-background-secondary-default disabled:opacity-40"
									onClick={handleNextPage}
									disabled={currentPage === totalPages - 1}
									aria-label="Sonraki Sayfa" iconOnly leadingIcon={ChevronRight}
								></Button>
							</div>
						</CardHeader>
						<CardContent className="flex min-h-[500px] items-start justify-center overflow-auto bg-background-secondary-default/30 p-6">
							{!isLoaded ? (
								<div className="text-center text-text-tertiary">
									<p className="font-semibold mb-2">Henüz veri yüklenmemiş</p>
									<p className="text-sm">Lütfen Başlangıç sayfasından Excel dosyası yükleyin.</p>
								</div>
							) : branches.length === 0 ? (
								<div className="text-center text-text-tertiary">
									<p className="font-semibold mb-2">Şube bulunamadı</p>
									<p className="text-sm">Seçili okullarda hiç şube bulunmamaktadır.</p>
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
										{pages[currentPage].map((branch) => (
											<div
												key={branch.id}
												className={cn(
													"border-2 rounded-lg flex flex-col justify-between relative overflow-hidden",
													currentScheme.border,
													currentScheme.bg
												)}
												style={{ width: `${labelWidth}mm`, minWidth: 0, maxWidth: `${labelWidth}mm`, minHeight: `${labelHeight}mm`, padding: `${Math.max(0.5, boxPaddingMm)}mm` }}
											>
												<div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6mm', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sideStripBgHex }}>
													<span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textTransform: 'uppercase', fontWeight: 700, fontSize: `${sideStripFontSizeMm}mm`, color: sideStripTextColor, lineHeight: 1, letterSpacing: '0.2mm' }}>
														{branch.districtName}
													</span>
												</div>
												<div style={{ minWidth: 0, width: '100%', maxWidth: '100%', paddingLeft: '7mm', height: '100%', boxSizing: 'border-box', display: 'grid', gridTemplateRows: `minmax(0, 1fr) minmax(${Math.max(10, innerHeightMm * 0.36)}mm, 36%)`, gap: `${boxPaddingMm}mm` }}>
												<div style={{ minHeight: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: `${Math.max(0.5, boxPaddingMm / 2)}mm` }}>
													{headerPrefix ? (
														<h3 className="font-bold uppercase" style={{ fontSize: `${smallFontSizeMm}mm`, margin: 0, color: scheme === "black" ? "#ffffff" : "#111827" }}>
															{headerPrefix}
														</h3>
													) : null}
													<h2 className="font-black rounded etiket-branch-name" style={{ minWidth: 0, width: '100%', maxWidth: '100%', height: '100%', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: `${fitLabelFontSize(`${branch.schoolCode || ""} - ${branch.schoolName}`)}mm`, padding: `${Math.max(0.5, boxPaddingMm)}mm`, margin: 0, lineHeight: `${Math.max(1.2, fitLabelFontSize(`${branch.schoolCode || ""} - ${branch.schoolName}`) * 1.12)}mm`, overflowWrap: "anywhere", wordBreak: "break-word", background: '#ffffff', color: '#111827', border: '1px solid #d1d5db' }}>
														{`${branch.schoolCode ? `${branch.schoolCode} - ` : ""}${branch.schoolName}`}
													</h2>
												</div>
												<div className="grid grid-cols-2" style={{ gap: `${boxPaddingMm}mm` }}>
													<div className="h-full min-w-0 min-h-0 overflow-hidden flex flex-col justify-center bg-white rounded text-center" style={{ padding: `${boxPaddingMm}mm`, border: "1px solid #d1d5db" }}>
														<p className="uppercase" style={{ fontSize: `${infoLabelFontSizeMm}mm`, lineHeight: 1.1, margin: 0, color: infoLabelTextColor }}>Şube Adı</p>
													<p className="font-bold" style={{ fontSize: `${branchValueFontSizeMm}mm`, lineHeight: 1.1, margin: 0, color: "#111827" }}>{branch.branchName}</p>
													</div>
													<div className="h-full min-w-0 min-h-0 overflow-hidden flex flex-col justify-center bg-white rounded text-center" style={{ padding: `${boxPaddingMm}mm`, border: "1px solid #d1d5db" }}>
														<p className="uppercase" style={{ fontSize: `${infoLabelFontSizeMm}mm`, lineHeight: 1.1, margin: 0, color: infoLabelTextColor }}>Öğrenci Sayısı</p>
														<p className="font-bold" style={{ fontSize: `${infoValueFontSizeMm}mm`, lineHeight: 1.1, margin: 0, color: "#111827" }}>{branch.studentCount}</p>
													</div>
												</div>
												</div>
											</div>
										))}
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
