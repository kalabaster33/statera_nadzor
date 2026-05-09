'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FolderOpen, FileText, Plus } from 'lucide-react'

const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/visits/new', label: 'New', icon: Plus, primary: true },
  { href: '/reports', label: 'Reports', icon: FileText },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-bg-secondary/95 backdrop-blur pb-safe-bottom">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-center -mt-6 size-14 rounded-2xl bg-accent text-bg-primary shadow-lg shadow-accent/30 active:scale-95 transition-transform"
                aria-label={label}
              >
                <Icon className="size-6" strokeWidth={2.5} />
              </Link>
            )
          }
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 transition-colors ${
                active ? 'text-accent' : 'text-text-muted'
              }`}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
