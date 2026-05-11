'use client'

/**
 * ProjectsContext — single source of truth for the projects list.
 *
 * Fetches the projects array exactly once per browser session (or until
 * invalidate() is called after a create/delete). All pages that need
 * the project list subscribe here instead of making their own fetch.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/types'

type ProjectsContextValue = {
  projects: Project[]
  loading: boolean
  /** Call after creating or deleting a project to refetch */
  invalidate: () => void
}

const ProjectsContext = createContext<ProjectsContextValue>({
  projects: [],
  loading: true,
  invalidate: () => {},
})

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('name')
    if (data) setProjects(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchProjects()
  }, [fetchProjects])

  const invalidate = useCallback(() => {
    fetchedRef.current = false
    fetchProjects()
  }, [fetchProjects])

  return (
    <ProjectsContext.Provider value={{ projects, loading, invalidate }}>
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  return useContext(ProjectsContext)
}
