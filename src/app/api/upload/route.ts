import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadToCloudinary } from '@/lib/cloudinary';
import {
  checkApiRateLimit,
  secureResponse,
  errorResponse,
  RATE_LIMITS,
  sanitizeFileName,
} from '@/lib/security';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
];

// Dangerous file extensions to block
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar',
  '.msi', '.dll', '.scr', '.pif', '.com', '.hta', '.cpl',
];

export async function POST(request: NextRequest) {
  try {
    // Rate limit uploads
    const rateLimit = checkApiRateLimit(request, 'upload', RATE_LIMITS.API_UPLOAD);
    if (!rateLimit.allowed) return rateLimit.response!;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('No file provided');
    }

    // Sanitize filename and check for dangerous extensions
    const sanitizedName = sanitizeFileName(file.name);
    const lowerName = sanitizedName.toLowerCase();
    
    if (BLOCKED_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
      return errorResponse('File type not allowed for security reasons');
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('File size exceeds 10MB limit');
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return errorResponse('File type not allowed');
    }

    // Additional check: verify file signature matches claimed type
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Basic magic number validation for images
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const isValidImage = validateImageMagicNumber(buffer, file.type);
      if (!isValidImage) {
        return errorResponse('File content does not match declared type');
      }
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const resourceType = isImage ? 'image' : file.type.startsWith('video/') ? 'video' : 'raw';

    const result = await uploadToCloudinary(buffer, {
      folder: `chat-uploads/${session.user.id}`,
      resourceType,
      filename: sanitizedName,
    });

    return secureResponse({
      success: true,
      media: {
        publicId: result.publicId,
        url: result.secureUrl,
        filename: sanitizedName,
        mimeType: file.type,
        size: result.bytes,
        width: result.width,
        height: result.height,
        resourceType: result.resourceType,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse('Upload failed', 500);
  }
}

/**
 * Validate image magic numbers to prevent disguised malicious files
 */
function validateImageMagicNumber(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  
  const magicNumbers: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF87a or GIF89a
    'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  };
  
  const expected = magicNumbers[mimeType];
  if (!expected) return true; // Unknown type, skip validation
  
  return expected.some(magic => 
    magic.every((byte, index) => buffer[index] === byte)
  );
}
