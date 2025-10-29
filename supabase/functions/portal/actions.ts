import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { withState } from './stateStore.ts';
import { nowISO, uid, ROLES, ensureArray } from './utils.ts';

interface ActionContext {
  user: any | null;
}

function requireRole(user: any, allowed: string[]) {
  if (!user || !allowed.includes(user.role)) {
    const roles = allowed.join(', ');
    throw new Error(`Acceso denegado. Se requiere rol: ${roles}`);
  }
}

export async function executeAction(
  supabase: SupabaseClient,
  slug: string,
  action: string,
  payload: any = {},
  context: ActionContext,
) {
  const user = context?.user || null;
  switch (action) {
    case 'users.upsertProfile':
      return withState(supabase, slug, (draft) => {
        const existing = draft.users.find((item: any) => item.id === payload.id);
        if (existing) {
          existing.email = payload.email ?? existing.email;
          existing.name = payload.name ?? existing.name;
          existing.role = payload.role ?? existing.role;
          existing.updatedAt = nowISO();
          existing.phone = payload.phone ?? existing.phone ?? null;
          existing.timezone = payload.timezone ?? existing.timezone ?? draft.parameters.tz;
          if (payload.passwordHash) existing.passwordHash = payload.passwordHash;
          return draft;
        }
        draft.users.push({
          id: payload.id,
          email: payload.email,
          name: payload.name,
          role: payload.role ?? ROLES.CLIENTE,
          passwordHash: payload.passwordHash ?? null,
          phone: payload.phone ?? null,
          timezone: payload.timezone ?? draft.parameters.tz,
          status: payload.status ?? 'active',
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
        return draft;
      });

    case 'audit.add':
      return withState(supabase, slug, (draft) => {
        draft.audit.push({
          id: uid('audit'),
          userId: payload.userId ?? user?.id ?? null,
          type: payload.type,
          message: payload.message,
          payload: payload.payload || null,
          timestamp: nowISO(),
        });
        return draft;
      });

    case 'approvals.queue':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        draft.approvals.push({
          id: uid('approval'),
          status: 'pending',
          action: payload.action,
          entityId: payload.entityId,
          entityType: payload.entityType,
          reason: payload.reason || null,
          requestedBy: payload.userId ?? user?.id ?? null,
          createdAt: nowISO(),
          decidedBy: null,
          decidedAt: null,
          decisionComment: null,
        });
        return draft;
      });

    case 'approvals.resolve': {
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR]);
      const { approvalId, approved, comment } = payload;
      return withState(supabase, slug, (draft) => {
        const entry = draft.approvals.find((item: any) => item.id === approvalId);
        if (!entry) {
          throw new Error('Solicitud no encontrada');
        }
        if (entry.status !== 'pending') {
          throw new Error('La solicitud ya fue resuelta');
        }
        entry.status = approved ? 'approved' : 'rejected';
        entry.decidedBy = user.id;
        entry.decidedAt = nowISO();
        entry.decisionComment = comment || null;

        if (approved && entry.action === 'fee_mark_paid') {
          const fee = draft.fees.find((f: any) => f.id === entry.entityId);
          if (fee) {
            fee.status = 'paid';
            fee.paidAt = nowISO();
          }
        }

        if (approved && entry.action === 'case_archive') {
          const caseItem = draft.cases.find((c: any) => c.id === entry.entityId);
          if (caseItem) {
            caseItem.archivedAt = nowISO();
            caseItem.status = 'archivada';
          }
        }

        return draft;
      });
    }

    case 'notifications.send':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        draft.notifications.push({
          id: uid('notif'),
          title: payload.title,
          body: payload.body,
          channel: payload.channel || 'interno',
          userIds: ensureArray(payload.userIds),
          createdAt: nowISO(),
        });
        return draft;
      });

    case 'cases.markReviewed':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        const current = draft.cases.find((item: any) => item.id === payload.caseId);
        if (!current) throw new Error('Causa no encontrada');
        current.lastReviewedAt = nowISO();
        if (payload.novelty === 'yes' && !payload.onlyReviewed) {
          current.lastActivityAt = nowISO();
          draft.alerts.push({
            id: uid('alert'),
            caseId: payload.caseId,
            type: 'pjud_review',
            message: payload.note || 'Marcada como revisada con novedad',
            createdAt: nowISO(),
            userId: user?.id ?? null,
          });
        }
        return draft;
      });

    case 'tasks.complete':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        const task = draft.tasks.find((item: any) => item.id === payload.taskId);
        if (!task) throw new Error('Tarea no encontrada');
        task.status = 'done';
        task.completedAt = nowISO();
        return draft;
      });

    case 'cases.update':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA]);
      return withState(supabase, slug, (draft) => {
        const current = draft.cases.find((item: any) => item.id === payload.caseId);
        if (!current) throw new Error('Causa no encontrada');
        current.name = payload.name ?? current.name;
        current.court = payload.court ?? current.court;
        current.rit = payload.rit ?? current.rit;
        current.ruc = payload.ruc ?? current.ruc;
        current.tags = payload.tags ?? current.tags;
        current.updatedAt = nowISO();
        return draft;
      });

    case 'cases.create':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        const caseId = uid('case');
        draft.cases.push({
          id: caseId,
          name: payload.name,
          court: payload.court,
          rit: payload.rit || null,
          ruc: payload.ruc || null,
          clientUserId: payload.clientUserId || null,
          status: payload.status || 'activa',
          tags: payload.tags || [],
          createdAt: nowISO(),
          updatedAt: nowISO(),
          lastActivityAt: nowISO(),
          lastReviewedAt: null,
          participants: payload.participants || [],
        });
        if (payload.initialTask) {
          draft.tasks.push({
            id: uid('task'),
            ...payload.initialTask,
            caseId,
            createdAt: nowISO(),
            status: 'pending',
            visibleToClient: false,
          });
        }
        return draft;
      });

    case 'cases.archive':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR]);
      return withState(supabase, slug, (draft) => {
        const current = draft.cases.find((item: any) => item.id === payload.caseId);
        if (!current) throw new Error('Causa no encontrada');
        current.status = 'archivada';
        current.archivedAt = nowISO();
        return draft;
      });

    case 'tasks.create':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        draft.tasks.push({
          id: uid('task'),
          caseId: payload.caseId || null,
          title: payload.title,
          description: payload.description || null,
          dueDate: payload.dueDate || null,
          createdAt: nowISO(),
          status: 'pending',
          priority: payload.priority || 'normal',
          visibility: payload.visibility || 'interno',
          visibleToClient: payload.visibleToClient ?? false,
          ownerId: payload.ownerId || user?.id || null,
        });
        return draft;
      });

    case 'documents.create':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        draft.documents.push({
          id: uid('doc'),
          caseId: payload.caseId,
          name: payload.name,
          description: payload.description || null,
          type: payload.type || 'otro',
          visibleToClient: payload.visibleToClient ?? false,
          createdAt: nowISO(),
          uploadedBy: user?.id ?? null,
          content: payload.content || null,
        });
        return draft;
      });

    case 'documents.toggleVisibility':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        const doc = draft.documents.find((item: any) => item.id === payload.docId);
        if (!doc) throw new Error('Documento no encontrado');
        doc.visibleToClient = !doc.visibleToClient;
        doc.updatedAt = nowISO();
        return draft;
      });

    case 'fees.create':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO]);
      return withState(supabase, slug, (draft) => {
        const feeId = uid('fee');
        draft.fees.push({
          id: feeId,
          caseId: payload.caseId,
          concept: payload.concept,
          currency: payload.currency || 'CLP',
          amount: payload.amount,
          iva: payload.includeIva ? 0.19 : 0,
          dueDate: payload.dueDate || null,
          status: 'pending',
          createdAt: nowISO(),
        });
        ensureArray(payload.splits).forEach((split: any) => {
          draft.feeSplits.push({
            id: uid('split'),
            feeId,
            userId: split.userId,
            percent: split.percent ?? null,
            amount: split.amount ?? null,
          });
        });
        return draft;
      });

    case 'fees.markPaid':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA]);
      return withState(supabase, slug, (draft) => {
        const fee = draft.fees.find((item: any) => item.id === payload.feeId);
        if (!fee) throw new Error('Honorario no encontrado');
        fee.status = 'paid';
        fee.paidAt = nowISO();
        return draft;
      });

    case 'notificationPrefs.save':
      return withState(supabase, slug, (draft) => {
        const prefs = draft.notificationPrefs.find((item: any) => item.userId === user?.id);
        if (prefs) {
          prefs.channels = payload.channels;
          prefs.quietHours = payload.quietHours;
          prefs.updatedAt = nowISO();
        } else {
          draft.notificationPrefs.push({
            id: uid('pref'),
            userId: user?.id ?? null,
            channels: payload.channels,
            quietHours: payload.quietHours,
            createdAt: nowISO(),
          });
        }
        return draft;
      });

    case 'chat.postMessage':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO, ROLES.CLIENTE]);
      return withState(supabase, slug, (draft) => {
        const threadId = payload.threadId || uid('thread');
        if (!payload.threadId) {
          draft.chats.push({
            id: threadId,
            caseId: payload.caseId || null,
            participantIds: payload.participantIds || [],
            createdAt: nowISO(),
          });
        }
        draft.chatMessages.push({
          id: uid('msg'),
          threadId,
          body: payload.body,
          createdAt: nowISO(),
          senderId: user?.id ?? null,
        });
        return draft;
      });

    case 'offices.book':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO]);
      return withState(supabase, slug, (draft) => {
        draft.officeBookings.push({
          id: uid('booking'),
          officeId: payload.officeId,
          start: payload.start,
          end: payload.end,
          reason: payload.reason,
          userId: user?.id ?? null,
          createdAt: nowISO(),
        });
        return draft;
      });

    case 'meetings.create':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR, ROLES.SOCIO_MAYORISTA, ROLES.SOCIO, ROLES.ASOCIADO, ROLES.ABOGADO_ASOCIADO, ROLES.CLIENTE]);
      return withState(supabase, slug, (draft) => {
        draft.meetings.push({
          id: uid('meeting'),
          caseId: payload.caseId || null,
          title: payload.title,
          description: payload.description || null,
          start: payload.start,
          end: payload.end,
          participantIds: payload.participantIds || [],
          requestedBy: user?.id ?? null,
          createdAt: nowISO(),
          status: 'scheduled',
        });
        return draft;
      });

    case 'accountRequests.create':
      return withState(supabase, slug, (draft) => {
        draft.accountRequests.push({
          id: uid('request'),
          name: payload.name,
          email: payload.email,
          phone: payload.phone || null,
          role: payload.role || ROLES.CLIENTE,
          comment: payload.comment || null,
          status: 'pending',
          createdAt: nowISO(),
        });
        return draft;
      });

    case 'accountRequests.resolve':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR]);
      return withState(supabase, slug, (draft) => {
        const request = draft.accountRequests.find((item: any) => item.id === payload.requestId);
        if (!request) throw new Error('Solicitud no encontrada');
        request.status = payload.status;
        request.resolvedAt = nowISO();
        request.resolvedBy = user?.id ?? null;
        return draft;
      });

    case 'settings.update':
      requireRole(user, [ROLES.ADMIN, ROLES.SOCIO_FUNDADOR]);
      return withState(supabase, slug, (draft) => {
        draft.parameters = {
          ...draft.parameters,
          ...payload,
        };
        return draft;
      });

    case 'profile.update':
      return withState(supabase, slug, (draft) => {
        const current = draft.users.find((item: any) => item.id === user?.id);
        if (!current) return draft;
        current.name = payload.name ?? current.name;
        current.phone = payload.phone ?? current.phone;
        current.timezone = payload.timezone ?? current.timezone;
        current.updatedAt = nowISO();
        return draft;
      });

    default:
      throw new Error(`Acción no soportada: ${action}`);
  }
}
