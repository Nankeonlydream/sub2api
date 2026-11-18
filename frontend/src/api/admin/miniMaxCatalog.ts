import { apiClient } from '../client'
import type { MiniMaxCatalogEntry, MiniMaxCatalogState } from '@/utils/miniMaxH3'

export async function getMiniMaxCatalog(): Promise<MiniMaxCatalogState> {
  const { data } = await apiClient.get<MiniMaxCatalogState>('/admin/settings/minimax-catalog')
  return data
}

export async function saveMiniMaxCatalog(entries: MiniMaxCatalogEntry[]): Promise<MiniMaxCatalogState> {
  const { data } = await apiClient.put<MiniMaxCatalogState>('/admin/settings/minimax-catalog', { entries })
  return data
}

export async function resetMiniMaxCatalog(): Promise<MiniMaxCatalogState> {
  const { data } = await apiClient.delete<MiniMaxCatalogState>('/admin/settings/minimax-catalog')
  return data
}
