/**
 * TanStack Query bindings.
 *
 * Query keys are declared once here so cache invalidation after a mutation is
 * never guesswork. Every hook calls `api` from `@/mocks/api` — the single swap
 * point for the real backend.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from '@/mocks/api';
import type {
  ApprovalDecision,
  BudgetAvailability,
  RequisitionInput,
  Uuid,
} from '@/mocks/types';

export const qk = {
  session: ['session'] as const,
  notifications: ['notifications'] as const,
  approvals: (filters: Record<string, string | undefined>) => ['approvals', filters] as const,
  approvalSummary: ['approvals', 'summary'] as const,
  items: (q: string) => ['items', q] as const,
  boqLines: (projectId: string) => ['boq-lines', projectId] as const,
  stores: (projectId: string) => ['stores', projectId] as const,
  budget: (boqLineId: string, requested: number) =>
    ['budget-availability', boqLineId, requested] as const,
  reconSession: ['recon', 'session'] as const,
  reconLines: ['recon', 'lines'] as const,
  reconCandidates: (lineId: string) => ['recon', 'candidates', lineId] as const,
  project: (id: string) => ['project', id] as const,
  obligations: (month: string) => ['obligations', month] as const,
  paymentRun: (month: string) => ['payment-run', month] as const,
};

// --- session ---------------------------------------------------------------

export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: () => api.getSession(), staleTime: Infinity });
}

export function useNotifications() {
  return useQuery({ queryKey: qk.notifications, queryFn: () => api.getNotifications() });
}

// --- approvals -------------------------------------------------------------

export function useApprovalInbox(filters: {
  document_type?: string;
  project_id?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: qk.approvals(filters),
    queryFn: () => api.getApprovalInbox(filters),
  });
}

export function useApprovalSummary() {
  return useQuery({ queryKey: qk.approvalSummary, queryFn: () => api.getApprovalSummary() });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decision: ApprovalDecision) => api.decideApproval(decision),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useBulkApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, remarks }: { ids: Uuid[]; remarks: string }) =>
      api.bulkApprove(ids, remarks),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

// --- procurement -----------------------------------------------------------

export function useItemSearch(q: string) {
  return useQuery({ queryKey: qk.items(q), queryFn: () => api.searchItems(q) });
}

export function useBoqLines(projectId: string) {
  return useQuery({
    queryKey: qk.boqLines(projectId),
    queryFn: () => api.getBoqLines(projectId),
    enabled: Boolean(projectId),
  });
}

export function useStores(projectId: string) {
  return useQuery({
    queryKey: qk.stores(projectId),
    queryFn: () => api.getStores(projectId),
    enabled: Boolean(projectId),
  });
}

export function useBudgetAvailability(
  boqLineId: string | null,
  requested: number,
  options?: Partial<UseQueryOptions<BudgetAvailability>>,
) {
  return useQuery({
    queryKey: qk.budget(boqLineId ?? '', requested),
    queryFn: () => api.getBudgetAvailability(boqLineId!, requested),
    enabled: Boolean(boqLineId),
    ...options,
  });
}

export function useCreateRequisition() {
  return useMutation({ mutationFn: (input: RequisitionInput) => api.createRequisition(input) });
}

// --- reconciliation --------------------------------------------------------

export function useReconSession() {
  return useQuery({ queryKey: qk.reconSession, queryFn: () => api.getReconciliationSession() });
}

export function useStatementLines() {
  return useQuery({ queryKey: qk.reconLines, queryFn: () => api.getStatementLines() });
}

export function useMatchCandidates(lineId: string | null) {
  return useQuery({
    queryKey: qk.reconCandidates(lineId ?? ''),
    queryFn: () => api.getMatchCandidates(lineId!),
    enabled: Boolean(lineId),
  });
}

function useReconMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recon'] });
    },
  });
}

export function useMatchLine() {
  return useReconMutation(({ lineId, candidateId }: { lineId: string; candidateId: string }) =>
    api.matchLine(lineId, candidateId),
  );
}

export function useUnmatchLine() {
  return useReconMutation(({ lineId }: { lineId: string }) => api.unmatchLine(lineId));
}

export function useIgnoreLine() {
  return useReconMutation(({ lineId, reason }: { lineId: string; reason: string }) =>
    api.ignoreLine(lineId, reason),
  );
}

export function useAutoMatch() {
  return useReconMutation(({ threshold }: { threshold: number }) => api.autoMatch(threshold));
}

// --- project ---------------------------------------------------------------

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
}

export function useProject(id: string) {
  return useQuery({ queryKey: qk.project(id), queryFn: () => api.getProject(id) });
}

// --- members ---------------------------------------------------------------

export function useMemberObligations(month: string) {
  return useQuery({
    queryKey: qk.obligations(month),
    queryFn: () => api.getMemberObligations(month),
  });
}

export function usePaymentRunSummary(month: string) {
  return useQuery({
    queryKey: qk.paymentRun(month),
    queryFn: () => api.getPaymentRunSummary(month),
  });
}

export function useSubmitPaymentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, ids }: { month: string; ids: string[] }) =>
      api.submitPaymentRun(month, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payment-run'] });
      void qc.invalidateQueries({ queryKey: ['obligations'] });
    },
  });
}
