import { Router, Request, Response } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import logger from "./logger";
import rateLimit from "express-rate-limit";
import { getDeviceTokenSecret } from "./env-helpers";

const router = Router();

// LemonSqueezy package configuration (single source of truth)
// Pricing: 10 pages = 5 SAR, 25 pages = 12 SAR, 60 pages = 25 SAR, 150 pages = 55 SAR
export const LEMONSQUEEZY_PACKAGES = [
  { id: "basic", variantId: "1168542", pages: 10, price: 500, pricePerPage: 50, name: "الأساسية" },
  { id: "popular", variantId: "1168599", pages: 25, price: 1200, pricePerPage: 48, name: "الشائعة", badge: "الأكثر شيوعاً" },
  { id: "best", variantId: "1168600", pages: 60, price: 2500, pricePerPage: 42, name: "الأفضل قيمة", badge: "أفضل قيمة" },
  { id: "family", variantId: "1168614", pages: 150, price: 5500, pricePerPage: 37, name: "العائلية" },
];

// Variant ID to pages mapping (from config)
const VARIANT_TO_PAGES: Record<string, number> = LEMONSQUEEZY_PACKAGES.reduce((acc, pkg) => {
  acc[pkg.variantId] = pkg.pages;
  return acc;
}, {} as Record<string, number>);

// Rate limiter for checkout (uses default IP-based key generator)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 checkout attempts per hour
  message: { error: "محاولات دفع كثيرة - انتظر ساعة" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation warning
});

// Rate limiter for device token issue (uses default IP-based key generator)
const deviceIssueLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 token issues per hour per IP
  message: { error: "طلبات كثيرة" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Verify webhook signature using raw body
function verifyWebhookSignature(rawBody: Buffer | string, signature: string, secret: string): boolean {
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(payload).digest("hex");
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(digest, "hex")
    );
  } catch {
    return false;
  }
}

// Generate device token (HMAC signed)
function generateDeviceToken(deviceId: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(deviceId);
  return hmac.digest("hex");
}

// Verify device token
function verifyDeviceToken(deviceId: string, token: string, secret: string): boolean {
  const expected = generateDeviceToken(deviceId, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

// [6] GET /api/billing/packs - Returns packages from server (no IDs in frontend)
router.get("/billing/packs", (req: Request, res: Response) => {
  res.json({
    packages: LEMONSQUEEZY_PACKAGES.map(pkg => ({
      id: pkg.id,
      variantId: pkg.variantId,
      pages: pkg.pages,
      price: pkg.price,
      pricePerPage: pkg.pricePerPage,
      name: pkg.name,
      badge: pkg.badge,
    }))
  });
});

// [2] POST /api/device/issue - Issue device token
router.post("/device/issue", deviceIssueLimiter, (req: Request, res: Response) => {
  const tokenSecret = getDeviceTokenSecret();
  
  if (!tokenSecret) {
    logger.error("Device token secret not configured");
    return res.status(500).json({ error: "Server configuration error" });
  }

  let { deviceId } = req.body;
  
  // Generate new device ID if not provided
  if (!deviceId) {
    deviceId = crypto.randomUUID();
  }
  
  if (typeof deviceId !== "string" || deviceId.length > 100) {
    return res.status(400).json({ error: "Invalid device ID" });
  }

  const token = generateDeviceToken(deviceId, tokenSecret);
  
  // Set token in httpOnly cookie
  res.cookie("device_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  });
  
  res.json({ deviceId, token });
});

// Device token verification middleware
export function requireDeviceToken(req: Request, res: Response, next: () => void) {
  const tokenSecret = getDeviceTokenSecret();
  
  if (!tokenSecret) {
    logger.error("Token secret not configured");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const deviceId = req.body?.deviceId || req.params?.deviceId;
  const token = req.cookies?.device_token || req.headers["x-device-token"];
  
  if (!deviceId || !token) {
    return res.status(401).json({ 
      error: "معرف الجهاز غير صالح",
      code: "INVALID_DEVICE_TOKEN" 
    });
  }
  
  if (!verifyDeviceToken(deviceId, token, tokenSecret)) {
    logger.warn("Invalid device token", { deviceId: deviceId.substring(0, 8) + "..." });
    return res.status(401).json({ 
      error: "معرف الجهاز غير صالح",
      code: "INVALID_DEVICE_TOKEN" 
    });
  }
  
  next();
}

// [IMPROVEMENT 1] Webhook endpoint for LemonSqueezy with proper status-based idempotency
router.post("/webhooks/lemonsqueezy", async (req: Request, res: Response) => {
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  // Get signature from header
  const signature = req.headers["x-signature"] as string;
  if (!signature) {
    logger.warn("LemonSqueezy webhook: Missing signature");
    return res.status(400).json({ error: "Missing signature" });
  }

  // Use raw body (Buffer) for signature verification
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  // Signature invalid => 400
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    logger.warn("LemonSqueezy webhook: Invalid signature");
    return res.status(400).json({ error: "Invalid signature" });
  }

  let eventId: string | undefined;
  let eventName: string | undefined;
  
  try {
    // Parse body if it's a Buffer
    const body = Buffer.isBuffer(req.body) ? JSON.parse(rawBody.toString('utf8')) : req.body;
    const { meta, data } = body;
    eventName = meta?.event_name;
    eventId = String(meta?.event_id || data?.id || `${Date.now()}_${Math.random()}`);

    logger.info(`LemonSqueezy webhook received: ${eventName}`, {
      eventId,
      orderId: data?.id,
      customData: meta?.custom_data,
    });

    // [FIX v4] Atomic upsert with canProcess flag for proper idempotency
    // - canProcess = true: this worker should process (new insert or retry from failed)
    // - canProcess = false: another worker owns it (processing) or it's already done (succeeded)
    const { status: existingStatus, isNew, canProcess, previousStatus } = await storage.upsertWebhookEventForProcessing(
      eventId, 
      eventName || "unknown"
    );
    
    // Short-circuit: already succeeded - nothing to do
    if (existingStatus === "succeeded") {
      logger.info("Webhook already processed successfully - no-op", { eventId });
      return res.status(200).json({ received: true, duplicate: true });
    }
    
    // Short-circuit: another worker is currently processing this event
    if (!canProcess) {
      logger.info("Webhook being processed by another worker - skipping", { 
        eventId, 
        currentStatus: existingStatus 
      });
      return res.status(200).json({ received: true, inProgress: true });
    }
    
    if (!isNew && previousStatus === 'failed') {
      logger.info("Webhook retry from failed state", { eventId, previousStatus });
    }

    // Process the event - we have exclusive claim
    if (eventName === "order_created") {
      await handleOrderCreated(data, meta, eventId);
    } else if (eventName === "order_refunded") {
      await handleOrderRefunded(data, meta, eventId);
    }

    // Update event status to succeeded
    await storage.updateWebhookEventStatus(eventId, "succeeded");

    logger.info("Webhook processed successfully", { eventId, eventName, orderId: data?.id });
    return res.status(200).json({ received: true });
  } catch (error) {
    // Server/DB failure => 500 (so LemonSqueezy retries)
    const errorMessage = (error as Error).message;
    logger.error("LemonSqueezy webhook failed", { eventId, eventName, error: errorMessage });
    
    // Mark event as failed with error message if we have eventId
    if (eventId) {
      try {
        await storage.updateWebhookEventStatus(eventId, "failed", errorMessage);
      } catch (updateError) {
        logger.error("Failed to update webhook event status", { eventId, error: (updateError as Error).message });
      }
    }
    
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

async function handleOrderCreated(data: any, meta: any, eventId: string) {
  const orderId = data?.id;
  const attributes = data?.attributes;
  const customData = meta?.custom_data || {};
  
  // Get device ID from custom data (passed during checkout)
  const deviceId = customData.device_id;
  const userId = customData.user_id;
  
  if (!deviceId) {
    logger.error("LemonSqueezy order missing device_id", { orderId, eventId });
    // Throw error so status becomes failed and webhook can be retried if device_id is added
    throw new Error("missing_device_id");
  }

  // Get variant ID to determine pages
  const firstOrderItem = attributes?.first_order_item;
  const variantId = String(firstOrderItem?.variant_id || "");
  
  // Determine pages from variant mapping (trusted server config)
  let pages = VARIANT_TO_PAGES[variantId];
  
  // Fallback: use pages from custom data if variant not mapped
  if (!pages && customData.pages) {
    pages = parseInt(customData.pages, 10);
  }
  
  // Fallback: determine from price (SAR)
  if (!pages) {
    const totalSar = (attributes?.total || 0) / 100;
    if (totalSar >= 55) pages = 150;
    else if (totalSar >= 25) pages = 60;
    else if (totalSar >= 12) pages = 25;
    else if (totalSar >= 5) pages = 10;
    else pages = 0;
  }

  if (pages <= 0) {
    logger.error("Could not determine pages for order", { orderId, variantId, eventId });
    throw new Error("invalid_pages");
  }

  // Check existing transaction (safety check - prevents double credit add)
  const existingTransaction = await storage.getTransactionByPaymentId(`ls_${orderId}`);
  if (existingTransaction) {
    logger.info("Order already processed via transaction check", { orderId, eventId });
    return; // Success - already processed
  }

  // Add credits to device
  const totalSar = (attributes?.total || 0) / 100;
  
  // Create transaction and add credits atomically (NO bonus pages)
  await storage.createTransactionAndAddCredits({
    deviceId,
    pagesPurchased: pages,
    amount: Math.round(totalSar * 100), // Store in halalas
    paymentId: `ls_${orderId}`,
  });

  // [IMPROVEMENT 1] NO duplicate createWebhookEvent here - status is updated by caller

  logger.info("LemonSqueezy order processed successfully", {
    orderId,
    deviceId,
    pages,
    amount: totalSar,
    eventId,
  });
}

async function handleOrderRefunded(data: any, meta: any, eventId: string) {
  const orderId = data?.id;
  const customData = meta?.custom_data || {};
  const deviceId = customData.device_id;
  const attributes = data?.attributes;

  logger.info("Processing refund", { orderId, deviceId, eventId });

  if (!deviceId) {
    logger.error("Refund missing device_id", { orderId, eventId });
    throw new Error("missing_device_id");
  }

  // Get the original transaction to know how many pages were purchased
  const transaction = await storage.getTransactionByPaymentId(`ls_${orderId}`);
  
  if (transaction) {
    const pagesToDeduct = transaction.pagesPurchased;
    
    // Try to deduct pages
    const deducted = await storage.deductPageCredits(deviceId, pagesToDeduct);
    
    if (!deducted) {
      // If can't deduct (user already used pages), put account on hold
      await storage.setDeviceStatus(deviceId, "on_hold");
      logger.warn("Account put on hold due to refund with used pages", { 
        orderId, 
        deviceId, 
        pagesToDeduct,
        eventId,
      });
    } else {
      logger.info("Credits deducted for refund", { 
        orderId, 
        deviceId, 
        pagesToDeduct,
        eventId,
      });
    }
  } else {
    // No transaction found, put account on hold as precaution
    await storage.setDeviceStatus(deviceId, "on_hold");
    logger.warn("Account put on hold due to refund (no transaction found)", { orderId, deviceId, eventId });
  }

  // [IMPROVEMENT 1] NO duplicate createWebhookEvent here - status is updated by caller
}

// Create checkout URL with rate limiting and device token verification
router.post("/lemonsqueezy/checkout", checkoutLimiter, async (req: Request, res: Response) => {
  const tokenSecret = getDeviceTokenSecret();
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const appUrl = process.env.APP_URL;
  
  if (!apiKey) {
    logger.error("LEMONSQUEEZY_API_KEY not configured");
    return res.status(500).json({ error: "Payment service not configured" });
  }
  
  if (!storeId) {
    logger.error("LEMONSQUEEZY_STORE_ID not configured");
    return res.status(500).json({ error: "Payment service not configured" });
  }
  
  if (!appUrl) {
    logger.error("APP_URL not configured");
    return res.status(500).json({ error: "App URL not configured" });
  }

  const { variantId, deviceId, userId } = req.body;

  if (!variantId || !deviceId) {
    return res.status(400).json({ error: "Missing variantId or deviceId" });
  }

  // [Security] Verify device token to prevent deviceId spoofing
  if (tokenSecret) {
    const token = req.cookies?.device_token || req.headers["x-device-token"];
    if (!token) {
      logger.warn("Checkout attempted without device token", { deviceId: deviceId?.substring(0, 8) });
      // Hard enforcement in production
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ 
          error: "جلسة منتهية - أعد تحميل الصفحة",
          code: "INVALID_DEVICE_TOKEN" 
        });
      }
    } else if (!verifyDeviceToken(deviceId, token as string, tokenSecret)) {
      logger.warn("Invalid device token on checkout", { deviceId: deviceId?.substring(0, 8) });
      return res.status(401).json({ 
        error: "معرف الجهاز غير صالح",
        code: "INVALID_DEVICE_TOKEN" 
      });
    }
  }

  // Validate variantId against known packages (server-side validation)
  const pkg = LEMONSQUEEZY_PACKAGES.find(p => p.variantId === String(variantId));
  if (!pkg) {
    logger.warn("Invalid variant ID attempted", { variantId });
    return res.status(400).json({ error: "باقة غير صالحة" });
  }

  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              custom: {
                device_id: String(deviceId),
                user_id: userId ? String(userId) : "",
                pages: String(pkg.pages), // Include pages for fallback
              },
            },
            product_options: {
              redirect_url: `${appUrl}/payment-success`,
            },
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: String(storeId),
              },
            },
            variant: {
              data: {
                type: "variants",
                id: String(variantId),
              },
            },
          },
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error("LemonSqueezy checkout creation failed", {
        status: response.status,
        errors: result.errors,
        variantId,
      });
      const errorMessage = result.errors?.[0]?.detail || "Failed to create checkout";
      return res.status(400).json({ error: errorMessage });
    }

    const checkoutUrl = result.data?.attributes?.url;
    res.json({ checkoutUrl, pages: pkg.pages, price: pkg.price });
  } catch (error) {
    logger.error("LemonSqueezy checkout error:", error);
    res.status(500).json({ error: "Checkout creation failed" });
  }
});

// Export for use in other modules
export { verifyDeviceToken };
export default router;
