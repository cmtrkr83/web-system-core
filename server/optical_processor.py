#!/usr/bin/env python3
"""Optik kağıt işleme - JPEG görsellerde siyah kenarlıklı cevap alanı tespiti, eğiklik düzeltme ve önizleme"""

import sys
import json
import base64
from pathlib import Path
from typing import Optional, List, Dict, Any

try:
    import cv2
    import numpy as np
except ImportError as e:
    print(json.dumps({"error": f"Missing dependencies: {e}. Run: pip install opencv-python numpy"}))
    sys.exit(1)

try:
    from pyzbar import pyzbar
except ImportError:
    pyzbar = None

try:
    from pdf2image import convert_from_path
except ImportError:
    convert_from_path = None


DB_DIR = Path(__file__).parent.parent / "db"
UPLOAD_DIR = DB_DIR / "optic_uploads"
PROCESSED_DIR = DB_DIR / "optic_processed"
ERROR_DIR = DB_DIR / "optic_errors"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
ERROR_DIR.mkdir(parents=True, exist_ok=True)


def load_image(path: Path) -> Optional[np.ndarray]:
    """Görsel dosyasını oku, başarısızsa None dön"""
    with open(path, 'rb') as f:
        file_bytes = np.frombuffer(f.read(), np.uint8)
    return cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)


def img_to_base64(image: np.ndarray, quality: int = 60) -> str:
    """OpenCV görselini base64 JPEG string'ine çevir"""
    h, w = image.shape[:2]
    # Büyük görselleri önizleme için küçült
    max_dim = 1600
    if w > max_dim or h > max_dim:
        scale = max_dim / max(w, h)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        resized = image
    _, buf = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode('utf-8')


def read_qr_code(image: np.ndarray) -> Optional[str]:
    """QR kod oku - önce doğrudan dene, sonra farklı binarizasyonlarla dene"""
    if pyzbar is None:
        return None
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Önce doğrudan gri-tonla dene
    codes = pyzbar.decode(gray)
    for code in codes:
        try:
            data = code.data.decode('utf-8').strip()
            if data:
                return data
        except:
            continue

    # Otsu threshold ile dene
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    codes = pyzbar.decode(otsu)
    for code in codes:
        try:
            data = code.data.decode('utf-8').strip()
            if data:
                return data
        except:
            continue

    # Farklı sabit threshold değerleri ile dene
    for th in [180, 150, 120, 100, 200]:
        _, binary = cv2.threshold(gray, th, 255, cv2.THRESH_BINARY)
        codes = pyzbar.decode(binary)
        for code in codes:
            try:
                data = code.data.decode('utf-8').strip()
                if data:
                    return data
            except:
                continue

    return None


def detect_answer_area(image: np.ndarray) -> Optional[Dict[str, Any]]:
    """
    Siyah kenarlıklı cevap alanını tespit et.

    Strateji:
      1. Görseli gri-tona çevir ve GaussianBlur uygula
      2. Farklı threshold değerlerini dene (140-200 arası)
      3. Her threshold'da kontur bul, en büyük dikdörtgen adayı seç
      4. İnce çerçeve (düşük fill ratio) ve dolu dikdörtgen (yüksek fill ratio)
         durumlarını ayrı ayrı ele al
      5. Canny kenar tespiti ile de dene (yedek strateji)
    """
    h_orig, w_orig = image.shape[:2]
    image_area = w_orig * h_orig
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    best = None
    best_rect_area = 0
    min_area_threshold = image_area * 0.03  # En az %3

    # --- Strateji 1: Farklı threshold değerleri ile tara ---
    for thresh_val in range(140, 210, 5):
        _, thresh = cv2.threshold(blurred, thresh_val, 255, cv2.THRESH_BINARY_INV)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            x, y, cw, ch = cv2.boundingRect(contour)
            rect_area = cw * ch

            if rect_area < min_area_threshold:
                continue

            aspect = cw / ch if ch > 0 else 0
            if aspect < 0.4 or aspect > 3.0:
                continue

            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
            verts = len(approx)
            area = cv2.contourArea(contour)
            fill_ratio = area / rect_area if rect_area > 0 else 0

            if rect_area > best_rect_area and verts >= 4:
                best_rect_area = rect_area
                corners = approx.reshape(4, 2).tolist()
                # Kendi köşelerini kullan (4'ten fazlaysa yine de 4 almaya çalış)
                if verts > 4:
                    # MinAreaRect ile daha iyi köşeler bul
                    rect_m = cv2.minAreaRect(contour)
                    box = cv2.boxPoints(rect_m)
                    corners = box.tolist()

                best = {
                    "corners": corners,
                    "rect": {"x": int(x), "y": int(y), "w": int(cw), "h": int(ch)},
                    "skew_angle": 0.0,
                    "area_ratio": round(rect_area / image_area, 4),
                    "fill_ratio": round(fill_ratio, 4),
                    "vertices": verts,
                    "threshold": thresh_val,
                }

    # --- Strateji 2: Canny kenar tespiti (yedek) ---
    if best is None:
        edges = cv2.Canny(blurred, 30, 100)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
        dilated = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:10]:
            x, y, cw, ch = cv2.boundingRect(contour)
            rect_area = cw * ch
            if rect_area < min_area_threshold:
                continue
            aspect = cw / ch if ch > 0 else 0
            if aspect < 0.3 or aspect > 3.5:
                continue

            if rect_area > best_rect_area:
                best_rect_area = rect_area
                rect_m = cv2.minAreaRect(contour)
                box = cv2.boxPoints(rect_m)
                corners = box.tolist()
                best = {
                    "corners": corners,
                    "rect": {"x": int(x), "y": int(y), "w": int(cw), "h": int(ch)},
                    "skew_angle": 0.0,
                    "area_ratio": round(rect_area / image_area, 4),
                    "fill_ratio": 0,
                    "vertices": 4,
                    "threshold": 0,
                }

    if best is None:
        return None

    # Eğiklik açısını hesapla
    corners_np = np.array(best["corners"], dtype=np.float32)
    rect = cv2.minAreaRect(corners_np)
    angle = rect[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    best["skew_angle"] = round(angle, 2)

    return best


def deskew_and_crop_answer_area(
    image: np.ndarray, corners: List[List[float]]
) -> tuple:
    """
    Köşe noktalarını kullanarak perspective transform ile
    cevap alanını düzleştir ve kırp.
    """
    src_pts = np.array(corners, dtype=np.float32)

    def order_pts(pts):
        rect_ordered = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect_ordered[0] = pts[np.argmin(s)]
        rect_ordered[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1)
        rect_ordered[1] = pts[np.argmin(diff)]
        rect_ordered[3] = pts[np.argmax(diff)]
        return rect_ordered

    src_ordered = order_pts(src_pts)

    w = int(max(
        np.linalg.norm(src_ordered[1] - src_ordered[0]),
        np.linalg.norm(src_ordered[3] - src_ordered[2])
    ))
    h = int(max(
        np.linalg.norm(src_ordered[3] - src_ordered[0]),
        np.linalg.norm(src_ordered[2] - src_ordered[1])
    ))

    w = max(w, 1)
    h = max(h, 1)

    dst_pts = np.array([
        [0, 0],
        [w - 1, 0],
        [w - 1, h - 1],
        [0, h - 1],
    ], dtype=np.float32)

    M = cv2.getPerspectiveTransform(src_ordered, dst_pts)
    warped = cv2.warpPerspective(image, M, (w, h), flags=cv2.INTER_CUBIC)
    return warped, w, h


def detect_bubbles(cropped: np.ndarray, threshold: int = 120) -> Dict[str, Any]:
    """
    Kırpılmış cevap alanı içindeki yuvarlak (baloncuk) tespiti.

    - HoughCircles ile daireleri bul
    - Standart baloncuk ölçüsünü bul (medyan yarıçap)
    - Satır/sütun düzenini keşfet (grid tespiti)
    - Grid hücrelerini dolu/boş/eksik olarak sınıflandır
    - Düzene uymayan baloncukları eler

    threshold: binary eşik değeri (0-255). Düşük değer: daha az piksel siyah → daha az dolu.
              Yüksek değer: daha fazla piksel siyah → daha fazla dolu.
    """
    gray = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 0)

    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.0, minDist=15,
        param1=50, param2=20,
        minRadius=3, maxRadius=30
    )

    if circles is None:
        return {
            "detected": False, "total": 0, "filled": 0, "empty": 0,
            "missing": 0, "rejected": 0, "standard_radius": 0,
            "grid_rows": 0, "questions_per_row": [], "options_per_question": 0,
            "overlay_base64": None,
        }

    circles = np.round(circles[0]).astype(int)

    # Yarıçap filtrele
    radii = circles[:, 2]
    median_r = float(np.median(radii))
    tolerance = max(2.0, median_r * 0.30)
    mask = abs(circles[:, 2] - median_r) <= tolerance
    filtered = circles[mask]
    radius_rejected = int((~mask).sum())

    if len(filtered) < 10:
        return {
            "detected": False, "total": 0, "filled": 0, "empty": 0,
            "missing": 0, "rejected": radius_rejected, "standard_radius": int(round(median_r)),
            "grid_rows": 0, "questions_per_row": [], "options_per_question": 0,
            "overlay_base64": None,
        }

    # --- SATIR TESPİTİ (Y kümeleme) ---
    idx = np.lexsort((filtered[:, 0], filtered[:, 1]))
    filtered = filtered[idx]

    ys = filtered[:, 1]
    sorted_y = np.sort(ys)
    y_diffs = np.diff(sorted_y)
    non_zero = y_diffs[y_diffs > 0]
    y_thresh = max(5, float(np.median(non_zero)) * 0.4) if len(non_zero) > 0 else 10

    rows = []
    current = [filtered[0]]
    for i in range(1, len(filtered)):
        if filtered[i][1] - filtered[i-1][1] > y_thresh:
            rows.append(np.array(current))
            current = [filtered[i]]
        else:
            current.append(filtered[i])
    rows.append(np.array(current))
    rows = [r for r in rows if len(r) >= 3]

    if len(rows) < 2:
        return {
            "detected": False, "total": 0, "filled": 0, "empty": 0,
            "missing": 0, "rejected": radius_rejected, "standard_radius": int(round(median_r)),
            "grid_rows": 0, "questions_per_row": [], "options_per_question": 0,
            "overlay_base64": None,
        }

    # --- YATAY ve DİKEY ARALIK HESAPLAMA ---
    x_spacing = 50
    y_spacing = 50
    all_x_diffs = []
    all_y_diffs = []
    for row in rows:
        xs = np.sort(row[:, 0])
        diffs = np.diff(xs)
        all_x_diffs.extend(diffs[diffs > 0])
    for i in range(1, len(rows)):
        prev_y = int(round(np.mean(rows[i-1][:, 1])))
        curr_y = int(round(np.mean(rows[i][:, 1])))
        d = curr_y - prev_y
        if d > 0:
            all_y_diffs.append(d)
    if all_x_diffs:
        x_spacing = float(np.median(all_x_diffs))
    if all_y_diffs:
        y_spacing = float(np.median(all_y_diffs))

    scan_r = int(round(median_r))
    overlay = cropped.copy()
    rejected_count = radius_rejected

    # --- ÇOĞUNLUK SATIRLARINDAN SÜTUN POZİSYONLARINI BUL ---
    row_sizes = np.array([len(r) for r in rows])
    max_row_size = int(np.max(row_sizes))
    half_threshold = max_row_size * 0.5

    # Sadece yarıdan fazla baloncuğu olan satırlar "tam" kabul edilir
    majority_idx = [i for i, sz in enumerate(row_sizes) if sz >= half_threshold]
    majority_rows_list = [rows[i] for i in majority_idx] if majority_idx else rows

    all_major_xs = np.sort(np.concatenate([r[:, 0] for r in majority_rows_list]))
    raw_clusters = []  # (median_x, count)
    c = [all_major_xs[0]]
    for x in all_major_xs[1:]:
        if x - c[-1] > x_spacing * 0.6:
            raw_clusters.append((int(round(np.median(c))), len(c)))
            c = [x]
        else:
            c.append(x)
    raw_clusters.append((int(round(np.median(c))), len(c)))

    # Sahte kümeleri ele: en az 3 baloncuk veya majority satırlarının %20'si kadar üyesi olmayanı at
    min_cluster = max(3, int(len(majority_rows_list) * 0.2))
    col_clusters = [med for med, cnt in raw_clusters if cnt >= min_cluster]

    # Sütunları soru bloklarına ayır (x_spacing'in 1.4 katından büyük boşluklar)
    question_groups = []
    g = [col_clusters[0]]
    for i in range(1, len(col_clusters)):
        if col_clusters[i] - col_clusters[i-1] > x_spacing * 1.4:
            question_groups.append(g)
            g = [col_clusters[i]]
        else:
            g.append(col_clusters[i])
    question_groups.append(g)

    # Her bloktaki opsiyon sayısının medyanı = standart şık sayısı
    opts_in_groups = [len(g) for g in question_groups]
    majority_opts = int(round(np.median(opts_in_groups)))

    # Eksik sütunları tamamla / fazlalıkları kırp: her blokta majority_opts kadar sütun
    padded_groups = []
    for g in question_groups:
        if len(g) >= majority_opts:
            padded_groups.append(g[:majority_opts])
        else:
            start_x = g[0]
            new_g = [int(round(start_x + oi * x_spacing)) for oi in range(majority_opts)]
            padded_groups.append(new_g)

    # --- SATIR BAZINDA AKTİF GRUPLARI BELİRLE ---
    # Her satır için, HoughCircles'ın bulduğu dairelerin hangi soru gruplarına
    # ait olduğunu tespit et. Sadece aktif gruplardaki hücreler okunur.
    row_active_groups = []   # per row, per group: bool
    row_col_centers = []     # per row: list of active column centers
    for ri, row in enumerate(rows):
        row_x_set = set(int(c[0]) for c in row)
        active = []
        cols = []
        for g in padded_groups:
            g_min = min(g) - x_spacing * 0.4
            g_max = max(g) + x_spacing * 0.4
            has_circles = sum(1 for cx in row_x_set if g_min <= cx <= g_max)
            is_active = has_circles >= 2  # en az 2 daire = grup bu satırda basılı
            active.append(is_active)
            if is_active:
                cols.extend(g)
        row_active_groups.append(active)
        row_col_centers.append(cols)

    # Hiçbir satırda aktif grup yoksa (tek ders / eşit dağılım) tümünü aktif say
    if not any(any(ag) for ag in row_active_groups):
        row_active_groups = [[True] * len(padded_groups) for _ in rows]
        for ri in range(len(rows)):
            row_col_centers[ri] = []
            for g in padded_groups:
                row_col_centers[ri].extend(g)

    # --- GLOBAL SATIR POZİSYONLARINI BUL ---
    row_centers = []
    for row in rows:
        ry = int(round(np.mean(row[:, 1])))
        row_centers.append(ry)

    # Radius filtreye takılanları mor ile işaretle
    for c in circles[~mask]:
        cv2.circle(overlay, (int(c[0]), int(c[1])), int(c[2]), (255, 0, 255), 1)
        cv2.line(overlay, (int(c[0])-3, int(c[1])-3), (int(c[0])+3, int(c[1])+3), (255, 0, 255), 1)
        cv2.line(overlay, (int(c[0])+3, int(c[1])-3), (int(c[0])-3, int(c[1])+3), (255, 0, 255), 1)

    # --- MAVİ KILAVUZ ÇİZGİLERİ ÇİZ ---
    h, w = cropped.shape[:2]
    for ry in row_centers:
        cv2.line(overlay, (0, ry), (w, ry), (255, 0, 0), 1)
    for g in padded_groups:
        for cx in g:
            cv2.line(overlay, (cx, 0), (cx, h), (255, 0, 0), 1)

    # --- GRİD HÜCRELERİNİ DOLU/BOŞ OKU ---
    _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    binary_preview = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    probe_r = scan_r

    # 1. PASS: gri-ton ve binary ortalamaları (sadece aktif hücreler)
    gray_means = []
    bin_means = []
    for ri, ry in enumerate(row_centers):
        gray_row, bin_row = [], []
        for cx in row_col_centers[ri]:
            mask = np.zeros(binary.shape, dtype=np.uint8)
            cv2.circle(mask, (cx, ry), probe_r, 255, -1)
            gray_row.append(cv2.mean(gray, mask)[0])
            bin_row.append(cv2.mean(binary, mask)[0])
        gray_means.append(gray_row)
        bin_means.append(bin_row)

    # 2. PASS: soru bazında rölatif kontrol (sadece aktif gruplar)
    filled = []
    for ri in range(len(row_centers)):
        row_filled = []
        col_offset = 0
        for gi, active in enumerate(row_active_groups[ri]):
            if not active:
                continue
            g = padded_groups[gi]
            opts_count = len(g)

            abs_filled = [oi for oi in range(opts_count) if bin_means[ri][col_offset + oi] < 128]

            if len(abs_filled) == 0:
                opt_vals = [(oi, bin_means[ri][col_offset + oi]) for oi in range(opts_count)]
                opt_vals.sort(key=lambda x: x[1])
                if len(opt_vals) >= 2 and (opt_vals[1][1] - opt_vals[0][1]) > 5:
                    for oi in range(opts_count):
                        row_filled.append(oi == opt_vals[0][0])
                else:
                    row_filled.extend([False] * opts_count)
            else:
                for oi in range(opts_count):
                    row_filled.append(bin_means[ri][col_offset + oi] < 128)

            col_offset += opts_count
        filled.append(row_filled)

    # 3. PASS: çizim ve sayım
    filled_count = 0
    empty_count = 0
    total_cells = 0
    for ri, ry in enumerate(row_centers):
        for ci, cx in enumerate(row_col_centers[ri]):
            total_cells += 1
            if filled[ri][ci]:
                cv2.circle(overlay, (cx, ry), scan_r, (0, 255, 0), 3)
                filled_count += 1
            else:
                cv2.circle(overlay, (cx, ry), scan_r, (0, 0, 255), 3)
                empty_count += 1

    grid_rejected = len(filtered) - total_cells
    rejected_count += max(0, grid_rejected)

    # Her satırdaki soru sayısı = o satırda aktif olan grup sayısı
    questions_per_row = [sum(ag) for ag in row_active_groups]

    # --- SORU NUMARALAMA VE CEVAP ÇIKARMA ---
    # Sol en üstten başla, aşağıya doğru sütun bitince 1 sağdaki sütundan devam et
    questions = []
    qno = 1
    for gi in range(len(padded_groups)):
        opts_count = len(padded_groups[gi])
        for ri in range(len(row_centers)):
            if ri >= len(row_active_groups) or not row_active_groups[ri][gi]:
                continue
            col_offset = sum(row_active_groups[ri][:gi]) * opts_count
            filled_slice = filled[ri][col_offset:col_offset + opts_count]
            answer_idx = next((oi for oi, f in enumerate(filled_slice) if f), None)
            answer = chr(65 + answer_idx) if answer_idx is not None else None
            questions.append({"no": qno, "answer": answer})
            qno += 1

    return {
        "detected": total_cells > 0,
        "total": total_cells,
        "filled": filled_count,
        "empty": empty_count,
        "missing": 0,
        "rejected": rejected_count,
        "standard_radius": scan_r,
        "grid_rows": len(row_centers),
        "questions_per_row": questions_per_row,
        "options_per_question": majority_opts,
        "questions": questions,
        "overlay_base64": img_to_base64(overlay, quality=70),
        "binary_base64": img_to_base64(binary_preview, quality=85),
    }


def process_single_jpeg(file_path: str, threshold: int = 120) -> Dict[str, Any]:
    """
    Tek bir JPEG dosyasını işle:
      1. Görseli yükle
      2. Siyah kenarlıklı cevap alanını tespit et
      3. Bulunduysa perspective transform ile düzelt + kırp
      4. Önizleme için base64 döndür
      5. Bulunamazsa hata mesajı döndür

    threshold: binary eşik değeri (0-255). Düşük değer: daha az dolu.
              Yüksek değer: daha fazla dolu.
    """
    path = Path(file_path)
    if not path.exists():
        return {"success": False, "error": "Dosya bulunamadı"}

    if path.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.tiff', '.tif'):
        return {"success": False, "error": "Desteklenmeyen dosya formatı. JPEG veya PNG yükleyin."}

    image = load_image(path)
    if image is None:
        return {"success": False, "error": "Görsel okunamadı"}

    h, w = image.shape[:2]
    result = {
        "success": True,
        "file_name": path.name,
        "image_width": w,
        "image_height": h,
        "area_detected": False,
        "skew_angle": 0,
        "preview_base64": None,
        "error": None,
    }

    qr = read_qr_code(image)
    if qr:
        result["qr_data"] = qr

    area = detect_answer_area(image)

    if area is None:
        result["area_detected"] = False
        result["error"] = "Siyah kenarlıklı cevap alanı tespit edilemedi. Görselin doğru yüklendiğinden ve cevap alanının görünür olduğundan emin olun."
        error_path = ERROR_DIR / f"no_area_{path.stem}.jpg"
        cv2.imwrite(str(error_path), image)
        return result

    result["area_detected"] = True
    result["skew_angle"] = area["skew_angle"]
    result["bounding_box"] = area["rect"]
    result["corners"] = area["corners"]
    result["area_ratio"] = area["area_ratio"]
    result["fill_ratio"] = area.get("fill_ratio", 0)
    result["detect_threshold"] = area.get("threshold", 0)

    warped, crop_w, crop_h = deskew_and_crop_answer_area(image, area["corners"])
    result["crop_width"] = crop_w
    result["crop_height"] = crop_h

    # Baloncuk tespiti
    bubble_result = detect_bubbles(warped, threshold)
    result["bubbles"] = {
        "detected": bubble_result["detected"],
        "total": bubble_result["total"],
        "filled": bubble_result["filled"],
        "empty": bubble_result["empty"],
        "missing": bubble_result["missing"],
        "rejected": bubble_result["rejected"],
        "standard_radius": bubble_result["standard_radius"],
        "grid_rows": bubble_result["grid_rows"],
        "questions_per_row": bubble_result["questions_per_row"],
        "options_per_question": bubble_result["options_per_question"],
        "questions": bubble_result.get("questions", []),
    }
    if bubble_result["overlay_base64"]:
        result["bubble_overlay_base64"] = bubble_result["overlay_base64"]
    if bubble_result.get("binary_base64"):
        result["bubble_binary_base64"] = bubble_result["binary_base64"]

    # Önizleme: orijinal görsel üzerine tespit edilen alanı çiz
    preview = image.copy()
    corners_int = np.array(area["corners"], dtype=np.int32)
    cv2.polylines(preview, [corners_int], True, (0, 255, 0), 4)

    if area["skew_angle"] != 0:
        label = f"Skew: {area['skew_angle']:.1f} deg"
    else:
        label = f"Cevap Alani: {area['rect']['w']}x{area['rect']['h']}"
    cv2.putText(
        preview, label,
        (area['rect']['x'], max(30, area['rect']['y'] - 10)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2
    )

    result["preview_base64"] = img_to_base64(preview)
    result["cropped_base64"] = img_to_base64(warped)

    output_path = PROCESSED_DIR / f"{path.stem}_processed.jpg"
    cv2.imwrite(str(output_path), preview)
    result["processed_path"] = str(output_path)

    return result


def process_file(input_path: str, dpi: int = 300) -> Dict[str, Any]:
    """PDF/JPEG dosyasını işle - eski tam sayfa işleme modu"""
    path = Path(input_path)

    if not path.exists():
        return {"error": "Dosya bulunamadı", "path": input_path}

    results = {
        "input_file": str(path),
        "dpi": dpi,
        "pages": []
    }

    if path.suffix.lower() == '.pdf':
        if convert_from_path is None:
            return {"error": "pdf2image not installed, PDF processing disabled"}
        jpeg_paths = pdf_to_jpeg(path, dpi)
        if not jpeg_paths:
            return {"error": "PDF dönüştürme başarısız", "path": input_path}
    else:
        jpeg_paths = [path]

    for idx, jpeg_path in enumerate(jpeg_paths):
        page_result = process_single_jpeg(str(jpeg_path))
        results["pages"].append(page_result)

    return results


def pdf_to_jpeg(pdf_path: Path, dpi: int = 300) -> List[Path]:
    """PDF sayfalarını JPEG'e çevir"""
    if convert_from_path is None:
        return []
    try:
        pages = convert_from_path(str(pdf_path), dpi=dpi)
        jpeg_paths = []
        for idx, page in enumerate(pages):
            jpeg_path = UPLOAD_DIR / f"{pdf_path.stem}_page_{idx+1:03d}.jpg"
            page.save(str(jpeg_path), 'JPEG', quality=95)
            jpeg_paths.append(jpeg_path)
        return sorted(jpeg_paths)
    except Exception as e:
        print(json.dumps({"error": f"PDF conversion failed: {str(e)}"}))
        return []


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Kullanım: python optical_processor.py <mode> <args...>"}))
        print(json.dumps({"error": "Modlar: detect_frame (tek JPEG), batch (klasör/dosyalar), process (PDF/JPEG)"}))
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "detect_frame":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "detect_frame modu için dosya yolu gerekli"}))
            sys.exit(1)
        file_path = sys.argv[2]
        threshold = int(sys.argv[3]) if len(sys.argv) > 3 else 120
        result = process_single_jpeg(file_path, threshold)
        print(json.dumps(result, ensure_ascii=False))

    elif mode == "process":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "process modu için dosya yolu gerekli"}))
            sys.exit(1)
        input_file = sys.argv[2]
        dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 300
        result = process_file(input_file, dpi)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif mode == "batch":
        # Kullanım:
        #   python optical_processor.py batch <klasör> [-o çıktı.csv] [-t eşik]
        #   python optical_processor.py batch dosya1.jpg dosya2.jpg ... [-o çıktı.csv] [-t eşik]
        if len(sys.argv) < 3:
            print(json.dumps({"error": "batch modu için klasör veya dosya yolu gerekli"}))
            print(json.dumps({"error": "Kullanım: python optical_processor.py batch <klasör> [-o çıktı.csv] [-t eşik]"}))
            print(json.dumps({"error": "veya: python optical_processor.py batch dosya1.jpg dosya2.jpg ... [-o çıktı.csv] [-t eşik]"}))
            sys.exit(1)

        # Argümanları ayıkla
        output_path = "sonuclar.csv"
        threshold = 120
        file_args = []
        skip_next = False
        for i, arg in enumerate(sys.argv[2:], start=2):
            if skip_next:
                skip_next = False
                continue
            if arg == "-o" and i + 1 < len(sys.argv):
                output_path = sys.argv[i + 1]
                skip_next = True
            elif arg == "-t" and i + 1 < len(sys.argv):
                threshold = int(sys.argv[i + 1])
                skip_next = True
            elif arg.startswith("-"):
                pass  # bilinmeyen flag, yoksay
            else:
                file_args.append(arg)

        if not file_args:
            print(json.dumps({"error": "Hiçbir dosya/klasör belirtilmedi"}))
            sys.exit(1)

        # Dosya listesini hazırla
        jpeg_files = []
        for arg in file_args:
            p = Path(arg)
            if p.is_dir():
                jpeg_files.extend(sorted(f for f in p.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg')))
            elif p.is_file() and p.suffix.lower() in ('.jpg', '.jpeg'):
                jpeg_files.append(p)
            else:
                print(json.dumps({"warn": f"Geçersiz yol veya format: {arg}"}), file=sys.stderr)

        if not jpeg_files:
            print(json.dumps({"error": "İşlenecek JPEG dosyası bulunamadı"}))
            sys.exit(1)

        total = len(jpeg_files)
        max_questions = 0
        results = []
        for idx, f in enumerate(jpeg_files):
            print(json.dumps({"progress": f"{idx+1}/{total}", "file": f.name}), file=sys.stderr)
            r = process_single_jpeg(str(f), threshold)
            b = r.get("bubbles", {})
            qs = b.get("questions", [])
            if len(qs) > max_questions:
                max_questions = len(qs)
            if r.get("success"):
                results.append(r)

        print(json.dumps({"info": f"{len(results)} dosya başarıyla işlendi, CSV yazılıyor..."}), file=sys.stderr)
        with open(output_path, "w", encoding="utf-8-sig") as out:
            header_parts = ["Dosya", "QR", "Toplam Soru", "Cevaplanan"]
            for qi in range(1, max_questions + 1):
                header_parts.append(f"Soru {qi}")
            out.write(",".join(header_parts) + "\n")

            for r in results:
                b = r.get("bubbles", {})
                qs = b.get("questions", [])
                qr = r.get("qr_data", "")
                filled_count = sum(1 for q in qs if q.get("answer"))
                row_parts = [
                    r.get("file_name", ""),
                    qr,
                    str(len(qs)),
                    str(filled_count),
                ]
                for q in qs:
                    row_parts.append(q.get("answer") or "")
                for _ in range(len(qs), max_questions):
                    row_parts.append("")
                out.write(",".join(row_parts) + "\n")

        print(json.dumps({
            "success": True,
            "output": output_path,
            "total_files": len(jpeg_files),
            "processed": len(results),
            "failed": total - len(results),
            "max_questions": max_questions,
        }))

    else:
        print(json.dumps({"error": f"Bilinmeyen mod: {mode}. Kullanılabilir: detect_frame, batch, process"}))
        sys.exit(1)
