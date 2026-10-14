<template>
<q-page padding class="records-page">
      <div class="records-container">
        <q-card flat bordered>
          <q-card-section class="row items-center">
            <div class="text-h6">已上传视频列表 / 发布记录</div>
            <q-space /><q-btn outline color="primary" icon="add" label="发布新视频" to="/publish" class="q-mr-sm" />
            <q-btn flat dense round icon="refresh" @click="loadTasks()" :loading="taskLoading" />
          </q-card-section>
          <q-separator />
          <q-card-section class="q-py-sm">
            <q-input v-model="taskSearch" outlined dense clearable label="搜索视频标题或详情">
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </q-card-section>
          <q-table
            :rows="filteredTasks"
            :columns="taskColumns"
            :visible-columns="['title', 'description', 'status', 'createTime', 'actions']"
            no-data-label="暂无匹配的视频记录"
            row-key="id"
            :loading="taskLoading"
            :pagination="{ rowsPerPage: 10 }"
            flat
            bordered
          >
            <template #body-cell-title="props">
              <q-td :props="props" style="min-width: 160px; max-width: 260px; white-space: normal">
                <q-btn flat dense no-caps color="primary" style="text-align: left; overflow-wrap: anywhere" :label="props.row.title" @click="openDetail(props.row)" />
              </q-td>
            </template>
            <template #body-cell-description="props">
              <q-td :props="props" style="min-width: 160px; max-width: 240px; white-space: normal">
                <div class="ellipsis-2-lines">{{ props.row.description || '（无视频详情）' }}</div>
              </q-td>
            </template>
            <template v-slot:body-cell-index="props">
              <q-td :props="props">{{ props.rowIndex + 1 }}</q-td>
            </template>
            <template v-slot:body-cell-orientation="props">
              <q-td :props="props">
                <q-badge :color="props.row.orientation === 'landscape' ? 'info' : 'purple'" outline>
                  {{ props.row.orientation === 'landscape' ? '宽屏' : '窄屏' }}
                </q-badge>
              </q-td>
            </template>
            <template v-slot:body-cell-status="props">
              <q-td :props="props">
                <q-badge :color="statusColor(props.row.status)">
                  {{ statusLabel(props.row.status) }}
                </q-badge>
              </q-td>
            </template>
            <template v-slot:body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <q-btn flat dense color="primary" icon="visibility" label="视频详情" @click="openDetail(props.row)" />
                <q-btn v-if="['failed', 'partial'].includes(props.row.status)" flat dense color="warning" icon="replay" label="处理未完成项" @click="onRetry(props.row)" />
                <q-btn flat dense color="negative" icon="delete" label="删除" @click="onDelete(props.row)" />
              </q-td>
            </template>
          </q-table>
        </q-card>
        <q-expansion-item class="q-mt-md bg-white rounded-borders" icon="inventory_2" label="其他平台的历史记录" caption="保留已登记的网页发布结果">
          <TiktokBrowserRecords />
        </q-expansion-item>
      </div>
    <!-- 详情对话框 -->
    <q-dialog v-model="detailDialog">
      <q-card style="width: 760px; max-width: 95vw">
        <q-card-section class="text-h6">视频详情 / 发布记录</q-card-section>
        <q-card-section class="q-gutter-sm">
          <div style="overflow-wrap: anywhere"><b>视频标题：</b>{{ detailTask?.title }}</div>
          <div><b>视频详情 / 描述：</b></div>
          <div style="white-space: pre-wrap; overflow-wrap: anywhere">{{ detailTask?.description || '（无视频详情）' }}</div>
          <video v-if="detailTask?.videoUrl" :src="fullVideoUrl(detailTask.videoUrl)" :poster="detailTask.cover || undefined" controls preload="metadata" class="full-width rounded-borders bg-dark" style="max-height: 320px" />
          <div><b>尺寸：</b>{{ detailTask?.orientation === 'landscape' ? '宽屏' : '窄屏' }}（{{ detailTask?.width }} × {{ detailTask?.height }}）</div>
          <div><b>视频：</b><a :href="fullVideoUrl(detailTask?.videoUrl || '')" target="_blank">{{ detailTask?.videoFilename }}</a></div>
          <div><b>大小：</b>{{ formatSize(detailTask?.videoSize || 0) }}</div>
          <div><b>时长：</b>{{ formatDuration(detailTask?.duration || 0) }}</div>
          <div v-if="detailTask?.cover" class="row items-start">
            <span><b>封面：</b></span>
            <img :src="detailTask.cover" alt="封面" style="max-width: 160px; border-radius: 4px" />
          </div>
          <q-separator />
          <div class="text-subtitle2">各平台发布结果</div>
          <q-list bordered separator>
            <q-item v-for="r in detailTask?.records || []" :key="r.id">
              <q-item-section avatar>
                <q-icon :name="recordIcon(r.status)" :color="recordColor(r.status)" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="row items-center q-gutter-sm">
                  <span>{{ platformName(r.platform) }}</span>
                  <q-badge :color="r.youtubeDeletedAt ? 'grey' : recordColor(r.status)">{{ r.youtubeDeletedAt ? '旧视频已删除（历史记录）' : recordStatusLabel(r.status) }}</q-badge>
                  <q-badge v-if="r.mock" color="grey" outline>模拟</q-badge>
                  <q-badge v-if="r.status === 'processing' && r.pollCount" color="info" outline>轮询 {{ r.pollCount }} 次</q-badge>
                  <q-badge v-if="r.duplicate" color="negative" outline>重复</q-badge>
                </q-item-label>
                <q-item-label caption>{{ r.message || '—' }}</q-item-label>
                <q-item-label v-if="r.platform === 'tiktok'" caption>视频可见性：{{ tiktokPrivacyLabel(r.tiktokPrivacyLevel) }}</q-item-label>
                <q-item-label v-if="r.platform === 'tiktok'" caption>目标账号：{{ r.targetTiktokName || '旧记录（未绑定账号）' }} {{ r.targetTiktokOpenId || '' }}</q-item-label>
                <div v-if="r.platform === 'tiktok' && r.externalId && !r.mock && r.status === 'failed'" class="q-mt-sm">
                  <q-btn outline dense color="primary" icon="sync" label="检查平台状态" :loading="checkingStatus" @click="checkTiktokStatus" />
                  <div class="text-caption q-mt-xs">仅核对这次上传的结果，不会重新发送视频。</div>
                </div>
                <q-item-label v-if="r.platform === 'youtube'" caption>目标频道：{{ r.targetChannelTitle || '旧记录（未绑定频道）' }} {{ r.targetChannelId || '' }}</q-item-label>
                <div v-if="r.platform === 'youtube' && !r.mock && r.status === 'failed'" class="q-mt-sm">
                  <q-btn outline dense color="primary" icon="sync" label="核对 YouTube 结果" :loading="checkingStatus" @click="checkYoutubeStatus" />
                  <div class="text-caption q-mt-xs">先找回原视频，再继续处理所属列表；不会重新上传。</div>
                </div>
                <q-item-label v-if="r.youtubePlaylistId" caption>所属列表：{{ r.youtubePlaylistTitle }} · {{ r.youtubePlaylistAdded ? '已加入' : '待加入' }}</q-item-label>
                <q-item-label v-if="r.externalUrl" caption>
                  <a :href="r.externalUrl" target="_blank">{{ r.externalUrl }}</a>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="关闭" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
<q-dialog v-model="retryDialog" persistent>
  <q-card style="width: 620px; max-width: 95vw">
    <q-card-section class="text-h6">处理未完成项</q-card-section>
    <q-card-section class="q-gutter-sm">
      <div>视频：{{ retryTask?.title }}</div>
      <div>只处理未完成的平台，已成功的平台不再发送。YouTube 已有视频编号时继续核对原视频和所属列表，不重新上传。</div>
    </q-card-section>
    <q-card-actions align="right"><q-btn flat label="取消" :disable="retryBusy" v-close-popup />
      <q-btn color="primary" label="继续处理" :loading="retryBusy" @click="submitRetry" /></q-card-actions>
  </q-card>
</q-dialog>
</q-page>
</template>
<script setup lang="ts">
import TiktokBrowserRecords from '@/components/TiktokBrowserRecords.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { tiktokPrivacyLabel } from '@/api/tiktok'
import { Notify, Dialog } from 'quasar'
import { getPlatformList, type PlatformMeta } from '@/api/platform'
import { getPublishTasks, getPublishTask, retryPublishTask, removePublishTask, checkTiktokPublishStatus, checkYoutubePublishStatus, type PublishTask, type PublishTaskDetail } from '@/api/publish'
import { API_BASE_URL } from '@/utils/request'
const platforms = ref<PlatformMeta[]>([])
onMounted(async () => {
  loadTasks()
  try { platforms.value = (await getPlatformList()).data } catch {}
  refreshTimer = setInterval(autoRefresh, 5000)
})
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// 秒 → 可读时长
function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0 秒'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

const tasks = ref<PublishTask[]>([])
const taskSearch = ref('')
const filteredTasks = computed(() => {
  const keyword = (taskSearch.value || '').trim().toLocaleLowerCase()
  return tasks.value.filter(t => !keyword || `${t.title} ${t.description || ''}`.toLocaleLowerCase().includes(keyword))
})
const taskLoading = ref(false)
const taskColumns = [
  { name: 'index', label: '编号', align: 'center' as const, field: 'index' },
  { name: 'id', label: 'ID', align: 'center' as const, field: 'id' },
  { name: 'title', label: '视频标题', align: 'left' as const, field: 'title', sortable: true },
  { name: 'description', label: '视频详情', align: 'left' as const, field: 'description' },
  { name: 'orientation', label: '尺寸', align: 'center' as const, field: 'orientation' },
  { name: 'status', label: '状态', align: 'center' as const, field: 'status' },
  { name: 'createTime', label: '创建时间', align: 'center' as const, field: 'createTime', format: (value: string) => value ? new Date(value).toLocaleString() : '—' },
  { name: 'actions', label: '操作', align: 'center' as const, field: 'actions' },
]

async function loadTasks(silent = false) {
  if (!silent) taskLoading.value = true
  try {
    const res = await getPublishTasks()
    tasks.value = res.data
  } catch (e: any) {
    if (!silent) {
      Notify.create({ type: 'negative', message: e.response?.data?.message || '获取任务列表失败' })
    }
  } finally {
    if (!silent) taskLoading.value = false
  }
}

// 自动刷新：仅当存在「发布中」任务时刷新列表（避免无谓请求）；详情打开时始终同步详情
let refreshTimer: ReturnType<typeof setInterval> | null = null
async function autoRefresh() {
  if (tasks.value.some((t) => t.status === 'publishing')) {
    await loadTasks(true)
  }
  if (detailDialog.value && detailTask.value) {
    try {
      const res = await getPublishTask(detailTask.value.id)
      detailTask.value = res.data
    } catch (e) {
      // 忽略自动刷新错误
    }
  }
}

function statusLabel(s: string) {
  return { publishing: '发布中', success: '全部成功', partial: '部分成功', failed: '需处理', skipped: '全部跳过' }[s] || s
}
function statusColor(s: string) {
  return { publishing: 'orange', success: 'positive', partial: 'warning', failed: 'negative', skipped: 'grey' }[s] || 'grey'
}
function recordStatusLabel(s: string) {
  return { pending: '等待中', skipped: '已跳过', publishing: '发布中', processing: '处理中', success: '成功', failed: '失败' }[s] || s
}
function recordColor(s: string) {
  return { pending: 'grey', skipped: 'grey', publishing: 'orange', processing: 'info', success: 'positive', failed: 'negative' }[s] || 'grey'
}
function recordIcon(s: string) {
  return { success: 'check_circle', failed: 'error', publishing: 'hourglass_top', processing: 'autorenew', skipped: 'block', pending: 'schedule' }[s] || 'help'
}
function platformName(code: string) {
  return platforms.value.find((p) => p.code === code)?.name || code
}
function fullVideoUrl(url: string) {
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`
}

// ---- 详情 / 重试 / 删除 ----
const detailDialog = ref(false)
const detailTask = ref<PublishTaskDetail | null>(null)
const checkingStatus = ref(false)
async function checkYoutubeStatus() {
  if (!detailTask.value || checkingStatus.value) return
  const id = detailTask.value.id
  checkingStatus.value = true
  try {
    const { data } = await checkYoutubePublishStatus(id)
    if (detailTask.value?.id === id) detailTask.value = data
    await loadTasks(true)
    Notify.create({ type: 'positive', message: '已找回原视频，正在继续核对列表，没有重复上传' })
  } catch (e: any) { Notify.create({ type: 'negative', message: e.response?.data?.message || '核对失败，请稍后重试' }) }
  finally { checkingStatus.value = false }
}
async function checkTiktokStatus() {
  if (!detailTask.value || checkingStatus.value) return
  const id = detailTask.value.id
  checkingStatus.value = true
  try {
    const { data } = await checkTiktokPublishStatus(id)
    if (detailTask.value?.id === id) detailTask.value = data
    await loadTasks(true)
    Notify.create({ type: 'info', message: '已核对 TikTok 状态，请查看平台结果' })
  } catch (e: any) { Notify.create({ type: 'negative', message: e.response?.data?.message || '状态检查失败，请稍后重试' }) }
  finally { checkingStatus.value = false }
}

async function openDetail(row: PublishTask) {
  try {
    const res = await getPublishTask(row.id)
    detailTask.value = res.data
    detailDialog.value = true
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '获取详情失败' })
  }
}

const retryDialog = ref(false)
const retryTask = ref<PublishTaskDetail | null>(null)
const retryBusy = ref(false)
async function onRetry(row: PublishTask) {
  try {
    const { data } = await getPublishTask(row.id)
    if (data.records.some(r => ['pending', 'publishing', 'processing'].includes(r.status))) throw Error('任务仍在处理中，请等待完成')
    const eligible = data.records.filter(r => r.platform !== 'tiktok' && (r.status === 'failed' || (r.status === 'skipped' && !r.duplicate)))
    if (!eligible.length) throw Error('没有可重试的平台。TikTok 仅支持网页发布，请使用页面上的 TikTok 网页发布入口。')
    if (eligible.some(r => r.platform === 'youtube' && !r.mock && !r.externalId)) {
      detailTask.value = data; detailDialog.value = true
      Notify.create({ type: 'info', message: '先点击“核对 YouTube 结果”，避免上传成功但响应丢失造成重复视频。' })
      return
    }
    retryTask.value = data; retryDialog.value = true
  } catch (e: any) { Notify.create({ type: 'negative', message: e.response?.data?.message || e.message || '读取重试设置失败' }) }
}
async function submitRetry() {
  if (!retryTask.value || retryBusy.value) return
  retryBusy.value = true
  try {
    await retryPublishTask(retryTask.value.id)
    retryDialog.value = false
    Notify.create({ type: 'positive', message: '已重新触发发布' }); await loadTasks()
  } catch (e: any) { Notify.create({ type: 'negative', message: e.response?.data?.message || '重试失败' }) }
  finally { retryBusy.value = false }
}

function onDelete(row: PublishTask) {
  Dialog.create({
    title: '删除确认',
    message: `确定删除任务「${row.title}」吗？`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await removePublishTask(row.id)
      Notify.create({ type: 'positive', message: '删除成功' })
      loadTasks()
    } catch (e: any) {
      Notify.create({ type: 'negative', message: e.response?.data?.message || '删除失败' })
    }
  })
}
</script>
<style scoped>
.records-page { background: #f4f7fb; }
.records-container { max-width: 1600px; margin: auto; }
.records-container :deep(.q-card) { border-radius: 16px; }
</style>
