import Database from "better-sqlite3";
import { cp, mkdir, readdir, stat } from "fs/promises";
import path from "path";

export async function createLocalBackup(options: {
  databasePath: string;
  opticDatabasePath: string;
  formDesignsPath: string;
  uploadsPath: string;
  backupRoot: string;
}): Promise<{ id: string; path: string }> {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
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
  await cp(options.formDesignsPath, path.join(backupPath, "optic-form-designs.json"), { force: true });
  await cp(options.uploadsPath, path.join(backupPath, "optic_uploads"), { recursive: true, force: true });

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
