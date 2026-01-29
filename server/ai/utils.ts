import logger from "../logger.js";
import type { ImageData } from "./types.js";

export function extractBase64(dataUrl: string): ImageData {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL format");
  }
  return { mimeType: matches[1], data: matches[2] };
}

export function sanitizeDiagram(diagram: string | undefined): string | undefined {
  if (!diagram || typeof diagram !== 'string') return undefined;
  
  const trimmed = diagram.trim();
  
  if (!trimmed.toLowerCase().startsWith('<svg') || !trimmed.toLowerCase().endsWith('</svg>')) {
    logger.warn("Dropping invalid diagram - not valid SVG structure");
    return undefined;
  }
  
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<foreignobject/i,
    /<embed/i,
    /<object/i,
    /data:\s*text\/html/i,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(diagram)) {
      logger.warn("Dropping dangerous diagram - contains blocked pattern", { pattern: pattern.source });
      return undefined;
    }
  }
  
  return trimmed;
}
