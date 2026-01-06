import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary CDN Configuration
 * 
 * Optimized for chat media delivery:
 * - Automatic format selection (WebP, AVIF)
 * - Responsive images
 * - Lazy loading support
 * - CDN caching
 */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Always use HTTPS
});

// CDN base URL for direct access
const CDN_BASE_URL = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}`;

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  cdnUrl: string; // Optimized CDN URL
  format: string;
  resourceType: 'image' | 'video' | 'raw';
  bytes: number;
  width?: number;
  height?: number;
  originalFilename: string;
}

export interface CDNOptions {
  width?: number;
  height?: number;
  quality?: 'auto' | 'auto:low' | 'auto:eco' | 'auto:good' | 'auto:best' | number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  crop?: 'fill' | 'fit' | 'limit' | 'scale' | 'thumb';
  gravity?: 'auto' | 'face' | 'center';
  blur?: number;
  placeholder?: boolean; // Generate low-quality placeholder
}

/**
 * Upload file to Cloudinary with CDN optimization
 */
export async function uploadToCloudinary(
  file: Buffer,
  options: {
    folder?: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    filename?: string;
    eager?: Array<{ width?: number; height?: number; crop?: string }>;
  } = {}
): Promise<UploadResult> {
  const { folder = 'chat-uploads', resourceType = 'auto', filename, eager } = options;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: filename ? filename.replace(/\.[^/.]+$/, '') : undefined,
        // CDN Optimization settings
        eager: eager || [
          { width: 200, height: 200, crop: 'thumb', gravity: 'auto' }, // Thumbnail
          { width: 800, crop: 'limit' }, // Medium size
        ],
        eager_async: true, // Generate transformations asynchronously
        // Quality and format optimization
        quality: 'auto',
        fetch_format: 'auto',
        // Metadata
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        // Caching
        invalidate: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve({
            publicId: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            cdnUrl: getCDNUrl(result.public_id, { format: 'auto', quality: 'auto' }),
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

/**
 * Delete file from Cloudinary
 */
export async function deleteFromCloudinary(
  publicId: string, 
  resourceType: 'image' | 'video' | 'raw' = 'image'
) {
  return cloudinary.uploader.destroy(publicId, { 
    resource_type: resourceType,
    invalidate: true, // Invalidate CDN cache
  });
}

/**
 * Get optimized CDN URL with transformations
 */
export function getCDNUrl(publicId: string, options: CDNOptions = {}): string {
  const {
    width,
    height,
    quality = 'auto',
    format = 'auto',
    crop = 'limit',
    gravity,
    blur,
    placeholder = false,
  } = options;

  // Build transformation string
  const transformations: string[] = [];

  // Quality and format (always apply for optimization)
  transformations.push(`q_${quality}`);
  transformations.push(`f_${format}`);

  // Dimensions
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (width || height) transformations.push(`c_${crop}`);
  if (gravity) transformations.push(`g_${gravity}`);

  // Effects
  if (blur) transformations.push(`e_blur:${blur}`);

  // Placeholder (low quality image placeholder for lazy loading)
  if (placeholder) {
    return `${CDN_BASE_URL}/image/upload/w_50,q_10,e_blur:1000/${publicId}`;
  }

  const transformString = transformations.join(',');
  return `${CDN_BASE_URL}/image/upload/${transformString}/${publicId}`;
}

/**
 * Get responsive image srcset for different screen sizes
 */
export function getResponsiveSrcSet(
  publicId: string, 
  sizes: number[] = [320, 640, 960, 1280, 1920]
): string {
  return sizes
    .map(size => `${getCDNUrl(publicId, { width: size })} ${size}w`)
    .join(', ');
}

/**
 * Get video streaming URL with adaptive bitrate
 */
export function getVideoStreamUrl(publicId: string): {
  hls: string;
  dash: string;
  mp4: string;
} {
  return {
    hls: `${CDN_BASE_URL}/video/upload/sp_auto/${publicId}.m3u8`,
    dash: `${CDN_BASE_URL}/video/upload/sp_auto/${publicId}.mpd`,
    mp4: `${CDN_BASE_URL}/video/upload/q_auto/${publicId}.mp4`,
  };
}

/**
 * Get thumbnail URL for video
 */
export function getVideoThumbnail(publicId: string, options: CDNOptions = {}): string {
  const { width = 400, height = 300, quality = 'auto' } = options;
  return `${CDN_BASE_URL}/video/upload/w_${width},h_${height},c_fill,q_${quality},so_0/${publicId}.jpg`;
}

/**
 * Legacy function for backward compatibility
 */
export function getOptimizedUrl(
  publicId: string, 
  options: { width?: number; height?: number; quality?: number } = {}
) {
  return getCDNUrl(publicId, {
    width: options.width,
    height: options.height,
    quality: options.quality ? options.quality as CDNOptions['quality'] : 'auto',
  });
}

export default cloudinary;
