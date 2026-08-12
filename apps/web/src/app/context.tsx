import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from '@/lib/queries';
import type { Company, ProjectRef, SessionContext } from '@/mocks/types';

interface AppContextValue {
  session: SessionContext | undefined;
  loading: boolean;
  company: Company | undefined;
  project: ProjectRef | undefined;
  setCompanyId: (id: string) => void;
  /** `null` = "All projects". */
  setProjectId: (id: string | null) => void;
  navCollapsed: boolean;
  toggleNav: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

const STORAGE = {
  company: 'aicos.company',
  project: 'aicos.project',
  nav: 'aicos.nav-collapsed',
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * Application context: the active legal entity and project. Every request to
 * the API carries these as `X-Company-Id` and a project filter, so they belong
 * above the router rather than in each screen.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useSession();
  const [companyId, setCompanyIdState] = useState<string | null>(() => read(STORAGE.company));
  const [projectId, setProjectIdState] = useState<string | null>(() => read(STORAGE.project));
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => read(STORAGE.nav) === '1');
  const [commandOpen, setCommandOpen] = useState(false);

  const setCompanyId = useCallback((id: string) => {
    setCompanyIdState(id);
    write(STORAGE.company, id);
  }, []);

  const setProjectId = useCallback((id: string | null) => {
    setProjectIdState(id);
    write(STORAGE.project, id);
  }, []);

  const toggleNav = useCallback(() => {
    setNavCollapsed((prev) => {
      write(STORAGE.nav, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const company =
      session?.companies.find((c) => c.id === companyId) ?? session?.companies[0];
    const project = session?.projects.find((p) => p.id === projectId);
    return {
      session,
      loading: isLoading,
      company,
      project,
      setCompanyId,
      setProjectId,
      navCollapsed,
      toggleNav,
      commandOpen,
      setCommandOpen,
    };
  }, [
    session,
    isLoading,
    companyId,
    projectId,
    setCompanyId,
    setProjectId,
    navCollapsed,
    toggleNav,
    commandOpen,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
