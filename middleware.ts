import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Auth guard + session refresh.
 *
 * - Refreshes the Supabase session cookie on every request (required by @supabase/ssr).
 * - Redirects unauthenticated users to /login.
 * - /login and /offline stay public; API routes return 401 themselves
 *   (excluded here so fetch() callers get JSON, not an HTML redirect).
 *
 * Note: when the PWA is offline, pages are served from the service worker
 * cache and the middleware never runs — offline work is unaffected.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not run code between createServerClient and getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = path.startsWith('/login') || path.startsWith('/offline')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - api routes (they return 401 JSON themselves)
     * - Next.js internals and static assets
     * - PWA assets (manifest, service worker, icons, fonts)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|fonts).*)',
  ],
}
