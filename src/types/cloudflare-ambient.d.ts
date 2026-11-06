/** Minimal ambient types so local typecheck works before wrangler types generation. */
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}
interface D1ExecResult {
  count: number;
  duration: number;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | string | Blob, options?: R2PutOptions): Promise<R2Object>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}
interface R2Object {
  key: string;
  size: number;
  etag: string;
}
interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}
interface R2PutOptions {
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
}
interface R2ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}
interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}
interface KVNamespace {
  get(key: string, options?: { type?: string }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}
