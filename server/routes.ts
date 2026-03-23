import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { replaceRegistryPayloadSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  app.get("/api/registry", async (_req, res) => {
    const data = await storage.getRegistryData();
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

    await storage.replaceRegistryData(parsed.data);
    return res.status(200).json({ message: "Registry verisi güncellendi" });
  });

  app.post("/api/registry/clear", async (_req, res) => {
    await storage.clearRegistryData();
    return res.status(200).json({ message: "Registry verisi temizlendi" });
  });

  return httpServer;
}
