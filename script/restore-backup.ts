import path from "path";
import { createLocalBackup, listLocalBackups, restoreLocalBackup } from "../server/backup";

const dbDir = path.resolve(process.cwd(), "db");
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
const databasePath = path.resolve(process.env.DATABASE_URL || path.join(dbDir, "local.db"));
const opticDatabasePath = path.join(dbDir, "optic-readings.sqlite");
const formDesignsPath = path.join(dbDir, "optic-form-designs.json");
const uploadsPath = path.join(dbDir, "optic_uploads");
const backupId = process.argv[2];

if (!backupId || backupId.includes("/") || backupId.includes("\\")) {
  throw new Error("Kullanım: npm run db:restore -- <yedek-id>");
}

const backups = await listLocalBackups(backupRoot);
if (!backups.some((backup) => backup.id === backupId)) {
  throw new Error(`Yedek bulunamadı: ${backupId}`);
}

const safetyBackup = await createLocalBackup({
  databasePath,
  opticDatabasePath,
  formDesignsPath,
  uploadsPath,
  backupRoot,
});

try {
  await restoreLocalBackup({
    backupPath: path.join(backupRoot, backupId),
    databasePath,
    opticDatabasePath,
    formDesignsPath,
    uploadsPath,
  });
  console.log(`Yedek geri yüklendi: ${backupId}`);
  console.log(`Geri dönüş için güvenlik yedeği: ${safetyBackup.id}`);
} catch (error) {
  console.error("Geri yükleme başarısız; güvenlik yedeği korunuyor:", safetyBackup.id);
  throw error;
}
