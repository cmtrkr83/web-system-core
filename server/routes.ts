import type { Express } from "express";
import { createServer, type Server } from "http";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
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
    await storage.setActiveExam(id);
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

  app.post("/api/registry/replace", async (req, res) => {
    const parsed = replaceRegistryPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Geçersiz payload",
        issues: parsed.error.issues,
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

    await storage.replaceRegistryData(parsed.data, activeExam.id);
    return res.status(200).json({ message: "Registry verisi güncellendi" });
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

  await fs.mkdir(dbDir, { recursive: true });

  const opticDb = new Database(opticDbFile);
  opticDb.pragma("journal_mode = WAL");
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
      results_json TEXT NOT NULL DEFAULT '[]'
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

  const insertScanSession = opticDb.prepare(`
    INSERT INTO optic_scan_sessions (
      id, created_at, file_name, page_count, qr, tc_no, booklet, exam_id, confidence, results_json
    ) VALUES (
      @id, @created_at, @file_name, @page_count, @qr, @tc_no, @booklet, @exam_id, @confidence, @results_json
    )
  `);

  const insertScanAnswer = opticDb.prepare(`
    INSERT INTO optic_scan_answers (
      id, session_id, page_index, area_id, subject, question_number, answer, confidence, scores_json
    ) VALUES (
      @id, @session_id, @page_index, @area_id, @subject, @question_number, @answer, @confidence, @scores_json
    )
  `);

  const PYTHON_CANDIDATES = [
    process.env.OPTIC_PYTHON,
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    "python3",
    "python",
  ].filter((p): p is string => Boolean(p));

  let resolvedPython: string | null = null;

  function resolvePython(): string {
    if (resolvedPython) return resolvedPython;
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
    resolvedPython = PYTHON_CANDIDATES[0] ?? "python";
    return resolvedPython;
  }

  function runPython(args: string[], timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(resolvePython(), args, { timeout: timeoutMs });
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

      const index = existing.findIndex((item) => item.id === body.id);
      if (index >= 0) {
        existing[index] = { ...existing[index], ...body };
      } else {
        existing.push(body);
      }
      await fs.writeFile(formDesignsFile, JSON.stringify(existing, null, 2), "utf-8");
      return res.status(201).json({ message: "Kaydedildi" });
    } catch (err) {
      return res.status(500).json({ message: "Kaydetme hatası" });
    }
  });

  app.delete("/api/optics/form-designs/:id", async (req, res) => {
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
      await fs.writeFile(formDesignsFile, JSON.stringify(next, null, 2), "utf-8");
      return res.status(200).json({ message: "Silindi" });
    } catch (err) {
      return res.status(500).json({ message: "Silme hatası" });
    }
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
    try {
      const body = req.body as { manifest?: unknown; files?: string[] };
      const manifest = body?.manifest;
      const files = Array.isArray(body?.files) ? body.files : [];
      if (!manifest || files.length === 0) {
        return res.status(400).json({ message: "manifest ve files gerekli" });
      }

      await fs.mkdir(uploadsDir, { recursive: true });
      const manifestPath = path.join(uploadsDir, `manifest_${Date.now()}.json`);
      await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

      const scriptPath = path.join(process.cwd(), "server", "optical_processor.py");
      const args = [scriptPath, "read", manifestPath, ...files];
      const stdout = await runPython(args, 600000);
      return res.status(200).json(JSON.parse(stdout));
    } catch (err) {
      console.error("Optik okuma hatası:", err);
      return res.status(500).json({ message: "Okuma hatası", error: String(err) });
    }
  });

  // File upload endpoint
  app.post("/api/optics/upload", (req, res) => {
    const uploadDir = path.join(dbDir, "optic_uploads");
    
    const busboy = Busboy({ headers: req.headers as Record<string, string> });
    
    let fileName = "upload.pdf";
    const chunks: Buffer[] = [];
    
    busboy.on("file", (fieldname: string, file: NodeJS.ReadableStream, filename: string, encoding: string, mimetype: string) => {
      fileName = typeof filename === "string" ? filename : (filename as any).filename || "upload.pdf";
      const stream = file as unknown as NodeJS.ReadableStream;
      stream.on("data", (data: Buffer) => {
        chunks.push(data);
      });
    });
    
    busboy.on("finish", async () => {
      try {
        await fs.mkdir(uploadDir, { recursive: true });
        
        const fileBuffer = Buffer.concat(chunks);
        
        if (fileBuffer.length === 0) {
          return res.status(400).json({ message: "Dosya verisi bulunamadı" });
        }
        
        const filePath = path.join(uploadDir, `${Date.now()}_${fileName}`);
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
