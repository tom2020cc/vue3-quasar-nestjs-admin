<template>
  <q-page padding class="publish-page">
    <div class="publish-heading row items-center q-mb-lg">
      <div><div class="text-overline text-primary">创作工作台</div><h1>视频发布</h1><div class="text-grey-7">上传素材，选择账号，将内容发布到你的频道。</div></div>
      <q-space /><q-btn outline color="primary" icon="folder_open" label="扫描文件夹发布" to="/folder-publish" class="q-mr-sm" :disable="aiBusy || uploading || batchUploading" /><q-btn outline color="primary" icon="history" label="发布记录" to="/publish-records" :disable="aiBusy || uploading || batchUploading" />
    </div>
    <q-banner v-if="submitted" rounded class="bg-green-1 text-positive q-mb-md">已提交发布任务。平台处理状态请前往“发布记录”查看。<template #action><q-btn flat color="positive" label="查看发布记录" to="/publish-records" /></template></q-banner>
    <div class="row q-col-gutter-md">
      <!-- 左：新建发布 -->
      <div class="col-12">
        <q-card flat bordered class="publish-card">
          <q-card-section class="row items-center">
            <div>
              <div class="text-h6">准备视频素材</div>
              <div class="text-caption text-grey-7 q-mt-xs">
                YouTube 支持横屏和竖屏视频 · 单个或批量上传 · 发布前选择目标频道
              </div>
            </div>
            <q-space />
            <q-btn-toggle
              v-model="publishMode"
              :disable="aiBusy || uploading || batchUploading"
              toggle-color="primary"
              unelevated
              no-caps
              :options="[
                { label: '单个发布', value: 'single' },
                { label: '批量发布', value: 'batch' },
              ]"
            />
          </q-card-section>
          <q-separator />

          <q-card-section class="publish-form">
            <section class="media-section">
            <div class="text-subtitle1">待上传视频列表</div>
            <!-- 单个模式：选择视频 → 预览 → 尺寸 → 标题 -->
            <div v-if="publishMode === 'single'" class="q-gutter-md">
            <q-file
              v-model="videoFile"
              accept="video/*"
              outlined
              dense
              label="选择视频文件"
              :disable="aiBusy || uploading"
              clearable
              @update:model-value="onFileChange"
            >
              <template v-slot:prepend><q-icon name="movie" /></template>
            </q-file>

            <div v-if="previewUrl" class="media-preview">
              <video :src="previewUrl" controls preload="metadata" :poster="coverUrl || undefined" />
              <div class="preview-info">
                <div class="text-subtitle2 ellipsis">{{ videoFile?.name }}</div>
                <div class="text-caption text-grey-7 q-mt-sm">{{ videoWidth }} × {{ videoHeight }} px · {{ formatDuration(videoDuration) }}</div>
                <div class="text-caption text-grey-7">{{ formatSize(videoFile?.size || 0) }} · {{ orientation === 'landscape' ? '横屏' : '竖屏' }}</div>
                <q-btn flat dense color="primary" icon="visibility" label="视频详情" class="q-mt-sm" @click="showDraft(videoFile!)" />
              </div>
            </div>
            <div v-else class="upload-empty"><q-icon name="cloud_upload" size="52px" color="primary" /><div class="text-subtitle1 q-mt-sm">从电脑选择视频</div><div class="text-caption text-grey-7">不设文件大小上限 · 自动分片 · 支持断点续传</div></div>

            <!-- 尺寸方向选择 -->
            <div>
              <div class="text-subtitle2 q-mb-sm">尺寸方向</div>
              <q-btn-toggle
                v-model="orientation"
                :disable="aiBusy || uploading"
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

            <!-- 标题 -->
            <q-input v-model="title" :disable="aiBusy || uploading" outlined dense label="视频标题" :rules="[(v) => !!v || '标题不能为空']" />
            </div>

            <!-- 批量模式：多选文件 + 逐文件标题/尺寸 + 上传进度 -->
            <div v-else class="q-gutter-md">
              <q-file
                v-model="batchFilePicker"
                accept="video/*"
                outlined
                dense
                label="选择多个视频（可多选）"
                multiple
                clearable
                :disable="aiBusy || batchUploading"
                @update:model-value="onBatchFilesChange"
              >
                <template v-slot:prepend><q-icon name="movie" /></template>
              </q-file>

              <div
                v-for="(b, idx) in batchItems"
                :key="fileId(b.file)"
                class="q-pa-sm rounded-borders"
                style="border: 1px solid rgba(0, 0, 0, 0.12)"
              >
                <div class="row items-center q-gutter-sm">
                  <q-icon :name="b.detecting ? 'hourglass_top' : 'movie'" color="primary" />
                  <span class="text-subtitle2 ellipsis" style="flex: 1; min-width: 0">{{ b.file.name }}</span>
                  <q-badge :color="b.orientation === 'landscape' ? 'info' : 'purple'" outline>
                    {{ b.orientation === 'landscape' ? '宽屏' : '窄屏' }}
                  </q-badge>
                  <q-btn flat dense color="primary" label="视频详情" @click="showDraft(b.file)" />
                  <q-btn flat dense round icon="delete" color="negative" :disable="aiBusy || batchUploading" @click="removeBatchItem(idx)" />
                </div>
                <q-input v-model="b.title" :disable="aiBusy || batchUploading" dense outlined label="视频标题" class="q-mt-sm" />
                <q-input v-model="b.description" :disable="aiBusy || batchUploading" dense outlined type="textarea" autogrow label="视频详情 / 描述（可选）" class="q-mt-sm" />
                <div v-if="!b.detecting" class="text-caption text-grey-7 q-mt-xs">
                  {{ b.width }} × {{ b.height }} px · {{ formatDuration(b.duration) }}
                </div>
              </div>

            </div>
            <div class="q-mt-lg">
              <q-btn outline color="primary" icon="cloud_upload" label="仅上传到本地" :loading="uploading || batchUploading" :disable="aiBusy || (publishMode === 'single' ? !videoFile : !batchItems.length)" @click="uploadOnly" />
              <p class="text-caption text-grey-7">网络中断后可重试；刷新页面后重新选择同一文件，点击上传即可恢复。</p>
              <UploadProgress :state="uploadState" @pause="pauseUpload" @resume="resumeUpload" @retry="uploadOnly" />
            </div>
            </section>
            <section class="settings-section q-gutter-md">
            <div class="text-subtitle1">发布设置</div>
            <!-- 每个视频保存自己的标题与描述 -->
            <q-input v-if="publishMode === 'single'" v-model="description" :disable="aiBusy || uploading" outlined dense type="textarea" autogrow label="视频详情 / 描述（可选）" />
            <AiTextTools :items="aiItems" :disabled="uploading || batchUploading" @busy="aiBusy = $event" @apply="applyAi" />

            <!-- 选择平台 -->
            <div>
              <div class="row items-center q-mb-sm">
                <div class="text-subtitle2">已接入平台</div>
                <q-space />
                <q-btn flat dense no-caps size="sm" color="primary" label="全选" @click="selectAllCompatible" />
                <q-btn flat dense no-caps size="sm" color="grey-7" label="清空" @click="clearPlatforms" />
              </div>

              <div class="row q-col-gutter-sm">
                <div v-for="p in platforms" :key="p.code" class="col-12">
                  <q-card
                    flat
                    bordered
                    class="platform-card cursor-pointer"
                    :class="{
                      'platform-card--selected': selectedPlatforms.includes(p.code),
                      'platform-card--disabled': isPlatformDisabled(p),
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
                          <div class="text-caption text-grey-7">{{ youtubeOptions.length }} 个已授权频道 · 支持播放列表</div>
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
                        <q-badge v-else-if="publishMode === 'single' && !p.orientations.includes(orientation)" color="grey" outline>当前尺寸不支持</q-badge>
                      </div>
                      <div v-if="p.available === false" class="text-caption text-negative q-mt-xs">{{ p.unavailableReason }}</div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <q-banner v-if="!platforms.length" rounded class="bg-blue-1 text-primary q-mt-sm">
                {{ platformLoading ? '正在读取授权状态…' : platformError || '暂无已接入的发布平台，请先配置并授权 YouTube 频道。' }}
                <template #action><q-btn flat label="管理平台" to="/platform-config" /><q-btn v-if="platformError" flat label="重试" @click="loadPublishPlatforms" /></template>
              </q-banner>
              <div v-else-if="selectedPlatforms.length === 0" class="text-caption text-negative q-mt-sm">
                请至少选择一个平台
              </div>
            </div>
            <div v-if="selectedPlatforms.includes('youtube')" class="q-gutter-sm">
              <q-select v-model="youtubeAccountId" :options="youtubeOptions" emit-value map-options outlined
                label="YouTube 目标频道（必选）" :disable="aiBusy || uploading || batchUploading || playlistCreating" />
              <YoutubePublishPlaylist v-model="youtubePlaylistId" :account-id="youtubeAccountId"
                :channel-label="selectedYoutube ? youtubeAccountLabel(selectedYoutube) : ''"
                :disabled="uploading || batchUploading" @busy="playlistCreating = $event" />
              <div v-if="selectedYoutube" class="text-primary">本次将发布到：{{ youtubeAccountLabel(selectedYoutube) }}。批量发布也使用此频道。</div>
              <div v-else class="text-negative">请先选择频道；没有可选频道时，请到平台配置添加账号或识别原有频道。</div>
              <q-btn flat dense color="primary" label="管理 YouTube 账号" to="/platform-config" :disable="aiBusy || uploading || batchUploading" />
            </div>

            </section>
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              v-if="publishMode === 'single'"
              color="primary"
              icon="send"
              label="上传并发布"
              unelevated
              :disable="aiBusy || !videoFile || !title || selectedPlatforms.length === 0 || youtubeSelectionMissing || playlistCreating"
              :loading="uploading"
              @click="onPublish"
            />
            <q-btn
              v-else
              color="primary"
              icon="send"
              label="批量发布"
              unelevated
              :disable="aiBusy || batchItems.length === 0 || selectedPlatforms.length === 0 || youtubeSelectionMissing || playlistCreating"
              :loading="batchUploading"
              @click="onBatchPublish"
            />
          </q-card-actions>
        </q-card>
      </div>

    </div>

    <q-dialog v-model="draftDialog" @hide="clearDraftPreview">
      <q-card style="width: 720px; max-width: 95vw" v-if="draftDetail">
        <q-card-section class="text-h6">待上传视频详情</q-card-section>
        <q-card-section class="q-gutter-sm">
          <div style="overflow-wrap: anywhere"><b>视频标题：</b>{{ draftDetail.title || '（未填写）' }}</div>
          <video v-if="draftPreviewUrl" :src="draftPreviewUrl" controls preload="metadata" class="full-width rounded-borders bg-dark" style="max-height: 320px" />
          <div><b>文件：</b>{{ draftDetail.file.name }}</div>
          <div><b>大小：</b>{{ formatSize(draftDetail.file.size) }}</div>
          <div><b>尺寸 / 时长：</b>{{ draftDetail.width }} × {{ draftDetail.height }} · {{ formatDuration(draftDetail.duration) }}</div>
          <div><b>视频详情 / 描述：</b></div>
          <div style="white-space: pre-wrap; overflow-wrap: anywhere">{{ draftDetail.description || '（未填写）' }}</div>
          <div class="text-caption text-grey-7">可返回列表修改视频标题和详情，提交后会作为平台视频的标题和描述。</div>
        </q-card-section>
        <q-card-actions align="right"><q-btn flat label="关闭" color="primary" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup lang="ts">
import AiTextTools from '@/components/AiTextTools.vue'
import type { AiResult } from '@/api/ai'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import YoutubePublishPlaylist from '@/components/YoutubePublishPlaylist.vue'
import { getYoutubeAccounts, youtubeAccountLabel, type YoutubeAccount } from '@/api/youtube'
import { Notify } from 'quasar'
import { getPlatformConfigs, type PlatformMeta } from '@/api/platform'
import { isPublishPlatformReady, isReadyYoutubeAccount } from '@/utils/platformAvailability'
import {
  createPublishTask,
  createPublishTaskBatch,
  type CreatePublishTaskPayload,
  type VideoUploadResult,
} from '@/api/publish'
import { useResumableUpload } from '@/composables/useResumableUpload'
import UploadProgress from '@/components/UploadProgress.vue'

// ---- 平台定义 ----
const platforms = ref<PlatformMeta[]>([])
const youtubeAccounts = ref<YoutubeAccount[]>([])
const youtubeAccountId = ref<string | null>(null)
const youtubePlaylistId = ref<string | null>(null)
const playlistCreating = ref(false)
const youtubeOptions = computed(() => youtubeAccounts.value.filter(isReadyYoutubeAccount).map((a) => ({ label: youtubeAccountLabel(a), value: a.id })))
const selectedYoutube = computed(() => youtubeAccounts.value.find((a) => a.id === youtubeAccountId.value && isReadyYoutubeAccount(a)))
const youtubeSelectionMissing = computed(() => selectedPlatforms.value.includes('youtube') && !selectedYoutube.value)
const platformLoading = ref(false)
const platformError = ref('')
async function loadPublishPlatforms() {
  platformLoading.value = true
  platformError.value = ''
  try {
    const [res, accounts] = await Promise.all([getPlatformConfigs(), getYoutubeAccounts()])
    youtubeAccounts.value = accounts.data
    platforms.value = res.data.filter(p => isPublishPlatformReady(p, accounts.data))
    selectedPlatforms.value = platforms.value.map(p => p.code)
  } catch {
    platforms.value = []
    selectedPlatforms.value = []
    platformError.value = '授权状态读取失败，请重试。'
  } finally {
    platformLoading.value = false
  }
}
onMounted(loadPublishPlatforms)

// ---- 新建发布 ----
const videoFile = ref<File | null>(null)
const previewUrl = ref('')
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoDuration = ref(0)
const coverUrl = ref('')
const orientation = ref<'landscape' | 'portrait'>('landscape')
const aiBusy = ref(false)
const aiItems = computed(() => publishMode.value === 'single'
  ? (videoFile.value ? [{ id: fileId(videoFile.value), title: title.value, description: description.value }] : [])
  : batchItems.value.map(b => ({ id: fileId(b.file), title: b.title, description: b.description })))
function applyAi(items: AiResult[]) {
  for (const r of items) {
    if (publishMode.value === 'single') {
      if (videoFile.value && fileId(videoFile.value) === r.id && title.value === r.sourceTitle && description.value === r.sourceDescription) { title.value = r.title; description.value = r.description }
    } else {
      const b = batchItems.value.find(b => fileId(b.file) === r.id)
      if (b && b.title === r.sourceTitle && b.description === r.sourceDescription) { b.title = r.title; b.description = r.description }
    }
  }
}
const title = ref('')
const description = ref('')
const selectedPlatforms = ref<string[]>([])
const uploading = ref(false)
const { state: uploadState, upload: uploadWithResume, pause: pauseUpload, resume: resumeUpload, dispose: disposeUpload, reset: resetUpload } = useResumableUpload()
const submitted = ref(false)
onUnmounted(disposeUpload)
async function uploadOnly() {
  if (aiBusy.value) return
  if (uploading.value || batchUploading.value) return
  const files = publishMode.value === 'single' ? (videoFile.value ? [videoFile.value] : []) : batchItems.value.map(b => b.file)
  if (!files.length) return
  if (publishMode.value === 'single') uploading.value = true
  else batchUploading.value = true
  try {
    for (let i = 0; i < files.length; i++) await uploadWithResume(files[i], i + 1, files.length)
    Notify.create({ type: 'positive', message: '已上传到本地，尚未发布到任何平台' })
  } catch (error: any) {
    if (error.name !== 'AbortError') Notify.create({ type: 'negative', message: error.message || '上传中断，可继续上传' })
  } finally { uploading.value = false; batchUploading.value = false }
}

// ---- 批量发布 ----
const publishMode = ref<'single' | 'batch'>('single')
const batchFilePicker = ref<File[]>([])
const batchItems = ref<BatchItem[]>([])
const batchUploading = ref(false)

// 批量模式下单个待发布文件（含自动检测的尺寸与封面）
interface BatchItem {
  file: File
  title: string
  description: string
  width: number
  height: number
  duration: number
  orientation: 'landscape' | 'portrait'
  cover?: string
  detecting: boolean
}

// Changing the video must not silently add publishing destinations.
watch(orientation, (val) => {
  if (publishMode.value !== 'single') return
  selectedPlatforms.value = selectedPlatforms.value.filter(code =>
    platforms.value.some(p => p.code === code && p.available !== false && p.orientations.includes(val)))
})

// 读取视频宽高/时长（用于宽屏/窄屏判断）
function readVideoMeta(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      const duration = video.duration && isFinite(video.duration) ? video.duration : 0
      URL.revokeObjectURL(url)
      resolve({ width, height, duration })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取视频信息'))
    }
  })
}

async function onFileChange(file: File | null) {
  resetUpload()
  submitted.value = false
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  coverUrl.value = ''
  videoWidth.value = videoHeight.value = videoDuration.value = 0
  if (!file) { title.value = ''; description.value = ''; return }
  videoFile.value = file
  title.value = baseName(file.name)
  previewUrl.value = URL.createObjectURL(file)
  try {
    const meta = await readVideoMeta(file)
    if (videoFile.value !== file) return
    videoWidth.value = meta.width
    videoHeight.value = meta.height
    videoDuration.value = meta.duration
    orientation.value = meta.width >= meta.height ? 'landscape' : 'portrait'
  } catch { /* 无法读取时仍可手动选择尺寸 */ }
  captureCover(file).then((dataUrl) => {
    if (videoFile.value === file && dataUrl) coverUrl.value = dataUrl
  })
}

const draftDialog = ref(false)
const draftFile = ref<File | null>(null)
const draftPreviewUrl = ref('')
const draftDetail = computed(() => {
  if (!draftFile.value) return null
  if (publishMode.value === 'batch') return batchItems.value.find(b => b.file === draftFile.value) || null
  return { file: draftFile.value, title: title.value, description: description.value,
    width: videoWidth.value, height: videoHeight.value, duration: videoDuration.value }
})
function clearDraftPreview() {
  if (draftPreviewUrl.value) URL.revokeObjectURL(draftPreviewUrl.value)
  draftPreviewUrl.value = ''
  draftFile.value = null
}
function showDraft(file: File) {
  clearDraftPreview()
  draftFile.value = file
  draftPreviewUrl.value = URL.createObjectURL(file)
  draftDialog.value = true
}
onUnmounted(() => {
  clearDraftPreview()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

// 平台图标/主题色映射（用于平台选择卡片展示）
function platformMeta(code: string): { icon: string; color: string } {
  const map: Record<string, { icon: string; color: string }> = {
    douyin_cn: { icon: 'music_note', color: 'red' },
    youtube: { icon: 'smart_display', color: 'red' },
    tiktok: { icon: 'music_video', color: 'dark' },
    kuaishou: { icon: 'bolt', color: 'orange' },
    facebook: { icon: 'groups', color: 'blue' },
    instagram: { icon: 'photo_camera', color: 'pink' },
  }
  return map[code] || { icon: 'public', color: 'grey' }
}

// 平台卡片是否禁用（批量模式下不按尺寸禁用，尺寸兼容在发布时逐文件过滤）
function isPlatformDisabled(p: PlatformMeta) {
  if (p.available === false) return true
  if (publishMode.value === 'single' && !p.orientations.includes(orientation.value)) return true
  return false
}

// 点击平台卡片切换选择（禁用的平台直接忽略）
function togglePlatform(p: PlatformMeta) {
  if (uploading.value || batchUploading.value) return
  if (isPlatformDisabled(p)) return
  const idx = selectedPlatforms.value.indexOf(p.code)
  if (idx >= 0) selectedPlatforms.value.splice(idx, 1)
  else selectedPlatforms.value.push(p.code)
}

// 全选可用平台（单个模式按当前尺寸过滤，批量模式全选可用平台）
function selectAllCompatible() {
  if (uploading.value || batchUploading.value) return
  selectedPlatforms.value = platforms.value
    .filter((p) => {
      if (p.available === false) return false
      if (publishMode.value === 'single') return p.orientations.includes(orientation.value)
      return true
    })
    .map((p) => p.code)
}

// 清空已选平台
function clearPlatforms() {
  if (uploading.value || batchUploading.value) return
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

async function onPublish() {
  if (aiBusy.value) return
  if (playlistCreating.value || uploading.value || batchUploading.value) return
  if (!videoFile.value) return
  if (youtubeSelectionMissing.value) { Notify.create({ type: 'warning', message: '请选择 YouTube 目标频道' }); return }
  const targets = [...selectedPlatforms.value]
  const targetAccountId = targets.includes('youtube') ? youtubeAccountId.value! : undefined
  const targetPlaylistId = targetAccountId ? youtubePlaylistId.value || undefined : undefined
  uploading.value = true
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
      platforms: targets,
      youtubeAccountId: targetAccountId,
      youtubePlaylistId: targetPlaylistId,
      videoHash: up.hash,
      duration: videoDuration.value,
      cover: coverUrl.value || undefined,
    })
    Notify.create({ type: 'positive', message: '已创建发布任务，正在后台发布…' })
    // 稍后刷新任务列表（发布为异步进行）
    submitted.value = true
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || e.message || '上传/发布失败' })
  } finally {
    uploading.value = false
  }
}

// ---- 批量发布 ----
// 去掉扩展名作为默认标题
function baseName(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

// 批量文件选择：q-file 回传完整列表，按 fileId 复用已检测项、增量检测新项
async function onBatchFilesChange(files: File[] | null) {
  const list = files || []
  const prevMap = new Map(batchItems.value.map((b) => [fileId(b.file), b]))
  const next: BatchItem[] = []
  for (const file of list) {
    const key = fileId(file)
    const prev = prevMap.get(key)
    if (prev && !prev.detecting) {
      next.push(prev)
    } else {
      const item: BatchItem = {
        file,
        title: baseName(file.name),
        description: '',
        width: 0,
        height: 0,
        duration: 0,
        orientation: 'landscape',
        detecting: true,
      }
      next.push(item)
    }
  }
  batchItems.value = next
  for (const item of batchItems.value) {
    if (item.detecting) void detectBatchItem(item)
  }
}

// 检测单个批量文件的尺寸/时长并抓取封面
async function detectBatchItem(item: BatchItem) {
  try {
    const meta = await readVideoMeta(item.file)
    item.width = meta.width
    item.height = meta.height
    item.duration = meta.duration
    item.orientation = meta.width >= meta.height ? 'landscape' : 'portrait'
  } catch {
    // 检测失败保留默认值
  } finally {
    item.detecting = false
  }
  captureCover(item.file).then((dataUrl) => {
    if (dataUrl) item.cover = dataUrl
  })
}

// 移除某个批量项，并同步 q-file 的选中列表
function removeBatchItem(idx: number) {
  const removed = batchItems.value[idx]
  if (!removed) return
  batchItems.value.splice(idx, 1)
  batchFilePicker.value = batchFilePicker.value.filter((f) => fileId(f) !== fileId(removed.file))
}

// 批量发布：逐文件上传 → 按尺寸过滤兼容平台 → 一次性提交批量任务
async function onBatchPublish() {
  if (aiBusy.value) return
  if (playlistCreating.value || uploading.value || batchUploading.value) return
  if (youtubeSelectionMissing.value) { Notify.create({ type: 'warning', message: '请选择 YouTube 目标频道' }); return }
  if (batchItems.value.some(b => !b.title.trim())) { Notify.create({ type: 'warning', message: '请填写每个视频的标题' }); return }
  const targets = [...selectedPlatforms.value]
  const targetAccountId = youtubeAccountId.value || undefined
  const targetPlaylistId = youtubePlaylistId.value || undefined
  if (batchItems.value.length === 0) {
    Notify.create({ type: 'warning', message: '请先选择要发布的视频' })
    return
  }
  if (selectedPlatforms.value.length === 0) {
    Notify.create({ type: 'warning', message: '请至少选择一个目标平台' })
    return
  }

  const compatibleOf = (orientation: string) =>
    targets.filter((code) => {
      const p = platforms.value.find((x) => x.code === code)
      return !!p && p.available !== false && p.orientations.includes(orientation)
    })

  batchUploading.value = true
  const items: CreatePublishTaskPayload[] = []
  const skipped: string[] = []
  const submittedItems: BatchItem[] = []
  try {
    for (let i = 0; i < batchItems.value.length; i++) {
      const b = batchItems.value[i]
      const compatible = compatibleOf(b.orientation)
      if (compatible.length === 0) {
        skipped.push(b.title)
        continue
      }
      const up = await uploadWithResume(b.file, i + 1, batchItems.value.length)
      submittedItems.push(b)
      items.push({
        title: b.title,
        description: b.description,
        videoFilename: up.filename,
        orientation: b.orientation,
        width: b.width,
        height: b.height,
        videoHash: up.hash,
        duration: b.duration,
        cover: b.cover || undefined,
        platforms: compatible,
        youtubeAccountId: compatible.includes('youtube') ? targetAccountId : undefined,
        youtubePlaylistId: compatible.includes('youtube') ? targetPlaylistId : undefined,
      })
    }

    if (items.length === 0) {
      Notify.create({ type: 'warning', message: '没有可发布的视频（所选视频与平台尺寸不兼容）' })
      return
    }

    const res = await createPublishTaskBatch(items)
    const data = res.data
    const skipText = skipped.length ? `，跳过 ${skipped.length} 个（尺寸不兼容）` : ''
    Notify.create({
      type: data.failed === 0 ? 'positive' : 'warning',
      message: `已创建 ${data.success} 个发布任务，创建失败 ${data.failed} 个${skipText}`,
    })
    const accepted = new Set(data.results.filter(r => r.ok).map(r => submittedItems[r.index]))
    batchItems.value = batchItems.value.filter(b => !accepted.has(b))
    batchFilePicker.value = batchItems.value.map(b => b.file)
    submitted.value = data.success > 0
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || e.message || '批量发布失败' })
  } finally {
    batchUploading.value = false
    }
}

</script>

<style scoped>
.publish-page { background: #f4f7fb; padding: 28px; }
.publish-heading, .publish-card { max-width: 1480px; margin-left: auto; margin-right: auto; }
h1 { font-size: 28px; font-weight: 700; line-height: 1.4; margin: 0 0 8px; color: #172b4d; }
.publish-card { border-radius: 18px; overflow: hidden; border-color: #e0e7f0; box-shadow: 0 5px 24px #203e6410; }
.publish-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); padding: 0; }
.media-section, .settings-section { padding: 24px; min-width: 0; }
.media-section { border-right: 1px solid #e6ebf3; }
.media-section > .text-subtitle1 { margin-bottom: 16px; }
.settings-section { margin: 0; }
.settings-section > * { margin-left: 0; }
.upload-empty { padding: 44px 12px; text-align: center; border: 1px dashed #bdd0e7; border-radius: 12px; background: #f7faff; }
.media-preview { display: flex; align-items: center; gap: 20px; padding: 16px; background: #f4f7fb; border-radius: 12px; }
.media-preview video { width: 46%; max-height: 230px; object-fit: contain; background: #142135; border-radius: 8px; }
.preview-info { flex: 1; min-width: 0; }
@media (max-width: 900px) { .publish-form { grid-template-columns: minmax(0,1fr); } .media-section { border-right: 0; border-bottom: 1px solid #e6ebf3; } .publish-page { padding: 16px; } }

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
