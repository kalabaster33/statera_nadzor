'use client'

import { useEffect } from 'react'
import { initSyncEngine } from '@/lib/sync'

export function SyncProvider() {
  useEffect(() => {
    initSyncEngine()
  }, [])
  return null
}
