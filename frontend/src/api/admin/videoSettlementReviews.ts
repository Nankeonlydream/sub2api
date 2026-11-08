/**
 * Native video tasks (Grok, Seedance Ark) the settlement worker could not
 * price and left for an admin decision.
 */
import { apiClient } from '../client'
import type { PaginatedResponse } from '@/types'

export interface VideoSettlementReview {
  task_id: string
  api_key_id: number
  user_id: number
  user_email: string
  account_id: number
  group_id: number
  kind: 'grok' | 'ark'
  model: string
  video_resolution: string
  video_duration_seconds: number
  attempts: number
  reason: string
  created_at: string
  reviewed_at: string
  /** No upstream task ID was ever bound: only dismissal is possible. */
  submitting: boolean
}

export type VideoSettlementReviewAction =
  | { action: 'retry' }
  | { action: 'charge'; output_tokens?: number }
  | { action: 'dismiss'; reason?: string }

export interface VideoSettlementReviewActionResult {
  state: 'pending' | 'complete' | 'failed' | 'review'
  error?: string
}

export async function listVideoSettlementReviews(page = 1, pageSize = 20): Promise<PaginatedResponse<VideoSettlementReview>> {
  const { data } = await apiClient.get<PaginatedResponse<VideoSettlementReview>>('/admin/video-settlements/reviews', {
    params: { page, page_size: pageSize }
  })
  return data
}

export async function getVideoSettlementReviewSummary(): Promise<{ pending_count: number }> {
  const { data } = await apiClient.get<{ pending_count: number }>('/admin/video-settlements/reviews/summary')
  return data
}

export async function actOnVideoSettlementReview(
  review: Pick<VideoSettlementReview, 'task_id' | 'api_key_id'>,
  action: VideoSettlementReviewAction
): Promise<VideoSettlementReviewActionResult> {
  const { data } = await apiClient.post<VideoSettlementReviewActionResult>('/admin/video-settlements/reviews/action', {
    task_id: review.task_id,
    api_key_id: review.api_key_id,
    ...action
  })
  return data
}
