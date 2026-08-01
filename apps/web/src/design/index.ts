/**
 * AI-COS design system — the single import surface for UI primitives.
 *
 * Screens import from `@/design`; they never reach into a component file
 * directly, and never re-implement formatting.
 */
export { cn } from './cn';
export * from './format';

export { Button, ButtonGroup } from './components/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button';

export { Input, Textarea, AmountInput, SearchInput } from './components/Input';
export type { InputProps, TextareaProps, AmountInputProps } from './components/Input';

export { Select } from './components/Select';
export type { SelectProps, SelectOption } from './components/Select';

export { FormField, FieldSet, useFieldProps } from './components/FormField';

export {
  Badge,
  StatusChip,
  DocumentStatusChip,
  ConfidenceBadge,
  CountBadge,
  DOCUMENT_STATUS,
} from './components/Badge';
export type { Tone, BadgeProps } from './components/Badge';

export { Card, CardHeader, CardBody, CardFooter, DetailItem, DetailList } from './components/Card';

export { KpiTile, TileRow, MeterBar } from './components/Tile';
export type { KpiTileProps } from './components/Tile';

export { DataGrid } from './components/DataGrid';
export type { Column, DataGridProps, Density } from './components/DataGrid';

export { Modal, ConfirmDialog } from './components/Modal';
export type { ModalProps } from './components/Modal';

export { ToastProvider, useToast } from './components/Toast';
export type { Toast } from './components/Toast';

export { Tabs, TabPanel } from './components/Tabs';
export type { TabItem } from './components/Tabs';

export { Breadcrumb } from './components/Breadcrumb';
export type { Crumb } from './components/Breadcrumb';

export { EmptyState } from './components/EmptyState';

export { Menu } from './components/Menu';
export type { MenuItem } from './components/Menu';

export { Money, MoneyBreakdown } from './components/Money';

export { PageHeader, PageBody, Toolbar, KeyHint } from './components/Page';
