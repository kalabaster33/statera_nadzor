'use client'

import { useEffect, useState } from 'react'
import { WifiOff, CloudOff } from 'lucide-react'
import { db } from '@/lib/offline-db'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)

    const tick = async () => {
      if (!db) return
      const count = await db.queuedVisits.where('syncStatus').anyOf('pending', 'syncing', 'error').count()
      setPendingCount(count)
    }
    tick()
    const interval = setInterval(tick, 4000)

    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      clearInterval(interval)
    }
  }, [])

  if (online && pendingCount === 0) return null

  return (
    <div
      className={`sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium ${
        online ? 'bg-warning/15 text-warning border-b border-warning/30' : 'bg-danger/15 text-danger border-b border-danger/30'
      }`}
    >
      {online ? <CloudOff className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {online
        ? `${pendingCount} visit${pendingCount === 1 ? '' : 's'} queued — syncing…`
        : 'Offline · saving locally'}
    </div>
  )
}
