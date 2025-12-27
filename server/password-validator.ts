export interface PasswordStrength {
  score: number;
  isValid: boolean;
  feedback: string[];
}

export function validatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;
  
  if (password.length < 8) {
    feedback.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  } else if (password.length >= 12) {
    score += 30;
  } else {
    score += 20;
  }
  
  if (!/[A-Z]/.test(password)) {
    feedback.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  } else {
    score += 20;
  }
  
  if (!/[a-z]/.test(password)) {
    feedback.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  } else {
    score += 20;
  }
  
  if (!/[0-9]/.test(password)) {
    feedback.push('يجب أن تحتوي على رقم واحد على الأقل');
  } else {
    score += 15;
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    feedback.push('يجب أن تحتوي على رمز خاص واحد على الأقل');
  } else {
    score += 15;
  }
  
  const commonPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein'];
  if (commonPasswords.includes(password.toLowerCase())) {
    feedback.push('كلمة المرور ضعيفة جداً');
    score = 0;
  }
  
  return {
    score,
    isValid: score >= 70 && feedback.length === 0,
    feedback
  };
}
