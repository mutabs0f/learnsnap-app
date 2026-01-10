import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { ChapterResult, Chapter, Child, ChapterContent } from "@shared/schema";

interface ReportData {
  result: ChapterResult;
  chapter: Chapter;
  child?: Child;
}

export async function exportReportToPDF(data: ReportData): Promise<void> {
  const { result, chapter, child } = data;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPosition = margin;

  const percentage = Math.round((result.totalScore! / 15) * 100);
  const stars = result.stars || 0;
  const timeMinutes = Math.floor((result.timeSpentSeconds || 0) / 60);
  const timeSeconds = (result.timeSpentSeconds || 0) % 60;

  pdf.setFillColor(59, 130, 246);
  pdf.rect(0, 0, pageWidth, 40, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.text("LearnSnap", pageWidth / 2, 15, { align: "center" });
  
  pdf.setFontSize(14);
  pdf.text("Performance Report", pageWidth / 2, 25, { align: "center" });
  pdf.text(chapter.title || "Chapter Report", pageWidth / 2, 33, { align: "center" });

  yPosition = 50;

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(12);
  
  const reportDate = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  if (child) {
    pdf.text(`Student: ${child.name}`, margin, yPosition);
    yPosition += 7;
  }
  pdf.text(`Date: ${reportDate}`, margin, yPosition);
  yPosition += 7;
  pdf.text(`Subject: ${chapter.subject || "General"}`, margin, yPosition);
  yPosition += 15;

  pdf.setFillColor(240, 253, 244);
  pdf.roundedRect(margin, yPosition, contentWidth, 45, 3, 3, "F");
  
  pdf.setFontSize(16);
  pdf.setTextColor(22, 101, 52);
  pdf.text("Overall Score", margin + contentWidth / 2, yPosition + 10, { align: "center" });
  
  pdf.setFontSize(36);
  pdf.text(`${percentage}%`, margin + contentWidth / 2, yPosition + 28, { align: "center" });
  
  pdf.setFontSize(12);
  const starText = `${"*".repeat(stars)}${"o".repeat(5 - stars)}`;
  pdf.text(starText, margin + contentWidth / 2, yPosition + 38, { align: "center" });
  
  yPosition += 55;

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(14);
  pdf.text("Score Breakdown", margin, yPosition);
  yPosition += 10;
  
  pdf.setFillColor(229, 231, 235);
  pdf.roundedRect(margin, yPosition, contentWidth, 8, 2, 2, "F");
  pdf.setFillColor(34, 197, 94);
  const practiceWidth = ((result.practiceScore || 0) / 5) * contentWidth;
  pdf.roundedRect(margin, yPosition, practiceWidth, 8, 2, 2, "F");
  pdf.setFontSize(10);
  pdf.text(`Practice: ${result.practiceScore}/5`, margin, yPosition + 15);
  yPosition += 25;
  
  pdf.setFillColor(229, 231, 235);
  pdf.roundedRect(margin, yPosition, contentWidth, 8, 2, 2, "F");
  pdf.setFillColor(59, 130, 246);
  const testWidth = ((result.testScore || 0) / 10) * contentWidth;
  pdf.roundedRect(margin, yPosition, testWidth, 8, 2, 2, "F");
  pdf.text(`Test: ${result.testScore}/10`, margin, yPosition + 15);
  yPosition += 25;
  
  const timeText = timeMinutes > 0 
    ? `Time Spent: ${timeMinutes} min ${timeSeconds} sec` 
    : `Time Spent: ${timeSeconds} sec`;
  pdf.text(timeText, margin, yPosition);
  yPosition += 15;

  let parsedContent: ChapterContent | null = null;
  try {
    parsedContent = typeof chapter.content === "string" 
      ? JSON.parse(chapter.content) 
      : chapter.content;
  } catch {
    parsedContent = chapter.content || null;
  }
  
  const practiceQuestions = parsedContent?.practice || [];
  const testQuestions = parsedContent?.test || [];
  const answers = result.answers as { practiceAnswers: string[]; testAnswers: string[] } | null;

  const allResults = [
    ...practiceQuestions.map((q, i) => ({
      question: q.question,
      isCorrect: answers?.practiceAnswers?.[i] === q.correct,
      type: "practice" as const,
    })),
    ...testQuestions.map((q, i) => ({
      question: q.question,
      isCorrect: answers?.testAnswers?.[i] === q.correct,
      type: "test" as const,
    })),
  ];

  const strengths = allResults.filter((r) => r.isCorrect);
  const weaknesses = allResults.filter((r) => !r.isCorrect);

  if (strengths.length > 0) {
    pdf.setFontSize(14);
    pdf.setTextColor(22, 101, 52);
    pdf.text(`Strengths (${strengths.length})`, margin, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    strengths.slice(0, 5).forEach((item) => {
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = margin;
      }
      const text = `+ ${item.question.substring(0, 70)}${item.question.length > 70 ? "..." : ""}`;
      pdf.text(text, margin + 5, yPosition);
      yPosition += 6;
    });
    yPosition += 10;
  }

  if (weaknesses.length > 0) {
    if (yPosition > pageHeight - 60) {
      pdf.addPage();
      yPosition = margin;
    }
    
    pdf.setFontSize(14);
    pdf.setTextColor(180, 83, 9);
    pdf.text(`Needs Improvement (${weaknesses.length})`, margin, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    weaknesses.slice(0, 5).forEach((item) => {
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = margin;
      }
      const text = `- ${item.question.substring(0, 70)}${item.question.length > 70 ? "..." : ""}`;
      pdf.text(text, margin + 5, yPosition);
      yPosition += 6;
    });
    yPosition += 10;
  }

  if (weaknesses.length > 0) {
    if (yPosition > pageHeight - 50) {
      pdf.addPage();
      yPosition = margin;
    }
    
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(margin, yPosition, contentWidth, 35, 3, 3, "F");
    
    pdf.setFontSize(12);
    pdf.setTextColor(30, 64, 175);
    pdf.text("Recommendations", margin + 5, yPosition + 8);
    
    pdf.setFontSize(9);
    pdf.text("1. Review the questions that were answered incorrectly", margin + 5, yPosition + 16);
    pdf.text("2. Re-read the lesson focusing on difficult concepts", margin + 5, yPosition + 22);
    pdf.text("3. Try the test again after reviewing", margin + 5, yPosition + 28);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(
    `Generated by LearnSnap - ${new Date().toISOString().split("T")[0]}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  const fileName = `LearnSnap_Report_${chapter.title?.replace(/\s+/g, "_") || "Chapter"}_${new Date().toISOString().split("T")[0]}.pdf`;
  pdf.save(fileName);
}

export async function captureChartToPDF(elementId: string): Promise<string | null> {
  const element = document.getElementById(elementId);
  if (!element) return null;

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Failed to capture chart:", error);
    return null;
  }
}
