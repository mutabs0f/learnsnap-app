import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

async function backupDatabase() {
  try {
    console.log('Starting database backup...');

    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);

    const command = `pg_dump "${DATABASE_URL}" > ${backupFile}`;
    await execAsync(command);

    console.log(`Backup created: ${backupFile}`);

    await execAsync(`gzip ${backupFile}`);
    console.log(`Backup compressed: ${backupFile}.gz`);

    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.mtimeMs < sevenDaysAgo) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
      }
    }

    console.log('Backup completed successfully');
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
}

backupDatabase();
