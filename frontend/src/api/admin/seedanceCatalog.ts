import { apiClient } from '../client'
import type { SeedanceCatalogEntry, SeedanceCatalogState } from '@/utils/seedanceVideo'

export async function getSeedanceCatalog(): Promise<SeedanceCatalogState> {
  const { data } = await apiClient.get<SeedanceCatalogState>('/admin/settings/seedance-catalog')
  return data
}

export async function saveSeedanceCatalog(entries: SeedanceCatalogEntry[]): Promise<SeedanceCatalogState> {
  const { data } = await apiClient.put<SeedanceCatalogState>('/admin/settings/seedance-catalog', { entries })
  return data
}

export async function resetSeedanceCatalog(): Promise<SeedanceCatalogState> {
  const { data } = await apiClient.delete<SeedanceCatalogState>('/admin/settings/seedance-catalog')
  return data
}
