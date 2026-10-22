// Centralized storage path resolution and filesystem security helpers.
// Handles read-only Lambda / Vercel Serverless Function environments by redirecting writes to /tmp.
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

/**
 * Detects whether execution is running inside a serverless / AWS Lambda / Vercel environment
 * where the application root (e.g. /var/task) is read-only.
 */
export function isServerless(): boolean {
  return (
    process.env['VERCEL'] === '1' ||
    process.env['VERCEL'] === 'true' ||
    Boolean(process.env['VERCEL_ENV']) ||
    Boolean(process.env['AWS_LAMBDA_FUNCTION_NAME']) ||
    Boolean(process.env['LAMBDA_TASK_ROOT'])
  );
}

/**
 * Returns the designated uploads root directory (or application subfolder).
 * Serverless: /tmp/uploads/[reference]
 * Local:      [process.cwd()]/storage/uploads/[reference]
 */
export function getUploadsDir(reference?: string): string {
  const root = isServerless()
    ? path.join('/tmp', 'uploads')
    : path.resolve(process.cwd(), 'storage', 'uploads');
  return reference ? path.join(root, reference) : root;
}

/**
 * Returns the designated temporary directory for generated PDFs.
 * Serverless: /tmp/temp/[subDir]
 * Local:      [process.cwd()]/storage/temp/[subDir]
 */
export function getTempDir(subDir?: string): string {
  const root = isServerless()
    ? path.join('/tmp', 'temp')
    : path.resolve(process.cwd(), 'storage', 'temp');
  return subDir ? path.join(root, subDir) : root;
}

/**
 * Returns the primary storage root directory.
 * Serverless: /tmp
 * Local:      [process.cwd()]/storage
 */
export function getStorageRoot(): string {
  return isServerless() ? '/tmp' : path.resolve(process.cwd(), 'storage');
}

/**
 * Safely ensures target directory exists recursively before file writes.
 */
export async function ensureDir(dirPath: string): Promise<string> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Returns the designated PDF storage directory.
 * Serverless: /tmp/pdfs
 * Local:      [process.cwd()]/storage/pdfs
 */
export function getPdfDir(): string {
  const root = isServerless()
    ? path.join('/tmp', 'pdfs')
    : path.resolve(process.cwd(), 'storage', 'pdfs');
  return root;
}

/**
 * Validates that a file path resides strictly inside approved storage roots,
 * protecting against directory traversal attacks while allowing both local storage and /tmp.
 */
export function isAllowedStoragePath(targetPath: string): boolean {
  if (!targetPath) return false;
  const resolved = path.resolve(targetPath);
  const cwd = process.cwd();

  const allowedRoots = [
    path.resolve(cwd, 'storage'),
    path.resolve(cwd, 'astro-award', 'storage'),
    path.resolve('/tmp', 'uploads'),
    path.resolve('/tmp', 'temp'),
    path.resolve('/tmp', 'pdfs'),
    path.resolve('/tmp', 'storage'),
    path.resolve(os.tmpdir(), 'uploads'),
    path.resolve(os.tmpdir(), 'temp'),
    path.resolve(os.tmpdir(), 'pdfs'),
    path.resolve('/tmp'),
  ];

  return allowedRoots.some(root => resolved.startsWith(root));
}

