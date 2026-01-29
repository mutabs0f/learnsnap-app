import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Loader2, CheckCircle, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "agent" | "admin";
  content: string;
}

type ViewState = "chat" | "ticket-form" | "ticket-submitted";

const WELCOME_MESSAGE: Message = {
  role: "agent",
  content: "أهلاً بك! أنا مساعد ليرن سناب. كيف أقدر أساعدك اليوم؟"
};

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("chat");
  const [ticketForm, setTicketForm] = useState({
    name: "",
    email: "",
    phone: "",
    issue: ""
  });
  const [ticketError, setTicketError] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [lastCategory, setLastCategory] = useState<string>("general");
  
  // Generate new session ID each time widget opens (fresh start)
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Start fresh when widget opens
  useEffect(() => {
    if (isOpen) {
      startFreshChat();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pre-fill form with stored user data
  useEffect(() => {
    const storedEmail = localStorage.getItem("userEmail");
    const storedName = localStorage.getItem("userName");
    if (storedEmail) setTicketForm(prev => ({ ...prev, email: storedEmail }));
    if (storedName) setTicketForm(prev => ({ ...prev, name: storedName }));
  }, [viewState]);

  const startFreshChat = () => {
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    setMessages([WELCOME_MESSAGE]);
    setViewState("chat");
    setInput("");
    setTicketId(null);
    setLastCategory("general");
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          userEmail: localStorage.getItem("userEmail"),
          userName: localStorage.getItem("userName"),
          deviceId: localStorage.getItem("deviceId"),
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: "agent", content: data.message }]);
      
      // If escalated, show ticket form
      if (data.escalated) {
        setLastCategory(data.category || "general");
        setTicketForm(prev => ({ ...prev, issue: userMessage }));
        setTimeout(() => setViewState("ticket-form"), 1500);
      }
    } catch {
      setMessages(prev => [...prev, { 
        role: "agent", 
        content: "عذراً، حدث خطأ. حاول مرة أخرى." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitTicket = async () => {
    setTicketError("");
    
    if (!ticketForm.name.trim() || !ticketForm.email.trim() || !ticketForm.issue.trim()) {
      setTicketError("الرجاء ملء جميع الحقول المطلوبة");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(ticketForm.email)) {
      setTicketError("الرجاء إدخال بريد إلكتروني صحيح");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          customerName: ticketForm.name,
          customerEmail: ticketForm.email,
          customerPhone: ticketForm.phone || undefined,
          issueSummary: ticketForm.issue,
          deviceId: localStorage.getItem("deviceId"),
          userId: localStorage.getItem("userId"),
          category: lastCategory
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        setTicketId(data.ticketId);
        setViewState("ticket-submitted");
      } else {
        setTicketError(data.error || "حدث خطأ، حاول مرة أخرى");
      }
    } catch {
      setTicketError("حدث خطأ، حاول مرة أخرى");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetToChat = () => {
    setViewState("chat");
    setTicketForm({ name: "", email: "", phone: "", issue: "" });
    setTicketError("");
    setTicketId(null);
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 start-6 z-50 rounded-full shadow-lg ${isOpen ? "hidden" : ""}`}
        size="icon"
        aria-label="فتح الدردشة"
        data-testid="button-open-chat"
      >
        <MessageCircle className="w-5 h-5" />
      </Button>

      {isOpen && (
        <div className="fixed bottom-6 start-6 z-50 w-80 sm:w-96 h-[500px] bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden border" dir="rtl">
          <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold">مساعد ليرن سناب</h3>
              <p className="text-xs opacity-80">
                {viewState === "chat" ? "نرد عليك فوراً" : 
                 viewState === "ticket-form" ? "أرسل بياناتك للتواصل" :
                 "تم استلام طلبك"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {viewState === "chat" && messages.length > 1 && (
                <Button
                  onClick={startFreshChat}
                  aria-label="محادثة جديدة"
                  data-testid="button-new-chat"
                  size="icon"
                  variant="ghost"
                  className="text-white"
                  title="محادثة جديدة"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
              <Button
                onClick={() => setIsOpen(false)} 
                aria-label="إغلاق"
                data-testid="button-close-chat"
                size="icon"
                variant="ghost"
                className="text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {viewState === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-purple-500 text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-end">
                    <div className="bg-muted p-3 rounded-2xl rounded-bl-md">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="اكتب رسالتك..."
                    className="flex-1 px-4 py-2 rounded-full border bg-muted focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    dir="rtl"
                    data-testid="input-chat-message"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="rounded-full"
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {viewState === "ticket-form" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-800 dark:text-amber-200">
                    لمتابعة طلبك، الرجاء تعبئة بياناتك وسيتواصل معك فريق الدعم قريباً.
                  </p>
                </div>
              </div>

              {ticketError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                  {ticketError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">الاسم *</label>
                  <input
                    type="text"
                    value={ticketForm.name}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="أدخل اسمك"
                    className="w-full px-4 py-2 rounded-lg border bg-muted focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    dir="rtl"
                    data-testid="input-ticket-name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">البريد الإلكتروني *</label>
                  <input
                    type="email"
                    value={ticketForm.email}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="example@email.com"
                    className="w-full px-4 py-2 rounded-lg border bg-muted focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    dir="ltr"
                    data-testid="input-ticket-email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">رقم الجوال (اختياري)</label>
                  <input
                    type="tel"
                    value={ticketForm.phone}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="05xxxxxxxx"
                    className="w-full px-4 py-2 rounded-lg border bg-muted focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    dir="ltr"
                    data-testid="input-ticket-phone"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">وصف المشكلة *</label>
                  <textarea
                    value={ticketForm.issue}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, issue: e.target.value }))}
                    placeholder="اشرح مشكلتك بالتفصيل..."
                    rows={3}
                    className="w-full px-4 py-2 rounded-lg border bg-muted focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-none"
                    dir="rtl"
                    data-testid="input-ticket-issue"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={submitTicket}
                  disabled={isLoading}
                  className="flex-1"
                  data-testid="button-submit-ticket"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "إرسال"
                  )}
                </Button>
                <Button
                  onClick={resetToChat}
                  variant="outline"
                  disabled={isLoading}
                  data-testid="button-back-to-chat"
                >
                  رجوع
                </Button>
              </div>
            </div>
          )}

          {viewState === "ticket-submitted" && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-lg font-bold mb-2">تم استلام طلبك!</h4>
              <p className="text-sm text-muted-foreground mb-2">
                رقم التذكرة: <span className="font-mono font-bold">#{ticketId}</span>
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                سيتواصل معك فريق الدعم على بريدك الإلكتروني قريباً.
              </p>
              <Button onClick={resetToChat} variant="outline" data-testid="button-new-conversation">
                محادثة جديدة
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
