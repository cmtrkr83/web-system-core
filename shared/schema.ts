import { sqliteTable, text } from "drizzle-orm/sqlite-core";
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

export const registryDistricts = sqliteTable("registry_districts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const registrySchools = sqliteTable("registry_schools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  districtId: text("district_id").notNull(),
  code: text("code").notNull(),
});

export const registryStudents = sqliteTable("registry_students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tc: text("tc").notNull(),
  schoolNo: text("school_no").notNull().default(""),
  schoolId: text("school_id").notNull(),
  salon: text("salon").notNull(),
  class: text("class").notNull(),
});

export const registryMeta = sqliteTable("registry_meta", {
  id: text("id").primaryKey(),
  sourceFileName: text("source_file_name").notNull().default(""),
  loadedAt: text("loaded_at").notNull().default(""),
});

export const insertRegistryDistrictSchema = createInsertSchema(registryDistricts);
export const insertRegistrySchoolSchema = createInsertSchema(registrySchools);
export const insertRegistryStudentSchema = createInsertSchema(registryStudents);

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
