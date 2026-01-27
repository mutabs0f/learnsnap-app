export interface AdminStats {
  stats: {
    totalUsers: number;
    totalDevices: number;
    totalQuizzes: number;
    totalTransactions: number;
    totalPagesUsed: number;
    totalRevenue: number;
  };
  recentQuizzes: Array<{
    id: string;
    device_id: string;
    status: string;
    created_at: string;
  }>;
  recentUsers: Array<{
    id: string;
    email: string;
    name: string;
    created_at: string;
  }>;
}

export interface Device {
  device_id: string;
  pages_remaining: number;
  total_pages_used: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  device_id: string;
  amount: number;
  pages_purchased: number;
  created_at: string;
}

export interface QuestionReport {
  id: number;
  sessionId: string;
  questionIndex: number;
  questionText: string;
  reason: string;
  details: string | null;
  status: string;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportStats {
  total: number;
  pending: number;
  reviewed: number;
  resolved: number;
  dismissed: number;
}

export interface SupportLookupResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    createdAt: string;
  } | null;
  credits: {
    ownerId: string;
    pagesRemaining: number;
    totalPagesUsed: number;
    isEarlyAdopter: boolean;
    updatedAt: string;
  } | null;
  recentPayments: Array<{
    orderNumber: string;
    transactionNo: string;
    deviceId: string;
    pages: number;
    amount: string;
    status: string;
    createdAt: string;
  }>;
  recentActions: Array<{
    id: string;
    actionType: string;
    amountPages: number | null;
    reasonCode: string;
    referenceId: string;
    status: string;
    createdAt: string;
  }>;
  searchedBy: {
    email?: string;
    userId?: string;
    deviceId?: string;
    transactionNo?: string;
  };
}

export interface AdminAuthState {
  isAuthenticated: boolean;
  sessionToken: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  fetchWithAuth: (url: string) => Promise<any>;
}

export interface PendingPayment {
  id: string;
  orderNumber: string;
  transactionNo: string;
  deviceId: string;
  pages: number;
  amount: number;
  status: string;
  createdAt: string;
}

export interface FailedWebhook {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface SystemHealth {
  status: string;
  checks: Record<string, { status: string; message?: string; latency?: number }>;
  uptime: number;
  version: string;
}

// Admin Dashboard v2.0 Types
export interface EnhancedStats {
  totalUsers: number;
  totalDevices: number;
  activeUsers7Days: number;
  totalTransactions: number;
  totalRevenue: number;
  totalCreditsDistributed: number;
  totalCreditsRemaining: number;
  completedQuizzes: number;
}

export interface SearchResult {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    email_verified: boolean;
    created_at: string;
    credits: number | null;
  }>;
  devices: Array<{
    device_id: string;
    pages_remaining: number;
    total_pages_used: number;
    user_id: string | null;
    user_email: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export interface Alert {
  type: 'high_credits' | 'failed_transactions' | 'new_high_usage';
  severity: 'warning' | 'error';
  message: string;
  deviceId: string;
  email?: string;
  value: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: number;
  actor_type: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface DeviceCreditsDetail {
  credits: {
    device_id: string;
    pages_remaining: number;
    total_pages_used: number;
    user_id: string | null;
    created_at: string;
    updated_at: string;
  };
  transactions: Transaction[];
  auditLog: AuditLogEntry[];
}
