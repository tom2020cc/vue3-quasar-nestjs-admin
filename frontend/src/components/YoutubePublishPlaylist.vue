<template>
  <div class="playlist-setting rounded-borders q-pa-md">
    <div class="row items-center q-mb-sm">
      <q-icon name="playlist_play" size="22px" color="primary" class="q-mr-sm" />
      <span class="text-weight-medium">所属播放列表</span>
      <q-space />
      <q-btn flat dense color="primary" icon="add" label="新建列表" :disable="!accountId || disabled || creating" @click="openCreate" />
    </div>
    <q-select :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event || null)"
      :options="options" emit-value map-options clearable outlined dense bg-color="white"
      label="选择已有列表（可选）" :display-value="modelValue ? undefined : '不加入播放列表'"
      :loading="loading" :disable="!accountId || disabled || creating || loading">
      <template #no-option><q-item><q-item-section>该频道暂无播放列表，可新建列表或直接发布</q-item-section></q-item></template>
      <template #after><q-btn flat round icon="refresh" aria-label="刷新播放列表" :disable="!accountId || disabled || creating || loading" @click="load" /></template>
    </q-select>
    <div v-if="error" class="text-negative text-caption q-mt-sm" role="alert">{{ error }}</div>
    <div class="text-caption text-grey-7 q-mt-sm">留空则直接发布。批量发布的 YouTube 视频使用同一个列表。</div>
    <q-dialog v-model="dialog" persistent>
      <q-card style="width: 460px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">新建 YouTube 播放列表</div>
          <div class="text-caption text-grey-7 q-mt-xs">目标频道：{{ channelLabel }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-md q-pt-none">
          <q-input v-model="title" outlined autofocus label="列表名称" maxlength="150" counter :disable="creating" />
          <q-select v-model="privacy" :options="privacyOptions" emit-value map-options outlined label="列表可见范围" :disable="creating" />
          <div class="text-caption text-grey-7">点击“创建并选择”会立即在此 YouTube 频道创建列表。这里只设置列表可见范围，不改变视频自身的可见性。</div>
          <q-banner v-if="createError" dense class="bg-red-1 text-negative rounded-borders">{{ createError }}</q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="取消" :disable="creating" @click="dialog = false" />
          <q-btn unelevated color="primary" label="创建并选择" :loading="creating" :disable="!title.trim()" @click="create" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Notify } from 'quasar'
import { createYoutubePlaylist, getYoutubePlaylists } from '@/api/youtube'

const props = defineProps<{ accountId: string | null; channelLabel: string; modelValue: string | null; disabled: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null]; busy: [value: boolean] }>()
const lists = ref<{ id: string; title: string }[]>([])
const options = computed(() => lists.value.map(p => ({ label: p.title, value: p.id })))
const loading = ref(false)
const error = ref('')
const dialog = ref(false)
const creating = ref(false)
const title = ref('')
const privacy = ref('private')
const createError = ref('')
const privacyOptions = [{ label: '私密', value: 'private' }, { label: '不公开（知道链接的人可查看）', value: 'unlisted' }, { label: '公开', value: 'public' }]
let loadVersion = 0
async function load() {
  const version = ++loadVersion
  const accountId = props.accountId
  error.value = ''
  if (!accountId) { loading.value = false; return }
  loading.value = true
  try {
    const res = await getYoutubePlaylists(accountId, true)
    if (version !== loadVersion || accountId !== props.accountId) return
    lists.value = res.data.data
    if (props.modelValue && !lists.value.some(p => p.id === props.modelValue)) emit('update:modelValue', null)
  } catch (e: any) {
    if (version === loadVersion) error.value = e.response?.data?.message || '列表加载失败，请点击右侧刷新重试'
  } finally { if (version === loadVersion) loading.value = false }
}
watch(() => props.accountId, () => {
  emit('update:modelValue', null)
  lists.value = []
  dialog.value = false
  void load()
}, { immediate: true })
function openCreate() {
  title.value = ''
  privacy.value = 'private'
  createError.value = ''
  dialog.value = true
}
async function create() {
  if (!props.accountId || creating.value || !title.value.trim()) return
  const accountId = props.accountId
  creating.value = true
  emit('busy', true)
  try {
    const res = await createYoutubePlaylist({ accountId, title: title.value.trim(), privacyStatus: privacy.value })
    if (accountId !== props.accountId) return
    ++loadVersion // Do not let an older list response remove the newly created entry.
    loading.value = false
    lists.value.push(res.data.data)
    emit('update:modelValue', res.data.data.id)
    dialog.value = false
    error.value = ''
    Notify.create({ type: 'positive', message: '列表已创建并选中，发布后会将视频加入此列表' })
  } catch (e: any) {
    createError.value = e.response?.data?.message || '创建结果未确认，请先取消并刷新列表，确认是否已创建后再试'
  } finally { creating.value = false; emit('busy', false) }
}
</script>

<style scoped>
.playlist-setting { border: 1px solid #dce6f2; background: #f6f9fd; }
</style>
