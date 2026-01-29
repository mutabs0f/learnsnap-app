import logger from './logger';

export interface OptimizationOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
}

const DEFAULT_OPTIONS: OptimizationOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 85,
  format: 'jpeg'
};

export async function optimizeImage(
  base64Image: string,
  options: Partial<OptimizationOptions> = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Extract image data
    const matches = base64Image.match(/^data:image\/([a-z]+);base64,(.+)$/);
    if (!matches) {
      logger.warn('Invalid image format, returning original');
      return base64Image;
    }
    
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const originalSize = imageBuffer.length;
    
    // Skip optimization for small images (< 1MB)
    if (originalSize < 1024 * 1024) {
      logger.info('Image already small, skipping optimization', {
        size: originalSize
      });
      return base64Image;
    }
    
    // Use sharp for image processing
    const sharp = await import('sharp');
    
    // Get original dimensions
    const metadata = await sharp.default(imageBuffer).metadata();
    
    // Determine if optimization is needed
    if (
      metadata.width! <= opts.maxWidth &&
      metadata.height! <= opts.maxHeight
    ) {
      // Only resize if needed, otherwise just compress
      const optimized = await sharp.default(imageBuffer)
        .jpeg({
          quality: opts.quality,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();
      
      const optimizedSize = optimized.length;
      const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
      
      logger.info('Image compressed', {
        originalSize,
        optimizedSize,
        savings: `${savings}%`
      });
      
      return `data:image/${opts.format};base64,${optimized.toString('base64')}`;
    }
    
    // Optimize with resize
    const optimized = await sharp.default(imageBuffer)
      .resize(opts.maxWidth, opts.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: opts.quality,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
    
    const optimizedSize = optimized.length;
    const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
    
    logger.info('Image optimized', {
      originalSize,
      optimizedSize,
      savings: `${savings}%`,
      originalDimensions: `${metadata.width}x${metadata.height}`
    });
    
    return `data:image/${opts.format};base64,${optimized.toString('base64')}`;
  } catch (error) {
    logger.error('Image optimization failed', {
      error: (error as Error).message
    });
    // Return original on error
    return base64Image;
  }
}

export async function optimizeImages(
  images: string[],
  options?: Partial<OptimizationOptions>
): Promise<string[]> {
  return Promise.all(
    images.map(img => optimizeImage(img, options))
  );
}

export function estimateOptimizationSavings(
  originalSizeMB: number,
  targetQuality: number = 85
): {
  estimatedSizeMB: number;
  estimatedSavings: number;
  estimatedCostSavings: number;
} {
  // Rough estimation based on JPEG compression
  const compressionRatio = targetQuality / 100;
  const estimatedSizeMB = originalSizeMB * compressionRatio * 0.4;
  const estimatedSavings = ((originalSizeMB - estimatedSizeMB) / originalSizeMB * 100);
  
  // Gemini pricing estimate
  const estimatedCostSavings = (originalSizeMB - estimatedSizeMB) * 0.002;
  
  return {
    estimatedSizeMB: parseFloat(estimatedSizeMB.toFixed(2)),
    estimatedSavings: parseFloat(estimatedSavings.toFixed(1)),
    estimatedCostSavings: parseFloat(estimatedCostSavings.toFixed(4))
  };
}

/**
 * Smart optimization based on content analysis
 * Adjusts quality and resolution based on image characteristics
 */
export async function smartOptimize(
  base64Image: string,
  contentType: 'standard' | 'high-quality' | 'max-quality' = 'standard'
): Promise<string> {
  try {
    const matches = base64Image.match(/^data:image\/([a-z]+);base64,(.+)$/);
    if (!matches) {
      logger.warn('Invalid image format, returning original');
      return base64Image;
    }
    
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const originalSize = imageBuffer.length;
    
    // Skip optimization for images under 1MB (faster processing)
    if (originalSize < 1024 * 1024) {
      logger.info('Image under 1MB, skipping optimization', {
        size: (originalSize / 1024).toFixed(2) + ' KB'
      });
      return base64Image;
    }
    
    const sharp = await import('sharp');
    const metadata = await sharp.default(imageBuffer).metadata();
    
    // Determine optimization settings based on content type
    let targetWidth: number;
    let quality: number;
    
    switch (contentType) {
      case 'max-quality':
        // No optimization, return original for sensitive content
        logger.info('Max quality mode, skipping optimization');
        return base64Image;
        
      case 'high-quality':
        // Higher quality for small text or complex content
        targetWidth = 2560;
        quality = 90;
        break;
        
      case 'standard':
      default:
        // Standard optimization for most cases
        targetWidth = 2048;
        quality = 85;
        break;
    }
    
    // Skip resize if image is already smaller than target
    const needsResize = metadata.width! > targetWidth || metadata.height! > targetWidth;
    
    if (!needsResize && originalSize < 2 * 1024 * 1024) {
      // Image is already optimal size
      logger.info('Image already optimal, skipping', {
        width: metadata.width,
        height: metadata.height,
        size: (originalSize / 1024 / 1024).toFixed(2) + ' MB'
      });
      return base64Image;
    }
    
    // Apply optimization
    let sharpInstance = sharp.default(imageBuffer);
    
    if (needsResize) {
      sharpInstance = sharpInstance.resize(targetWidth, targetWidth, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3' // Best quality for text
      });
    }
    
    const optimized = await sharpInstance
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
    
    const optimizedSize = optimized.length;
    const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
    
    logger.info('Smart optimization completed', {
      contentType,
      originalSize: (originalSize / 1024 / 1024).toFixed(2) + ' MB',
      optimizedSize: (optimizedSize / 1024 / 1024).toFixed(2) + ' MB',
      savings: savings + '%',
      resolution: needsResize ? `${targetWidth}px` : 'original',
      quality: quality + '%'
    });
    
    return `data:image/jpeg;base64,${optimized.toString('base64')}`;
    
  } catch (error) {
    logger.error('Smart optimization failed', {
      error: (error as Error).message
    });
    // Return original on error
    return base64Image;
  }
}

/**
 * Smart batch optimization
 */
export async function smartOptimizeImages(
  images: string[],
  contentType: 'standard' | 'high-quality' | 'max-quality' = 'standard'
): Promise<string[]> {
  logger.info('Starting smart batch optimization', {
    count: images.length,
    contentType
  });
  
  const results = await Promise.all(
    images.map(img => smartOptimize(img, contentType))
  );
  
  logger.info('Batch optimization completed', {
    count: results.length
  });
  
  return results;
}
