import { Router, Request, Response } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import logger from "./logger";
import rateLimit from "express-rate-limit";
import { getDeviceTokenSecret } from "./env-helpers";
import { maskId } from "./utils/helpers";
import { createCsrfProtection } from "./security";

const csrfProtection = createCsrfProtection();

const router = Router();

// Paylink package configuration (single source of truth)
// Pricing: 10 pages = 5 SAR, 25 pages = 12 SAR, 60 pages = 25 SAR, 150 pages = 55 SAR
export const PAYLINK_PACKAGES = [
  { id: "basic", pages: 10, price: 500, pricePerPage: 50, name: "الأساسية" },
  { id: "popular", pages: 25, price: 1200, pricePerPage: 48, name: "الشائعة", badge: "الأكثر شيوعاً" },
  { id: "best", pages: 60, price: 2500, pricePerPage: 42, name: "الأفضل قيمة", badge: "أفضل قيمة" },
  { id: "family", pages: 150, price: 5500, pricePerPage: 37, name: "العائلية" },
];

// Paylink API base URLs
const PAYLINK_BASE_URLS = {
  testing: "https://restpilot.paylink.sa",
  production: "https://restapi.paylink.sa",
};

// Get Paylink base URL based on environment
function getPaylinkBaseUrl(): string {
  const env = process.env.PAYLINK_ENVIRONMENT || "testing";
  return PAYLINK_BASE_URLS[env as keyof typeof PAYLINK_BASE_URLS] || PAYLINK_BASE_URLS.testing;
}

// Rate limiter for checkout (uses default IP-based key generator)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 checkout attempts per hour
  message: { error: "محاولات دفع كثيرة - انتظر ساعة" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
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

// Cache for Paylink auth token
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get Paylink authentication token
async function getPaylinkToken(): Promise<string> {
  // Check if we have a valid cached token (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const apiId = process.env.PAYLINK_API_ID;
  const secretKey = process.env.PAYLINK_SECRET_KEY;

  if (!apiId || !secretKey) {
    throw new Error("Paylink credentials not configured");
  }

  const baseUrl = getPaylinkBaseUrl();
  
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      apiId,
      secretKey,
      persistToken: true, // 30 hours validity
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("Paylink auth failed", { status: response.status, error });
    throw new Error("Failed to authenticate with Paylink");
  }

  const data = await response.json();
  const token = data.id_token;

  // Cache token for 29 hours (slightly less than 30 hour validity)
  cachedToken = {
    token,
    expiresAt: Date.now() + 29 * 60 * 60 * 1000,
  };

  return token;
}

// Verify webhook signature using HMAC
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

// GET /api/billing/packs - Returns packages from server
router.get("/billing/packs", (req: Request, res: Response) => {
  res.json({
    packages: PAYLINK_PACKAGES.map(pkg => ({
      id: pkg.id,
      pages: pkg.pages,
      price: pkg.price,
      pricePerPage: pkg.pricePerPage,
      name: pkg.name,
      badge: pkg.badge,
    }))
  });
});

// POST /api/device/issue - Issue device token
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

// POST /api/payment/create - Create Paylink invoice
// [SECURITY v3.2.0] Added CSRF protection
router.post("/payment/create", checkoutLimiter, csrfProtection, async (req: Request, res: Response) => {
  const tokenSecret = getDeviceTokenSecret();
  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL;
  
  if (!process.env.PAYLINK_API_ID || !process.env.PAYLINK_SECRET_KEY) {
    logger.error("Paylink credentials not configured");
    return res.status(500).json({ error: "Payment service not configured" });
  }
  
  if (!appUrl) {
    logger.error("FRONTEND_URL or APP_URL not configured");
    return res.status(500).json({ error: "App URL not configured" });
  }

  const { packageId, deviceId, clientName, clientMobile, clientEmail } = req.body;

  if (!packageId || !deviceId) {
    return res.status(400).json({ error: "Missing packageId or deviceId" });
  }

  // Verify device token to prevent deviceId spoofing
  if (tokenSecret) {
    const token = req.cookies?.device_token || req.headers["x-device-token"];
    if (!token) {
      logger.warn("Checkout attempted without device token", { deviceId: deviceId?.substring(0, 8) });
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

  // [FIX v2.9.28 P0.1] Get userId if user is logged in
  // If Authorization header exists but invalid/expired → 401 (NO silent guest fallback)
  let paymentUserId: string | null = null;
  const authHeader = req.headers.authorization;
  const authHeaderPresent = !!(authHeader && authHeader.startsWith("Bearer "));

  if (authHeaderPresent) {
    const sessionToken = authHeader!.substring(7);
    try {
      const session = await storage.getUserSession(sessionToken);
      if (session) {
        if (new Date(session.expiresAt) > new Date()) {
          paymentUserId = session.userId;
        } else {
          // [P0.1] Session expired - do NOT fall back to guest
          logger.warn("[P0.1] Payment create: session expired", {
            authHeaderPresent: true,
            authValid: false,
            deviceId: deviceId?.substring(0, 8) || null,
            resolvedUserId: null,
          });
          return res.status(401).json({
            error: "انتهت صلاحية الجلسة - سجل الدخول مرة أخرى",
            code: "SESSION_EXPIRED",
          });
        }
      } else {
        // [P0.1] Invalid session token - do NOT fall back to guest
        logger.warn("[P0.1] Payment create: invalid session token", {
          authHeaderPresent: true,
          authValid: false,
          deviceId: deviceId?.substring(0, 8) || null,
          resolvedUserId: null,
        });
        return res.status(401).json({
          error: "جلسة غير صالحة - سجل الدخول مرة أخرى",
          code: "INVALID_SESSION",
        });
      }
    } catch (e) {
      // [P0.1] Auth error - do NOT fall back to guest
      logger.error("[P0.1] Payment create: auth error", {
        authHeaderPresent: true,
        authValid: false,
        deviceId: deviceId?.substring(0, 8) || null,
        resolvedUserId: null,
        error: (e as Error).message,
      });
      return res.status(401).json({
        error: "خطأ في المصادقة - سجل الدخول مرة أخرى",
        code: "AUTH_ERROR",
      });
    }
  }

  // [P0.1] Structured log: auth resolution
  logger.info("[P0.1] Payment create: auth resolved", {
    authHeaderPresent,
    authValid: authHeaderPresent ? !!paymentUserId : null,
    deviceId: deviceId?.substring(0, 8) || null,
    resolvedUserId: paymentUserId?.substring(0, 8) || null,
  });

  // Determine target for credits - use user_<id> if logged in, otherwise deviceId
  const targetOwnerId = paymentUserId ? `user_${paymentUserId}` : deviceId;

  // Validate packageId against known packages (server-side validation)
  const pkg = PAYLINK_PACKAGES.find(p => p.id === String(packageId));
  if (!pkg) {
    logger.warn("Invalid package ID attempted", { packageId });
    return res.status(400).json({ error: "باقة غير صالحة" });
  }

  try {
    const paylinkToken = await getPaylinkToken();
    const baseUrl = getPaylinkBaseUrl();
    
    // Generate unique order number
    const orderNumber = `LS_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Amount in SAR (price is stored in halalas, divide by 100)
    const amountSar = pkg.price / 100;

    const invoiceData = {
      orderNumber,
      amount: amountSar,
      callBackUrl: `${appUrl}/payment-success?orderId=${orderNumber}&deviceId=${deviceId}&pages=${pkg.pages}`,
      cancelUrl: `${appUrl}/pricing`,
      clientName: clientName || "Customer",
      clientEmail: clientEmail || "",
      clientMobile: clientMobile || "0500000000",
      currency: "SAR",
      products: [
        {
          title: `LearnSnap - ${pkg.pages} صفحة`,
          price: amountSar,
          qty: 1,
          description: `باقة ${pkg.name} - ${pkg.pages} صفحة لتوليد الاختبارات`,
          isDigital: true,
        }
      ],
      supportedCardBrands: [
        "mada",
        "visaMastercard",
        "amex",
        "stcpay",
        "urpay",
        "tabby",
        "tamara",
      ],
      displayPending: true,
      note: JSON.stringify({ deviceId: targetOwnerId, userId: paymentUserId, packageId: pkg.id, pages: pkg.pages }),
    };

    const response = await fetch(`${baseUrl}/api/addInvoice`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paylinkToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoiceData),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      logger.error("Paylink invoice creation failed", {
        status: response.status,
        error: result,
        packageId,
      });
      return res.status(400).json({ error: result.detail || "Failed to create payment" });
    }

    // [FIX v2.9.17] Save pending payment with targetOwnerId instead of raw deviceId
    // This ensures credits go to the right place even if note parsing fails
    try {
      await storage.createPendingPayment({
        orderNumber,
        transactionNo: result.transactionNo,
        deviceId: targetOwnerId, // [FIX] Use targetOwnerId (user_<id> for logged-in users)
        pages: pkg.pages,
        amount: pkg.price,
      });
    } catch (err) {
      logger.warn("Failed to save pending payment (may already exist)", { orderNumber });
    }

    logger.info("Paylink invoice created", {
      orderNumber,
      transactionNo: result.transactionNo,
      deviceId: deviceId.substring(0, 8) + "...",
      pages: pkg.pages,
    });

    res.json({ 
      paymentUrl: result.url,
      mobileUrl: result.mobileUrl,
      transactionNo: result.transactionNo,
      orderNumber,
      pages: pkg.pages, 
      price: pkg.price,
    });
  } catch (error) {
    logger.error("Paylink checkout error:", error);
    res.status(500).json({ error: "فشل إنشاء رابط الدفع" });
  }
});

// POST /api/payment/verify - Verify payment status
// [v2.9.26] pending_payments is authoritative for ownerId and pageCount
router.post("/payment/verify", async (req: Request, res: Response) => {
  let { transactionNo, orderNumber, deviceId: reqDeviceId, pages: reqPages } = req.body;

  // [v2.9.26] Lookup pending_payments by orderNumber - this is authoritative
  let pendingPayment: any = null;
  let pendingFound = false;
  
  if (orderNumber) {
    try {
      pendingPayment = await storage.getPendingPaymentByOrderNumber(orderNumber);
      if (pendingPayment) {
        pendingFound = true;
        // Use pending payment's transactionNo if not provided
        transactionNo = transactionNo || pendingPayment.transactionNo;
      }
    } catch (err) {
      logger.error("[verify v2.9.26] Failed to lookup pending payment", { orderNumber, error: (err as Error).message });
    }
  }

  // Require transactionNo for verification
  if (!transactionNo) {
    logger.warn("[verify v2.9.26] Payment verification failed - no transactionNo", { 
      orderNumber, 
      pendingFound,
      reqDeviceId: reqDeviceId?.substring(0, 8) 
    });
    return res.status(400).json({ 
      error: "Missing transactionNo",
      code: "MISSING_TRANSACTION_NO",
      orderNumber,
      suggestion: "حاول مرة أخرى أو تواصل مع الدعم"
    });
  }

  try {
    const paylinkToken = await getPaylinkToken();
    const baseUrl = getPaylinkBaseUrl();
    
    const response = await fetch(`${baseUrl}/api/getInvoice/${transactionNo}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${paylinkToken}`,
        "Accept": "application/json",
      },
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error("[verify v2.9.26] Paylink invoice fetch failed", { transactionNo, error: result });
      return res.status(400).json({ error: "Failed to verify payment" });
    }

    const orderStatus = result.orderStatus;
    
    // Check if payment was successful
    if (orderStatus === "PAID") {
      // Parse metadata from note field (for logging mismatch only)
      let metadata: any = {};
      try {
        metadata = JSON.parse(result.gatewayOrderRequest?.note || "{}");
      } catch {
        // Ignore - will use pending_payments as authoritative
      }

      // [v2.9.26] pending_payments is authoritative for ownerId and pageCount
      // Ignore req.body.deviceId if pending found
      let finalOwnerId: string;
      let pageCount: number;
      
      if (pendingFound && pendingPayment) {
        finalOwnerId = pendingPayment.deviceId; // This is the ownerId (user_xxx or deviceId)
        pageCount = pendingPayment.pages;
        
        // Log mismatch if metadata differs
        if (metadata.deviceId && metadata.deviceId !== finalOwnerId) {
          logger.warn("[verify v2.9.26] Metadata deviceId mismatch with pending_payments", {
            transactionNo,
            metadataDeviceId: metadata.deviceId?.substring(0, 8),
            pendingDeviceId: finalOwnerId.substring(0, 8),
          });
        }
        if (metadata.pages && metadata.pages !== pageCount) {
          logger.warn("[verify v2.9.26] Metadata pages mismatch with pending_payments", {
            transactionNo,
            metadataPages: metadata.pages,
            pendingPages: pageCount,
          });
        }
      } else {
        // Fallback: use metadata or request params
        finalOwnerId = metadata.deviceId || reqDeviceId;
        pageCount = metadata.pages || parseInt(reqPages) || 0;
      }

      if (!finalOwnerId) {
        logger.error("[verify v2.9.26] Payment verification missing ownerId", { 
          transactionNo, 
          orderNumber,
          pendingFound 
        });
        return res.status(400).json({ error: "Missing device ID" });
      }

      // Check if already processed (idempotency)
      const existingTransaction = await storage.getTransactionByPaymentId(`pl_${transactionNo}`);
      const alreadyProcessed = !!existingTransaction;
      
      // [v2.9.26] Structured log line
      logger.info("[verify v2.9.26] Payment verification", {
        orderNumber,
        transactionNo,
        pendingFound,
        finalOwnerId: finalOwnerId.substring(0, 12) + "...",
        pageCount,
        alreadyProcessed,
      });
      
      if (alreadyProcessed) {
        return res.json({ 
          status: "paid", 
          alreadyProcessed: true,
          pages: existingTransaction.pagesPurchased,
        });
      }

      // Add credits
      const amountHalalas = Math.round((result.amount || 0) * 100);
      await storage.createTransactionAndAddCredits({
        deviceId: finalOwnerId,
        pagesPurchased: pageCount,
        amount: amountHalalas,
        paymentId: `pl_${transactionNo}`,
      });

      // Mark pending payment as paid
      if (orderNumber) {
        try {
          await storage.updatePendingPaymentStatus(orderNumber, "paid");
        } catch {
          // Ignore - pending payment may not exist
        }
      }

      return res.json({ 
        status: "paid",
        pages: pageCount,
      });
    }

    // Return current status for pending/failed
    res.json({ 
      status: orderStatus.toLowerCase(),
      orderStatus,
    });
  } catch (error) {
    logger.error("[verify v2.9.26] Payment verification error:", error);
    res.status(500).json({ error: "فشل التحقق من الدفع" });
  }
});

// POST /api/webhooks/paylink - Handle Paylink webhook notifications
router.post("/webhooks/paylink", async (req: Request, res: Response) => {
  const webhookSecret = process.env.PAYLINK_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  // [SECURITY FIX v2.9.32] In production, webhook signature verification is REQUIRED (fail-closed)
  if (isProduction && !webhookSecret) {
    logger.error("CRITICAL: PAYLINK_WEBHOOK_SECRET not configured in production - rejecting webhook");
    return res.status(500).json({ error: "Webhook verification not configured" });
  }

  // Get signature from header (Paylink uses x-paylink-signature or similar)
  const signature = req.headers["x-paylink-signature"] as string || req.headers["x-signature"] as string;
  
  // [SECURITY FIX v2.9.32] In production, signature is REQUIRED
  if (isProduction && !signature) {
    logger.warn("Paylink webhook: Missing signature header in production");
    return res.status(401).json({ error: "Missing signature" });
  }

  // Verify signature if secret is configured
  if (webhookSecret && signature) {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      logger.warn("Paylink webhook: Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  let eventId: string | undefined;
  
  try {
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const { transactionNo, orderStatus, amount } = body;
    
    eventId = `pl_${transactionNo}_${orderStatus}`;

    // [SECURITY v2.9.32b] Mask sensitive identifiers in logs
    logger.info("Paylink webhook received", {
      transactionNo: maskId(transactionNo),
      orderStatus,
      amount,
    });

    // Check idempotency
    const { status: existingStatus, canProcess } = await storage.upsertWebhookEventForProcessing(
      eventId, 
      `paylink_${orderStatus}`
    );
    
    if (existingStatus === "succeeded") {
      logger.info("Webhook already processed successfully", { eventId });
      return res.status(200).json({ received: true, duplicate: true });
    }
    
    if (!canProcess) {
      logger.info("Webhook being processed by another worker", { eventId });
      return res.status(200).json({ received: true, inProgress: true });
    }

    // Process paid orders
    if (orderStatus === "PAID" || orderStatus === "paid") {
      // [SECURITY v2.9.32b] pending_payments is the ONLY source of truth for credits
      // Metadata from webhook body is used ONLY for logging/mismatch detection
      
      // Step 1: Look up pending_payments (REQUIRED)
      const pendingPayment = await storage.getPendingPaymentByTransactionNo(transactionNo);
      
      if (!pendingPayment) {
        // No pending_payments record = no credits granted (fail-safe)
        logger.warn("Webhook PAID received but no pending_payments record found - ignoring", { 
          transactionNo: maskId(transactionNo),
          eventId 
        });
        await storage.updateWebhookEventStatus(eventId, "succeeded");
        return res.status(200).json({ received: true, ignored: true, reason: "no_pending_payment" });
      }
      
      // Step 2: Use pending_payments as the ONLY source of truth
      const deviceId = pendingPayment.deviceId;
      const pages = pendingPayment.pages;
      
      // Step 3: Parse metadata for logging mismatch only (not for decision-making)
      let metadata: any = {};
      try {
        metadata = JSON.parse(body.note || body.gatewayOrderRequest?.note || "{}");
      } catch {
        // Ignore parse errors - metadata is optional for logging only
      }
      
      // Log mismatch if metadata differs from pending_payments (informational only)
      if (metadata.deviceId && metadata.deviceId !== deviceId) {
        logger.warn("Webhook metadata deviceId mismatch with pending_payments (using pending_payments)", {
          transactionNo: maskId(transactionNo),
          metadataDeviceId: maskId(metadata.deviceId),
          pendingDeviceId: maskId(deviceId),
        });
      }
      if (metadata.pages && metadata.pages !== pages) {
        logger.warn("Webhook metadata pages mismatch with pending_payments (using pending_payments)", {
          transactionNo: maskId(transactionNo),
          metadataPages: metadata.pages,
          pendingPages: pages,
        });
      }

      // Step 4: Check existing transaction (idempotency)
      const existingTransaction = await storage.getTransactionByPaymentId(`pl_${transactionNo}`);
      if (existingTransaction) {
        logger.info("Order already processed via transaction check", { 
          transactionNo: maskId(transactionNo), 
          eventId 
        });
        await storage.updateWebhookEventStatus(eventId, "succeeded");
        return res.status(200).json({ received: true });
      }

      // Step 5: Add credits from pending_payments data ONLY
      const amountHalalas = Math.round((amount || 0) * 100);
      await storage.createTransactionAndAddCredits({
        deviceId,
        pagesPurchased: pages,
        amount: amountHalalas,
        paymentId: `pl_${transactionNo}`,
      });

      logger.info("Paylink payment processed successfully", {
        transactionNo: maskId(transactionNo),
        deviceId: maskId(deviceId),
        pages,
        amount,
        eventId,
      });
    }

    // Handle refunds
    if (orderStatus === "REFUNDED" || orderStatus === "refunded") {
      // [SECURITY v2.9.32b] Use pending_payments as source of truth for refunds too
      const pendingPayment = await storage.getPendingPaymentByTransactionNo(transactionNo);
      let deviceId = pendingPayment?.deviceId;
      
      // Fallback to metadata only if pending_payments not found (legacy records)
      if (!deviceId) {
        let metadata: any = {};
        try {
          metadata = JSON.parse(body.note || body.gatewayOrderRequest?.note || "{}");
          deviceId = metadata.deviceId;
        } catch {
          // Ignore parse errors
        }
      }
      
      if (pendingPayment) {
        logger.info("Resolved deviceId from pending_payments for refund", { 
          transactionNo: maskId(transactionNo), 
          deviceId: maskId(deviceId)
        });
      }

      if (deviceId) {
        const transaction = await storage.getTransactionByPaymentId(`pl_${transactionNo}`);
        
        if (transaction) {
          const deducted = await storage.deductPageCredits(deviceId, transaction.pagesPurchased);
          
          if (!deducted) {
            await storage.setDeviceStatus(deviceId, "on_hold");
            logger.warn("Account put on hold due to refund with used pages", { 
              transactionNo: maskId(transactionNo), 
              deviceId: maskId(deviceId),
              eventId,
            });
          } else {
            logger.info("Credits deducted for refund", { 
              transactionNo: maskId(transactionNo), 
              deviceId: maskId(deviceId),
              eventId,
            });
          }
        } else {
          await storage.setDeviceStatus(deviceId, "on_hold");
          logger.warn("Account put on hold due to refund (no transaction found)", { 
            transactionNo: maskId(transactionNo), 
            deviceId: maskId(deviceId), 
            eventId 
          });
        }
      }
    }

    await storage.updateWebhookEventStatus(eventId, "succeeded");
    return res.status(200).json({ received: true });
  } catch (error) {
    const errorMessage = (error as Error).message;
    logger.error("Paylink webhook failed", { eventId, error: errorMessage });
    
    if (eventId) {
      try {
        await storage.updateWebhookEventStatus(eventId, "failed", errorMessage);
      } catch (updateError) {
        logger.error("Failed to update webhook event status", { eventId });
      }
    }
    
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Export for use in other modules
export { verifyDeviceToken };
export default router;
