import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { FileQuestion } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { Button, EmptyState, PageBody } from '@/design';
import { ApprovalsScreen } from '@/features/approvals/ApprovalsScreen';
import { MembersScreen } from '@/features/members/MembersScreen';
import { ModulePlaceholder } from '@/features/misc/ModulePlaceholder';
import { ProjectScreen } from '@/features/projects/ProjectScreen';
import { ProjectsListScreen } from '@/features/projects/ProjectsListScreen';
import { ReconciliationWorkbench } from '@/features/reconciliation/ReconciliationWorkbench';
import { RequisitionForm } from '@/features/requisitions/RequisitionForm';

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => (
    <PageBody>
      <EmptyState
        icon={<FileQuestion aria-hidden />}
        title="Page not found"
        description="The address does not match any screen in this build."
        action={
          <Link to="/approvals">
            <Button variant="primary">Go to approvals</Button>
          </Link>
        }
      />
    </PageBody>
  ),
});

/** The Director's home is the approval queue, not a menu tree (UX-1). */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/approvals' });
  },
});

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvals',
  component: ApprovalsScreen,
});

const requisitionNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requisitions/new',
  component: RequisitionForm,
});

const reconciliationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reconciliation',
  component: ReconciliationWorkbench,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsListScreen,
});

/** Tab state lives in the URL — a tab must be linkable and back-navigable. */
const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = projectDetailRoute.useParams();
  const { tab } = projectDetailRoute.useSearch();
  const navigate = projectDetailRoute.useNavigate();
  return (
    <ProjectScreen
      projectId={projectId}
      tab={tab ?? 'overview'}
      onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })}
    />
  );
}

const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members',
  component: MembersScreen,
});

const modulePlaceholderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/modules/$moduleKey',
  component: function ModulePage() {
    const { moduleKey } = modulePlaceholderRoute.useParams();
    return <ModulePlaceholder moduleKey={moduleKey} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  approvalsRoute,
  requisitionNewRoute,
  reconciliationRoute,
  projectsRoute,
  projectDetailRoute,
  membersRoute,
  modulePlaceholderRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
