import apiClient from './client'

export interface DingTalkApp {
  id: string
  name: string
  client_id: string
  client_secret?: string
  client_secret_configured?: boolean
  redirect_url: string
  corp_id: string
  enabled: boolean
}
export interface DingTalkDepartment { id: number; parent_id: number; name: string }
export interface DingTalkMember { department_id: number; staff_id: string; name: string; user_id: number; balance: number }
export interface DingTalkDirectory { departments: DingTalkDepartment[]; members: DingTalkMember[]; synced_at: string | null }
export interface DingTalkSyncJob { job_id: string; status: 'idle' | 'running' | 'succeeded' | 'failed'; error: string; departments: number; members: number }
export interface DingTalkUsageRow { id: string; name: string; app_id?: string; company_id?: string; members: number; requests: number; cost: number }
export interface DingTalkStatistics {
  organizations: { id: string; name: string; company_id: string; departments: DingTalkDepartment[] }[]
  companies: DingTalkUsageRow[]
  departments: DingTalkUsageRow[]
  users: DingTalkUsageRow[]
  total: DingTalkUsageRow
}
export interface DingTalkStatisticsFilter { start: string; end: string; company_id?: string; app_id?: string; department_id?: number }
export interface DingTalkManager {
  user_id: number
  name?: string
  limit_cents: number
  used_cents: number
  enabled: boolean
  departments: { app_id: string; department_id: number }[]
}
export interface DingTalkGrant { id: number; actor_id: number; target_id: number; app_id: string; department_id: number; amount_cents: number; created_at: string }
export interface DingTalkGrantInput { app_id: string; department_id: number; target_id: number; amount: number; request_id: string }
export async function publicDingTalkApps() {
  return (await apiClient.get<{ id: string; name: string }[]>('/auth/oauth/dingtalk/apps')).data
}
export function dingTalkAPI(admin: boolean) {
  const base = admin ? '/admin/dingtalk' : '/organization/dingtalk'
  return {
    apps: async () => (await apiClient.get<DingTalkApp[]>(`${base}/apps`)).data,
    saveApps: async (apps: DingTalkApp[]) => (await apiClient.put<DingTalkApp[]>(`${base}/apps`, { apps })).data,
    directory: async (app: string) => (await apiClient.get<DingTalkDirectory>(`${base}/apps/${encodeURIComponent(app)}/directory`)).data,
    sync: async (app: string) => (await apiClient.post<DingTalkSyncJob>(`${base}/apps/${encodeURIComponent(app)}/sync`)).data,
    syncStatus: async (app: string) => (await apiClient.get<DingTalkSyncJob>(`${base}/apps/${encodeURIComponent(app)}/sync`)).data,
    statistics: async (params: DingTalkStatisticsFilter) => (await apiClient.get<DingTalkStatistics>(`${base}/statistics`, { params })).data,
    managers: async () => (await apiClient.get<DingTalkManager[]>(`${base}/managers`)).data,
    saveManager: async (manager: DingTalkManager) => apiClient.put(`${base}/managers`, manager),
    grants: async () => (await apiClient.get<DingTalkGrant[]>(`${base}/grants`)).data,
    grant: async (input: DingTalkGrantInput) => (await apiClient.post<DingTalkGrant>(`${base}/grants`, input)).data
  }
}
