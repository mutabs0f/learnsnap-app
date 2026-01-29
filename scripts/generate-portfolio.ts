import { jsPDF } from "jspdf";
import * as fs from "fs";

const doc = new jsPDF({
  orientation: "portrait",
  unit: "mm",
  format: "a4",
});

const pageWidth = 210;
const pageHeight = 297;
const margin = 20;
const contentWidth = pageWidth - margin * 2;

let y = margin;

function addPage() {
  doc.addPage();
  y = margin;
}

function centerText(text: string, fontSize: number, yPos: number) {
  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(text);
  doc.text(text, (pageWidth - textWidth) / 2, yPos);
}

function addSection(title: string) {
  if (y > pageHeight - 60) addPage();
  y += 10;
  doc.setFontSize(16);
  doc.setTextColor(41, 98, 255);
  doc.text(title, margin, y);
  doc.setTextColor(0, 0, 0);
  y += 3;
  doc.setDrawColor(41, 98, 255);
  doc.line(margin, y, margin + contentWidth, y);
  y += 10;
}

function addParagraph(text: string, fontSize: number = 11) {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, contentWidth);
  if (y + lines.length * 6 > pageHeight - margin) addPage();
  doc.text(lines, margin, y);
  y += lines.length * 6 + 5;
}

function addBullet(text: string) {
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, contentWidth - 10);
  if (y + lines.length * 5 > pageHeight - margin) addPage();
  doc.text("•", margin + 2, y);
  doc.text(lines, margin + 8, y);
  y += lines.length * 5 + 3;
}

// ========== COVER PAGE ==========
doc.setFillColor(41, 98, 255);
doc.rect(0, 0, pageWidth, 80, "F");

doc.setTextColor(255, 255, 255);
doc.setFontSize(36);
centerText("LearnSnap", 36, 45);

doc.setFontSize(14);
centerText("AI-Powered Learning Companion for Elementary Students", 14, 58);

doc.setTextColor(0, 0, 0);
y = 100;

doc.setFontSize(14);
doc.text("Project Portfolio", margin, y);
y += 15;

doc.setFontSize(12);
doc.text("Developer: Basim", margin, y);
y += 8;
doc.text("Platform: Replit", margin, y);
y += 8;
doc.text("Date: December 2025", margin, y);
y += 8;
doc.text("Version: 2.7.0", margin, y);

y = 180;
doc.setFontSize(11);
doc.setTextColor(100, 100, 100);
centerText("Work Sample for Saudi Freelance Platform (freelance.sa)", 11, y);
y += 6;
centerText("Submitted as proof of technical capability", 11, y);

// ========== PAGE 2: PROJECT OVERVIEW ==========
addPage();

addSection("1. Project Overview");

addParagraph("LearnSnap is an innovative mobile-first web application that transforms textbook pages into interactive learning experiences. Using advanced AI technology, it generates customized quizzes and explanations from photographed textbook content.", 11);

y += 5;
doc.setFontSize(13);
doc.text("The Problem", margin, y);
y += 8;

addParagraph("Parents often struggle to create effective study materials for their children. Traditional methods are time-consuming and may not align with curriculum content. LearnSnap solves this by instantly converting any textbook page into educational content.");

y += 5;
doc.setFontSize(13);
doc.text("Target Users", margin, y);
y += 8;

addBullet("Parents helping children with homework and exam preparation");
addBullet("Elementary school students (grades 1-6)");
addBullet("Home-schooling families");
addBullet("Tutors and educational support providers");

y += 5;
doc.setFontSize(13);
doc.text("Value Proposition", margin, y);
y += 8;

addBullet("Saves 30+ minutes per study session");
addBullet("Creates curriculum-aligned questions from actual textbooks");
addBullet("Provides instant feedback and encouragement");
addBullet("Makes learning engaging through gamification");

// ========== PAGE 3: FEATURES ==========
addPage();

addSection("2. Key Features");

doc.setFontSize(13);
doc.text("Core Functionality", margin, y);
y += 8;

addBullet("Image Upload: Capture textbook pages using camera or upload from gallery (up to 20 pages)");
addBullet("AI Text Extraction: Advanced OCR using Google Gemini to extract Arabic text accurately");
addBullet("Lesson Generation: Creates structured lesson summaries with key points");
addBullet("Quiz Generation: Produces 10-20 diverse questions per session");

y += 5;
doc.setFontSize(13);
doc.text("Question Types", margin, y);
y += 8;

addBullet("Multiple Choice (4 options with validated correct answers)");
addBullet("True/False questions");
addBullet("Fill-in-the-blank exercises");
addBullet("Matching pairs");

y += 5;
doc.setFontSize(13);
doc.text("User Experience", margin, y);
y += 8;

addBullet("Mobile-first responsive design");
addBullet("Full Arabic language support with RTL layout");
addBullet("Encouraging feedback messages for children");
addBullet("Score tracking and result review");
addBullet("Dark mode support");

y += 5;
doc.setFontSize(13);
doc.text("Security & Reliability", margin, y);
y += 8;

addBullet("User authentication (email/password + Google OAuth)");
addBullet("Secure payment processing via LemonSqueezy");
addBullet("Multi-model AI validation for answer accuracy");
addBullet("Rate limiting and input validation");

// ========== PAGE 4: TECHNOLOGY STACK ==========
addPage();

addSection("3. Technology Stack");

doc.setFontSize(13);
doc.text("Frontend", margin, y);
y += 8;

addBullet("React 18 with TypeScript");
addBullet("Vite for build tooling");
addBullet("Tailwind CSS for styling");
addBullet("shadcn/ui component library");
addBullet("TanStack Query for data fetching");
addBullet("Wouter for routing");

y += 5;
doc.setFontSize(13);
doc.text("Backend", margin, y);
y += 8;

addBullet("Node.js with Express.js");
addBullet("TypeScript for type safety");
addBullet("PostgreSQL database (Neon)");
addBullet("Drizzle ORM for database operations");
addBullet("Winston for structured logging");

y += 5;
doc.setFontSize(13);
doc.text("AI & Machine Learning", margin, y);
y += 8;

addBullet("Google Gemini Flash 2.0 (primary AI model)");
addBullet("OpenAI GPT-4o-mini (validation)");
addBullet("Anthropic Claude (fallback & validation)");
addBullet("Multi-model consensus for answer verification");

y += 5;
doc.setFontSize(13);
doc.text("Infrastructure", margin, y);
y += 8;

addBullet("Railway for production hosting");
addBullet("Replit for development environment");
addBullet("LemonSqueezy for payment processing");
addBullet("Resend for transactional emails");

// ========== PAGE 5: ARCHITECTURE ==========
addPage();

addSection("4. System Architecture");

addParagraph("LearnSnap follows a modern full-stack architecture with clear separation of concerns:");

y += 5;
doc.setFontSize(13);
doc.text("Request Flow", margin, y);
y += 8;

addParagraph("1. User uploads textbook image(s) via mobile browser");
addParagraph("2. Images are sent to backend API with device identification");
addParagraph("3. AI service extracts text and generates educational content");
addParagraph("4. Multi-model validation ensures answer accuracy");
addParagraph("5. Results are stored and returned to user");
addParagraph("6. User completes quiz with real-time feedback");

y += 5;
doc.setFontSize(13);
doc.text("Database Schema", margin, y);
y += 8;

addBullet("users: Authentication and profile data");
addBullet("quiz_sessions: Temporary quiz storage with 24h expiry");
addBullet("page_credits: Credit balance per device/user");
addBullet("transactions: Payment records");
addBullet("webhook_events: Payment webhook idempotency");

y += 5;
doc.setFontSize(13);
doc.text("Security Measures", margin, y);
y += 8;

addBullet("HMAC-signed device tokens");
addBullet("Rate limiting (20 requests per 15 minutes)");
addBullet("Helmet.js security headers");
addBullet("Session-based authentication with JWT");
addBullet("Parameterized SQL queries");

// ========== PAGE 6: SCREENSHOTS ==========
addPage();

addSection("5. Application Screenshots");

addParagraph("Note: Screenshots are available in the live application. Key screens include:");

y += 5;

doc.setFillColor(245, 245, 245);
doc.rect(margin, y, contentWidth, 25, "F");
doc.setFontSize(11);
doc.text("Landing Page", margin + 5, y + 8);
doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text("Hero section with features overview and pricing", margin + 5, y + 16);
doc.setTextColor(0, 0, 0);
y += 30;

doc.setFillColor(245, 245, 245);
doc.rect(margin, y, contentWidth, 25, "F");
doc.setFontSize(11);
doc.text("Upload Screen", margin + 5, y + 8);
doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text("Camera/gallery upload with multi-page support", margin + 5, y + 16);
doc.setTextColor(0, 0, 0);
y += 30;

doc.setFillColor(245, 245, 245);
doc.rect(margin, y, contentWidth, 25, "F");
doc.setFontSize(11);
doc.text("Quiz Interface", margin + 5, y + 8);
doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text("Interactive quiz with progress indicator and feedback", margin + 5, y + 16);
doc.setTextColor(0, 0, 0);
y += 30;

doc.setFillColor(245, 245, 245);
doc.rect(margin, y, contentWidth, 25, "F");
doc.setFontSize(11);
doc.text("Results Screen", margin + 5, y + 8);
doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text("Score display with question review and explanations", margin + 5, y + 16);
doc.setTextColor(0, 0, 0);
y += 30;

doc.setFillColor(245, 245, 245);
doc.rect(margin, y, contentWidth, 25, "F");
doc.setFontSize(11);
doc.text("Pricing Page", margin + 5, y + 8);
doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text("Page credit packages with secure checkout", margin + 5, y + 16);
doc.setTextColor(0, 0, 0);
y += 35;

addParagraph("Live demo available at the deployed application URL upon request.");

// ========== PAGE 7: OWNERSHIP ==========
addPage();

addSection("6. Ownership & Intellectual Property");

doc.setFillColor(230, 245, 230);
doc.rect(margin, y, contentWidth, 50, "F");
y += 10;

doc.setFontSize(12);
doc.text("Declaration of Ownership", margin + 5, y);
y += 10;

doc.setFontSize(11);
const ownershipText = "This project, LearnSnap, was fully designed, developed, and is solely owned by Basim. All source code, design assets, and intellectual property rights belong exclusively to Basim.";
const ownershipLines = doc.splitTextToSize(ownershipText, contentWidth - 10);
doc.text(ownershipLines, margin + 5, y);
y += 35;

doc.setFontSize(13);
doc.text("Development Details", margin, y);
y += 10;

addBullet("Development Platform: Replit (cloud-based IDE)");
addBullet("Development Period: November - December 2025");
addBullet("Current Version: 2.7.0");
addBullet("Lines of Code: ~15,000+ (TypeScript/React)");
addBullet("Total Development Time: 200+ hours");

y += 10;
doc.setFontSize(13);
doc.text("Proof of Development", margin, y);
y += 10;

addBullet("Complete version control history available");
addBullet("All commits authored by Basim");
addBullet("Development environment accessible on Replit");
addBullet("Production deployment on Railway platform");

y += 10;
doc.setFontSize(13);
doc.text("Third-Party Services (Licensed)", margin, y);
y += 10;

addBullet("AI APIs: Google, OpenAI, Anthropic (paid subscriptions)");
addBullet("Payment: LemonSqueezy (merchant of record)");
addBullet("Database: Neon PostgreSQL (cloud service)");
addBullet("Email: Resend (transactional email service)");

// ========== PAGE 8: CONTACT ==========
addPage();

addSection("7. Summary & Contact");

addParagraph("LearnSnap represents a complete, production-ready educational technology solution built with modern web technologies and AI capabilities. The project demonstrates proficiency in:");

y += 5;

addBullet("Full-stack web development (React + Node.js)");
addBullet("AI/ML integration and prompt engineering");
addBullet("Database design and optimization");
addBullet("Payment system integration");
addBullet("User authentication and security");
addBullet("Mobile-first responsive design");
addBullet("Arabic language support and RTL layouts");
addBullet("Production deployment and monitoring");

y += 15;

doc.setFillColor(41, 98, 255);
doc.rect(margin, y, contentWidth, 40, "F");
y += 15;

doc.setTextColor(255, 255, 255);
doc.setFontSize(14);
centerText("Ready for Review", 14, y);
y += 10;
doc.setFontSize(11);
centerText("This portfolio is submitted as proof of technical capability", 11, y);
y += 6;
centerText("for the Saudi Freelance Platform (freelance.sa)", 11, y);

doc.setTextColor(0, 0, 0);

y += 30;
doc.setFontSize(11);
doc.setTextColor(100, 100, 100);
centerText("Document generated: December 2025", 11, y);
y += 6;
centerText("LearnSnap v2.7.0 | Developed by Basim", 11, y);

// Save PDF
const pdfOutput = doc.output("arraybuffer");
fs.writeFileSync("LearnSnap_Portfolio.pdf", Buffer.from(pdfOutput));
console.log("PDF generated successfully: LearnSnap_Portfolio.pdf");
