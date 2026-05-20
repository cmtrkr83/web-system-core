import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const registryDistricts = sqliteTable(
  "registry_districts",
  {
    id: text("id"),
    examId: text("exam_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => ({
    pk: primaryKey(table.id, table.examId),
  }),
);

export const registrySchools = sqliteTable(
  "registry_schools",
  {
    id: text("id"),
    examId: text("exam_id").notNull(),
    name: text("name").notNull(),
    districtId: text("district_id").notNull(),
    code: text("code").notNull(),
  },
  (table) => ({
    pk: primaryKey(table.id, table.examId),
  }),
);

export const registryStudents = sqliteTable(
  "registry_students",
  {
    id: text("id"),
    examId: text("exam_id").notNull(),
    name: text("name").notNull(),
    tc: text("tc").notNull(),
    schoolNo: text("school_no").notNull().default(""),
    schoolId: text("school_id").notNull(),
    salon: text("salon").notNull(),
    class: text("class").notNull(),
  },
  (table) => ({
    pk: primaryKey(table.id, table.examId),
  }),
);

export const registryMeta = sqliteTable("registry_meta", {
  id: text("id").primaryKey(),
  examId: text("exam_id").notNull(),
  sourceFileName: text("source_file_name").notNull().default(""),
  loadedAt: text("loaded_at").notNull().default(""),
});

export const exams = sqliteTable("exams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  isActive: text("is_active").notNull().default("0"),
});

export const insertExamSchema = createInsertSchema(exams).omit({ id: true, createdAt: true });
export const insertRegistryDistrictSchema = createInsertSchema(registryDistricts).omit({ examId: true });
export const insertRegistrySchoolSchema = createInsertSchema(registrySchools).omit({ examId: true });
export const insertRegistryStudentSchema = createInsertSchema(registryStudents).omit({ examId: true });

export const replaceRegistryPayloadSchema = z.object({
  districts: z.array(insertRegistryDistrictSchema),
  schools: z.array(insertRegistrySchoolSchema),
  students: z.array(insertRegistryStudentSchema),
  sourceFileName: z.string().optional(),
});

export const registryMetaSchema = createInsertSchema(registryMeta);

export type InsertRegistryDistrict = z.infer<typeof insertRegistryDistrictSchema>;
export type InsertRegistrySchool = z.infer<typeof insertRegistrySchoolSchema>;
export type InsertRegistryStudent = z.infer<typeof insertRegistryStudentSchema>;
export type ReplaceRegistryPayload = z.infer<typeof replaceRegistryPayloadSchema>;
export type RegistryMeta = z.infer<typeof registryMetaSchema>;
export type InsertExam = z.infer<typeof insertExamSchema>;
export type Exam = typeof exams.$inferSelect;
