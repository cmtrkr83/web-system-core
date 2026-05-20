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

  return httpServer;
}
