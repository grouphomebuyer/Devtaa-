import { Outlet } from '@tanstack/react-router';
import { useApprovalSummary } from '@/lib/queries';
import { CommandPalette } from './CommandPalette';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';

/**
 * Application shell: fixed top bar, collapsible left navigation, and a single
 * scrolling content region. Nothing outside `<main>` scrolls, which is what
 * makes dense grids workable.
 */
export function AppShell() {
  const { data: summary } = useApprovalSummary();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <TopBar />

      <div className="flex min-h-0 flex-1">
        <SideNav approvalCount={summary?.awaiting_count ?? 0} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-none"
        >
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
