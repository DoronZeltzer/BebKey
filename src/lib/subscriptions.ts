import { supabase } from './supabase'

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'paused' | 'past_due' | null

export interface UserSubscription {
  status: SubscriptionStatus
  has_had_trial: boolean
  plan: string | null
  current_period_ends_at: string | null
}

export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const { data } = await supabase
    .from('user_subscriptions')
    .select('status, has_had_trial, plan, current_period_ends_at')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    status: (data?.status as SubscriptionStatus) ?? null,
    has_had_trial: data?.has_had_trial ?? false,
    plan: data?.plan ?? null,
    current_period_ends_at: data?.current_period_ends_at ?? null,
  }
}

export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing'
}
