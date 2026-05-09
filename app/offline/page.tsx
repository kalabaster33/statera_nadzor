import { WifiOff } from 'lucide-react'
import Link from 'next/link'

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] grid place-items-center text-center py-10">
      <div className="space-y-4">
        <WifiOff className="size-16 text-text-muted mx-auto" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">You're offline</h1>
        <p className="text-text-secondary max-w-xs">
          Some features need an internet connection. You can still log new visits — they'll sync when you're back online.
        </p>
        <Link href="/visits/new" className="btn-primary">
          Continue logging
        </Link>
      </div>
    </div>
  )
}
