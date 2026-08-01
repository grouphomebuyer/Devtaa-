import {
  Banknote,
  Boxes,
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  FileText,
  HardHat,
  Inbox,
  LayoutGrid,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Shown as a count chip in the rail. */
  badgeKey?: 'approvals';
  /** Specified in Phase 6 but not part of this frontend slice. */
  placeholder?: boolean;
  /** Key passed to the placeholder route. */
  moduleKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Information architecture from Phase 6 §3. Modules marked `placeholder` are
 * specified in the design documents but are not implemented in this build —
 * they route to an honest "not in this build" screen rather than a dead link.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { label: 'Approvals', to: '/approvals', icon: Inbox, badgeKey: 'approvals' },
      { label: 'Projects', to: '/projects', icon: Building2 },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { label: 'New requisition', to: '/requisitions/new', icon: ShoppingCart },
      {
        label: 'Orders & RFQs',
        to: '/modules/procurement',
        icon: ClipboardCheck,
        placeholder: true,
        moduleKey: 'procurement',
      },
      {
        label: 'Materials & stock',
        to: '/modules/materials',
        icon: Boxes,
        placeholder: true,
        moduleKey: 'materials',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Bank reconciliation', to: '/reconciliation', icon: Banknote },
      {
        label: 'Invoices & payments',
        to: '/modules/finance',
        icon: FileText,
        placeholder: true,
        moduleKey: 'finance',
      },
      {
        label: 'Compliance calendar',
        to: '/modules/compliance',
        icon: CalendarCheck2,
        placeholder: true,
        moduleKey: 'compliance',
      },
    ],
  },
  {
    label: 'Society & site',
    items: [
      { label: 'Members', to: '/members', icon: Users },
      { label: 'Site & DPR', to: '/modules/site', icon: HardHat, placeholder: true, moduleKey: 'site' },
      {
        label: 'Reports',
        to: '/modules/reports',
        icon: LayoutGrid,
        placeholder: true,
        moduleKey: 'reports',
      },
      {
        label: 'Admin',
        to: '/modules/admin',
        icon: Settings,
        placeholder: true,
        moduleKey: 'admin',
      },
    ],
  },
];

/** Flat list used by the command palette. */
export const NAV_FLAT: NavItem[] = NAV.flatMap((g) => g.items);
