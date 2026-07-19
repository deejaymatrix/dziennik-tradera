export interface BackupManifest {
  format_version: number;
  created_at: string;
  app_version: string;
  sqlite_sha256: string;
}
