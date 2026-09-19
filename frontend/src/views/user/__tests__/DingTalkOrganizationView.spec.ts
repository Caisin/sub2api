import { ref } from 'vue'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Select from '@/components/common/Select.vue'
import DingTalkOrganizationView from '../DingTalkOrganizationView.vue'

const state = vi.hoisted(() => ({ isAdmin: false, user: { id: 1 } }))
const api = vi.hoisted(() => ({ apps: vi.fn(), directory: vi.fn(), managers: vi.fn(), grants: vi.fn(), grant: vi.fn(), saveManager: vi.fn(), saveApps: vi.fn(), sync: vi.fn(), syncStatus: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state }))
vi.mock('@/api/dingtalk', () => ({ dingTalkAPI: () => api, publicDingTalkApps: vi.fn().mockResolvedValue([{ id: 'a', name: 'Engineering' }]) }))
vi.mock('@/api/user', () => ({ startOAuthBinding: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: ref('en'), t: (key: string) => key }) }))
vi.mock('@/components/layout/AppLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }))

enableAutoUnmount(afterEach)
afterEach(() => vi.useRealTimers())

function button(wrapper: ReturnType<typeof mount>, label: string) { return wrapper.findAll('button').find(b => b.text() === label)! }

describe('DingTalk organization quota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isAdmin = false
    api.apps.mockResolvedValue([{ id: 'a', name: 'Engineering', enabled: true }])
    api.directory.mockResolvedValue({ synced_at: new Date().toISOString(), departments: [{ id: 2, parent_id: 1, name: 'Team' }, { id: 3, parent_id: 2, name: 'Child' }], members: [{ department_id: 3, staff_id: 'staff', name: 'Member', user_id: 2, balance: 20 }] })
    api.managers.mockResolvedValue([{ user_id: 1, name: 'Manager', limit_cents: 10000, used_cents: 2500, enabled: true, departments: [{ app_id: 'a', department_id: 2 }, { app_id: 'b', department_id: 5 }] }])
    api.syncStatus.mockResolvedValue({ status: 'idle' })
    api.grants.mockResolvedValue([])
    api.grant.mockResolvedValue({ id: 1 })
  })
  it('shows scoped departments and remaining budget without administrator controls', async () => {
    const wrapper = mount(DingTalkOrganizationView, { props: { mode: 'allocation' } })
    await flushPromises()
    expect(wrapper.text()).toContain('$100.00 / $25.00 / $75.00')
    expect(wrapper.text()).not.toContain('Save applications')
    expect(wrapper.text()).not.toContain('Add manager')
    expect(wrapper.text()).not.toContain('Sync DingTalk directory')
    await wrapper.get('[aria-label="Expand/collapse Team"]').trigger('click')
    await button(wrapper, 'Child').trigger('click')
    expect(wrapper.text()).toContain('Member')
  })
  it('retries a failed allocation with the same request ID and amount', async () => {
    api.grant.mockRejectedValueOnce({ status: 0, message: 'Connection lost' }).mockResolvedValueOnce({ id: 1 })
    const wrapper = mount(DingTalkOrganizationView, { props: { mode: 'allocation' } })
    await flushPromises()
    await wrapper.get('[aria-label="Expand/collapse Team"]').trigger('click')
    await button(wrapper, 'Child').trigger('click')
    await button(wrapper, 'Add quota').trigger('click')
    await wrapper.get('[data-testid="grant-amount"]').setValue(12.5)
    await wrapper.get('[role="region"] form').trigger('submit')
    await flushPromises()
    expect(api.grant).toHaveBeenCalledTimes(1)
    const input = api.grant.mock.calls[0][0]
    expect(input).toMatchObject({ app_id: 'a', department_id: 3, target_id: 2, amount: 12.5 })
    expect(input.request_id.length).toBeGreaterThan(15)
    expect(wrapper.get('[data-testid="grant-amount"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[role="region"] form').trigger('submit')
    await flushPromises()
    expect(api.grant.mock.calls[1][0]).toEqual(input)
    expect(wrapper.text()).toContain('Quota credited')
  })
  it('updates a manager budget while preserving assignments in other applications', async () => {
    state.isAdmin = true
    const wrapper = mount(DingTalkOrganizationView)
    await flushPromises()
    await button(wrapper, 'Edit').trigger('click')
    await wrapper.get('[data-testid="manager-limit"]').setValue(150)
    await button(wrapper, 'Save manager').element.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(api.saveManager).toHaveBeenCalledWith(expect.objectContaining({ user_id: 1, limit_cents: 15000, departments: [{ app_id: 'a', department_id: 2 }, { app_id: 'b', department_id: 5 }] }))
  })
  it('collapses department branches and searches members across the organization', async () => {
    const wrapper = mount(DingTalkOrganizationView)
    await flushPromises()
    expect(wrapper.get('[aria-label="Expand/collapse Team"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('button').some(b => b.text() === 'Child')).toBe(false)
    await wrapper.get('[data-testid="member-search"]').setValue('staff')
    expect(wrapper.find('tbody').text()).toContain('Member')
    await wrapper.get('[data-testid="member-search"]').setValue('missing')
    expect(wrapper.find('tbody').text()).not.toContain('Member')
    await wrapper.get('[aria-label="Expand/collapse Team"]').trigger('click')
    expect(button(wrapper, 'Child')).toBeDefined()
  })
  it('defaults a new manager to 500 and selects the member departments from a searchable dropdown', async () => {
    state.isAdmin = true
    const wrapper = mount(DingTalkOrganizationView)
    await flushPromises()
    expect(wrapper.findAll('button').some(b => b.text() === 'Add quota')).toBe(false)
    await button(wrapper, 'Add manager').trigger('click')
    expect((wrapper.get('[data-testid="manager-limit"]').element as HTMLInputElement).value).toBe('500')
    const select = wrapper.findComponent(Select)
    expect(select.props('searchable')).toBe(true)
    await select.get('button').trigger('click')
    await flushPromises()
    const input = document.querySelector('.select-search-input') as HTMLInputElement
    input.value = 'Member'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const option = document.querySelector('[role="option"]') as HTMLElement
    expect(option.textContent).toContain('Member (#2)')
    option.click()
    await flushPromises()
    await button(wrapper, 'Save manager').element.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(api.saveManager).toHaveBeenCalledWith(expect.objectContaining({ user_id: 2, limit_cents: 50000, departments: [{ app_id: 'a', department_id: 3 }] }))
  })
  it('submits a background sync and polls until completion without blocking other controls', async () => {
    vi.useFakeTimers()
    state.isAdmin = true
    const wrapper = mount(DingTalkOrganizationView)
    await flushPromises()
    api.sync.mockResolvedValue({ status: 'running', job_id: 'job' })
    api.syncStatus.mockResolvedValue({ status: 'running', job_id: 'job' })
    await button(wrapper, 'Sync DingTalk directory').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Sync is running in the background')
    expect(button(wrapper, 'Refresh').attributes('disabled')).toBeUndefined()
    api.syncStatus.mockResolvedValue({ status: 'succeeded', job_id: 'job' })
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(api.directory).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Directory and members synced')
    wrapper.unmount()
    const calls = api.syncStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(api.syncStatus).toHaveBeenCalledTimes(calls)
  })
  it('keeps configuration out of the allocation menu for administrators', async () => {
    state.isAdmin = true
    const wrapper = mount(DingTalkOrganizationView, { props: { mode: 'allocation' } })
    await flushPromises()
    await wrapper.get('[aria-label="Expand/collapse Team"]').trigger('click')
    await button(wrapper, 'Child').trigger('click')
    expect(button(wrapper, 'Add quota')).toBeDefined()
    expect(wrapper.text()).not.toContain('Add manager')
    expect(wrapper.text()).not.toContain('Save applications')
    expect(wrapper.text()).toContain('System administrators can credit members in all organizations')
  })

  it('searches and collapses manager departments without losing selected permissions', async () => {
    state.isAdmin = true
    const wrapper = mount(DingTalkOrganizationView)
    await flushPromises()
    await button(wrapper, 'Add manager').trigger('click')
    const departments = wrapper.get('[data-testid="manager-departments"]')
    expect(departments.text()).not.toContain('Child')
    await wrapper.get('[data-testid="manager-department-search"]').setValue('Child')
    expect(departments.text()).toContain('Team')
    expect(departments.text()).toContain('Child')
    const child = departments.findAll('label').find(label => label.text() === 'Child')!
    await child.get('input').setValue(true)
    await wrapper.get('[aria-label="Expand/collapse managed department Team"]').trigger('click')
    expect(departments.text()).not.toContain('Child')
    await wrapper.get('[data-testid="manager-department-search"]').setValue('')
    await wrapper.get('[aria-label="Expand/collapse managed department Team"]').trigger('click')
    expect((departments.findAll('label').find(label => label.text() === 'Child')!.get('input').element as HTMLInputElement).checked).toBe(true)
  })
  it('includes descendants once per member and limits allocation search to the selected subtree', async () => {
    const data = await api.directory()
    data.departments.push({ id: 4, parent_id: 3, name: 'Grandchild' }, { id: 5, parent_id: 1, name: 'Other' })
    data.members.push(
      { department_id: 4, staff_id: 'staff', name: 'Member', user_id: 2, balance: 20 },
      { department_id: 4, staff_id: 'nested', name: 'Nested member', user_id: 3, balance: 10 },
      { department_id: 5, staff_id: 'outside', name: 'Outside member', user_id: 4, balance: 30 }
    )
    const wrapper = mount(DingTalkOrganizationView, { props: { mode: 'allocation' } })
    await flushPromises()
    expect(wrapper.get('tbody').findAll('tr')).toHaveLength(2)
    expect(wrapper.get('tbody').text()).toContain('Nested member')
    expect(wrapper.get('tbody').text()).not.toContain('Outside member')
    await wrapper.get('[data-testid="member-search"]').setValue('Outside')
    expect(wrapper.get('tbody').findAll('tr')).toHaveLength(0)
    await wrapper.get('[data-testid="member-search"]').setValue('')
    await button(wrapper, 'Other').trigger('click')
    expect(wrapper.get('tbody').findAll('tr')).toHaveLength(1)
    expect(wrapper.get('tbody').text()).toContain('Outside member')
  })

})
