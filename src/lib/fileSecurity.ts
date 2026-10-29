// src/lib/fileSecurity.ts — Secure File Upload, Malware/Webshell Defense & Magic Bytes Validation
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
export const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // Strict 5MB limit per file

// Executable and script extensions that are strictly forbidden
export const FORBIDDEN_EXTENSIONS = new Set([
  '.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps', '.phar',
  '.exe', '.sh', '.bash', '.js', '.mjs', '.cjs', '.html', '.htm', '.svg',
  '.asp', '.aspx', '.jsp', '.jspx', '.cgi', '.pl', '.py', '.rb', '.bat',
  '.cmd', '.vbs', '.ps1', '.jar', '.war', '.bin', '.dll', '.so', '.com',
  '.scr', '.pif', '.wsf', '.hta', '.vbe', '.jse'
]);

// Magic byte signatures for authorized file types
const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46, 0x2D]; // %PDF-
const MAGIC_PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]; // \x89PNG\r\n\x1a\n
const MAGIC_JPG = [0xFF, 0xD8, 0xFF]; // JPEG SOI & marker

// Check if buffer starts with given magic byte sequence
function matchesMagic(buf: Buffer, magic: number[]): boolean {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) return false;
  }
  return true;
}

// Webshell and dangerous script signatures to check in content
const DANGEROUS_CONTENT_PATTERNS = [
  /<\?php/i,
  /<\?=/i,
  /<script[\s\S]*?>/i,
  /<html[\s\S]*?>/i,
  /<!doctype\s+html/i,
  /<%[\s\S]*?%>/i, // ASP tags
  /eval\s*\(/i,
  /base64_decode\s*\(/i,
  /system\s*\(/i,
  /passthru\s*\(/i,
  /shell_exec\s*\(/i,
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  canonicalExt?: string;
  mimeType?: string;
  sanitizedOriginalName?: string;
  storedFileName?: string;
}

/**
 * Validates an uploaded file against:
 * 1. Strict extension whitelist & dangerous script blacklist
 * 2. Multi-extension / double extension attacks (e.g. payload.php.png)
 * 3. File size ceiling (5MB max)
 * 4. Magic bytes matching the declared extension (anti-spoofing)
 * 5. Webshell / executable script signature scans
 *
 * Generates a cryptographically random UUID filename for disk storage.
 */
export function validateUploadedFile(
  filename: string,
  _declaredMime: string,
  buffer: Buffer
): FileValidationResult {
  // 1. Check for empty file
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Uploaded file is empty.' };
  }

  // 2. Enforce strict 5MB ceiling
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${filename}" exceeds the maximum allowed size of 5MB.`,
    };
  }

  // 3. Filename sanitation & traversal defense
  const rawBase = path.basename(filename).trim();
  if (!rawBase || rawBase.includes('\0') || rawBase.includes('/') || rawBase.includes('\\') || rawBase.includes('..')) {
    return { valid: false, error: 'Filename contains invalid or dangerous characters.' };
  }

  // 4. Multi-extension analysis (e.g. "image.php.jpg" or "shell.phtml.pdf")
  const parts = rawBase.toLowerCase().split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'File must have a valid extension (.pdf, .png, .jpg, .jpeg).' };
  }

  const finalExt = `.${parts[parts.length - 1]}`;

  // Check all segments for forbidden extensions
  for (let i = 1; i < parts.length; i++) {
    const extPart = `.${parts[i]}`;
    if (FORBIDDEN_EXTENSIONS.has(extPart)) {
      return {
        valid: false,
        error: `Executable or script extension "${extPart}" is strictly prohibited.`,
      };
    }
  }

  // Strict whitelist check
  if (!ALLOWED_EXTENSIONS.has(finalExt)) {
    return {
      valid: false,
      error: `Invalid file extension "${finalExt}". Only .pdf, .png, .jpg, and .jpeg are allowed.`,
    };
  }

  // 5. Magic Bytes / File Content Verification (Anti-Spoofing)
  let detectedType: 'pdf' | 'png' | 'jpg' | null = null;
  if (matchesMagic(buffer, MAGIC_PDF)) {
    detectedType = 'pdf';
  } else if (matchesMagic(buffer, MAGIC_PNG)) {
    detectedType = 'png';
  } else if (matchesMagic(buffer, MAGIC_JPG)) {
    detectedType = 'jpg';
  }

  if (!detectedType) {
    return {
      valid: false,
      error: `File content does not match allowed file formats. Only genuine PDF, PNG, and JPEG files are permitted.`,
    };
  }

  // Verify that detected magic matches the extension
  const extMatchesMagic =
    (detectedType === 'pdf' && finalExt === '.pdf') ||
    (detectedType === 'png' && finalExt === '.png') ||
    (detectedType === 'jpg' && (finalExt === '.jpg' || finalExt === '.jpeg'));

  if (!extMatchesMagic) {
    return {
      valid: false,
      error: `Extension spoofing detected: file extension "${finalExt}" does not match file signature (${detectedType.toUpperCase()}).`,
    };
  }

  // 6. Malware & Webshell Signature Inspection
  // Scan the first 4KB and last 4KB of the file
  const sampleHead = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf-8');
  const sampleTail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString('utf-8');
  const combinedSample = `${sampleHead}\n${sampleTail}`;

  for (const pattern of DANGEROUS_CONTENT_PATTERNS) {
    if (pattern.test(combinedSample)) {
      return {
        valid: false,
        error: 'Security alert: Suspicious script or webshell signature detected in file content.',
      };
    }
  }

  // 7. Canonical MIME type and safe metadata
  let canonicalMime = 'application/pdf';
  let canonicalExt = '.pdf';
  if (detectedType === 'png') {
    canonicalMime = 'image/png';
    canonicalExt = '.png';
  } else if (detectedType === 'jpg') {
    canonicalMime = 'image/jpeg';
    canonicalExt = finalExt === '.jpeg' ? '.jpeg' : '.jpg';
  }

  // Sanitize original filename for display (remove any unusual chars, max 120 chars)
  const safeName = rawBase
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

  // Cryptographically secure random identifier for disk storage
  const storedFileName = `${randomUUID()}${canonicalExt}`;

  return {
    valid: true,
    canonicalExt,
    mimeType: canonicalMime,
    sanitizedOriginalName: safeName,
    storedFileName,
  };
}
