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
    opticDb.transaction((examId: string) => {
      opticDb.prepare(`
        DELETE FROM optic_scan_answers
        WHERE session_id IN (
          SELECT id FROM optic_scan_sessions WHERE exam_id = ?
        )
      `).run(examId);
      opticDb.prepare("DELETE FROM optic_scan_sessions WHERE exam_id = ?").run(examId);
      opticDb.prepare("DELETE FROM optic_coding_profiles WHERE exam_id = ?").run(examId);
      opticDb.prepare("DELETE FROM optic_answer_keys WHERE exam_id = ?").run(examId);
    })(id);
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

  app.get("/api/registry/imports", async (req, res) => {
    const examId = typeof req.query.examId === "string" ? req.query.examId.trim() : "";
    if (!examId) {
      return res.status(400).json({ message: "examId gerekli" });
    }

    return res.status(200).json(await storage.getRegistryImportHistory(examId));
  });

  app.post("/api/registry/replace", async (req, res) => {
    const examId = typeof req.body?.examId === "string" ? req.body.examId.trim() : "";
    if (!examId) {
      return res.status(400).json({ message: "examId gerekli" });
    }
    const sourceRows = req.body?.sourceRows;
    const excludedRows = req.body?.excludedRows;
    if (
      !Number.isSafeInteger(sourceRows) ||
      sourceRows < 0 ||
      !Number.isSafeInteger(excludedRows) ||
      excludedRows < 0
    ) {
      return res.status(400).json({ message: "Excel satır sayıları geçersiz" });
    }

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

    const exams = await storage.getExams();
    if (!exams.some((exam) => exam.id === examId)) {
      return res.status(404).json({ message: "Sınav bulunamadı" });
    }
    if (parsed.data.students.length === 0) {
      return res.status(422).json({ message: "Kütük en az bir öğrenci içermelidir" });
    }
    if (sourceRows !== parsed.data.students.length + excludedRows) {
      return res.status(400).json({ message: "Excel satır toplamı öğrenci sayılarıyla uyuşmuyor" });
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

    const contentHash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
    await storage.replaceRegistryData(parsed.data, examId, {
      sourceFileName: String(req.body?.sourceFileName || ""),
      contentHash,
      sourceRows,
      excludedRows,
      safetyBackupId: safetyBackup.id,
    });
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

  const getStoredFormDesign = async (id: string) => {
    const raw = await fs.readFile(formDesignsFile, "utf-8");
    const designs = JSON.parse(raw) as Array<{
      id: string;
      version?: number;
      manifestHash?: string;
      fields?: Array<{ id: string }>;
      grids?: Array<{ subject: string; questionCount: number; optionCount: number }>;
    }>;
    return designs.find((design) => design.id === id);
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
      registry_student_id TEXT NOT NULL DEFAULT '',
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      confidence REAL NOT NULL DEFAULT 0,
      score_total REAL,
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0,
      blank_count INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS optic_coding_profiles (
      exam_id TEXT NOT NULL,
      form_design_id TEXT NOT NULL,
      form_version INTEGER NOT NULL DEFAULT 1,
      manifest_hash TEXT NOT NULL DEFAULT '',
      elements_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (exam_id, form_design_id)
    );

    CREATE TABLE IF NOT EXISTS optic_answer_keys (
      exam_id TEXT NOT NULL,
      form_design_id TEXT NOT NULL,
      form_version INTEGER NOT NULL DEFAULT 1,
      answers_json TEXT NOT NULL DEFAULT '{}',
      correct_points REAL NOT NULL DEFAULT 1,
      incorrect_points REAL NOT NULL DEFAULT 0,
      blank_points REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (exam_id, form_design_id, form_version)
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
  if (!hasSessionCol("registry_student_id")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN registry_student_id TEXT NOT NULL DEFAULT ''");
  if (!hasSessionCol("match_status")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN match_status TEXT NOT NULL DEFAULT 'unmatched'");
  if (!hasSessionCol("confidence")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN confidence REAL NOT NULL DEFAULT 0");
  if (!hasSessionCol("score_total")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN score_total REAL");
  if (!hasSessionCol("correct_count")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0");
  if (!hasSessionCol("incorrect_count")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN incorrect_count INTEGER NOT NULL DEFAULT 0");
  if (!hasSessionCol("blank_count")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN blank_count INTEGER NOT NULL DEFAULT 0");
  if (!hasSessionCol("form_design_id")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN form_design_id TEXT NOT NULL DEFAULT ''");
  if (!hasSessionCol("form_version")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN form_version INTEGER NOT NULL DEFAULT 1");
  if (!hasSessionCol("manifest_hash")) opticDb.exec("ALTER TABLE optic_scan_sessions ADD COLUMN manifest_hash TEXT NOT NULL DEFAULT ''");
  opticDb.exec("CREATE INDEX IF NOT EXISTS idx_optic_scan_sessions_exam ON optic_scan_sessions(exam_id, created_at)");

  const insertScanSession = opticDb.prepare(`
    INSERT INTO optic_scan_sessions (
      id, created_at, file_name, page_count, qr, tc_no, booklet, exam_id,
      registry_student_id, match_status, confidence, score_total, correct_count,
      incorrect_count, blank_count, results_json, form_design_id, form_version, manifest_hash
    ) VALUES (
      @id, @created_at, @file_name, @page_count, @qr, @tc_no, @booklet, @exam_id,
      @registry_student_id, @match_status, @confidence, @score_total, @correct_count,
      @incorrect_count, @blank_count, @results_json, @form_design_id, @form_version, @manifest_hash
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
    WHERE exam_id = ? AND file_name = ? AND manifest_hash = ? AND tc_no = ? AND results_json = ?
    LIMIT 1
  `);

  app.get("/api/optics/coding-profiles", (req, res) => {
    const examId = typeof req.query.examId === "string" ? req.query.examId : "";
    const formDesignId = typeof req.query.formDesignId === "string" ? req.query.formDesignId : "";
    if (!examId || !formDesignId) {
      return res.status(400).json({ message: "examId ve formDesignId gerekli" });
    }

    const profile = opticDb.prepare(`
      SELECT
        exam_id AS examId,
        form_design_id AS formDesignId,
        form_version AS formVersion,
        manifest_hash AS manifestHash,
        elements_json AS elementsJson,
        updated_at AS updatedAt
      FROM optic_coding_profiles
      WHERE exam_id = ? AND form_design_id = ?
    `).get(examId, formDesignId) as {
      examId: string;
      formDesignId: string;
      formVersion: number;
      manifestHash: string;
      elementsJson: string;
      updatedAt: string;
    } | undefined;

    if (!profile) return res.status(200).json({ profile: null });
    return res.status(200).json({
      profile: {
        ...profile,
        elements: JSON.parse(profile.elementsJson),
      },
    });
  });

  app.put("/api/optics/coding-profiles", async (req, res) => {
    const {
      examId,
      formDesignId,
      formVersion,
      manifestHash,
      elements,
    } = req.body ?? {};
    if (
      typeof examId !== "string" ||
      typeof formDesignId !== "string" ||
      !Number.isSafeInteger(formVersion) ||
      formVersion < 1 ||
      typeof manifestHash !== "string" ||
      !Array.isArray(elements) ||
      elements.length > 500
    ) {
      return res.status(400).json({ message: "Kodlama profili geçersiz" });
    }

    const invalidElement = elements.some((element) => {
      if (!element || typeof element !== "object") return true;
      return (
        typeof element.id !== "string" ||
        typeof element.columnKey !== "string" ||
        typeof element.label !== "string" ||
        !Number.isFinite(element.xMm) ||
        !Number.isFinite(element.yMm) ||
        !["text", "qr"].includes(element.kind) ||
        (element.boundFieldId !== undefined && typeof element.boundFieldId !== "string") ||
        (element.fontSizeMm !== undefined && !Number.isFinite(element.fontSizeMm)) ||
        (element.letterSpacingMm !== undefined && !Number.isFinite(element.letterSpacingMm)) ||
        (element.qrSizeMm !== undefined && !Number.isFinite(element.qrSizeMm))
      );
    });
    if (invalidElement) {
      return res.status(400).json({ message: "Kodlama profili öğeleri geçersiz" });
    }

    const exams = await storage.getExams();
    if (!exams.some((exam) => exam.id === examId)) {
      return res.status(404).json({ message: "Sınav bulunamadı" });
    }
    const formDesign = await getStoredFormDesign(formDesignId);
    if (!formDesign) return res.status(404).json({ message: "Optik form tasarımı bulunamadı" });
    if (
      (formDesign.version ?? 1) !== formVersion ||
      (formDesign.manifestHash ?? "") !== manifestHash
    ) {
      return res.status(409).json({ message: "Form sürümü değişti; kodlama profilini yeniden kontrol edin" });
    }
    if (elements.some((element) =>
      element.boundFieldId !== undefined &&
      !formDesign.fields?.some((field) => field.id === element.boundFieldId),
    )) {
      return res.status(422).json({ message: "Kodlama profili artık formda bulunmayan bir alana bağlı" });
    }

    const updatedAt = new Date().toISOString();
    opticDb.prepare(`
      INSERT INTO optic_coding_profiles (
        exam_id, form_design_id, form_version, manifest_hash, elements_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(exam_id, form_design_id) DO UPDATE SET
        form_version = excluded.form_version,
        manifest_hash = excluded.manifest_hash,
        elements_json = excluded.elements_json,
        updated_at = excluded.updated_at
    `).run(examId, formDesignId, formVersion, manifestHash, JSON.stringify(elements), updatedAt);

    return res.status(200).json({ message: "Kodlama profili kaydedildi", updatedAt });
  });

  app.get("/api/optics/answer-keys", (req, res) => {
    const examId = typeof req.query.examId === "string" ? req.query.examId : "";
    const formDesignId = typeof req.query.formDesignId === "string" ? req.query.formDesignId : "";
    const formVersion = Number(req.query.formVersion);
    if (!examId || !formDesignId || !Number.isSafeInteger(formVersion) || formVersion < 1) {
      return res.status(400).json({ message: "examId, formDesignId ve formVersion gerekli" });
    }

    const answerKey = opticDb.prepare(`
      SELECT
        exam_id AS examId,
        form_design_id AS formDesignId,
        form_version AS formVersion,
        answers_json AS answersJson,
        correct_points AS correctPoints,
        incorrect_points AS incorrectPoints,
        blank_points AS blankPoints,
        updated_at AS updatedAt
      FROM optic_answer_keys
      WHERE exam_id = ? AND form_design_id = ? AND form_version = ?
    `).get(examId, formDesignId, formVersion) as {
      examId: string;
      formDesignId: string;
      formVersion: number;
      answersJson: string;
      correctPoints: number;
      incorrectPoints: number;
      blankPoints: number;
      updatedAt: string;
    } | undefined;

    if (!answerKey) return res.status(200).json({ answerKey: null });
    return res.status(200).json({
      answerKey: {
        ...answerKey,
        answers: JSON.parse(answerKey.answersJson),
      },
    });
  });

  app.put("/api/optics/answer-keys", async (req, res) => {
    const {
      examId,
      formDesignId,
      formVersion,
      answers,
      correctPoints,
      incorrectPoints,
      blankPoints,
    } = req.body ?? {};
    if (
      typeof examId !== "string" ||
      typeof formDesignId !== "string" ||
      !Number.isSafeInteger(formVersion) ||
      formVersion < 1 ||
      !answers ||
      typeof answers !== "object" ||
      Array.isArray(answers) ||
      !Number.isFinite(correctPoints) ||
      !Number.isFinite(incorrectPoints) ||
      !Number.isFinite(blankPoints)
    ) {
      return res.status(400).json({ message: "Cevap anahtarı geçersiz" });
    }

    const invalidSubject = Object.entries(answers).some(([subject, values]) =>
      !subject.trim() ||
      !Array.isArray(values) ||
      values.length > 500 ||
      values.some((answer) => typeof answer !== "string" || (answer !== "" && !/^[A-E]$/.test(answer))),
    );
    if (invalidSubject) {
      return res.status(400).json({ message: "Cevap anahtarı alanları geçersiz" });
    }

    const exams = await storage.getExams();
    if (!exams.some((exam) => exam.id === examId)) {
      return res.status(404).json({ message: "Sınav bulunamadı" });
    }
    const formDesign = await getStoredFormDesign(formDesignId);
    if (!formDesign) return res.status(404).json({ message: "Optik form tasarımı bulunamadı" });
    if ((formDesign.version ?? 1) !== formVersion) {
      return res.status(409).json({ message: "Form sürümü değişti; cevap anahtarını yeniden hazırlayın" });
    }
    const expectedSubjects = new Set((formDesign.grids ?? []).map((grid) => grid.subject));
    if (
      Object.keys(answers).length !== expectedSubjects.size ||
      Object.entries(answers).some(([subject, values]) => {
        const grid = formDesign.grids?.find((item) => item.subject === subject);
        if (!grid || !Array.isArray(values) || values.length !== grid.questionCount) return true;
        const allowed = new Set(Array.from({ length: grid.optionCount }, (_, index) => String.fromCharCode(65 + index)));
        return values.some((answer) => typeof answer !== "string" || !allowed.has(answer));
      })
    ) {
      return res.status(422).json({ message: "Cevap anahtarı formun ders ve soru yapısıyla uyuşmuyor" });
    }

    const updatedAt = new Date().toISOString();
    opticDb.prepare(`
      INSERT INTO optic_answer_keys (
        exam_id, form_design_id, form_version, answers_json,
        correct_points, incorrect_points, blank_points, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(exam_id, form_design_id, form_version) DO UPDATE SET
        answers_json = excluded.answers_json,
        correct_points = excluded.correct_points,
        incorrect_points = excluded.incorrect_points,
        blank_points = excluded.blank_points,
        updated_at = excluded.updated_at
    `).run(
      examId,
      formDesignId,
      formVersion,
      JSON.stringify(answers),
      correctPoints,
      incorrectPoints,
      blankPoints,
      updatedAt,
    );

    return res.status(200).json({ message: "Cevap anahtarı kaydedildi", updatedAt });
  });

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
          registry_student_id: "",
          match_status: "unmatched",
          confidence: Number(body.confidence) || 0,
          score_total: null,
          correct_count: 0,
          incorrect_count: 0,
          blank_count: 0,
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
      const scanValues: unknown[] = Array.isArray(req.body?.scans) ? req.body.scans : [];
      const isRecord = (value: unknown): value is Record<string, unknown> =>
        Boolean(value && typeof value === "object" && !Array.isArray(value));
      const hasInvalidScan = scanValues.some((value) => {
        if (!isRecord(value) || typeof value.fileName !== "string" || !Array.isArray(value.results)) {
          return true;
        }
        return value.results.some((resultValue) => {
          if (
            !isRecord(resultValue) ||
            typeof resultValue.subject !== "string" ||
            !Array.isArray(resultValue.answers)
          ) {
            return true;
          }
          return resultValue.answers.some((answerValue) =>
            !isRecord(answerValue) ||
            !Number.isSafeInteger(answerValue.questionNumber) ||
            Number(answerValue.questionNumber) < 1 ||
            typeof answerValue.answer !== "string",
          );
        });
      });
      if (hasInvalidScan) {
        return res.status(400).json({ message: "Tarama sonuçlarının biçimi geçersiz" });
      }
      const scans = scanValues as Array<Record<string, unknown>>;
      if (scans.length === 0) {
        return res.status(400).json({ message: "En az bir tarama sonucu gerekli" });
      }
      const examIds = new Set((await storage.getExams()).map((exam) => exam.id));
      if (scans.some((scan) => typeof scan.examId !== "string" || !examIds.has(scan.examId))) {
        return res.status(400).json({ message: "Her tarama geçerli bir examId içermelidir" });
      }

      const preparedScans = await Promise.all(scans.map(async (scan) => {
        const examId = String(scan.examId);
        const formDesignId = String(scan.formDesignId || "");
        const formVersion = Number(scan.formVersion) || 1;
        const answerKeyRow = formDesignId
          ? opticDb.prepare(`
              SELECT answers_json, correct_points, incorrect_points, blank_points
              FROM optic_answer_keys
              WHERE exam_id = ? AND form_design_id = ? AND form_version = ?
            `).get(examId, formDesignId, formVersion) as {
              answers_json: string;
              correct_points: number;
              incorrect_points: number;
              blank_points: number;
            } | undefined
          : undefined;
        const answerKey = answerKeyRow
          ? JSON.parse(answerKeyRow.answers_json) as Record<string, string[]>
          : null;
        const sourceResults = Array.isArray(scan.results) ? scan.results : [];
        const resultSubjects = sourceResults.map((resultValue) =>
          String((resultValue as Record<string, unknown>).subject || ""),
        );
        const hasCompleteAnswerKey = Boolean(
          answerKeyRow &&
          answerKey &&
          resultSubjects.length === Object.keys(answerKey).length &&
          new Set(resultSubjects).size === resultSubjects.length &&
          Object.keys(answerKey).every((subject) => resultSubjects.includes(subject)) &&
          sourceResults.every((resultValue) => {
            const result = resultValue as Record<string, unknown>;
            const expected = answerKey[String(result.subject || "")];
            const answers = Array.isArray(result.answers) ? result.answers : [];
            return expected && answers.length === expected.length &&
              answers.every((answerValue, index) =>
                Number((answerValue as Record<string, unknown>).questionNumber) === index + 1,
              );
          })
        );
        let scoreTotal: number | null = hasCompleteAnswerKey ? 0 : null;
        let correctCount = 0;
        let incorrectCount = 0;
        let blankCount = 0;
        const results = sourceResults.map((resultValue) => {
          const result = resultValue as Record<string, unknown>;
          const subject = String(result.subject || "");
          const subjectAnswerKey = answerKey?.[subject];
          const answers = (Array.isArray(result.answers) ? result.answers : []).map((answerValue) => {
            const answer = answerValue as Record<string, unknown>;
            const questionNumber = Number(answer.questionNumber) || 0;
            const expected = subjectAnswerKey?.[questionNumber - 1] || "";
            if (!expected || !answerKeyRow || scoreTotal === null) return answer;

            const selectedAnswer = String(answer.answer || "").toUpperCase();
            const isCorrect = selectedAnswer === expected;
            const isBlank = !selectedAnswer;
            const points = isBlank
              ? answerKeyRow.blank_points
              : isCorrect
                ? answerKeyRow.correct_points
                : answerKeyRow.incorrect_points;
            if (isBlank) blankCount += 1;
            else if (isCorrect) correctCount += 1;
            else incorrectCount += 1;
            scoreTotal += points;

            return {
              ...answer,
              correctAnswer: expected,
              isCorrect,
              points,
              scores: [{ letter: expected, score: points }],
            };
          });
          return { ...result, answers };
        });

        const tcNo = String(scan.tcNo || "").trim();
        const qrData = String(scan.qrData || "").trim();
        const matchedStudent =
          (tcNo ? await storage.findRegistryStudentByNumber(examId, tcNo) : undefined) ??
          (qrData ? await storage.findRegistryStudentByNumber(examId, qrData) : undefined);
        return {
          ...scan,
          examId,
          tcNo,
          registryStudentId: matchedStudent?.id || "",
          matchStatus: matchedStudent ? "matched" : "unmatched",
          scoreTotal,
          correctCount,
          incorrectCount,
          blankCount,
          results,
        };
      }));

      let skipped = 0;
      let matchedCount = 0;
      const scanIds = opticDb.transaction((rows: Array<Record<string, unknown>>) => {
        const ids: string[] = [];
        for (const body of rows) {
          const results = Array.isArray(body.results) ? body.results : [];
          const resultsJson = JSON.stringify(results);
          if (
            findScanSession.get(
              String(body.examId),
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
            registry_student_id: String(body.registryStudentId || ""),
            match_status: String(body.matchStatus || "unmatched"),
            confidence: Number(body.confidence) || 0,
            score_total: typeof body.scoreTotal === "number" ? body.scoreTotal : null,
            correct_count: Number(body.correctCount) || 0,
            incorrect_count: Number(body.incorrectCount) || 0,
            blank_count: Number(body.blankCount) || 0,
            results_json: resultsJson,
            form_design_id: String(body.formDesignId || ""),
            form_version: Number(body.formVersion) || 1,
            manifest_hash: String(body.manifestHash || ""),
          });
          ids.push(sessionId);
          if (body.matchStatus === "matched") matchedCount += 1;
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
      })(preparedScans as Array<Record<string, unknown>>);
      return res.status(201).json({
        message: "Kaydedildi",
        scanIds,
        count: scanIds.length,
        skipped,
        matched: matchedCount,
        unmatched: scanIds.length - matchedCount,
      });
    } catch (err) {
      console.error("Optik tarama batch kaydı başarısız:", err);
      return res.status(500).json({ message: "Kaydetme hatası" });
    }
  });

  app.get("/api/optics/scans", async (req, res) => {
    try {
      const examId = typeof req.query.examId === "string" ? req.query.examId : "";
      if (!examId) return res.status(400).json({ message: "examId gerekli" });
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
            s.registry_student_id AS registryStudentId,
            s.match_status AS matchStatus,
            s.confidence AS confidence,
            s.score_total AS scoreTotal,
            s.correct_count AS correctCount,
            s.incorrect_count AS incorrectCount,
            s.blank_count AS blankCount,
            s.form_design_id AS formDesignId,
            s.form_version AS formVersion,
            s.manifest_hash AS manifestHash,
            s.results_json AS resultsJson,
            COUNT(a.id) AS answerCount
          FROM optic_scan_sessions s
          LEFT JOIN optic_scan_answers a ON a.session_id = s.id
          WHERE s.exam_id = ?
          GROUP BY s.id
          ORDER BY s.created_at DESC
        `)
        .all(examId) as Array<Record<string, unknown>>;

      return res.status(200).json(sessions.map((session) => ({
        ...session,
        results: JSON.parse(String(session.resultsJson || "[]")),
      })));
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
