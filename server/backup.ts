import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { cp, mkdir, readdir, rm, stat, writeFile } from "fs/promises";
import path from "path";

export async function createLocalBackup(options: {
  databasePath: string;
  opticDatabasePath: string;
  formDesignsPath: string;
  uploadsPath: string;
  backupRoot: string;
}): Promise<{ id: string; path: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `${timestamp}-${randomUUID().slice(0, 8)}`;
  const backupPath = path.join(options.backupRoot, id);
  await mkdir(backupPath, { recursive: true });

  const backupDatabase = async (sourcePath: string, fileName: string) => {
    const source = new Database(sourcePath, { readonly: true });
    try {
      await source.backup(path.join(backupPath, fileName));
    } finally {
      source.close();
    }
  };

  await backupDatabase(options.databasePath, "local.db");
  await backupDatabase(options.opticDatabasePath, "optic-readings.sqlite");
  const optionalSources = [
    { source: options.formDesignsPath, destination: path.join(backupPath, "optic-form-designs.json"), kind: "file" },
    { source: options.uploadsPath, destination: path.join(backupPath, "optic_uploads"), kind: "directory" },
  ] as const;
  for (const { source, destination, kind } of optionalSources) {
    let info;
    try {
      info = await stat(source);
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }

    if (!info) {
      if (kind === "file") {
        await writeFile(destination, "[]\n", "utf-8");
      } else {
        await mkdir(destination, { recursive: true });
      }
      continue;
    }

    if ((kind === "file" && !info.isFile()) || (kind === "directory" && !info.isDirectory())) {
      throw new Error(`Beklenen yedek kaynağı türü geçersiz: ${source}`);
    }
    await cp(source, destination, { recursive: kind === "directory", force: true });
  }

  return { id, path: backupPath };
}

export async function listLocalBackups(backupRoot: string): Promise<Array<{ id: string; createdAt: string }>> {
  let entries: string[];
  try {
    entries = await readdir(backupRoot);
  } catch {
    return [];
  }

  const backups = await Promise.all(
    entries.map(async (id) => {
      try {
        const info = await stat(path.join(backupRoot, id));
        return info.isDirectory() ? { id, createdAt: info.birthtime.toISOString() } : null;
      } catch {
        return null;
      }
    }),
  );
  return backups.filter((backup): backup is { id: string; createdAt: string } => backup !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreLocalBackup(options: {
  backupPath: string;
  databasePath: string;
  opticDatabasePath: string;
  formDesignsPath: string;
  uploadsPath: string;
}): Promise<void> {
  const requiredFiles = ["local.db", "optic-readings.sqlite", "optic-form-designs.json", "optic_uploads"];
  for (const file of requiredFiles) {
    const info = await stat(path.join(options.backupPath, file));
    if (file !== "optic_uploads" && !info.isFile()) {
      throw new Error(`Geçersiz yedek öğesi: ${file}`);
    }
    if (file === "optic_uploads" && !info.isDirectory()) {
      throw new Error(`Geçersiz yedek öğesi: ${file}`);
    }
  }

  await cp(path.join(options.backupPath, "local.db"), options.databasePath, { force: true });
  await cp(path.join(options.backupPath, "optic-readings.sqlite"), options.opticDatabasePath, { force: true });
  await cp(path.join(options.backupPath, "optic-form-designs.json"), options.formDesignsPath, { force: true });
  await rm(options.uploadsPath, { recursive: true, force: true });
  await cp(path.join(options.backupPath, "optic_uploads"), options.uploadsPath, { recursive: true, force: true });
}
