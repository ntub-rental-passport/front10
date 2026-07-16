import { createAdminCollection, newId } from './useAdminStore'
import { getAuthSession } from '@/src/composables/useAuth'
import {
  seedAuditEvents,
  type AuditActionType,
  type AuditEvent,
} from '@/src/mocks/admin-seed'

const events = createAdminCollection<AuditEvent[]>('audit', seedAuditEvents)

export function useAdminAudit() {
  function logAction(action: AuditActionType, target: string, detail: string): void {
    events.value.unshift({
      id: newId('ev'),
      at: new Date().toISOString(),
      actor: getAuthSession()?.email ?? 'admin@rentmate.tw',
      action,
      target,
      detail,
    })
  }

  return { events, logAction }
}
