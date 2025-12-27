import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  resourceType: 'image' | 'video' | 'raw';
  bytes: number;
  width?: number;
  height?: number;
  originalFilename: string;
}

export async function uploadToCloudinary(
  file: Buffer,
  options: {
    folder?: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    filename?: string;
  } = {}
): Promise<UploadResult> {
  const { folder = 'chat-uploads', resourceType = 'auto', filename } = options;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: filename ? filename.replace(/\.[^/.]+$/, '') : undefined,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve({
            publicId: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            format: result.format,
            resourceType: result.resource_type as 'image' | 'video' | 'raw',
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            originalFilename: result.original_filename,
          });
        }
      }
    );

    uploadStream.end(file);
  });
}

export async function deleteFromCloudinary(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

export function getOptimizedUrl(publicId: string, options: { width?: number; height?: number; quality?: number } = {}) {
  const { width, height, quality = 'auto' } = options;
  
  return cloudinary.url(publicId, {
    secure: true,
    quality,
    ...(width && { width }),
    ...(height && { height }),
    crop: width || height ? 'limit' : undefined,
  });
}

export default cloudinary;
