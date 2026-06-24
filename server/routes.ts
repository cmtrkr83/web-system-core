import type { Express } from "express";
import { createServer, type Server } from "http";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { replaceRegistryPayloadSchema, insertExamSchema } from "@shared/schema";
import { spawn } from "child_process";
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
   const configsFile = path.join(dbDir, "optic-configs.json");
   const resultsFile = path.join(dbDir, "optic-results.json");
   const resultsCsvFile = path.join(dbDir, "optic-results.csv");
   const opticDbFile = path.join(dbDir, "optic-readings.sqlite");
   const uploadsDir = path.join(dbDir, "optic_uploads");
   const processedDir = path.join(dbDir, "optic_processed");
   const errorsDir = path.join(dbDir, "optic_errors");

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

  const insertScanSession = opticDb.prepare(`
    INSERT INTO optic_scan_sessions (
      id, created_at, file_name, page_count, qr, results_json
    ) VALUES (
      @id, @created_at, @file_name, @page_count, @qr, @results_json
    )
  `);

  const insertScanAnswer = opticDb.prepare(`
    INSERT INTO optic_scan_answers (
      id, session_id, page_index, area_id, subject, question_number, answer, confidence, scores_json
    ) VALUES (
      @id, @session_id, @page_index, @area_id, @subject, @question_number, @answer, @confidence, @scores_json
    )
  `);

  app.get("/api/optics/configs", async (_req, res) => {
    try {
      const data = await fs.readFile(configsFile, "utf-8");
      return res.status(200).json(JSON.parse(data));
    } catch (err) {
      return res.status(200).json([]);
    }
  });

  app.post("/api/optics/configs", async (req, res) => {
    try {
      const body = req.body;
      const existing = await (async () => {
        try {
          const d = await fs.readFile(configsFile, "utf-8");
          return JSON.parse(d) as any[];
        } catch {
          return [] as any[];
        }
      })();

      existing.push({ id: Date.now().toString(), createdAt: new Date().toISOString(), ...body });
      await fs.writeFile(configsFile, JSON.stringify(existing, null, 2), "utf-8");
      return res.status(201).json({ message: "Kaydedildi" });
    } catch (err) {
      return res.status(500).json({ message: "Kaydetme hatası" });
    }
  });

  app.get("/api/optics/results", async (_req, res) => {
    try {
      const data = await fs.readFile(resultsFile, "utf-8");
      return res.status(200).json(JSON.parse(data));
    } catch (err) {
      return res.status(200).json([]);
    }
  });

  app.post("/api/optics/results", async (req, res) => {
    try {
      const body = req.body;
      const existing = await (async () => {
        try {
          const d = await fs.readFile(resultsFile, "utf-8");
          return JSON.parse(d) as any[];
        } catch {
          return [] as any[];
        }
      })();

      existing.push({ id: Date.now().toString(), createdAt: new Date().toISOString(), ...body });
      await fs.writeFile(resultsFile, JSON.stringify(existing, null, 2), "utf-8");
      // Also append CSV rows: for each result (area) and each row -> page, subject, areaId, rowNumber, answer
      try {
        const csvLines: string[] = [];
        const header = "createdAt;page;subject;areaId;row;answer";
        const createdAt = new Date().toISOString();

        for (const resEntry of Array.isArray(body.results) ? body.results : []) {
          const subject = String(resEntry.subject || "").replace(/[;\n\r]/g, " ");
          const areaId = String(resEntry.areaId || "");
          const page = Number.isFinite(Number(resEntry.pageIndex)) ? Number(resEntry.pageIndex) + 1 : "";
          const answers = Array.isArray(resEntry.answers) ? resEntry.answers : [];
          for (let i = 0; i < answers.length; i++) {
            const rawAnswer = answers[i];
            const resolved = typeof rawAnswer === "string"
              ? rawAnswer
              : rawAnswer && typeof rawAnswer === "object" && "answer" in rawAnswer
                ? String((rawAnswer as { answer?: unknown }).answer || "")
                : String(rawAnswer || "");
            const letter = resolved ? String(resolved[0]).toLowerCase() : "";
            csvLines.push(`${createdAt};${page};${subject};${areaId};${i + 1};${letter}`);
          }
        }

        // ensure db dir exists
        await fs.mkdir(dbDir, { recursive: true });

        const existsCsv = await (async () => {
          try { await fs.access(resultsCsvFile); return true; } catch { return false; }
        })();

        // UTF-8 BOM for Windows Excel compatibility when creating a new file
        const BOM = "\uFEFF";
        const toWriteHeader = (existsCsv ? "" : BOM + header + "\n");
        const toWriteBody = csvLines.join("\n") + (csvLines.length ? "\n" : "");
        const toWrite = toWriteHeader + toWriteBody;
        if (toWrite) await fs.appendFile(resultsCsvFile, toWrite, "utf-8");
      } catch (csvErr) {
        console.error("CSV write failed:", csvErr);
      }
      return res.status(201).json({ message: "Kaydedildi" });
    } catch (err) {
      return res.status(500).json({ message: "Kaydetme hatası" });
    }
  });

  app.post("/api/optics/scans", async (req, res) => {
    try {
      const body = req.body as {
        fileName?: string;
        pageCount?: number;
        qrData?: string;
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

  app.post("/api/optics/process", async (req, res) => {
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(processedDir, { recursive: true });
      await fs.mkdir(errorsDir, { recursive: true });

      if (!req.body || !req.body.filePath) {
        return res.status(400).json({ message: "filePath gerekli" });
      }

      const inputFile = String(req.body.filePath);
      const dpi = Number(req.body.dpi) || 300;

      const scriptPath = path.join(process.cwd(), "server", "optical_processor.py");
      
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn("python", [scriptPath, inputFile, String(dpi)], {
          timeout: 120000,
        });
        
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

      return res.status(200).json(JSON.parse(result));
    } catch (err) {
      console.error("Optik işleme hatası:", err);
      return res.status(500).json({ message: "İşleme hatası", error: String(err) });
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

  // Detect black-bordered answer area in a JPEG image
  app.post("/api/optics/detect-frame", async (req, res) => {
    try {
      const { filePath, threshold } = req.body;

      if (!filePath) {
        return res.status(400).json({ success: false, error: "filePath gerekli" });
      }

      const thr = typeof threshold === "number" ? Math.max(0, Math.min(255, Math.round(threshold))) : 120;

      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(processedDir, { recursive: true });
      await fs.mkdir(errorsDir, { recursive: true });

      const scriptPath = path.join(process.cwd(), "server", "optical_processor.py");

      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn("python", [scriptPath, "detect_frame", filePath, String(thr)], {
          timeout: 30000,
        });

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

      const parsed = JSON.parse(result);
      return res.status(200).json(parsed);
    } catch (err) {
      console.error("Çerçeve tespit hatası:", err);
      return res.status(500).json({
        success: false,
        error: "Çerçeve tespit edilirken bir hata oluştu: " + String(err),
      });
    }
  });

  // Batch: process multiple JPEG files
  app.post("/api/optics/batch", async (req, res) => {
    try {
      const { files, threshold } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, error: "files dizisi gerekli" });
      }

      const thr = typeof threshold === "number" ? Math.max(0, Math.min(255, Math.round(threshold))) : 120;

      const scriptPath = path.join(process.cwd(), "server", "optical_processor.py");
      const tmpCsv = path.join(dbDir, `optic_batch_${Date.now()}.csv`);

      // Python batch komutunu hazırla: batch <dosyalar> -o <csv> -t <eşik>
      const pyArgs = [
        scriptPath, "batch",
        ...files,
        "-o", tmpCsv,
        "-t", String(thr),
      ];

      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn("python", pyArgs, { timeout: 120000 + files.length * 60000 });
        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (data) => { stdout += data.toString(); });
        proc.stderr?.on("data", (data) => { stderr += data.toString(); });
        proc.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(stderr || `Python batch exited with code ${code}`));
          } else {
            resolve(stdout);
          }
        });
        proc.on("error", (err) => reject(err));
      });

      const summary = JSON.parse(result);

      // CSV'yi oku
      let csvContent = "";
      try {
        csvContent = await fs.readFile(tmpCsv, "utf-8");
        await fs.unlink(tmpCsv).catch(() => {});
      } catch {
        // CSV okunamazsa boş dön
      }

      return res.status(200).json({
        success: true,
        csv: csvContent,
        summary,
      });
    } catch (err) {
      console.error("Batch işlem hatası:", err);
      return res.status(500).json({
        success: false,
        error: "Batch işlem hatası: " + String(err),
      });
    }
  });

  // Error pages endpoint
  app.post("/api/optics/error-pages", async (req, res) => {
    try {
      const { originalPath, pageNum, reason } = req.body;
      
      const errorRecord = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        originalPath,
        pageNum,
        reason,
      };
      
      // errors.json dosyasına ekle
      const errorsFile = path.join(dbDir, "optic_errors.json");
      const existing = await (async () => {
        try {
          const d = await fs.readFile(errorsFile, "utf-8");
          return JSON.parse(d) as any[];
        } catch {
          return [] as any[];
        }
      })();
      
      existing.push(errorRecord);
      await fs.writeFile(errorsFile, JSON.stringify(existing, null, 2), "utf-8");
      
      return res.status(201).json({ message: "Hata kaydı eklendi" });
    } catch (err) {
      console.error("Error pages hatası:", err);
      return res.status(500).json({ message: "Hata kaydı başarısız" });
    }
  });

  return httpServer;
}
