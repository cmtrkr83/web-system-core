import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { replaceRegistryPayloadSchema, insertExamSchema } from "@shared/schema";

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

    const exam = await storage.createExam(parsed.data);
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
      // Also append CSV rows: for each result (area) and each row -> subject, areaId, rowNumber, answer
      try {
        const csvLines: string[] = [];
        const header = "createdAt;subject;areaId;row;answer";
        const createdAt = new Date().toISOString();

        for (const resEntry of Array.isArray(body.results) ? body.results : []) {
          const subject = String(resEntry.subject || "").replace(/[;\n\r]/g, " ");
          const areaId = String(resEntry.areaId || "");
          const answers = Array.isArray(resEntry.answers) ? resEntry.answers : [];
          for (let i = 0; i < answers.length; i++) {
            const raw = String(answers[i] || "").trim();
            const letter = raw ? String(raw[0]).toLowerCase() : "";
            csvLines.push(`${createdAt};${subject};${areaId};${i + 1};${letter}`);
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

  return httpServer;
}
