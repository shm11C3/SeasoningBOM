export type D1Value = ArrayBuffer | boolean | null | number | string;

export type D1Result<T = unknown> = {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: unknown;
};

export type D1PreparedStatement = {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
};

export type WorkerEnv = {
  DB: D1Database;
  CLERK_AUTHORIZED_PARTIES?: string;
  CLERK_JWT_KEY?: string;
};

export type AuthenticatedUserProfile = {
  id: string;
  authProvider: "clerk";
  authSubject: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  contributionVisibility: "private" | "summary_only" | "public";
};
