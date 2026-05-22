export interface ChatQuota {
  limit: number | null;
  used: number;
  window_days: number;
}

export interface Me {
  id: string;
  email: string;
  tier: 'free' | 'paid';
  subscription_status: string | null;
  current_period_end: string | null;
  chat_quota: ChatQuota;
}
