export const ROLES = {
  ADMIN: 'admin',
  SOCIO_FUNDADOR: 'socio_fundador',
  SOCIO_MAYORISTA: 'socio_mayorista',
  SOCIO: 'socio',
  ASOCIADO: 'asociado',
  ABOGADO_ASOCIADO: 'abogado_asociado',
  CLIENTE: 'cliente',
} as const;

export const ALL_ROLES = [
  ROLES.ADMIN,
  ROLES.SOCIO_FUNDADOR,
  ROLES.SOCIO_MAYORISTA,
  ROLES.SOCIO,
  ROLES.ASOCIADO,
  ROLES.ABOGADO_ASOCIADO,
  ROLES.CLIENTE,
] as const;

export type Role = (typeof ALL_ROLES)[number];

export function uid(prefix = ''): string {
  const value = crypto.randomUUID();
  return prefix ? `${prefix}_${value}` : value;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function sanitizeUsers(users: any[] = []) {
  return users.map(({ passwordHash, ...rest }) => rest);
}

export function deepClone<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

export function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

export function filterStateForUser(state: any, user: any | null) {
  const clone = deepClone(state);
  clone.users = sanitizeUsers(clone.users);
  if (!user) {
    return clone;
  }
  const role: Role = (user.role as Role) || ROLES.CLIENTE;
  if (role === ROLES.CLIENTE) {
    clone.accountRequests = [];
    clone.audit = [];
    clone.approvals = [];
    const allowedCaseIds = new Set(
      clone.cases.filter((c: any) => c.clientUserId === user.id).map((c: any) => c.id),
    );
    clone.cases = clone.cases.filter((c: any) => allowedCaseIds.has(c.id));
    clone.tasks = clone.tasks.filter((t: any) => allowedCaseIds.has(t.caseId) && t.visibleToClient);
    clone.documents = clone.documents.filter((d: any) => allowedCaseIds.has(d.caseId) && d.visibleToClient);
    clone.fees = clone.fees.filter((f: any) => allowedCaseIds.has(f.caseId));
    const allowedFeeIds = new Set(clone.fees.map((f: any) => f.id));
    clone.feeSplits = clone.feeSplits.filter((split: any) => allowedFeeIds.has(split.feeId));
    clone.events = clone.events.filter((evt: any) => evt.participantIds?.includes(user.id) || evt.visibility === 'clientes');
    clone.meetings = clone.meetings.filter((meeting: any) => meeting.participantIds?.includes(user.id) || meeting.requestedBy === user.id);
    clone.officeBookings = clone.officeBookings.filter((booking: any) => booking.userId === user.id);
    clone.chats = clone.chats.filter((thread: any) => thread.participantIds?.includes(user.id));
    const allowedThreadIds = new Set(clone.chats.map((thread: any) => thread.id));
    clone.chatMessages = clone.chatMessages.filter((msg: any) => allowedThreadIds.has(msg.threadId));
    clone.notifications = clone.notifications.filter((n: any) => !n.userIds || n.userIds.includes(user.id));
  }
  return clone;
}
