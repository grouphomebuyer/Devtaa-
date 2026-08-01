import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Plus, Send, Trash2 } from 'lucide-react';
import {
  AmountInput,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormField,
  Input,
  Modal,
  Money,
  PageBody,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  cn,
  formatDate,
  formatMoney,
  toISODate,
  useToast,
} from '@/design';
import { useApp } from '@/app/context';
import {
  useBoqLines,
  useBudgetAvailability,
  useCreateRequisition,
  useItemSearch,
  useStores,
} from '@/lib/queries';
import { AicosApiError } from '@/mocks/types';
import { BudgetPanel } from './BudgetPanel';

// ---------------------------------------------------------------------------
// Schema — the same shape the server validates (Phase 3 §2.3: schemas shared
// from `packages/contracts`; this local copy is the placeholder for that
// import until the contracts package publishes procurement schemas).
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  item_id: z.string().min(1, 'Choose an item from the master.'),
  boq_line_id: z.string().min(1, 'Every line must be charged to a BOQ line.'),
  quantity: z
    .number({ invalid_type_error: 'Enter a quantity.' })
    .positive('Quantity must be more than zero.'),
  estimated_rate: z
    .number({ invalid_type_error: 'Enter an estimated rate.' })
    .nonnegative('Rate cannot be negative.'),
  required_by: z.string().min(1, 'Enter the date the material is needed on site.'),
  remarks: z.string().max(200, 'Keep remarks under 200 characters.').optional(),
});

const requisitionSchema = z.object({
  project_id: z.string().min(1, 'Select a project.'),
  store_id: z.string().min(1, 'Select the receiving store.'),
  priority: z.enum(['normal', 'urgent']),
  justification: z
    .string()
    .min(10, 'Explain why this is needed — at least 10 characters. The approver sees this.'),
  lines: z.array(lineSchema).min(1, 'Add at least one line.'),
});

type RequisitionFormValues = z.infer<typeof requisitionSchema>;

const emptyLine = (): RequisitionFormValues['lines'][number] => ({
  item_id: '',
  boq_line_id: '',
  quantity: 0,
  estimated_rate: 0,
  required_by: toISODate(new Date(Date.now() + 5 * 86_400_000)),
  remarks: '',
});

export function RequisitionForm() {
  const { session, project, setProjectId } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [activeLine, setActiveLine] = useState(0);
  const [itemQuery, setItemQuery] = useState('');
  const [deviationOpen, setDeviationOpen] = useState(false);
  const [created, setCreated] = useState<{ document_no: string; routed_to: string } | null>(null);

  const defaultProject = project?.id ?? session?.projects[0]?.id ?? '';

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RequisitionFormValues>({
    resolver: zodResolver(requisitionSchema),
    mode: 'onBlur',
    defaultValues: {
      project_id: defaultProject,
      store_id: '',
      priority: 'normal',
      justification: '',
      lines: [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control });

  const projectId = values.project_id ?? defaultProject;
  const { data: boqLines = [] } = useBoqLines(projectId);
  const { data: stores = [] } = useStores(projectId);
  const { data: items = [] } = useItemSearch(itemQuery);

  // `defaultValues` are read once, but the session (and therefore the default
  // project) arrives asynchronously — adopt it as soon as it is known.
  useEffect(() => {
    if (!values.project_id && defaultProject) setValue('project_id', defaultProject);
  }, [defaultProject, values.project_id, setValue]);

  // keep the store valid when the project changes
  useEffect(() => {
    if (stores.length > 0 && !stores.some((s) => s.id === values.store_id)) {
      setValue('store_id', stores[0].id);
    }
  }, [stores, values.store_id, setValue]);

  const lines = (values.lines ?? []) as Partial<RequisitionFormValues['lines'][number]>[];
  const active = lines[activeLine];
  const requestedValue = (active?.quantity ?? 0) * (active?.estimated_rate ?? 0);

  const { data: budget, isFetching: budgetLoading } = useBudgetAvailability(
    active?.boq_line_id || null,
    Math.round(requestedValue),
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (l?.quantity ?? 0) * (l?.estimated_rate ?? 0), 0),
    [lines],
  );

  const create = useCreateRequisition();

  const onSubmit = handleSubmit(async (form) => {
    try {
      const result = await create.mutateAsync({
        project_id: form.project_id,
        store_id: form.store_id,
        priority: form.priority,
        justification: form.justification,
        lines: form.lines.map((l) => ({
          item_id: l.item_id,
          boq_line_id: l.boq_line_id,
          quantity: l.quantity,
          estimated_rate: l.estimated_rate,
          required_by: l.required_by,
          remarks: l.remarks,
        })),
      });
      setCreated({ document_no: result.document_no, routed_to: result.routed_to });
      toast.success(`${result.document_no} submitted`, `Routed to ${result.routed_to}.`);
    } catch (err) {
      if (err instanceof AicosApiError) {
        const details = err.error.details as { breaches?: { line: string }[] } | undefined;
        toast.error(
          err.error.message,
          details?.breaches
            ? `Lines over budget: ${details.breaches.map((b) => b.line).join(', ')}. Reduce the quantity or raise a deviation.`
            : err.error.code,
        );
      } else {
        toast.error('The requisition could not be submitted.');
      }
    }
  });

  const itemOptions = [
    { value: '', label: 'Search and select an item…' },
    ...items.map((i) => ({
      value: i.id,
      label: `${i.code} — ${i.name}`,
      group: i.category,
    })),
  ];

  const boqOptions = [
    { value: '', label: 'Select BOQ line…' },
    ...boqLines.map((b) => ({
      value: b.id,
      label: `${b.code} · ${b.name} — ${formatMoney(b.available)} available`,
    })),
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/approvals' },
          { label: 'Procurement' },
          { label: 'New requisition' },
        ]}
        title="Purchase requisition"
        subtitle="Raise a material request against a BOQ line. Availability is checked live, before you submit."
        meta={<Badge tone="neutral">Draft</Badge>}
        actions={
          <>
            <Button variant="ghost" onClick={() => void navigate({ to: '/approvals' })}>
              Cancel
            </Button>
            <Button
              variant="primary"
              iconLeft={<Send aria-hidden />}
              loading={isSubmitting || create.isPending}
              onClick={() => void onSubmit()}
            >
              Submit for approval
            </Button>
          </>
        }
      />

      <PageBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div className="grid content-start gap-4">
            <Card>
              <CardHeader title="Request details" size="sm" />
              <CardBody className="grid gap-3 md:grid-cols-2">
                <FormField label="Project" required error={errors.project_id?.message}>
                  <Controller
                    control={control}
                    name="project_id"
                    render={({ field }) => (
                      <Select
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          setProjectId(e.target.value);
                        }}
                        invalid={Boolean(errors.project_id)}
                        options={(session?.projects ?? []).map((p) => ({
                          value: p.id,
                          label: `${p.code} · ${p.name}`,
                        }))}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label="Receiving store"
                  required
                  error={errors.store_id?.message}
                  hint="Where the material will be booked in on delivery."
                >
                  <Controller
                    control={control}
                    name="store_id"
                    render={({ field }) => (
                      <Select
                        {...field}
                        invalid={Boolean(errors.store_id)}
                        options={stores.map((s) => ({ value: s.id, label: s.name }))}
                        placeholder="Select a store"
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label="Priority"
                  required
                  hint="Urgent requests route directly to the Director."
                >
                  <Controller
                    control={control}
                    name="priority"
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={[
                          { value: 'normal', label: 'Normal — 8 hour SLA' },
                          { value: 'urgent', label: 'Urgent — 2 hour SLA, Director routing' },
                        ]}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label="Justification"
                  required
                  className="md:col-span-2"
                  error={errors.justification?.message}
                  hint="Shown on the approval card. Be specific — it is the difference between a decision in minutes and a return."
                >
                  <Textarea
                    {...register('justification')}
                    invalid={Boolean(errors.justification)}
                    placeholder="e.g. Required for the 7th slab casting on 06-08-2026; current stock covers 3.5 days."
                  />
                </FormField>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Lines"
                size="sm"
                description={`${fields.length} line${fields.length === 1 ? '' : 's'} · click a row to see its budget position`}
                actions={
                  <>
                    <SearchInput
                      label="Filter the item master"
                      value={itemQuery}
                      onValueChange={setItemQuery}
                      placeholder="Filter items"
                      className="w-52"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={<Plus aria-hidden />}
                      onClick={() => {
                        append(emptyLine());
                        setActiveLine(fields.length);
                      }}
                    >
                      Add line
                    </Button>
                  </>
                }
              />
              <CardBody padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse">
                    <colgroup>
                      <col style={{ width: '30px' }} />
                      <col style={{ width: '26%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '104px' }} />
                      <col style={{ width: '104px' }} />
                      <col style={{ width: '96px' }} />
                      <col style={{ width: '132px' }} />
                      <col style={{ width: '38px' }} />
                    </colgroup>
                    <caption className="sr-only">
                      Requisition lines. Each line charges a BOQ line; the budget panel updates for
                      the selected row.
                    </caption>
                    <thead>
                      <tr className="border-b border-line bg-surface-subtle text-left">
                        {['#', 'Item', 'BOQ line', 'Quantity', 'Est. rate', 'Value', 'Required by', ''].map(
                          (h, i) => (
                            <th
                              key={h + i}
                              scope="col"
                              className={cn(
                                'px-2 py-1.5 text-micro font-semibold uppercase tracking-wide text-content-secondary',
                                ['Quantity', 'Est. rate', 'Value'].includes(h) && 'text-right',
                              )}
                            >
                              {h || <span className="sr-only">Actions</span>}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => {
                        const line = lines[index];
                        const value = (line?.quantity ?? 0) * (line?.estimated_rate ?? 0);
                        const item = items.find((i) => i.id === line?.item_id);
                        const lineErrors = errors.lines?.[index];
                        return (
                          <tr
                            key={field.id}
                            onFocusCapture={() => setActiveLine(index)}
                            onClick={() => setActiveLine(index)}
                            className={cn(
                              'border-b border-line-subtle align-top',
                              activeLine === index && 'bg-surface-selected/50',
                            )}
                          >
                            <td className="px-2 py-2 text-micro text-content-tertiary">
                              {index + 1}
                            </td>
                            <td className="px-2 py-2">
                              <Controller
                                control={control}
                                name={`lines.${index}.item_id`}
                                render={({ field: f }) => (
                                  <Select
                                    {...f}
                                    aria-label={`Item for line ${index + 1}`}
                                    selectSize="sm"
                                    invalid={Boolean(lineErrors?.item_id)}
                                    options={itemOptions}
                                    onChange={(e) => {
                                      f.onChange(e);
                                      const chosen = items.find((i) => i.id === e.target.value);
                                      if (chosen) {
                                        if (chosen.default_boq_line_id) {
                                          setValue(
                                            `lines.${index}.boq_line_id`,
                                            chosen.default_boq_line_id,
                                          );
                                        }
                                        if (chosen.last_rate) {
                                          setValue(
                                            `lines.${index}.estimated_rate`,
                                            Number(chosen.last_rate),
                                          );
                                        }
                                      }
                                    }}
                                  />
                                )}
                              />
                              {item?.last_rate && (
                                <p className="mt-1 text-micro text-content-tertiary">
                                  Last purchased at {formatMoney(item.last_rate)}/{item.uom} on{' '}
                                  {formatDate(item.last_purchased_at)}
                                </p>
                              )}
                              {lineErrors?.item_id && (
                                <p role="alert" className="mt-0.5 text-micro text-danger">
                                  {lineErrors.item_id.message}
                                </p>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <Controller
                                control={control}
                                name={`lines.${index}.boq_line_id`}
                                render={({ field: f }) => (
                                  <Select
                                    {...f}
                                    aria-label={`BOQ line for line ${index + 1}`}
                                    selectSize="sm"
                                    invalid={Boolean(lineErrors?.boq_line_id)}
                                    options={boqOptions}
                                  />
                                )}
                              />
                              {lineErrors?.boq_line_id && (
                                <p role="alert" className="mt-0.5 text-micro text-danger">
                                  {lineErrors.boq_line_id.message}
                                </p>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <Controller
                                control={control}
                                name={`lines.${index}.quantity`}
                                render={({ field: f }) => (
                                  <AmountInput
                                    aria-label={`Quantity for line ${index + 1}`}
                                    inputSize="sm"
                                    currency={false}
                                    decimals={3}
                                    uom={item?.uom}
                                    value={f.value}
                                    onValueChange={(v) => f.onChange(v ?? 0)}
                                    onBlur={f.onBlur}
                                    invalid={Boolean(lineErrors?.quantity)}
                                    className="w-32"
                                  />
                                )}
                              />
                              {lineErrors?.quantity && (
                                <p role="alert" className="mt-0.5 text-micro text-danger">
                                  {lineErrors.quantity.message}
                                </p>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <Controller
                                control={control}
                                name={`lines.${index}.estimated_rate`}
                                render={({ field: f }) => (
                                  <AmountInput
                                    aria-label={`Estimated rate for line ${index + 1}`}
                                    inputSize="sm"
                                    value={f.value}
                                    onValueChange={(v) => f.onChange(v ?? 0)}
                                    onBlur={f.onBlur}
                                    invalid={Boolean(lineErrors?.estimated_rate)}
                                    className="w-32"
                                  />
                                )}
                              />
                            </td>
                            <td className="px-2 py-2 text-right text-dense">
                              <Money value={value} />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="date"
                                inputSize="sm"
                                aria-label={`Required by date for line ${index + 1}`}
                                invalid={Boolean(lineErrors?.required_by)}
                                {...register(`lines.${index}.required_by`)}
                                className="w-36"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                iconOnly
                                aria-label={`Remove line ${index + 1}`}
                                disabled={fields.length === 1}
                                onClick={() => {
                                  remove(index);
                                  setActiveLine(0);
                                }}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-subtle">
                        <td colSpan={5} className="px-2 py-2 text-right text-dense font-medium">
                          Estimated value
                        </td>
                        <td className="px-2 py-2 text-right text-dense font-semibold">
                          <Money value={total} strong />
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {errors.lines?.message && (
                  <p role="alert" className="px-3 py-2 text-xs text-danger">
                    {errors.lines.message}
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {/* live budget panel */}
          <div className="grid content-start gap-4 xl:sticky xl:top-4 xl:self-start">
            <BudgetPanelSlot
              activeLine={activeLine}
              loading={budgetLoading}
              budget={budget}
              onRequestDeviation={() => setDeviationOpen(true)}
            />

            <Card>
              <CardHeader title="What happens next" size="sm" />
              <CardBody>
                <ol className="grid gap-2 text-xs text-content-secondary">
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[9px] font-bold text-primary-text">
                      1
                    </span>
                    Routed by delegation-of-authority to{' '}
                    {values.priority === 'urgent' ? 'the Director' : 'the Project Manager'}.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[9px] font-bold text-primary-text">
                      2
                    </span>
                    Approver sees this justification, the budget position and the last purchase rate.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[9px] font-bold text-primary-text">
                      3
                    </span>
                    On approval, procurement consolidates open lines into an RFQ or a purchase order.
                  </li>
                </ol>
                <p className="mt-3 flex items-start gap-1.5 rounded border border-line bg-surface-subtle px-2 py-1.5 text-micro text-content-tertiary">
                  <Info aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                  Target: 45 seconds to submit, decision within 8 hours (Phase 6 §9).
                </p>
              </CardBody>
            </Card>
          </div>
        </form>
      </PageBody>

      {/* budget deviation stub */}
      <Modal
        open={deviationOpen}
        onClose={() => setDeviationOpen(false)}
        title="Request a budget deviation"
        description="Not implemented in this build."
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setDeviationOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-dense text-content-secondary">
          The deviation workflow (BD document type, contingency drawdown and re-forecast) is
          specified in Phase 2 but is not part of this frontend slice. From here it would open a
          pre-filled deviation for the shortfall on this BOQ line and submit both documents
          together.
        </p>
      </Modal>

      {/* submitted confirmation */}
      <Modal
        open={created !== null}
        onClose={() => {
          setCreated(null);
          void navigate({ to: '/approvals' });
        }}
        title="Requisition submitted"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Raise another
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setCreated(null);
                void navigate({ to: '/approvals' });
              }}
            >
              Back to approvals
            </Button>
          </>
        }
      >
        <p className="text-dense text-content">
          <span className="font-mono font-medium">{created?.document_no}</span> has been submitted.
        </p>
        <p className="mt-1 text-dense text-content-secondary">
          Routed to {created?.routed_to}. You will be notified when a decision is taken.
        </p>
      </Modal>
    </>
  );
}

/** Split out so the panel re-renders on line focus without re-rendering the form. */
function BudgetPanelSlot({
  activeLine,
  budget,
  loading,
  onRequestDeviation,
}: {
  activeLine: number;
  budget: Parameters<typeof BudgetPanel>[0]['data'];
  loading: boolean;
  onRequestDeviation: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="text-micro uppercase tracking-wide text-content-tertiary">
        Live budget — line {activeLine + 1}
      </p>
      <BudgetPanel data={budget} loading={loading} onRequestDeviation={onRequestDeviation} />
    </div>
  );
}
