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
