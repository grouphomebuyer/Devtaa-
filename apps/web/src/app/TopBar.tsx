import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Bell,
  Building2,
  ChevronDown,
  FolderKanban,
  HelpCircle,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react';
import { Badge, Button, Menu, cn, financialYearLabel, formatRelative, initials } from '@/design';
import { asRoute } from '@/lib/links';
import { useNotifications } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { useApp } from './context';

export function TopBar() {
  const { session, company, project, setCompanyId, setProjectId, setCommandOpen } = useApp();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { data: notifications = [] } = useNotifications();
  const unread = notifications.filter((n) => !n.read).length;
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!bellRef.current?.contains(e.target as Node)) setBellOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBellOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [bellOpen]);

  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      {/* wordmark */}
      <div className="flex items-center gap-2 pr-1">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[11px] font-bold text-primary-fg"
        >
          AI
        </span>
        <span className="text-dense font-semibold tracking-tight text-content">AI-COS</span>
      </div>

      <div aria-hidden className="mx-1 h-5 w-px bg-line" />

      {/* company switcher */}
      <Menu
        label="Switch company"
        width="w-80"
        items={(session?.companies ?? []).map((c) => ({
          id: c.id,
          label: c.short_name,
          description: `${c.name} · GSTIN ${c.gstin}`,
          selected: c.id === company?.id,
          onSelect: () => setCompanyId(c.id),
        }))}
        trigger={(props) => (
          <button
            {...props}
            ref={props.ref}
            type="button"
            className="flex h-7 max-w-[200px] items-center gap-1.5 rounded border border-transparent px-2 text-dense text-content transition-colors hover:border-line hover:bg-surface-hover"
          >
            <Building2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span className="truncate font-medium">{company?.short_name ?? 'Company'}</span>
            <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-content-tertiary" />
          </button>
        )}
      />

      {/* project switcher */}
      <Menu
        label="Switch project context"
        width="w-96"
        items={[
          {
            id: 'all',
            label: 'All projects',
            description: 'No project filter applied',
            selected: !project,
            onSelect: () => setProjectId(null),
          },
          ...(session?.projects ?? []).map((p) => ({
            id: p.id,
            label: `${p.code} · ${p.name}`,
            description: `${p.city} · ${p.engagement_model.replace(/_/g, ' ')} · ${p.status}`,
            selected: p.id === project?.id,
            onSelect: () => setProjectId(p.id),
            sectionStart: p.id === (session?.projects[0]?.id ?? '') ? 'Projects' : undefined,
          })),
        ]}
        trigger={(props) => (
          <button
            {...props}
            ref={props.ref}
            type="button"
            className="flex h-7 max-w-[220px] items-center gap-1.5 rounded border border-transparent px-2 text-dense text-content transition-colors hover:border-line hover:bg-surface-hover"
          >
            <FolderKanban aria-hidden className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span className="truncate">{project ? project.code : 'All projects'}</span>
            <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-content-tertiary" />
          </button>
        )}
      />

      {/* global search — opens the command palette */}
      <div className="mx-2 hidden min-w-0 flex-1 justify-center md:flex">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex h-7 w-full max-w-md items-center gap-2 rounded border border-line bg-surface-subtle px-2 text-xs text-content-tertiary transition-colors hover:border-line-strong hover:bg-surface"
        >
          <Search aria-hidden className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search documents, vendors, projects…</span>
          <kbd className="rounded border border-line bg-surface px-1 py-px font-mono text-micro">
            Ctrl K
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Badge tone="neutral" className="hidden lg:inline-flex">
          {financialYearLabel(new Date())}
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggle}
        >
          {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>

        {/* notifications */}
        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            className="relative flex h-8 w-8 items-center justify-center rounded text-content-secondary transition-colors hover:bg-surface-hover hover:text-content"
          >
            <Bell aria-hidden className="h-4 w-4" />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[9px] font-bold leading-none text-white"
              >
                {unread}
              </span>
            )}
          </button>

          {bellOpen && (
            <div
              role="dialog"
              aria-label="Notifications"
              className="absolute right-0 z-50 mt-1 w-96 overflow-hidden rounded-md border border-line bg-surface-raised shadow-popover animate-scale-in"
            >
              <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
                <h2 className="text-dense font-semibold text-content">Notifications</h2>
                <span className="text-micro text-content-tertiary">{unread} unread</span>
              </div>
              <ul className="max-h-96 overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        if (n.href) void navigate({ to: asRoute(n.href) });
                      }}
                      className="flex w-full gap-2 border-b border-line-subtle px-3 py-2 text-left last:border-b-0 hover:bg-surface-hover"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          n.read ? 'bg-transparent' : 'bg-primary',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-dense font-medium text-content">
                          {n.title}
                          {!n.read && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="block truncate text-xs text-content-secondary">
                          {n.body}
                        </span>
                        <span className="mt-0.5 block text-micro text-content-tertiary">
                          {formatRelative(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* user menu */}
        <Menu
          label="Account"
          align="end"
          width="w-60"
          items={[
            {
              id: 'profile',
              label: session?.user.name ?? 'User',
              description: `${session?.user.role_label ?? ''} · ${session?.user.email ?? ''}`,
              icon: <UserRound aria-hidden />,
              disabled: true,
            },
            {
              id: 'settings',
              label: 'Preferences',
              icon: <Settings aria-hidden />,
              sectionStart: 'Account',
            },
            { id: 'help', label: 'Help & keyboard shortcuts', icon: <HelpCircle aria-hidden /> },
            { id: 'logout', label: 'Sign out', icon: <LogOut aria-hidden />, danger: true },
          ]}
          trigger={(props) => (
            <button
              {...props}
              ref={props.ref}
              type="button"
              className="flex h-8 items-center gap-1.5 rounded px-1 transition-colors hover:bg-surface-hover"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-micro font-semibold text-primary-text"
              >
                {initials(session?.user.name ?? 'User')}
              </span>
              <span className="sr-only">Open account menu for {session?.user.name}</span>
              <ChevronDown aria-hidden className="h-3 w-3 text-content-tertiary" />
            </button>
          )}
        />
      </div>
    </header>
  );
}
