import { nowISO } from './utils.ts';

export interface PortalState {
  version: number;
  parameters: any;
  users: any[];
  contacts: any[];
  accountRequests: any[];
  cases: any[];
  tasks: any[];
  documents: any[];
  fees: any[];
  feeSplits: any[];
  expenses: any[];
  timeEntries: any[];
  alerts: any[];
  events: any[];
  meetings: any[];
  notifications: any[];
  notificationPrefs: any[];
  approvals: any[];
  audit: any[];
  offices: any[];
  officeBookings: any[];
  chats: any[];
  chatMessages: any[];
}

export function seedState(): PortalState {
  return {
    version: 1,
    parameters: {
      tz: 'America/Santiago',
      iva: 0.19,
      pjudThresholdDays: 2,
      staleCaseDays: 7,
      ufValue: 36000,
    },
    users: [],
    contacts: [],
    accountRequests: [],
    cases: [],
    tasks: [],
    documents: [],
    fees: [],
    feeSplits: [],
    expenses: [],
    timeEntries: [],
    alerts: [],
    events: [],
    meetings: [],
    notifications: [],
    notificationPrefs: [],
    approvals: [],
    audit: [],
    offices: [
      { id: 'office_quilpue', name: 'Quilpué', address: 'Thompson 889', createdAt: nowISO() },
      { id: 'office_santiago', name: 'Santiago', address: 'Pendiente', createdAt: nowISO() },
    ],
    officeBookings: [],
    chats: [],
    chatMessages: [],
  };
}

export interface StateRecord {
  slug: string;
  data: PortalState;
  version: number;
  updated_at: string;
}
