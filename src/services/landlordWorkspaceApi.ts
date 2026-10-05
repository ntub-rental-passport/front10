import { landlordDownload, landlordRequest } from '@/src/services/landlordApiClient'

// ---------------- 帳務 ----------------

export type ChargeKind = 'rent' | 'water' | 'electricity' | 'other'
export type ChargeStatus = 'pending' | 'overdue' | 'paid' | 'partial' | 'void'
export type PaymentMethod = 'bank-transfer' | 'cash' | 'line-pay' | 'other'

export interface LandlordChargePayment {
  id: number
  amount: number
  paid_on: string
  method: PaymentMethod
  note: string | null
  created_at: string
}

export interface LandlordCharge {
  id: number
  lease_id: number
  tenant_id: number
  tenant: string
  tenant_bound: boolean
  property_id: number
  property: string
  room: string
  kind: ChargeKind
  title: string
  period_start: string
  period_end: string
  due_date: string
  amount: number
  paid: number
  balance: number
  status: ChargeStatus
  partial: boolean
  overdue: boolean
  carried: boolean
  voided: boolean
  void_reason: string | null
  reminded_at: string | null
  payments: LandlordChargePayment[]
  events: Array<{ kind: string; detail: string; at: string }>
}

export interface ChargeTotals {
  total: number
  received: number
  awaiting: number
  overdue: number
  partial_received: number
  rate: number
}

export interface LandlordExpense {
  id: string
  title: string
  category: string
  amount: number
  spent_on: string
  note: string | null
  source: 'manual' | 'repair'
  property_id?: number | null
  repair_ticket_id?: number
}

export function fetchCharges(month?: string) {
  return landlordRequest<{ month: string; items: LandlordCharge[]; totals: ChargeTotals }>(
    `/landlord/finance/charges${month ? `?month=${month}` : ''}`,
  )
}
export function recordChargePayment(id: number, payload: { amount: number; paid_on: string; method: PaymentMethod; note?: string }) {
  return landlordRequest<LandlordCharge>(`/landlord/finance/charges/${id}/payments`, 'POST', payload)
}
export function reverseChargePayment(id: number, paymentId: number, reason: string) {
  return landlordRequest<LandlordCharge>(`/landlord/finance/charges/${id}/payments/${paymentId}/reverse`, 'POST', { reason })
}
export function remindCharge(id: number) {
  return landlordRequest<LandlordCharge>(`/landlord/finance/charges/${id}/remind`, 'POST')
}
export function voidCharge(id: number, reason: string) {
  return landlordRequest<LandlordCharge>(`/landlord/finance/charges/${id}/void`, 'POST', { reason })
}
export function createCharge(payload: {
  lease_id: number
  kind: Exclude<ChargeKind, 'rent'>
  title: string
  amount: number
  due_date: string
  period_start?: string
  period_end?: string
}) {
  return landlordRequest<LandlordCharge>('/landlord/finance/charges', 'POST', payload)
}
export function fetchExpenses(month?: string) {
  return landlordRequest<{ month: string; items: LandlordExpense[]; total: number }>(
    `/landlord/finance/expenses${month ? `?month=${month}` : ''}`,
  )
}
export function createExpense(payload: { title: string; category: string; amount: number; spent_on: string; property_id?: number | null; note?: string }) {
  return landlordRequest<LandlordExpense>('/landlord/finance/expenses', 'POST', payload)
}
export function deleteExpense(id: number) {
  return landlordRequest<{ deleted_id: number }>(`/landlord/finance/expenses/${id}`, 'DELETE')
}

// ---------------- 合約 ----------------

export type ContractState = 'active' | 'expiring' | 'expired' | 'archived' | 'upcoming'

export interface ContractFile {
  id: number
  name: string
  content_type: string
  size: number
  uploaded_at: string
}

export interface LandlordContract {
  lease_id: number
  tenant_id: number
  contract_id: string
  tenant: string
  phone: string
  email: string | null
  national_id_masked: string | null
  contact_address: string | null
  property_id: number
  property: string
  property_address: string
  room_id: number
  room: string
  start: string
  end: string
  moved_out_at: string | null
  rent: number
  deposit: number
  payment_day: number
  payment_frequency: string
  state: ContractState
  effective: boolean
  account_bound: boolean
  renewed_by_lease_id: number | null
  files: ContractFile[]
  created_at: string
}

export function fetchContracts() {
  return landlordRequest<{ items: LandlordContract[] }>('/landlord/contracts')
}
export function uploadContractFile(leaseId: number, name: string, data: string) {
  return landlordRequest<ContractFile>(`/landlord/contracts/${leaseId}/files`, 'POST', { name, data })
}
export function deleteContractFile(leaseId: number, fileId: number) {
  return landlordRequest<{ deleted_id: number }>(`/landlord/contracts/${leaseId}/files/${fileId}`, 'DELETE')
}
export function downloadContractFile(leaseId: number, file: ContractFile) {
  return landlordDownload(`/landlord/contracts/${leaseId}/files/${file.id}`, file.name)
}
export function renewLease(tenantId: number, payload: {
  lease_start: string
  lease_end: string
  monthly_rent: number
  deposit_amount: number
  payment_day: number
  payment_frequency: string
  contract_id?: string
  room_id?: number
}) {
  return landlordRequest<{ lease_id: number }>(`/landlord/tenants/${tenantId}/renew`, 'POST', payload)
}

// ---------------- 租客邀請 ----------------

export interface InvitationStatus {
  lease_id: number
  bound: boolean
  bound_email: string | null
  bound_at: string | null
  invitation: null | {
    id: number
    state: 'pending' | 'accepted' | 'revoked' | 'expired'
    invited_email: string | null
    expires_at: string
    created_at: string
    accepted_at: string | null
  }
}

export interface CreatedInvitation extends InvitationStatus {
  token: string
  code: string
  path: string
}

export function fetchInvitation(leaseId: number) {
  return landlordRequest<InvitationStatus>(`/landlord/invitations/leases/${leaseId}`)
}
export function createInvitation(leaseId: number, email?: string) {
  return landlordRequest<CreatedInvitation>(`/landlord/invitations/leases/${leaseId}`, 'POST', { email: email || null })
}
export function revokeInvitation(leaseId: number) {
  return landlordRequest<InvitationStatus>(`/landlord/invitations/leases/${leaseId}/revoke`, 'POST')
}
export function unbindLeaseAccount(leaseId: number) {
  return landlordRequest<InvitationStatus>(`/landlord/invitations/leases/${leaseId}/unbind`, 'POST')
}

// ---------------- 設定、紀錄、團隊、待辦 ----------------

export type MemberRole = 'manager' | 'accounting' | 'viewer'
export type WorkspaceRole = MemberRole | 'owner'

export interface LandlordSettings {
  display_name: string
  email: string
  email_verified: boolean
  phone: string
  workspace_name: string
  email_notifications: boolean
  rent_reminders: boolean
  contract_reminders: boolean
  repair_notifications: boolean
  reminder_days: number
  created_at: string
}

export interface AuditEvent {
  id: number
  at: string
  category: string
  title: string
  detail: string
  result: 'success' | 'warning'
  actor: string
}

export interface TeamMember {
  id: number
  email: string
  name: string
  role: MemberRole
  role_label: string
  status: 'pending' | 'active' | 'expired'
  invited_at: string
  joined_at: string | null
}

export interface WorkspaceOption {
  owner_id: number
  name: string
  role: WorkspaceRole
  role_label: string
}

export interface OverviewTask {
  id: string
  kind: 'rent' | 'contract' | 'utility' | 'maintenance'
  bucket: 'overdue' | 'today' | 'upcoming'
  date: string
  title: string
  meta: string
  timing: string
  route: string
}

export function fetchWorkspaces() {
  return landlordRequest<{ items: WorkspaceOption[] }>('/landlord/workspaces')
}
export function fetchLandlordSettings() {
  return landlordRequest<LandlordSettings>('/landlord/settings')
}
export function saveLandlordProfile(payload: { display_name: string; phone: string; workspace_name: string }) {
  return landlordRequest<LandlordSettings>('/landlord/settings/profile', 'PUT', payload)
}
export function saveLandlordNotifications(payload: Pick<LandlordSettings, 'email_notifications' | 'rent_reminders' | 'contract_reminders' | 'repair_notifications' | 'reminder_days'>) {
  return landlordRequest<LandlordSettings>('/landlord/settings/notifications', 'PUT', payload)
}
export function fetchAudit() {
  return landlordRequest<{ items: AuditEvent[] }>('/landlord/audit')
}
export function fetchTeam() {
  return landlordRequest<{ owner: { email: string; name: string }; items: TeamMember[] }>('/landlord/team')
}
export function inviteTeamMember(email: string, role: MemberRole) {
  return landlordRequest<TeamMember & { path: string; notified: boolean }>('/landlord/team', 'POST', { email, role })
}
export function changeTeamRole(id: number, role: MemberRole) {
  return landlordRequest<TeamMember>(`/landlord/team/${id}`, 'PATCH', { role })
}
export function removeTeamMember(id: number) {
  return landlordRequest<{ deleted_id: number }>(`/landlord/team/${id}`, 'DELETE')
}
export function previewTeamInvitation(token: string) {
  return landlordRequest<{
    workspace_name: string
    owner_name: string
    role: MemberRole
    role_label: string
    status: string
    email_matches: boolean
    owner_id: number
  }>(`/landlord/team-invitations/${token}`)
}
export function acceptTeamInvitation(token: string) {
  return landlordRequest<{ owner_id: number; role: MemberRole }>(`/landlord/team-invitations/${token}/accept`, 'POST')
}
export function fetchOverviewTasks() {
  return landlordRequest<{ items: OverviewTask[] }>('/landlord/overview/tasks')
}
