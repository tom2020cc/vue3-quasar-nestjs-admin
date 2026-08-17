<template>
  <q-page padding>
    <div class="row q-col-gutter-md">
      <!-- 左：新建发布 -->
      <div class="col-12 col-md-5">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-h6">视频发布</div>
            <div class="text-caption text-grey-7 q-mt-xs">
              宽屏视频可发：国产抖音、油管；窄屏视频可发：抖音、TikTok、快手
            </div>
          </q-card-section>
          <q-separator />

          <q-card-section class="q-gutter-md">
            <!-- 选择视频 -->
            <q-file
              v-model="videoFile"
              accept="video/*"
              outlined
              dense
              label="选择视频文件"
              :disable="uploading"
              clearable
              @update:model-value="onFileChange"
            >
              <template v-slot:prepend><q-icon name="movie" /></template>
            </q-file>

            <!-- 上传进度条 -->
            <div v-if="uploading">
              <div class="row items-center q-mb-xs">
                <q-icon :name="uploadStage === 'merging' ? 'build' : 'cloud_upload'" color="primary" />
                <span class="q-ml-sm">{{ uploadStage === 'merging' ? '正在合并分片…' : '正在上传视频' }}</span>
                <q-space />
                <span class="text-caption text-grey-7">{{ uploadLabel }}</span>
              </div>
              <q-linear-progress
                :value="uploadPercent / 100"
                :indeterminate="uploadStage === 'merging'"
                :color="uploadStage === 'merging' ? 'info' : 'primary'"
                track-color="grey-3"
                rounded
                size="18px"
              />
              <div v-if="uploadStage !== 'merging'" class="text-caption text-grey-7 q-mt-xs">
                大文件将自动分片上传，中断后可断点续传
              </div>
            </div>

            <!-- 视频预览与尺寸信息 -->
            <div v-if="previewUrl" class="text-center">
              <video :src="previewUrl" controls class="rounded-borders bg-dark" style="max-width: 100%; max-height: 220px" />
              <div class="row items-center justify-center q-mt-sm q-gutter-md">
                <img v-if="coverUrl" :src="coverUrl" alt="封面" style="max-width: 120px; border-radius: 4px" />
                <div class="text-caption text-grey-7 text-left">
                  <div>{{ videoWidth }} × {{ videoHeight }} px · {{ orientation === 'landscape' ? '宽屏' : '窄屏' }}</div>
                  <div v-if="videoFile">大小 {{ formatSize(videoFile.size) }}</div>
                  <div v-if="videoDuration">时长 {{ formatDuration(videoDuration) }}</div>
                </div>
              </div>
            </div>

            <!-- 尺寸方向选择 -->
            <div>
              <div class="text-subtitle2 q-mb-sm">尺寸方向</div>
              <q-btn-toggle
                v-model="orientation"
                toggle-color="primary"
                unelevated
                no-caps
                spread
                :options="[
                  { label: '宽屏（横屏）', value: 'landscape' },
                  { label: '窄屏（竖屏）', value: 'portrait' },
                ]"
              />
            </div>

            <!-- 标题 / 描述 -->
            <q-input v-model="title" outlined dense label="视频标题" :rules="[(v) => !!v || '标题不能为空']" />
            <q-input v-model="description" outlined dense type="textarea" autogrow label="视频描述（可选）" />

            <!-- 选择平台 -->
            <div>
              <div class="row items-center q-mb-sm">
                <div class="text-subtitle2">选择发布平台</div>
                <q-space />
                <q-btn flat dense no-caps size="sm" color="primary" label="全选" @click="selectAllCompatible" />
                <q-btn flat dense no-caps size="sm" color="grey-7" label="清空" @click="clearPlatforms" />
              </div>

              <div class="row q-col-gutter-sm">
                <div v-for="p in platforms" :key="p.code" class="col-12 col-sm-6">
                  <q-card
                    flat
                    bordered
                    class="platform-card cursor-pointer"
                    :class="{
                      'platform-card--selected': selectedPlatforms.includes(p.code),
                      'platform-card--disabled': p.available === false || !p.orientations.includes(orientation),
                    }"
                    @click="togglePlatform(p)"
                  >
                    <q-card-section class="q-pa-sm">
                      <div class="row items-center no-wrap">
                        <q-avatar rounded :color="platformMeta(p.code).color" text-color="white" size="38px" :icon="platformMeta(p.code).icon" />
                        <div class="q-ml-sm" style="flex: 1; min-width: 0">
                          <div class="row items-center no-wrap">
                            <span class="text-subtitle2 ellipsis">{{ p.name }}</span>
                            <q-icon v-if="selectedPlatforms.includes(p.code)" name="check_circle" color="primary" size="18px" class="q-ml-xs" />
                          </div>
                          <div class="text-caption text-grey-7 ellipsis">{{ p.description }}</div>
                        </div>
                      </div>
                      <div class="q-mt-sm">
                        <q-badge
                          v-for="o in p.orientations"
                          :key="o"
                          :color="o === 'landscape' ? 'info' : 'purple'"
                          outline
                          class="q-mr-xs"
                        >
                          {{ o === 'landscape' ? '宽屏' : '窄屏' }}
                        </q-badge>
                        <q-badge v-if="p.available === false" color="negative" outline>暂不可用</q-badge>
                        <q-badge v-else-if="!p.orientations.includes(orientation)" color="grey" outline>当前尺寸不支持</q-badge>
                      </div>
                      <div v-if="p.available === false" class="text-caption text-negative q-mt-xs">{{ p.unavailableReason }}</div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <div v-if="selectedPlatforms.length === 0" class="text-caption text-negative q-mt-sm">
                请至少选择一个平台
              </div>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              color="primary"
              icon="send"
              label="发布"
              unelevated
              :disable="!videoFile || !title || selectedPlatforms.length === 0"
              :loading="uploading"
              @click="onPublish"
            />
          </q-card-actions>
        </q-card>
      </div>

      <!-- 右：任务列表 -->
      <div class="col-12 col-md-7">
        <q-card flat bordered>
          <q-card-section class="row items-center">
            <div class="text-h6">发布任务</div>
            <q-space />
            <q-btn flat dense round icon="refresh" @click="loadTasks" :loading="taskLoading" />
          </q-card-section>
          <q-separator />

          <q-table
            :rows="tasks"
            :columns="taskColumns"
            row-key="id"
            :loading="taskLoading"
            :pagination="{ rowsPerPage: 10 }"
            flat
            bordered
          >
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
                <q-btn flat dense color="primary" icon="visibility" label="详情" @click="openDetail(props.row)" />
                <q-btn flat dense color="warning" icon="replay" label="重试" @click="onRetry(props.row)" />
                <q-btn flat dense color="negative" icon="delete" label="删除" @click="onDelete(props.row)" />
              </q-td>
            </template>
          </q-table>
        </q-card>
      </div>
    </div>

    <!-- 详情对话框 -->
    <q-dialog v-model="detailDialog">
      <q-card style="min-width: 560px">
        <q-card-section class="text-h6">任务详情</q-card-section>
        <q-card-section class="q-gutter-sm">
          <div><b>标题：</b>{{ detailTask?.title }}</div>
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
                  <q-badge :color="recordColor(r.status)">{{ recordStatusLabel(r.status) }}</q-badge>
                  <q-badge v-if="r.mock" color="grey" outline>模拟</q-badge>
                  <q-badge v-if="r.status === 'processing' && r.pollCount" color="info" outline>轮询 {{ r.pollCount }} 次</q-badge>
                  <q-badge v-if="r.duplicate" color="negative" outline>重复</q-badge>
                </q-item-label>
                <q-item-label caption>{{ r.message || '—' }}</q-item-label>
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Notify, Dialog } from 'quasar'
import { getPlatformList, type PlatformMeta } from '@/api/platform'
import {
  CHUNK_SIZE,
  uploadChunk,
  getUploadedChunks,
  mergeChunks,
  createPublishTask,
  getPublishTasks,
  getPublishTask,
  retryPublishTask,
  removePublishTask,
  type PublishTask,
  type PublishTaskDetail,
  type VideoUploadResult,
} from '@/api/publish'
import { API_BASE_URL } from '@/utils/request'

// ---- 平台定义 ----
const platforms = ref<PlatformMeta[]>([])
onMounted(async () => {
  try {
    const res = await getPlatformList()
    platforms.value = res.data
  } catch (e) {
    // 忽略
  }
  loadTasks()
  // 定时自动刷新：处理中任务存在时静默刷新列表；详情对话框打开时同步刷新详情
  refreshTimer = setInterval(autoRefresh, 5000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// ---- 新建发布 ----
const videoFile = ref<File | null>(null)
const previewUrl = ref('')
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoDuration = ref(0)
const coverUrl = ref('')
const orientation = ref<'landscape' | 'portrait'>('landscape')
const title = ref('')
const description = ref('')
const selectedPlatforms = ref<string[]>([])
const uploading = ref(false)
const uploadPercent = ref(0)
const uploadStage = ref<'idle' | 'uploading' | 'merging'>('idle')
const uploadLabel = ref('')

// 切换尺寸方向时，默认勾选该方向支持的所有平台
watch(orientation, (val) => {
  selectedPlatforms.value = platforms.value
    .filter((p) => p.available !== false && p.orientations.includes(val))
    .map((p) => p.code)
})

async function onFileChange(file: File | null) {
  if (!file) return
  videoFile.value = file
  coverUrl.value = ''
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)

  // 读取视频宽高/时长以判断宽屏/窄屏
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.src = previewUrl.value
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve(null)
    video.onerror = reject
  })
  videoWidth.value = video.videoWidth
  videoHeight.value = video.videoHeight
  videoDuration.value = video.duration && isFinite(video.duration) ? video.duration : 0
  orientation.value = video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait'

  // 异步抓取封面（不阻塞选择流程）
  captureCover(file).then((dataUrl) => {
    if (dataUrl) coverUrl.value = dataUrl
  })
}

// 平台图标/主题色映射（用于平台选择卡片展示）
function platformMeta(code: string): { icon: string; color: string } {
  const map: Record<string, { icon: string; color: string }> = {
    douyin_cn: { icon: 'music_note', color: 'red' },
    youtube: { icon: 'smart_display', color: 'red' },
    tiktok: { icon: 'music_video', color: 'dark' },
    kuaishou: { icon: 'bolt', color: 'orange' },
  }
  return map[code] || { icon: 'public', color: 'grey' }
}

// 点击平台卡片切换选择（不支持的尺寸直接忽略）
function togglePlatform(p: PlatformMeta) {
  if (p.available === false || !p.orientations.includes(orientation.value)) return
  const idx = selectedPlatforms.value.indexOf(p.code)
  if (idx >= 0) selectedPlatforms.value.splice(idx, 1)
  else selectedPlatforms.value.push(p.code)
}

// 全选当前尺寸下所有可用平台
function selectAllCompatible() {
  selectedPlatforms.value = platforms.value
    .filter((p) => p.available !== false && p.orientations.includes(orientation.value))
    .map((p) => p.code)
}

// 清空已选平台
function clearPlatforms() {
  selectedPlatforms.value = []
}

// 从视频抓取一帧作为封面（base64 data URL）
function captureCover(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (val: string | null) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      resolve(val)
    }
    const draw = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return finish(null)
        const scale = Math.min(1, 360 / w)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(w * scale)
        canvas.height = Math.round(h * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
        finish(null)
      }
    }
    video.onloadeddata = () => {
      const dur = video.duration && isFinite(video.duration) ? video.duration : 0
      const t = dur > 1 ? Math.min(1, dur - 0.1) : 0
      if (t <= 0) draw()
      else video.currentTime = t
    }
    video.onseeked = draw
    video.onerror = () => finish(null)
    timer = setTimeout(() => finish(null), 8000)
    video.src = url
  })
}

// 字节 → 可读大小
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

// 生成稳定的上传标识（文件名+大小+修改时间），同一文件重传时命中同一 uploadId 实现续传
function fileId(file: File): string {
  const raw = `${file.name}:${file.size}:${file.lastModified}`
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = (h << 5) - h + raw.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(16)
}

// 计算第 index 个分片的实际字节数（最后一片可能不足 5MB）
function chunkSizeOf(file: File, index: number): number {
  const start = index * CHUNK_SIZE
  return Math.min(CHUNK_SIZE, file.size - start)
}

// 分片上传：先查已传分片（续传），再补齐缺失分片，最后合并
async function uploadWithResume(file: File): Promise<VideoUploadResult> {
  const uploadId = fileId(file)
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
  uploadStage.value = 'uploading'
  uploadLabel.value = '0%'
  uploadPercent.value = 0

  // 1. 查询已上传分片，实现断点续传
  let uploaded: number[] = []
  try {
    const res = await getUploadedChunks(uploadId)
    uploaded = res.data.data.uploaded || []
  } catch {
    // 查询失败按全量上传处理
  }
  const uploadedSet = new Set(uploaded.filter((i) => i >= 0 && i < totalChunks))
  let doneBytes = [...uploadedSet].reduce((sum, i) => sum + chunkSizeOf(file, i), 0)

  const report = (bytes: number) => {
    uploadPercent.value = Math.min(100, Math.round((bytes / file.size) * 100))
    uploadLabel.value = `${uploadPercent.value}%`
  }
  report(doneBytes)

  // 2. 顺序上传缺失分片
  for (let i = 0; i < totalChunks; i++) {
    if (uploadedSet.has(i)) continue
    const start = i * CHUNK_SIZE
    const chunk = file.slice(start, start + CHUNK_SIZE)
    await uploadChunk(uploadId, i, chunk, (pct) => {
      report(doneBytes + chunkSizeOf(file, i) * (pct / 100))
    })
    doneBytes += chunkSizeOf(file, i)
    report(doneBytes)
  }

  // 3. 合并分片为最终视频
  uploadStage.value = 'merging'
  uploadLabel.value = '正在合并分片…'
  const mergeRes = await mergeChunks({
    uploadId,
    fileName: file.name,
    totalChunks,
    mimetype: file.type || 'video/mp4',
  })
  return mergeRes.data.data
}

async function onPublish() {
  if (!videoFile.value) return
  uploading.value = true
  uploadPercent.value = 0
  uploadStage.value = 'idle'
  uploadLabel.value = ''
  try {
    // 1. 分片上传视频（带进度条与断点续传），返回文件名与内容哈希
    const up = await uploadWithResume(videoFile.value)
    // 2. 创建发布任务（携带元数据用于记录与去重）
    await createPublishTask({
      title: title.value,
      description: description.value,
      videoFilename: up.filename,
      orientation: orientation.value,
      width: videoWidth.value,
      height: videoHeight.value,
      platforms: selectedPlatforms.value,
      videoHash: up.hash,
      duration: videoDuration.value,
      cover: coverUrl.value || undefined,
    })
    Notify.create({ type: 'positive', message: '已创建发布任务，正在后台发布…' })
    // 稍后刷新任务列表（发布为异步进行）
    setTimeout(loadTasks, 1200)
    setTimeout(loadTasks, 4000)
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '上传/发布失败' })
  } finally {
    uploading.value = false
    uploadStage.value = 'idle'
  }
}

// ---- 任务列表 ----
const tasks = ref<PublishTask[]>([])
const taskLoading = ref(false)
const taskColumns = [
  { name: 'index', label: '编号', align: 'center' as const, field: 'index' },
  { name: 'id', label: 'ID', align: 'center' as const, field: 'id' },
  { name: 'title', label: '标题', align: 'left' as const, field: 'title' },
  { name: 'orientation', label: '尺寸', align: 'center' as const, field: 'orientation' },
  { name: 'status', label: '状态', align: 'center' as const, field: 'status' },
  { name: 'createTime', label: '创建时间', align: 'center' as const, field: 'createTime' },
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
  return { publishing: '发布中', success: '全部成功', partial: '部分成功', failed: '全部失败', skipped: '全部跳过' }[s] || s
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

async function openDetail(row: PublishTask) {
  try {
    const res = await getPublishTask(row.id)
    detailTask.value = res.data
    detailDialog.value = true
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '获取详情失败' })
  }
}

function onRetry(row: PublishTask) {
  Dialog.create({
    title: '重试确认',
    message: '将重新执行失败/跳过的平台，确定继续吗？',
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await retryPublishTask(row.id)
      Notify.create({ type: 'positive', message: '已重新触发发布' })
      setTimeout(loadTasks, 1500)
    } catch (e: any) {
      Notify.create({ type: 'negative', message: e.response?.data?.message || '重试失败' })
    }
  })
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
.platform-card {
  transition: all 0.15s ease;
}
.platform-card:hover {
  border-color: #1976d2;
}
.platform-card--selected {
  border-color: #1976d2;
  background: #e3f2fd;
  box-shadow: inset 0 0 0 1px #1976d2;
}
.platform-card--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.platform-card--disabled:hover {
  border-color: rgba(0, 0, 0, 0.12);
}
</style>
