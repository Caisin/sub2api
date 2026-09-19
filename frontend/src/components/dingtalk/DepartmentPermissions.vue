<template>
  <details open class="rounded-lg border p-3 dark:border-dark-600">
    <summary class="cursor-pointer text-sm font-medium">{{ text('负责部门', 'Managed departments') }} · {{ text('已选', 'Selected') }} {{ selected.length }}</summary>
    <label class="my-3 block text-sm">{{ text('搜索部门名称或 ID', 'Search department name or ID') }}<input v-model="search" data-testid="manager-department-search" type="search" class="input mt-1" /></label>
    <div class="max-h-80 overflow-auto" data-testid="manager-departments">
      <div v-for="dept in visibleRows" :key="dept.id" class="flex items-center gap-1 py-1 text-sm" :style="{ paddingLeft: `${dept.depth * 16}px` }">
        <button v-if="dept.hasChildren" type="button" class="shrink-0 rounded p-1" :aria-expanded="expanded.has(dept.id)" :aria-label="`${text('展开/收起权限部门', 'Expand/collapse managed department')} ${dept.name}`" @click="toggle(dept.id)">{{ expanded.has(dept.id) ? '▾' : '▸' }}</button>
        <span v-else class="w-6 shrink-0" />
        <label><input type="checkbox" :checked="selected.includes(dept.id)" @change="$emit('toggle', dept.id, ($event.target as HTMLInputElement).checked)" /> {{ dept.name }}</label>
      </div>
      <p v-if="!visibleRows.length" class="py-3 text-gray-500">{{ text('无匹配部门', 'No matching departments') }}</p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DingTalkDepartment } from '@/api/dingtalk'
import { buildDingTalkDepartmentRows } from '@/utils/dingtalkDepartments'
const props = defineProps<{ departments: DingTalkDepartment[]; selected: number[] }>()
defineEmits<{ (event: 'toggle', id: number, checked: boolean): void }>()
const { locale } = useI18n()
const text = (zh: string, en: string) => locale.value.startsWith('zh') ? zh : en
const search = ref('')
const expanded = ref(new Set<number>())
const rows = computed(() => buildDingTalkDepartmentRows(props.departments))
const matches = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return null
  const keep = new Set<number>()
  const ancestors: number[] = []
  for (const d of rows.value) {
    ancestors.length = d.depth
    if (`${d.name} ${d.id}`.toLocaleLowerCase().includes(query)) { keep.add(d.id); ancestors.forEach(id => keep.add(id)) }
    ancestors.push(d.id)
  }
  return keep
})
watch(matches, ids => { ids?.forEach(id => expanded.value.add(id)) })
const visibleRows = computed(() => {
  let hiddenBelow = Infinity
  return rows.value.filter(d => {
    if (d.depth > hiddenBelow) return false
    hiddenBelow = expanded.value.has(d.id) ? Infinity : d.depth
    return !matches.value || matches.value.has(d.id)
  })
})
function toggle(id: number) { if (expanded.value.has(id)) expanded.value.delete(id); else expanded.value.add(id) }
</script>
