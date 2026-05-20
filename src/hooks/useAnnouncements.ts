import { useQuery } from '@tanstack/react-query'
import { fetchAnnouncements } from '@/api/announcements'

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
