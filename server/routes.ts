import type { Express } from "express";
import { createServer, type Server } from "http";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { createLocalBackup, listLocalBackups } from "./backup";
import { storage } from "./storage";
import { replaceRegistryPayloadSchema, insertExamSchema } from "@shared/schema";
import { spawn, spawnSync } from "child_process";
import Busboy from "busboy";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Exam routes
  app.get("/api/exams", async (_req, res) => {
    const exams = await storage.getExams();
    return res.status(200).json(exams);
  });

  app.post("/api/exams", async (req, res) => {
    const parsed = insertExamSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Geçersiz payload",
        issues: parsed.error.issues,
      });
    }

    const examData = { ...parsed.data, uploadMode: req.body.uploadMode || "template" };
    const exam = await storage.createExam(examData as any);
    return res.status(201).json(exam);
  });

  app.put("/api/exams/:id/activate", async (req, res) => {
    const { id } = req.params;
    try {
      await storage.setActiveExam(id);
    } catch (error) {
      if (error instanceof Error && error.message === "Sınav bulunamadı") {
        return res.status(404).json({ message: error.message });
      }
      throw error;
    }
    return res.status(200).json({ message: "Sınav etkinleştirildi" });
  });

  app.delete("/api/exams/:id", async (req, res) => {
    const { id } = req.params;
    await storage.deleteExam(id);
    return res.status(200).json({ message: "Sınav silindi" });
  });

  app.get("/api/registry", async (req, res) => {
    const examId = typeof req.query.examId === "string" ? req.query.examId : undefined;
    const exams = await storage.getExams();
    const targetExamId = examId || exams.find((e) => e.isActive === "1")?.id;

    if (!targetExamId) {
      return res.status(200).json({ districts: [], schools: [], students: [], sourceFileName: "", loadedAt: "" });
    }

    const data = await storage.getRegistryData(targetExamId);
    return res.status(200).json(data);
  });

  app.get("/api/registry/summary", async (req, res) => {
    const examId = typeof req.query.examId === "string" ? req.query.examId : undefined;
    if (!examId) {
      return res.status(400).json({ message: "examId gerekli" });
    }
    return res.status(200).json(await storage.getRegistrySummary(examId));
  });

  app.get("/api/registry/students", async (req, res) => {
    const examId = typeof req.query.examId === "string" ? req.query.examId : undefined;
    if (!examId) {
      return res.status(400).json({ message: "examId gerekli" });
    }
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(500, Math.max(1, Number.parseInt(String(req.query.pageSize || "100"), 10) || 100));
    const schoolId = typeof req.query.schoolId === "string" ? req.query.schoolId : undefined;
    const result = await storage.getRegistryStudents(examId, schoolId, page, pageSize);
    return res.status(200).json({ ...result, page, pageSize });
  });

  app.post("/api/registry/replace", async (req, res) => {
    const parsed = replaceRegistryPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Geçersiz payload",
        issues: parsed.error.issues,
      });
    }

    const validationErrors = storage.validateRegistryPayload(parsed.data);
    if (validationErrors.length > 0) {
      return res.status(422).json({
        message: "Kütük verisi ilişkisel doğrulamadan geçemedi",
        issues: validationErrors.slice(0, 100),
        issueCount: validationErrors.length,
      });
    }

    // Get active exam
    const exams = await storage.getExams();
    const activeExam = exams.find((e) => e.isActive === "1");

    if (!activeExam) {
      return res.status(400).json({
        message: "Aktif bir sınav seçilmedi",
      });
    }

    let safetyBackup: { id: string; path: string };
    try {
      safetyBackup = await createLocalBackup({
        databasePath: process.env.DATABASE_URL || path.join(dbDir, "local.db"),
        opticDatabasePath: opticDbFile,
        formDesignsPath: formDesignsFile,
        uploadsPath: uploadsDir,
        backupRoot,
      });
    } catch (error) {
      console.error("Kütük güncellemesi öncesi yedek oluşturulamadı:", error);
      return res.status(503).json({
        message: "Güvenlik yedeği oluşturulamadığı için kütük güncellenmedi",
      });
    }

    await storage.replaceRegistryData(parsed.data, activeExam.id);
    return res.status(200).json({
      message: "Registry verisi güncellendi",
      safetyBackupId: safetyBackup.id,
    });
  });

  app.post("/api/registry/clear", async (_req, res) => {
    // Get active exam
    const exams = await storage.getExams();
    const activeExam = exams.find((e) => e.isActive === "1");

    if (!activeExam) {
      return res.status(400).json({
        message: "Aktif bir sınav seçilmedi",
      });
    }

    await storage.clearRegistryData(activeExam.id);
    return res.status(200).json({ message: "Registry verisi temizlendi" });
  });

  // Optics config endpoints (file-backed simple storage)
const fs = await import("fs/promises");
   const path = await import("path");
    const dbDir = path.resolve(process.cwd(), "db");
    const formDesignsFile = path.join(dbDir, "optic-form-designs.json");
    const opticDbFile = path.join(dbDir, "optic-readings.sqlite");
    const uploadsDir = path.join(dbDir, "optic_uploads");
    const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));

  await fs.mkdir(dbDir, { recursive: true });

  const writeJsonAtomically = async (filePath: string, value: unknown) => {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf-8");
    await fs.rename(temporaryPath, filePath);
  };

  let formDesignsQueue: Promise<unknown> = Promise.resolve();

  function withFormDesignsLock<T>(task: () => Promise<T>): Promise<T> {
    const result = formDesignsQueue.then(task, task);
    formDesignsQueue = result.catch(() => undefined);
    return result;
  }

  app.get("/api/system/backups", async (_req, res) => {
    return res.status(200).json(await listLocalBackups(backupRoot));
  });

  app.post("/api/system/backups", async (_req, res) => {
    try {
      const backup = await createLocalBackup({
        databasePath: process.env.DATABASE_URL || path.join(dbDir, "local.db"),
        opticDatabasePath: opticDbFile,
        formDesignsPath: formDesignsFile,
        uploadsPath: uploadsDir,
        backupRoot,
      });
      return res.status(201).json({ message: "Yedek oluşturuldu", ...backup });
    } catch (error) {
      console.error("Yedek oluşturma hatası:", error);
      return res.status(500).json({ message: "Yedek oluşturulamadı" });
    }
  });

  const opticDb = new Database(opticDbFile);
  opticDb.pragma("journal_mode = WAL");
  opticDb.pragma("foreign_keys = ON");
  opticDb.exec(`
    CREATE TABLE IF NOT EXISTS optic_scan_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 0,
      qr TEXT NOT NULL DEFAULT '',
      tc_no TEXT NOT NULL DEFAULT '',
      booklet TEXT NOT NULL DEFAULT '',
      exam_id TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      results_json TEXT NOT NULL DEFAULT '[]',
      form_design_id TEXT NOT NULL DEFAULT '',
      form_version INTEGER NOT NULL DEFAULT 1,
      manifest_hash TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS optic_scan_answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      page_index INTEGER NOT NULL DEFAULT 0,
      area_id TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      question_number INTEGER NOT NULL DEFAULT 0,
      answer TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      scores_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY(session_id) REFERENCES optic_scan_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_optic_scan_sessions_qr ON optic_scan_sessions(qr);
    CREATE INDEX IF NOT EXISTS idx_optic_scan_answers_session_id ON optic_scan_answers(session_id);
  `);

  // Eski veritabanlarına yeni sütunları ekle (migration)
  const sessionCols = opticDb.prepare("PRAGMA table_info(optic_scan_sessions)").all() as Array<{ name: string }>;
  const hasSessionCol = (name: string) => sessionCols.some((c) => c.name === name);
  if (!hasSessionCol("tc_no")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN tc_no TEXT NOT NULL DEFAULT ''");
  if (!hasSessionCol("booklet")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN booklet TEXT NOT NULL DEFAULT ''");
  if (!hasSessionCol("exam_id")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN exam_id TEXT NOT NULL DEFAULT ''");
  if (!hasSessionCol("confidence")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN confidence REAL NOT NULL DEFAULT 0");
  if (!hasSessionCol("form_design_id")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN form_design_id TEXT NOT NULL DEFAULT ''");
  if (!hasSessionCol("form_version")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN form_version INTEGER NOT NULL DEFAULT 1");
  if (!hasSessionCol("manifest_hash")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN manifest_hash TEXT NOT NULL DEFAULT ''");

  const insertScanSession = opticDb.prepare(`
    INSERT INTO optic_scan_sessions (
      id, created_at, file_name, page_count, qr, tc_no, booklet, exam_id, confidence, results_json
      , form_design_id, form_version, manifest_hash
    ) VALUES (
      @id, @created_at, @file_name, @page_count, @qr, @tc_no, @booklet, @exam_id, @confidence, @results_json,
      @form_design_id, @form_version, @manifest_hash
    )
  `);

  const insertScanAnswer = opticDb.prepare(`
    INSERT INTO optic_scan_answers (
      id, session_id, page_index, area_id, subject, question_number, answer, confidence, scores_json
    ) VALUES (
      @id, @session_id, @page_index, @area_id, @subject, @question_number, @answer, @confidence, @scores_json
    )
  `);

  const findScanSession = opticDb.prepare(`
    SELECT id FROM optic_scan_sessions
    WHERE file_name = ? AND manifest_hash = ? AND tc_no = ? AND results_json = ?
    LIMIT 1
  `);

  const PYTHON_CANDIDATES = [
    process.env.OPTIC_PYTHON,
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    "python3",
    "python",
  ].filter((p): p is string => Boolean(p));

  let resolvedPython: string | null | undefined;

  function resolvePython(): string | null {
    if (resolvedPython !== undefined) return resolvedPython;
    for (const candidate of PYTHON_CANDIDATES) {
      try {
        const check = spawnSync(candidate, ["-c", "import cv2, numpy; print('ok')"], {
          timeout: 8000,
          encoding: "utf-8",
        });
        if (check.status === 0 && /ok/.test(check.stdout ?? "")) {
          resolvedPython = candidate;
          return candidate;
        }
      } catch {
        // sıradaki adaya geç
      }
    }
    console.warn("Optik okuma için Python/OpenCV bulunamadı. OPTIC_PYTHON ile yorumlayıcı yolunu belirtin.");
    resolvedPython = null;
    return null;
  }

  function runPython(python: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(python, args, { timeout: timeoutMs });
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Python exited with code ${code}`));
        } else {
          resolve(stdout);
        }
      });
      proc.on("error", (err) => reject(err));
    });
  }

  app.get("/api/optics/form-designs", async (_req, res) => {
    try {
      const data = await fs.readFile(formDesignsFile, "utf-8");
      return res.status(200).json(JSON.parse(data));
    } catch (err) {
      return res.status(200).json([]);
    }
  });

  app.post("/api/optics/form-designs", async (req, res) => {
    const result = await withFormDesignsLock(async () => {
      try {
        const body = req.body;
        const existing = await (async () => {
          try {
            const d = await fs.readFile(formDesignsFile, "utf-8");
            return JSON.parse(d) as any[];
          } catch {
            return [] as any[];
          }
        })();

        const manifestHash = createHash("sha256")
          .update(JSON.stringify(body.manifest ?? {}))
          .digest("hex");
        const index = existing.findIndex((item) => item.id === body.id);
        if (index >= 0) {
          const previous = existing[index];
          const version = previous.manifestHash === manifestHash ? Number(previous.version || 1) : Number(previous.version || 1) + 1;
          existing[index] = { ...previous, ...body, version, manifestHash };
        } else {
          existing.push({ ...body, version: 1, manifestHash });
        }
        await writeJsonAtomically(formDesignsFile, existing);
        return { status: 201, body: { message: "Kaydedildi" } };
      } catch (err) {
        return { status: 500, body: { message: "Kaydetme hatası" } };
      }
    });
    return res.status(result.status).json(result.body);
  });

  app.delete("/api/optics/form-designs/:id", async (req, res) => {
    const result = await withFormDesignsLock(async () => {
      try {
        const existing = await (async () => {
          try {
            const d = await fs.readFile(formDesignsFile, "utf-8");
            return JSON.parse(d) as any[];
          } catch {
            return [] as any[];
          }
        })();
        const next = existing.filter((item) => item.id !== req.params.id);
        await writeJsonAtomically(formDesignsFile, next);
        return { status: 200, body: { message: "Silindi" } };
      } catch (err) {
        return { status: 500, body: { message: "Silme hatası" } };
      }
    });
    return res.status(result.status).json(result.body);
  });



  app.post("/api/optics/scans", async (req, res) => {
    try {
      const body = req.body as {
        fileName?: string;
        pageCount?: number;
        qrData?: string;
        tcNo?: string;
        booklet?: string;
        examId?: string;
        confidence?: number;
        formDesignId?: string;
        formVersion?: number;
        manifestHash?: string;
        results?: Array<{
          areaId?: string;
          pageIndex?: number;
          subject?: string;
          answers?: Array<{
            questionNumber?: number;
            answer?: string;
            confidence?: number;
            scores?: Array<{ letter?: string; score?: number }>;
          }>;
        }>;
      };

      const qrData = String(body.qrData || "");
      const sessionId = randomUUID();
      const createdAt = new Date().toISOString();
      const results = Array.isArray(body.results) ? body.results : [];

      const insertSessionTransaction = opticDb.transaction((rows: typeof results) => {
        insertScanSession.run({
          id: sessionId,
          created_at: createdAt,
          file_name: String(body.fileName || ""),
          page_count: Number(body.pageCount) || 0,
          qr: qrData,
          tc_no: String(body.tcNo || ""),
          booklet: String(body.booklet || ""),
          exam_id: String(body.examId || ""),
          confidence: Number(body.confidence) || 0,
          results_json: JSON.stringify(rows),
          form_design_id: String(body.formDesignId || ""),
          form_version: Number(body.formVersion) || 1,
          manifest_hash: String(body.manifestHash || ""),
        });

        for (const result of rows) {
          const answers = Array.isArray(result.answers) ? result.answers : [];
          for (const answer of answers) {
            insertScanAnswer.run({
              id: randomUUID(),
              session_id: sessionId,
              page_index: Number(result.pageIndex) || 0,
              area_id: String(result.areaId || ""),
              subject: String(result.subject || ""),
              question_number: Number(answer.questionNumber) || 0,
              answer: String(answer.answer || ""),
              confidence: Number(answer.confidence) || 0,
              scores_json: JSON.stringify(Array.isArray(answer.scores) ? answer.scores : []),
            });
          }
        }
      });

      insertSessionTransaction(results);

      return res.status(201).json({
        message: "Kaydedildi",
        scanId: sessionId,
        qrData,
      });
    } catch (err) {
      console.error("Optik tarama kaydı başarısız:", err);
      return res.status(500).json({ message: "Kaydetme hatası" });
    }
  });

  app.post("/api/optics/scans/batch", async (req, res) => {
    try {
      const scans = Array.isArray(req.body?.scans) ? req.body.scans : [];
      if (scans.length === 0) {
        return res.status(400).json({ message: "En az bir tarama sonucu gerekli" });
      }
      let skipped = 0;
      const scanIds = opticDb.transaction((rows: Array<Record<string, unknown>>) => {
        const ids: string[] = [];
        for (const body of rows) {
          const results = Array.isArray(body.results) ? body.results : [];
          const resultsJson = JSON.stringify(results);
          if (
            findScanSession.get(
              String(body.fileName || ""),
              String(body.manifestHash || ""),
              String(body.tcNo || ""),
              resultsJson,
            )
          ) {
            skipped += 1;
            continue;
          }
          const sessionId = randomUUID();
          insertScanSession.run({
            id: sessionId,
            created_at: new Date().toISOString(),
            file_name: String(body.fileName || ""),
            page_count: Number(body.pageCount) || 0,
            qr: String(body.qrData || ""),
            tc_no: String(body.tcNo || ""),
            booklet: String(body.booklet || ""),
            exam_id: String(body.examId || ""),
            confidence: Number(body.confidence) || 0,
            results_json: resultsJson,
            form_design_id: String(body.formDesignId || ""),
            form_version: Number(body.formVersion) || 1,
            manifest_hash: String(body.manifestHash || ""),
          });
          ids.push(sessionId);
          for (const result of results as Array<Record<string, unknown>>) {
            for (const answer of (Array.isArray(result.answers) ? result.answers : []) as Array<Record<string, unknown>>) {
              insertScanAnswer.run({
                id: randomUUID(),
                session_id: sessionId,
                page_index: Number(result.pageIndex) || 0,
                area_id: String(result.areaId || ""),
                subject: String(result.subject || ""),
                question_number: Number(answer.questionNumber) || 0,
                answer: String(answer.answer || ""),
                confidence: Number(answer.confidence) || 0,
                scores_json: JSON.stringify(Array.isArray(answer.scores) ? answer.scores : []),
              });
            }
          }
        }
        return ids;
      })(scans as Array<Record<string, unknown>>);
      return res.status(201).json({ message: "Kaydedildi", scanIds, count: scanIds.length, skipped });
    } catch (err) {
      console.error("Optik tarama batch kaydı başarısız:", err);
      return res.status(500).json({ message: "Kaydetme hatası" });
    }
  });

  app.get("/api/optics/scans", async (_req, res) => {
    try {
      const sessions = opticDb
        .prepare(`
          SELECT
            s.id,
            s.created_at AS createdAt,
            s.file_name AS fileName,
            s.page_count AS pageCount,
            s.qr AS qr,
            s.tc_no AS tcNo,
            s.booklet AS booklet,
            s.exam_id AS examId,
            s.confidence AS confidence,
            s.form_design_id AS formDesignId,
            s.form_version AS formVersion,
            s.manifest_hash AS manifestHash,
            COUNT(a.id) AS answerCount
          FROM optic_scan_sessions s
          LEFT JOIN optic_scan_answers a ON a.session_id = s.id
          GROUP BY s.id
          ORDER BY s.created_at DESC
        `)
        .all();

      return res.status(200).json(sessions);
    } catch (err) {
      console.error("Optik tarama listesi alınamadı:", err);
      return res.status(500).json({ message: "Liste alınamadı" });
    }
  });

  // Manifest tabanlı okuma: referans kareleri + baloncuk örneklemesi
  app.post("/api/optics/read", async (req, res) => {
    const body = req.body as { manifest?: unknown; files?: string[]; includeOverlay?: boolean };
    const manifest = body?.manifest;
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!manifest || files.length === 0) {
      return res.status(400).json({ message: "manifest ve files gerekli" });
    }

    const python = resolvePython();
    if (!python) {
      return res.status(503).json({ message: "Python/OpenCV bulunamadı. Sunucuda optik okuma bağımlılıkları kurulu değil." });
    }

    const uploadRoot = `${path.resolve(uploadsDir)}${path.sep}`;
    const safeFiles = files.map((file) => path.resolve(file));
    if (safeFiles.some((file) => !file.startsWith(uploadRoot))) {
      return res.status(400).json({ message: "Geçersiz optik dosya yolu" });
    }

    let manifestPath: string | null = null;
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      manifestPath = path.join(uploadsDir, `manifest_${Date.now()}_${randomUUID()}.json`);
      await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

      const scriptPath = path.join(process.cwd(), "server", "optical_processor.py");
      const noOverlay = body.includeOverlay === false ? ["--no-overlay"] : [];
      const args = [scriptPath, "read", manifestPath, ...noOverlay, ...safeFiles];
      const timeoutMs = Number(process.env.OPTIC_READ_TIMEOUT_MS) || 180000;
      const stdout = await runPython(python, args, timeoutMs);
      return res.status(200).json(JSON.parse(stdout));
    } catch (err) {
      console.error("Optik okuma hatası:", err);
      return res.status(500).json({ message: "Okuma hatası" });
    } finally {
      await Promise.allSettled([
        ...safeFiles.map((file) => fs.unlink(file)),
        ...(manifestPath ? [fs.unlink(manifestPath)] : []),
      ]);
    }
  });

  // File upload endpoint
  app.post("/api/optics/upload", (req, res) => {
    const uploadDir = path.join(dbDir, "optic_uploads");
    
    const busboy = Busboy({
      headers: req.headers as Record<string, string>,
      limits: { files: 1, fileSize: 20 * 1024 * 1024 },
    });
    
    let fileName = "upload.pdf";
    let uploadTooLarge = false;
    const chunks: Buffer[] = [];
    
    busboy.on("file", (fieldname: string, file: NodeJS.ReadableStream, filename: string, encoding: string, mimetype: string) => {
      const originalName = typeof filename === "string" ? filename : "upload.pdf";
      const extension = path.extname(originalName).toLowerCase();
      if (![".pdf", ".jpg", ".jpeg", ".png"].includes(extension)) {
        file.resume();
        return;
      }
      fileName = path.basename(originalName);
      const stream = file as unknown as NodeJS.ReadableStream;
      stream.on("data", (data: Buffer) => {
        chunks.push(data);
      });
      stream.on("limit", () => {
        uploadTooLarge = true;
      });
    });
    
    busboy.on("finish", async () => {
      try {
        await fs.mkdir(uploadDir, { recursive: true });
        
        const fileBuffer = Buffer.concat(chunks);
        
        if (fileBuffer.length === 0) {
          return res.status(400).json({ message: "Dosya verisi bulunamadı" });
        }
        if (uploadTooLarge) {
          return res.status(413).json({ message: "Dosya boyutu 20 MB sınırını aşıyor" });
        }
        
        const filePath = path.join(uploadDir, `${Date.now()}_${randomUUID()}${path.extname(fileName).toLowerCase()}`);
        await fs.writeFile(filePath, fileBuffer);
        
        return res.status(200).json({ filePath, fileName });
      } catch (e: unknown) {
        console.error("Upload error:", e);
        return res.status(500).json({ message: "Dosya kaydetme hatası" });
      }
    });
    
    busboy.on("error", (err: unknown) => {
      console.error("Busboy error:", err);
      res.status(500).json({ message: "Upload hatası" });
    });
    
    req.pipe(busboy);
  });

  return httpServer;
}
