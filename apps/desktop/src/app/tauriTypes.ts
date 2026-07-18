export interface AppStatus {
  version: string;
  env: string;
}

export type DatabaseStatus =
  { status: "ready"; path: string; integrity_ok: boolean } | { status: "failed"; reason: string };
