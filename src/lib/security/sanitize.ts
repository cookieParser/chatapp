/**
 * Input sanitization utilities for XSS and injection prevention
 */

// HTML entities to escape
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove potentially dangerous HTML tags and attributes
 */
export function stripHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, 'data-blocked:');
}

/**
 * Sanitize message content - allows basic formatting but prevents XSS
 */
export function sanitizeMessage(content: string): string {
  if (typeof content !== 'string') return '';
  
  // First strip dangerous content
  let sanitized = content
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and their content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove event handlers
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: URLs
    .replace(/javascript\s*:/gi, '')
    // Remove data: URLs (potential XSS vector)
    .replace(/data\s*:/gi, 'data-blocked:')
    // Remove vbscript: URLs
    .replace(/vbscript\s*:/gi, '');
  
  // Escape remaining HTML entities
  sanitized = escapeHtml(sanitized);
  
  // Trim and limit length
  return sanitized.trim();
}

/**
 * Sanitize username/display name
 */
export function sanitizeUsername(username: string): string {
  if (typeof username !== 'string') return '';
  return escapeHtml(username.trim())
    .replace(/[<>'"]/g, '')
    .slice(0, 50);
}

/**
 * Sanitize conversation/channel name
 */
export function sanitizeName(name: string): string {
  if (typeof name !== 'string') return '';
  return escapeHtml(name.trim())
    .replace(/[<>'"]/g, '')
    .slice(0, 100);
}

/**
 * Sanitize file name to prevent path traversal
 */
export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== 'string') return 'file';
  return fileName
    .replace(/\.\./g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 255) || 'file';
}

/**
 * Sanitize URL to prevent javascript: and data: URLs
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  
  // Block dangerous protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return '';
  }
  
  return url.trim();
}

/**
 * Deep sanitize an object's string values
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  sanitizer: (str: string) => string = escapeHtml
): T {
  const result = { ...obj };
  
  for (const key in result) {
    const value = result[key];
    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = sanitizer(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = sanitizeObject(
        value as Record<string, unknown>,
        sanitizer
      );
    }
  }
  
  return result;
}
