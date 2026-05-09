'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Geolocation } from '@/lib/types'

type GeoState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'acquired'; geo: Geolocation }
  | { status: 'denied'; message: string }
  | { status: 'unavailable' }

export function useGeolocation(autoCapture = false) {
  const [state, setState] = useState<GeoState>({ status: 'idle' })
  const watchId = useRef<number | null>(null)

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: 'unavailable' })
      return
    }
    setState({ status: 'requesting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'acquired',
          geo: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          },
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: 'denied', message: 'Location permission denied' })
        } else {
          setState({ status: 'denied', message: err.message })
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    )
  }, [])

  useEffect(() => {
    if (autoCapture) capture()
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [autoCapture, capture])

  const geo = state.status === 'acquired' ? state.geo : null
  return { state, geo, capture }
}
