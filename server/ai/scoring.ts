import type { Question } from "../../shared/schema.js";

export function calculateScores(questions: Question[], answers: string[]): { score: number; total: number } {
  let score = 0;
  questions.forEach((q, i) => {
    const answer = answers[i];
    
    switch (q.type) {
      case "true_false":
        const userBool = answer === "true" || answer === "صح";
        if (userBool === q.correct) score++;
        break;
        
      case "fill_blank":
        const userText = answer?.toString().trim().toLowerCase();
        const correctText = q.correct?.toString().trim().toLowerCase();
        if (userText === correctText) score++;
        break;
        
      case "matching":
        if (answer === "correct") score++;
        break;
        
      case "multiple_choice":
      default:
        if (answer === (q as Question & { correct: string }).correct) score++;
        break;
    }
  });
  return { score, total: questions.length };
}
