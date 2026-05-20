import {
  type User,
  type InsertUser,
  type ReplaceRegistryPayload,
  type RegistryMeta,
  type InsertExam,
  type Exam,
  users,
  registryDistricts,
  registryMeta,
  registrySchools,
  registryStudents,
  exams,
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
  getRegistryData(examId: string): Promise<ReplaceRegistryPayload & { loadedAt: string; sourceFileName: string }>;
  replaceRegistryData(payload: ReplaceRegistryPayload, examId: string): Promise<void>;
  clearRegistryData(examId: string): Promise<void>;
  getExams(): Promise<Exam[]>;
  createExam(exam: InsertExam): Promise<Exam>;
  setActiveExam(examId: string): Promise<void>;
  deleteExam(examId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private exams: Map<string, Exam>;

  constructor() {
    this.users = new Map();
    this.exams = new Map();
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

  async replaceRegistryData(_payload: ReplaceRegistryPayload, _examId: string): Promise<void> {
    return;
  }

  async getRegistryData(_examId: string): Promise<ReplaceRegistryPayload & { loadedAt: string; sourceFileName: string }> {
    return {
      districts: [],
      schools: [],
      students: [],
      sourceFileName: "",
      loadedAt: "",
    };
  }

  async clearRegistryData(_examId: string): Promise<void> {
    return;
  }

  async getExams(): Promise<Exam[]> {
    return Array.from(this.exams.values());
  }

  async createExam(exam: InsertExam): Promise<Exam> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newExam: Exam = { 
      ...exam, 
      id, 
      createdAt: now, 
      isActive: "0",
      description: exam.description || ""
    };
    this.exams.set(id, newExam);
    return newExam;
  }

  async setActiveExam(examId: string): Promise<void> {
    const allExams = Array.from(this.exams.values());
    for (const exam of allExams) {
      exam.isActive = exam.id === examId ? "1" : "0";
    }
  }

  async deleteExam(examId: string): Promise<void> {
    this.exams.delete(examId);
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

    // Create tables first
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        is_active TEXT NOT NULL DEFAULT '0'
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
        exam_id TEXT NOT NULL,
        source_file_name TEXT NOT NULL DEFAULT '',
        loaded_at TEXT NOT NULL DEFAULT ''
      );
    `);

    const ensureColumn = (tableName: string, columnName: string, columnSql: string) => {
      const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
      const hasColumn = columns.some((column) => column.name === columnName);

      if (columns.length > 0 && !hasColumn) {
        sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
      }
    };

    ensureColumn("registry_meta", "exam_id", "exam_id TEXT NOT NULL DEFAULT ''");
    ensureColumn("registry_districts", "exam_id", "exam_id TEXT NOT NULL DEFAULT ''");
    ensureColumn("registry_schools", "exam_id", "exam_id TEXT NOT NULL DEFAULT ''");
    ensureColumn("registry_students", "exam_id", "exam_id TEXT NOT NULL DEFAULT ''");

    const latestRegistryMeta = sqlite
      .prepare(`SELECT exam_id AS examId FROM registry_meta WHERE exam_id != '' ORDER BY loaded_at DESC LIMIT 1`)
      .get() as { examId?: string } | undefined;

    if (latestRegistryMeta?.examId) {
      sqlite.exec(`
        UPDATE registry_districts
        SET exam_id = '${latestRegistryMeta.examId}'
        WHERE exam_id = '' OR exam_id IS NULL;

        UPDATE registry_schools
        SET exam_id = '${latestRegistryMeta.examId}'
        WHERE exam_id = '' OR exam_id IS NULL;

        UPDATE registry_students
        SET exam_id = '${latestRegistryMeta.examId}'
        WHERE exam_id = '' OR exam_id IS NULL;
      `);
    }

      // Ensure composite primary keys (id, exam_id) for registry tables to allow identical ids across exams
      const ensureCompositePK = (tableName: string, createSql: string, insertCols: string) => {
        try {
          const cols = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string; pk: number }>;
          const pkCols = cols.filter((c) => c.pk && c.pk > 0).map((c) => c.name);

          const needsMigration = !(pkCols.length === 2 && pkCols.includes("id") && pkCols.includes("exam_id"));
          if (cols.length === 0) {
            // table doesn't exist yet, nothing to migrate
            return;
          }
          if (needsMigration) {
            console.log(`Migrating ${tableName} to composite PK (id, exam_id)`);
            sqlite.exec("BEGIN TRANSACTION;");
            sqlite.exec(createSql);
            // copy existing rows into the new table, coalescing missing exam_id to ''
            sqlite.exec(`INSERT OR REPLACE INTO ${tableName}_new (${insertCols}) SELECT ${insertCols} FROM ${tableName}`);
            sqlite.exec(`DROP TABLE ${tableName};`);
            sqlite.exec(`ALTER TABLE ${tableName}_new RENAME TO ${tableName};`);
            sqlite.exec("COMMIT;");
          }
        } catch (err) {
          console.error(`Failed to migrate ${tableName} to composite PK:`, err);
          try {
            sqlite.exec("ROLLBACK;");
          } catch {}
        }
      };

      ensureCompositePK(
        "registry_districts",
        `CREATE TABLE IF NOT EXISTS registry_districts_new (
          id TEXT NOT NULL,
          exam_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          PRIMARY KEY (id, exam_id)
        );`,
        "id, exam_id, name",
      );

      ensureCompositePK(
        "registry_schools",
        `CREATE TABLE IF NOT EXISTS registry_schools_new (
          id TEXT NOT NULL,
          exam_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          district_id TEXT NOT NULL,
          code TEXT NOT NULL,
          PRIMARY KEY (id, exam_id)
        );`,
        "id, exam_id, name, district_id, code",
      );

      ensureCompositePK(
        "registry_students",
        `CREATE TABLE IF NOT EXISTS registry_students_new (
          id TEXT NOT NULL,
          exam_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          tc TEXT NOT NULL,
          school_no TEXT NOT NULL DEFAULT '',
          school_id TEXT NOT NULL,
          salon TEXT NOT NULL,
          class TEXT NOT NULL,
          PRIMARY KEY (id, exam_id)
        );`,
        "id, exam_id, name, tc, school_no, school_id, salon, class",
      );

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

  async replaceRegistryData(payload: ReplaceRegistryPayload, examId: string): Promise<void> {
    const chunkSize = 500;
    const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    this.db.transaction((tx) => {
      // Replace only the selected exam's registry snapshot.
      tx.delete(registryStudents).where(eq(registryStudents.examId, examId)).run();
      tx.delete(registrySchools).where(eq(registrySchools.examId, examId)).run();
      tx.delete(registryDistricts).where(eq(registryDistricts.examId, examId)).run();
      tx.delete(registryMeta).where(eq(registryMeta.examId, examId)).run();

      if (payload.districts.length > 0) {
        tx.insert(registryDistricts).values(payload.districts.map((d) => ({ ...d, examId }))).run();
      }
      if (payload.schools.length > 0) {
        tx.insert(registrySchools).values(payload.schools.map((s) => ({ ...s, examId }))).run();
      }
      if (payload.students.length > 0) {
        for (const studentChunk of chunkArray(payload.students, chunkSize)) {
          tx.insert(registryStudents).values(studentChunk.map((st) => ({ ...st, examId }))).run();
        }
      }

      const meta: RegistryMeta = {
        id: `${examId}-meta`,
        examId: examId,
        sourceFileName: payload.sourceFileName || "",
        loadedAt: new Date().toISOString(),
      };
      tx.insert(registryMeta).values(meta).run();
    });
  }

  async getRegistryData(examId: string): Promise<ReplaceRegistryPayload & { loadedAt: string; sourceFileName: string }> {
    const districts = await this.db.select().from(registryDistricts).where(eq(registryDistricts.examId, examId));
    const schools = await this.db.select().from(registrySchools).where(eq(registrySchools.examId, examId));
    const students = await this.db.select().from(registryStudents).where(eq(registryStudents.examId, examId));
    const meta = await this.db.select().from(registryMeta).where(eq(registryMeta.examId, examId)).limit(1);

    return {
      districts,
      schools,
      students,
      sourceFileName: meta[0]?.sourceFileName || "",
      loadedAt: meta[0]?.loadedAt || "",
    };
  }

  async clearRegistryData(examId: string): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(registryStudents).where(eq(registryStudents.examId, examId)).run();
      tx.delete(registrySchools).where(eq(registrySchools.examId, examId)).run();
      tx.delete(registryDistricts).where(eq(registryDistricts.examId, examId)).run();
      tx.delete(registryMeta).where(eq(registryMeta.examId, examId)).run();
    });
  }

  async getExams(): Promise<Exam[]> {
    try {
      const result = await this.db.select().from(exams);
      console.log("✓ Fetched exams:", result.length);
      return result;
    } catch (err) {
      console.error("✗ Fetch exams failed:", err);
      return [];
    }
  }

  async createExam(exam: InsertExam): Promise<Exam> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newExam: Exam = { 
      ...exam, 
      id, 
      createdAt: now, 
      isActive: "0",
      description: exam.description || ""
    };
    try {
      await this.db.insert(exams).values(newExam);
      console.log("✓ Exam created:", newExam.id, newExam.name);
    } catch (err) {
      console.error("✗ Exam creation failed:", err);
      throw err;
    }
    return newExam;
  }

  async setActiveExam(examId: string): Promise<void> {
    // Set all to inactive
    await this.db.update(exams).set({ isActive: "0" });
    // Set selected exam to active
    await this.db.update(exams).set({ isActive: "1" }).where(eq(exams.id, examId));
  }

  async deleteExam(examId: string): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(registryStudents).where(eq(registryStudents.examId, examId)).run();
      tx.delete(registrySchools).where(eq(registrySchools.examId, examId)).run();
      tx.delete(registryDistricts).where(eq(registryDistricts.examId, examId)).run();
      tx.delete(registryMeta).where(eq(registryMeta.examId, examId)).run();

      tx.delete(exams).where(eq(exams.id, examId)).run();
    });
  }
}

export const storage = new DrizzleStorage(process.env.DATABASE_URL ?? "./db/local.db");
