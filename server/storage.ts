import {
  type User,
  type InsertUser,
  type ReplaceRegistryPayload,
  type RegistryMeta,
  users,
  registryDistricts,
  registryMeta,
  registrySchools,
  registryStudents,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getRegistryData(): Promise<ReplaceRegistryPayload & { loadedAt: string; sourceFileName: string }>;
  replaceRegistryData(payload: ReplaceRegistryPayload): Promise<void>;
  clearRegistryData(): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async replaceRegistryData(_payload: ReplaceRegistryPayload): Promise<void> {
    return;
  }

  async getRegistryData(): Promise<ReplaceRegistryPayload & { loadedAt: string; sourceFileName: string }> {
    return {
      districts: [],
      schools: [],
      students: [],
      sourceFileName: "",
      loadedAt: "",
    };
  }

  async clearRegistryData(): Promise<void> {
    return;
  }
}

// SQLite Storage implementation using Drizzle ORM
export class DrizzleStorage implements IStorage {
  private db;

  constructor(dbPath: string) {
    // Ensure the directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(dbPath);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registry_districts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registry_schools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        district_id TEXT NOT NULL,
        code TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registry_students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tc TEXT NOT NULL,
        school_no TEXT NOT NULL DEFAULT '',
        school_id TEXT NOT NULL,
        salon TEXT NOT NULL,
        class TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registry_meta (
        id TEXT PRIMARY KEY,
        source_file_name TEXT NOT NULL DEFAULT '',
        loaded_at TEXT NOT NULL DEFAULT ''
      );
    `);

    this.db = drizzle(sqlite);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    await this.db.insert(users).values(user);
    return user;
  }

  async replaceRegistryData(payload: ReplaceRegistryPayload): Promise<void> {
    const chunkSize = 500;
    const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    this.db.transaction((tx) => {
      tx.delete(registryStudents).run();
      tx.delete(registrySchools).run();
      tx.delete(registryDistricts).run();
      tx.delete(registryMeta).run();

      if (payload.districts.length > 0) {
        tx.insert(registryDistricts).values(payload.districts).run();
      }
      if (payload.schools.length > 0) {
        tx.insert(registrySchools).values(payload.schools).run();
      }
      if (payload.students.length > 0) {
        for (const studentChunk of chunkArray(payload.students, chunkSize)) {
          tx.insert(registryStudents).values(studentChunk).run();
        }
      }

      const meta: RegistryMeta = {
        id: "current",
        sourceFileName: payload.sourceFileName || "",
        loadedAt: new Date().toISOString(),
      };
      tx.insert(registryMeta).values(meta).run();
    });
  }

  async getRegistryData(): Promise<ReplaceRegistryPayload & { loadedAt: string; sourceFileName: string }> {
    const districts = await this.db.select().from(registryDistricts);
    const schools = await this.db.select().from(registrySchools);
    const students = await this.db.select().from(registryStudents);
    const meta = await this.db.select().from(registryMeta).limit(1);

    return {
      districts,
      schools,
      students,
      sourceFileName: meta[0]?.sourceFileName || "",
      loadedAt: meta[0]?.loadedAt || "",
    };
  }

  async clearRegistryData(): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(registryStudents).run();
      tx.delete(registrySchools).run();
      tx.delete(registryDistricts).run();
      tx.delete(registryMeta).run();
    });
  }
}

export const storage = new DrizzleStorage("./db/local.db");
