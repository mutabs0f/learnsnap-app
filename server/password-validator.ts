// [SECURITY FIX v4.2] Enhanced password validation
export interface PasswordStrength {
  score: number;
  isValid: boolean;
  feedback: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

// Common passwords list
const COMMON_PASSWORDS = new Set([
  'password', '12345678', 'qwerty', 'admin', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'login', 'princess', 'solo',
  '123456789', 'password1', 'qwerty123', 'admin123', 'root',
  'password123', 'abc123', 'iloveyou', 'sunshine', 'football'
]);

export function validatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;
  
  // Length check
  if (password.length < 8) {
    feedback.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  } else if (password.length >= 16) {
    score += 35;
  } else if (password.length >= 12) {
    score += 30;
  } else {
    score += 20;
  }
  
  // Uppercase check
  if (!/[A-Z]/.test(password)) {
    feedback.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  } else {
    score += 15;
  }
  
  // Lowercase check
  if (!/[a-z]/.test(password)) {
    feedback.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  } else {
    score += 15;
  }
  
  // Number check
  if (!/[0-9]/.test(password)) {
    feedback.push('يجب أن تحتوي على رقم واحد على الأقل');
  } else {
    score += 15;
  }
  
  // Special character check
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    feedback.push('يجب أن تحتوي على رمز خاص واحد على الأقل (!@#$%...)');
  } else {
    score += 20;
  }
  
  // Common password check
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    feedback.push('كلمة المرور شائعة جداً وسهلة التخمين');
    score = Math.min(score, 20);
  }
  
  // Sequential characters check
  if (/(.)\1{2,}/.test(password)) {
    feedback.push('تجنب تكرار نفس الحرف أكثر من مرتين');
    score -= 10;
  }
  
  // Sequential numbers check
  if (/012|123|234|345|456|567|678|789|890/.test(password)) {
    feedback.push('تجنب الأرقام المتسلسلة');
    score -= 10;
  }
  
  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));
  
  // Determine strength
  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (score < 40) strength = 'weak';
  else if (score < 60) strength = 'fair';
  else if (score < 80) strength = 'good';
  else strength = 'strong';
  
  return {
    score,
    isValid: score >= 60 && feedback.length === 0,
    feedback,
    strength
  };
}
