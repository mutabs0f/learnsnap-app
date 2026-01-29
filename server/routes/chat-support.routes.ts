/**
 * Chat Support API Routes
 * @version 3.8.0
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, desc, asc, sql } from "drizzle-orm";
import { supportConversations, supportMessages, type SupportConversation, type SupportMessage } from "@shared/schema";
import { getSupportResponse, sendTelegramAlert } from "../agents/support";
import logger from "../logger";
import rateLimit from "express-rate-limit";

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "رسائل كثيرة، انتظر قليلاً", code: "RATE_LIMIT" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/message", chatLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId, message, userEmail, userName, deviceId } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "Missing sessionId or message" });
    }

    if (typeof message !== 'string' || message.length > 2000) {
      return res.status(400).json({ error: "Invalid message" });
    }

    if (typeof sessionId !== 'string' || sessionId.length > 100) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const sanitizedEmail = userEmail && typeof userEmail === 'string' 
      ? userEmail.slice(0, 100).trim() 
      : null;
    const sanitizedName = userName && typeof userName === 'string' 
      ? userName.slice(0, 100).trim() 
      : null;
    const sanitizedDeviceId = deviceId && typeof deviceId === 'string' 
      ? deviceId.slice(0, 100).trim() 
      : null;

    const [existingConv] = await db
      .select()
      .from(supportConversations)
      .where(eq(supportConversations.sessionId, sessionId))
      .limit(1);

    let conversation: SupportConversation;
    let conversationId: string;

    if (!existingConv) {
      const [newConv] = await db.insert(supportConversations).values({
        sessionId,
        userEmail: sanitizedEmail,
        userName: sanitizedName,
        deviceId: sanitizedDeviceId,
        status: "active",
      }).returning();
      conversationId = newConv.id;
      conversation = newConv;
    } else {
      conversationId = existingConv.id;
      conversation = existingConv;
    }

    await db.insert(supportMessages).values({
      conversationId,
      role: "user",
      content: message,
    });

    const historyRows = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.conversationId, conversationId))
      .orderBy(desc(supportMessages.createdAt))
      .limit(10);

    const historyArray = historyRows.reverse().map((m: SupportMessage) => ({
      role: m.role,
      content: m.content
    }));

    const agentResponse = await getSupportResponse(message, historyArray);

    await db.insert(supportMessages).values({
      conversationId,
      role: "agent",
      content: agentResponse.message,
      escalated: agentResponse.escalate,
      category: agentResponse.category,
    });

    if (agentResponse.escalate) {
      await db.update(supportConversations)
        .set({ status: "escalated", updatedAt: new Date() })
        .where(eq(supportConversations.id, conversationId));
      
      // Note: Telegram alert is NOT sent here - only when customer submits actual ticket form
      logger.info("Conversation escalated, waiting for ticket form submission", { 
        conversationId, 
        category: agentResponse.category 
      });
    }

    res.json({
      message: agentResponse.message,
      escalated: agentResponse.escalate,
    });
  } catch (error) {
    logger.error("Chat message error", { error: (error as Error).message });
    res.status(500).json({ error: "حدث خطأ، حاول مرة أخرى" });
  }
});

// Submit support ticket for escalated issues
router.post("/ticket", chatLimiter, async (req: Request, res: Response) => {
  try {
    const { 
      sessionId, 
      customerName, 
      customerEmail, 
      customerPhone,
      issueSummary,
      deviceId,
      userId,
      category
    } = req.body;

    // Validate required fields and types
    if (!customerName || typeof customerName !== 'string' || customerName.trim().length === 0) {
      return res.status(400).json({ error: "الرجاء إدخال اسمك", code: "MISSING_NAME" });
    }
    if (!customerEmail || typeof customerEmail !== 'string') {
      return res.status(400).json({ error: "الرجاء إدخال البريد الإلكتروني", code: "MISSING_EMAIL" });
    }
    if (!issueSummary || typeof issueSummary !== 'string' || issueSummary.trim().length === 0) {
      return res.status(400).json({ error: "الرجاء وصف المشكلة", code: "MISSING_ISSUE" });
    }
    
    // Length validation
    if (customerName.length > 100) {
      return res.status(400).json({ error: "الاسم طويل جداً", code: "NAME_TOO_LONG" });
    }
    if (customerEmail.length > 255) {
      return res.status(400).json({ error: "البريد الإلكتروني طويل جداً", code: "EMAIL_TOO_LONG" });
    }
    if (issueSummary.length > 2000) {
      return res.status(400).json({ error: "وصف المشكلة طويل جداً", code: "ISSUE_TOO_LONG" });
    }
    if (customerPhone && customerPhone.length > 20) {
      return res.status(400).json({ error: "رقم الجوال غير صحيح", code: "PHONE_TOO_LONG" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({ error: "الرجاء إدخال بريد إلكتروني صحيح", code: "INVALID_EMAIL" });
    }
    
    // Validate category
    const VALID_CATEGORIES = ['general', 'payment', 'account', 'technical', 'error'];
    const safeCategory = (category && VALID_CATEGORIES.includes(category)) ? category : 'general';

    // Get conversation history if sessionId provided
    let conversationHistory: any[] = [];
    if (sessionId) {
      const [conversation] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.sessionId, sessionId))
        .limit(1);

      if (conversation) {
        const messages = await db
          .select()
          .from(supportMessages)
          .where(eq(supportMessages.conversationId, conversation.id))
          .orderBy(asc(supportMessages.createdAt))
          .limit(50);

        conversationHistory = messages.map((m: SupportMessage) => ({
          role: m.role,
          content: m.content,
          timestamp: m.createdAt
        }));
      }
    }

    // Limit conversation history to prevent oversized storage
    const limitedHistory = conversationHistory.slice(-20);
    
    // Insert ticket directly using SQL
    const result = await db.execute(
      sql`INSERT INTO support_tickets (
        session_id, device_id, user_id, customer_name, 
        customer_email, customer_phone, issue_summary, 
        conversation_history, category, status
      ) VALUES (
        ${sessionId || null}, ${deviceId || null}, ${userId || null}, 
        ${customerName.trim().slice(0, 100)}, ${customerEmail.trim().slice(0, 255)}, 
        ${customerPhone ? customerPhone.trim().slice(0, 20) : null},
        ${issueSummary.trim().slice(0, 2000)}, ${JSON.stringify(limitedHistory)}::jsonb, 
        ${safeCategory}, 'open'
      ) RETURNING id`
    );

    const ticketId = (result.rows[0] as any)?.id;

    // Send Telegram notification
    sendTelegramAlert({
      conversationId: `ticket-${ticketId}`,
      userMessage: `تذكرة جديدة #${ticketId}\n${issueSummary.trim()}`,
      userEmail: customerEmail.trim(),
      userName: customerName.trim(),
      category: safeCategory,
    }).catch(err => logger.error("Telegram alert for ticket failed", { error: err.message }));

    logger.info("Support ticket created", { ticketId, email: customerEmail, category });

    res.json({
      success: true,
      ticketId,
      message: "تم استلام طلبك بنجاح! سنتواصل معك قريباً."
    });
  } catch (error) {
    logger.error("Ticket submission error", { error: (error as Error).message });
    res.status(500).json({ error: "حدث خطأ، حاول مرة أخرى" });
  }
});

router.get("/history/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const [conversation] = await db
      .select()
      .from(supportConversations)
      .where(eq(supportConversations.sessionId, sessionId))
      .limit(1);

    if (!conversation) {
      return res.json({ messages: [] });
    }

    const messages = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.conversationId, conversation.id))
      .orderBy(asc(supportMessages.createdAt));

    res.json({ 
      messages: messages.map((m: SupportMessage) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }))
    });
  } catch (error) {
    logger.error("Chat history error", { error: (error as Error).message });
    res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
