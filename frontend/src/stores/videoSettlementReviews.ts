/**
 * Sidebar badge for native video tasks waiting for an admin billing decision.
 * Refreshed on login, on navigation at most once a minute, and after actions.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getVideoSettlementReviewSummary } from '@/api/admin/videoSettlementReviews'
import { useAuthStore } from './auth'

const THROTTLE_MS = 60_000

export const useVideoSettlementReviewStore = defineStore('videoSettlementReviews', () => {
  const pending = ref(0)
  let lastFetch = 0
  let generation = 0

  async function refresh(force = false) {
    const authStore = useAuthStore()
    // Observers and simple mode have no settlement review menu.
    if (!authStore.isAuthenticated || !authStore.isAdmin || authStore.isObserver || authStore.isSimpleMode) {
      pending.value = 0
      return
    }
    const now = Date.now()
    if (!force && lastFetch > 0 && now - lastFetch < THROTTLE_MS) return
    lastFetch = now
    const current = ++generation
    try {
      const summary = await getVideoSettlementReviewSummary()
      if (current === generation) pending.value = Math.max(0, summary.pending_count)
    } catch {
      if (current === generation) lastFetch = 0
    }
  }

  function setPending(count: number) {
    pending.value = Math.max(0, count)
  }

  function reset() {
    generation++
    lastFetch = 0
    pending.value = 0
  }

  return { pending, refresh, setPending, reset }
})
