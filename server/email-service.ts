import { Resend } from "resend";
import logger from "./logger";

let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    // Support multiple naming conventions
    const apiKey = process.env.RESEND_API_KEY || process.env.Resend;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "LearnSnap <noreply@learnsnap.app>";
const APP_URL = process.env.APP_URL || "https://learnsnap.app";

export async function sendVerificationEmail(
  email: string,
  token: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  const verificationUrl = `${APP_URL}/verify-email/${token}`;

  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "تأكيد حسابك في LearnSnap",
      html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Cairo', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">LearnSnap</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">التعلم الذكي</p>
    </div>
    <div style="padding: 40px 30px;">
      <h2 style="color: #333; margin: 0 0 20px 0;">مرحباً ${name || ""}!</h2>
      <p style="color: #666; font-size: 16px; line-height: 1.8;">
        شكراً لتسجيلك في LearnSnap. لتفعيل حسابك، اضغط على الزر أدناه:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 14px 40px; 
                  text-decoration: none; 
                  border-radius: 8px; 
                  font-size: 16px;
                  font-weight: bold;
                  display: inline-block;">
          تأكيد الإيميل
        </a>
      </div>
      <p style="color: #999; font-size: 14px; margin-top: 30px;">
        أو انسخ هذا الرابط في متصفحك:<br>
        <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 20px;">
        صلاحية هذا الرابط 24 ساعة فقط.
      </p>
    </div>
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) {
      logger.error("Failed to send verification email", { email, error });
      return { success: false, error: error.message };
    }

    logger.info("Verification email sent", { email, emailId: data?.id });
    return { success: true };
  } catch (error) {
    logger.error("Error sending verification email", { email, error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}

export async function sendWelcomeEmail(
  email: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "مرحباً بك في LearnSnap!",
      html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: 'Cairo', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0;">مرحباً بك في LearnSnap!</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.8;">
        مرحباً ${name || ""}،<br><br>
        تم تفعيل حسابك بنجاح! يمكنك الآن استخدام LearnSnap لتحويل صفحات الكتب إلى اختبارات تفاعلية.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${APP_URL}" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 14px 40px; 
                  text-decoration: none; 
                  border-radius: 8px;">
          ابدأ الآن
        </a>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) {
      logger.error("Failed to send welcome email", { email, error });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  const resetUrl = `${APP_URL}/reset-password/${token}`;

  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "إعادة تعيين كلمة المرور - LearnSnap",
      html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: 'Cairo', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0;">إعادة تعيين كلمة المرور</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.8;">
        مرحباً ${name || ""}،<br><br>
        تلقينا طلباً لإعادة تعيين كلمة المرور. اضغط على الزر أدناه:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 14px 40px; 
                  text-decoration: none; 
                  border-radius: 8px;">
          إعادة تعيين كلمة المرور
        </a>
      </div>
      <p style="color: #999; font-size: 12px;">
        صلاحية هذا الرابط ساعة واحدة فقط. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة.
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
