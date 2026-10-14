<template>
  <q-page class="folder-page">
    <div class="workspace">
      <header class="folder-hero">
        <div class="hero-heading"><div class="hero-icon"><q-icon name="drive_folder_upload" size="30px" /></div><div><div class="eyebrow">YOUTUBE · 批量创作</div><h1>文件夹发布</h1><p>把本地素材，整理成一个完整的视频列表。</p></div></div>
        <div class="hero-actions"><q-btn flat color="primary" icon="upload_file" label="普通上传" to="/publish" :disable="aiBusy || busy" /><q-btn outline color="primary" icon="history" label="发布记录" to="/publish-records" :disable="aiBusy || busy" /></div>
      </header>
      <div class="workflow" aria-label="发布流程">
        <div :class="{ done: rows.length && accountId }"><span class="step-number"><q-icon v-if="rows.length && accountId" name="check" /><template v-else>1</template></span><div><strong>选择素材与频道</strong><small>{{ rows.length ? `已扫描 ${rows.length} 个视频${accountId ? '' : '，请选择频道'}` : '扫描 static 中的视频文件夹' }}</small></div></div>
        <q-icon name="chevron_right" class="step-arrow" />
        <div :class="{ done: rows.length && descriptionCount === rows.length }"><span class="step-number">2</span><div><strong>准备 AI 文案</strong><small>{{ descriptionCount ? `${descriptionCount} 条已有介绍，可继续修改` : '翻译列表名，逐条生成介绍' }}</small></div></div>
        <q-icon name="chevron_right" class="step-arrow" />
        <div :class="{ done: completedRows.length > 0 }"><span class="step-number">3</span><div><strong>预览并发布</strong><small>{{ completedRows.length ? `${completedRows.length} 条发布成功` : '核对清单后，最后确认发布' }}</small></div></div>
      </div>
      <div class="setup-grid">
        <q-card flat bordered class="panel">
          <q-card-section>
            <div class="text-h6 q-mb-sm"><q-icon name="folder_open" color="primary" /> 视频素材</div>
            <p class="text-grey-7">选择 <code>static</code> 中的文件夹，自动读取其中的视频。</p>
            <q-input v-model="folderInput" outlined dense label="相对文件夹路径，例如：挖掘机/产品展示" :disable="aiBusy || busy" @keyup.enter="scan(folderInput)">
              <template #append><q-btn flat round icon="search" aria-label="扫描文件夹" :disable="aiBusy || busy" @click="scan(folderInput)" /></template>
            </q-input>
            <div class="row items-center q-gutter-sm q-mt-sm">
              <q-btn outline color="primary" icon="refresh" label="扫描 / 刷新" :disable="aiBusy || busy" @click="scan(folderInput)" />
              <q-btn flat label="static 根目录" :disable="aiBusy || busy" @click="scan('')" />
              <q-btn v-if="snapshot?.folder" flat label="上一级" :disable="aiBusy || busy" @click="scan(snapshot.folder.split('/').slice(0, -1).join('/'))" />
            </div>
            <div v-if="snapshot" class="folder-location q-mt-md">当前位置：static{{ snapshot.folder ? '/' + snapshot.folder : '' }}</div>
            <div v-if="snapshot?.folders.length" class="folder-links q-mt-sm">
              <q-btn v-for="folder in snapshot.folders" :key="folder.path" flat no-caps icon="folder" :label="folder.name" :disable="aiBusy || busy" @click="scan(folder.path)" />
            </div>
            <div v-else-if="snapshot && !snapshot.videos.length" class="text-grey-7 q-mt-md">这里还没有视频。放入文件夹后，点击“扫描 / 刷新”。</div>
          </q-card-section>
        </q-card>
        <q-card flat bordered class="panel">
          <q-card-section>
            <div class="text-h6 q-mb-md"><q-icon name="smart_display" color="red" /> 发布到哪里</div>
            <q-select v-model="accountId" :options="accountOptions" emit-value map-options outlined dense label="目标频道（必选）" :disable="aiBusy || busy" />
            <div v-if="!accountOptions.length" class="text-negative q-mt-sm">暂无可发布频道，请先在 <router-link to="/platform-config">平台管理</router-link> 完成授权。</div>
            <div class="mapping q-mt-md">
              <q-input v-model="playlistTitle" outlined dense label="YouTube 列表名称" maxlength="150" :disable="aiBusy || busy || confirmOpen" />
              <div class="playlist-hint"><q-icon name="auto_awesome" /> 可手动修改，也可在下方用 AI 翻译成英文。</div>
            </div>
            <p class="text-caption text-grey-7 q-mt-md q-mb-none">优先复用同名列表，没有时新建。新建列表默认公开。</p>
          </q-card-section>
        </q-card>
      </div>
      <q-banner v-if="error" rounded class="bg-red-1 text-negative q-mt-md">{{ error }}</q-banner>
      <q-banner v-if="notice" rounded class="bg-blue-1 text-primary q-mt-md">{{ notice }}</q-banner>
      <AiTextTools v-if="snapshot && rows.length" :key="snapshot.folder" ref="aiTools" :draft-key="snapshot.folder" :draft-items="draftItems" apply-label="应用文案并预览发布" @review="reviewAppliedAi" :folder-name="snapshot.playlistTitle" :playlist-title="playlistTitle" @playlist="playlistTitle = $event" @restore="restoreDraftRows" class="q-mt-lg" :items="chosen.map(r => ({ id: r.path, title: r.title, description: r.description || '', fingerprint: r.fingerprint, originalTitle: r.scannedTitle || r.title }))" :disabled="busy || confirmOpen" @busy="aiBusy = $event" @apply="applyAi" />
      <q-card flat bordered class="panel q-mt-lg">
        <q-card-section class="list-heading">
          <div><div class="section-title">视频清单 <q-badge color="blue-1" text-color="primary">{{ rows.length }}</q-badge></div><div class="text-caption text-grey-7">核对标题、介绍和勾选范围，再预览发布。{{ snapshot?.ignored ? `已忽略 ${snapshot.ignored} 个非视频或链接项目。` : '' }}</div></div>
          <div class="list-controls"><q-input v-model="search" outlined dense clearable placeholder="搜索标题、文件名或介绍" aria-label="搜索视频清单" class="list-search"><template #prepend><q-icon name="search" /></template></q-input><q-toggle v-model="expandDescriptions" label="展开介绍" color="primary" /></div>
        </q-card-section>
        <div v-if="rows.length" class="list-summary"><span><strong>{{ chosen.length }}</strong> 已选</span><span><strong>{{ formatSize(totalBytes) }}</strong> 素材大小</span><span><strong>{{ descriptionCount }}</strong> 已有介绍</span><span v-if="search">搜索仅筛选展示，发布仍按全部勾选项执行</span></div>
        <q-banner v-if="submittedRows.length" class="bg-blue-1 text-primary q-mx-lg q-mb-md rounded-borders">
          本文件夹已提交 {{ submittedRows.length }} 条 · 发布成功 {{ completedRows.length }} 条 · 处理中 {{ activeRows.length }} 条 · 需处理 {{ failedRows.length }} 条
          <div class="text-caption">{{ statusError || '状态自动刷新；已提交的视频不会再次上传。失败项请在发布记录中处理。' }}</div>
          <div class="text-caption">如果你已在 YouTube 手动删除旧视频，可点击“核对已删除视频”；只有原频道确认旧视频不可查询时，才允许重新添加。</div>
          <template #action><q-btn v-if="completedRows.length" flat label="核对已删除视频" :disable="aiBusy || busy || statusLoading" @click="releaseDeleted" /><q-btn flat label="刷新结果" :disable="busy" :loading="statusLoading" @click="refreshResults" /><q-btn flat label="查看发布记录" to="/publish-records" /></template>
        </q-banner>
        <q-linear-progress v-if="busy" :value="progress" :indeterminate="phase === '扫描中' || phase === '读取播放列表' || phase.startsWith('提交') || phase === '确认播放列表'" color="primary" size="6px" />
        <div v-if="busy" class="q-px-md q-py-sm text-primary">{{ phase }}</div>
        <q-table flat :rows="filteredRows" :columns="columns" row-key="path" :pagination="{ rowsPerPage: 20 }" :rows-per-page-options="[20, 50, 100]" class="video-table" wrap-cells rows-per-page-label="每页视频" no-data-label="没有匹配的视频">
          <template #header-cell-selected="props"><q-th :props="props"><q-checkbox :model-value="allSelected" :disable="aiBusy || busy || !selectable.length" aria-label="全选全部视频" @update:model-value="selectAll" /></q-th></template>
          <template #body-cell-selected="props"><q-td :props="props"><q-checkbox v-model="props.row.selected" :disable="aiBusy || busy || !!props.row.error || !!props.row.taskId || props.row.uncertain" :aria-label="'选择 ' + props.row.title" /></q-td></template>
          <template #no-data><div class="empty-videos"><q-icon :name="search ? 'search_off' : 'video_library'" size="42px" /><strong>{{ search ? '没有找到匹配的视频' : '从一个视频文件夹开始' }}</strong><span>{{ search ? '试试其他关键词，或清空搜索。' : '点击上方文件夹，视频标题和素材清单会自动出现在这里。' }}</span><q-btn v-if="search" flat color="primary" label="清空搜索" @click="search = ''" /></div></template>
          <template #body-cell-title="props"><q-td :props="props"><div class="video-copy"><div class="video-file-icon"><q-icon name="movie" size="24px" /></div><div class="video-copy-body"><button class="video-title" @click="detailRow = props.row">{{ props.row.title }}</button><div class="source-name">{{ props.row.name }}</div><div v-if="props.row.description" class="video-description" :class="{ expanded: expandDescriptions }">{{ props.row.description }}</div><span v-else class="missing-description">尚未填写介绍 · 可使用 AI 生成</span></div><q-btn flat round dense icon="open_in_full" color="grey-6" :aria-label="'查看文案：' + props.row.title" @click="detailRow = props.row" /></div></q-td></template>
          <template #body-cell-state="props"><q-td :props="props">
            <q-badge v-if="props.row.taskId" :color="folderPublishState(props.row.record).color">{{ folderPublishState(props.row.record).label }}</q-badge>
            <span v-else :class="props.row.error || props.row.failure ? 'text-negative' : 'text-grey-7'">{{ props.row.error || props.row.failure || (props.row.upload ? '素材已就绪' : '待准备素材') }}</span>
            <div v-if="props.row.record?.message" class="text-caption q-mt-xs">{{ props.row.record.message }}</div>
            <q-btn v-if="props.row.record?.externalUrl && !props.row.record.mock" flat dense no-caps color="primary" label="查看视频" :href="props.row.record.externalUrl" target="_blank" rel="noopener noreferrer" />
          </q-td></template>
        </q-table>
      </q-card>
    </div>
    <div class="publish-dock">
      <div class="dock-summary"><q-icon name="playlist_play" size="25px" color="primary" /><div><strong>{{ chosen.length }} 个视频待发布</strong><span>{{ accountId ? accountOptions.find(a => a.value === accountId)?.label.split(' · ').slice(0, 2).join(' · ') : '请先选择目标频道' }}<template v-if="playlistTitle && rows.length"> · {{ playlistTitle }}</template></span></div></div>
      <div class="dock-actions"><q-btn flat color="primary" icon="inventory_2" label="仅准备素材" :disable="aiBusy || busy || !chosen.length" @click="prepare" /><q-btn unelevated color="primary" icon-right="arrow_forward" :label="busy ? '正在处理…' : '准备并预览发布'" :disable="aiBusy || busy || !chosen.length || !accountId" @click="review" /></div>
    </div>
    <q-dialog :model-value="!!detailRow" @update:model-value="detailRow = null">
      <q-card class="copy-dialog"><q-card-section class="row items-center"><div class="text-h6">视频文案</div><q-space /><q-btn flat round icon="close" aria-label="关闭视频文案" v-close-popup /></q-card-section><q-separator /><q-card-section><div class="text-caption text-grey-6">视频标题</div><h2>{{ detailRow?.title }}</h2><div class="text-caption text-grey-6 q-mt-lg">视频介绍</div><p class="full-description">{{ detailRow?.description || '暂未填写介绍' }}</p><div class="source-name">原文件：{{ detailRow?.name }}</div></q-card-section></q-card>
    </q-dialog>
    <q-dialog v-model="confirmOpen" persistent>
      <q-card style="width: 560px; max-width: 95vw" class="panel">
        <q-card-section><div class="text-h6">确认批量发布</div></q-card-section>
        <q-card-section class="q-pt-none">
          <p>目标频道：<strong>{{ accountOptions.find(a => a.value === accountId)?.label }}</strong></p>
          <p>选中 <strong>{{ chosen.length }}</strong> 个视频，使用清单中已确认的标题与详情（未补充时详情留空）。</p>
          <q-select v-if="matches.length" v-model="playlistId" :options="matches.map(p => ({ label: `${p.title} · ${p.id}`, value: p.id }))" emit-value map-options outlined label="使用同名播放列表" />
          <template v-else><p>将创建播放列表：<strong>{{ playlistTitle }}</strong></p><q-select v-model="privacy" :options="privacyOptions" emit-value map-options outlined label="新播放列表可见性" /></template>
          <p class="text-caption text-grey-7 q-mt-md">确认后会调用 YouTube 创建列表（如需要），并按现有规则公开发布视频。私密列表不会让视频变为私密；最终状态请到发布记录查看。</p>
        </q-card-section>
        <q-card-actions align="right"><q-btn flat label="取消" @click="confirmOpen = false" /><q-btn unelevated color="primary" label="确认发布" :disable="matches.length > 0 && !playlistId" @click="publish" /></q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import AiTextTools from '@/components/AiTextTools.vue'
import type { AiResult, AiText } from '@/api/ai'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { QTableColumn } from 'quasar'
import request, { API_BASE_URL } from '@/utils/request'
import { getYoutubeAccounts, getYoutubePlaylists, createYoutubePlaylist, youtubeAccountLabel, type YoutubeAccount, type YoutubePlaylist } from '@/api/youtube'
import { getPlatformConfigs } from '@/api/platform'
import { isPublishPlatformReady, isReadyYoutubeAccount } from '@/utils/platformAvailability'
import { createPublishTaskBatch, getPublishTasks, getPublishTask, releaseDeletedYoutube, type PublishRecord, type VideoUploadResult } from '@/api/publish'
import { folderVideoPayload, resolveFolderPlaylist, ensureUniqueFolderTitles, folderPublishState } from '@/utils/folderPublish'

interface ScannedVideo { name: string; path: string; title: string; size: number; fingerprint: string; ticket: string; error: string }
interface Snapshot { folder: string; playlistTitle: string; folders: { name: string; path: string }[]; videos: ScannedVideo[]; ignored: number }
interface Row extends ScannedVideo { scannedTitle?: string; description?: string; selected: boolean; upload?: VideoUploadResult; width?: number; height?: number; duration?: number; taskId?: number; record?: PublishRecord; failure?: string; uncertain?: boolean }
const aiBusy = ref(false)
const aiTools = ref<InstanceType<typeof AiTextTools> | null>(null)
const draftItems = computed(() => rows.value.map(r => ({ id: r.path, title: r.title, description: r.description || '', fingerprint: r.fingerprint, originalTitle: r.scannedTitle || r.title })))
function restoreDraftRows(items: AiText[]) {
  for (const item of items) {
    const row = rows.value.find(r => r.path === item.id)
    if (row && !row.taskId && !row.uncertain && row.fingerprint === item.fingerprint && (row.scannedTitle || row.title) === item.originalTitle) {
      row.title = item.title; row.description = item.description
    }
  }
  ensureUniqueFolderTitles(rows.value)
}
function applyAi(items: AiResult[]) {
  for (const result of items) {
    const row = chosen.value.find(r => r.path === result.id)
    if (row && row.title === result.sourceTitle && (row.description || '') === result.sourceDescription) { row.title = result.title; row.description = result.description }
  }
  if (ensureUniqueFolderTitles(rows.value)) notice.value = 'AI 修改后的重名标题已追加编号，详情保持每条独立。'
}
const snapshot = ref<Snapshot | null>(null)
const rows = ref<Row[]>([])
const folderInput = ref(''), playlistTitle = ref('')
const search = ref(''), expandDescriptions = ref(false), detailRow = ref<Row | null>(null)
const filteredRows = computed(() => {
  const keyword = (search.value || '').trim().toLocaleLowerCase()
  return keyword ? rows.value.filter(r => [r.title, r.name, r.description || ''].some(t => t.toLocaleLowerCase().includes(keyword))) : rows.value
})
const descriptionCount = computed(() => rows.value.filter(r => r.description?.trim()).length)
const totalBytes = computed(() => rows.value.reduce((sum, row) => sum + row.size, 0))
function formatSize(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB` }

const busy = ref(false), progress = ref(0), phase = ref(''), error = ref(''), notice = ref('')
const accounts = ref<YoutubeAccount[]>([]), accountId = ref<string | null>(null)
const accountOptions = computed(() => accounts.value.filter(isReadyYoutubeAccount).map(a => ({ label: youtubeAccountLabel(a), value: a.id })))
const selectable = computed(() => rows.value.filter(r => !r.error && !r.taskId && !r.uncertain))
const chosen = computed(() => selectable.value.filter(r => r.selected))
const submittedRows = computed(() => rows.value.filter(r => r.taskId))
const completedRows = computed(() => submittedRows.value.filter(r => folderPublishState(r.record).kind === 'success'))
const activeRows = computed(() => submittedRows.value.filter(r => folderPublishState(r.record).kind === 'active'))
const failedRows = computed(() => submittedRows.value.filter(r => folderPublishState(r.record).kind === 'attention'))
const statusLoading = ref(false), statusError = ref('')
let statusTimer: ReturnType<typeof setInterval> | undefined
watch(accountId, () => {
  for (const row of rows.value) { row.taskId = undefined; row.record = undefined; row.selected = !row.error && !row.uncertain }
  statusError.value = ''
})
async function refreshResults() {
  if (statusLoading.value) return
  statusLoading.value = true; statusError.value = ''
  try {
    for (const row of [...submittedRows.value]) {
      const id = row.taskId!, target = accountId.value
      const task = (await getPublishTask(id)).data
      if (row.taskId === id && accountId.value === target) row.record = task.records.find(r => r.platform === 'youtube' && r.youtubeAccountId === target)
    }
  } catch { statusError.value = '暂时无法读取最新状态，将继续自动查询；请勿重复提交。' }
  finally { statusLoading.value = false }
}
// Recover results from the server by actual file hash and selected account, never from AI drafts.
async function findExistingTasks(list: Row[]) {
  if (!accountId.value) return
  const tasks = (await getPublishTasks()).data.sort((a, b) => b.id - a.id)
  for (const row of list) {
    if (!row.upload?.hash) continue
    for (const task of tasks.filter(t => t.videoHash === row.upload!.hash)) {
      const detail = (await getPublishTask(task.id)).data
      const record = detail.records.find(r => r.platform === 'youtube' && r.youtubeAccountId === accountId.value && !r.mock && !r.duplicate && !r.youtubeDeletedAt)
      if (!record) continue
      row.taskId = task.id; row.record = record; row.selected = false
      break
    }
  }
}
onUnmounted(() => { if (statusTimer) clearInterval(statusTimer) })

async function releaseDeleted() {
  if (busy.value || aiBusy.value || statusLoading.value) return
  busy.value = true; error.value = ''; notice.value = ''; phase.value = '核对已删除视频'
  let released = 0
  try {
    for (const row of [...completedRows.value]) {
      const result = (await releaseDeletedYoutube(row.taskId!)).data
      if (result.records.some(r => r.platform === 'youtube' && r.youtubeAccountId === accountId.value && r.youtubeDeletedAt)) {
        row.taskId = undefined; row.record = undefined; row.selected = !row.error; row.failure = ''; released++
      }
    }
  } catch (e) { error.value = message(e) }
  finally {
    notice.value = `已核对并释放 ${released} 条已删除视频，历史记录保留。未通过核对的视频仍保持去重保护；尚未重新发布。`
    busy.value = false
  }
}
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every(r => r.selected))
const selectAll = (value: boolean) => selectable.value.forEach(r => { r.selected = value })
const confirmOpen = ref(false), matches = ref<YoutubePlaylist[]>([]), playlistId = ref<string | null>(null)
const privacy = ref<'private' | 'unlisted' | 'public'>('public')
const privacyOptions = [{ label: '私密', value: 'private' }, { label: '不公开列出', value: 'unlisted' }, { label: '公开', value: 'public' }]
const columns: QTableColumn[] = [
  { name: 'selected', label: '', field: 'selected', style: 'width:60px' },
  { name: 'title', label: '视频标题 / 文件名', field: 'title', align: 'left' },
  { name: 'size', label: '大小', field: 'size', format: (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`, align: 'left', style: 'min-width:90px;white-space:nowrap' },
  { name: 'state', label: '处理状态', field: 'error', align: 'left', style: 'min-width:180px;max-width:260px' },
]
const message = (e: any) => e.response?.data?.message || e.message || '操作失败，请重试'
onBeforeRouteLeave(() => !busy.value && !aiBusy.value)

async function scan(folder: string) {
  if (aiBusy.value || busy.value) return
  if (aiTools.value && !await aiTools.value.saveDraft()) { error.value = '请先保存或重新读取当前草稿，再切换文件夹'; return }
  busy.value = true; phase.value = '扫描中'; error.value = ''; notice.value = ''
  try {
    const data: Snapshot = (await request.get('/video-folders', { params: { folder: folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') } })).data.data
    const old = new Map(rows.value.map(r => [r.path, r]))
    if (snapshot.value?.folder !== data.folder) playlistTitle.value = data.playlistTitle
    if (snapshot.value?.folder !== data.folder) { search.value = ''; detailRow.value = null }
    snapshot.value = data; folderInput.value = data.folder
    rows.value = data.videos.map(v => {
      const previous = old.get(v.path)
      return previous?.fingerprint === v.fingerprint
        ? { ...previous, ...v, title: previous.title === previous.scannedTitle ? v.title : previous.title, scannedTitle: v.title }
        : { ...v, scannedTitle: v.title, selected: !v.error }
    })
    ensureUniqueFolderTitles(rows.value)
  } catch (e) { error.value = message(e) }
  finally { busy.value = false }
}

function metadata(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const finish = (err?: string) => {
      clearTimeout(timer)
      video.onloadedmetadata = null; video.onerror = null
      if (err) reject(new Error(err))
      else resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
      video.removeAttribute('src'); video.load()
    }
    const timer = setTimeout(() => finish('读取视频超时，请检查文件格式'), 20000)
    video.preload = 'metadata'
    video.onloadedmetadata = () => finish(video.videoWidth && video.videoHeight && Number.isFinite(video.duration) ? undefined : '无法识别视频尺寸或时长')
    video.onerror = () => finish('浏览器无法读取该视频，请转为 MP4（H.264）后重试')
    video.src = new URL(url, API_BASE_URL).href
  })
}

async function prepare() {
  if (aiBusy.value || busy.value) return
  busy.value = true; error.value = ''; progress.value = 0
  const list = [...chosen.value]
  try {
    for (let i = 0; i < list.length; i++) {
      const row = list[i]; phase.value = `准备素材 ${i + 1}/${list.length}：${row.name}`; row.failure = ''
      try {
        if (!row.upload) row.upload = (await request.post('/video-folders/import', { path: row.path, ticket: row.ticket }, { timeout: 0 })).data.data
        if (!row.width) Object.assign(row, await metadata(row.upload!.url))
      } catch (e) { row.failure = message(e) }
      progress.value = (i + 1) / list.length
    }
    phase.value = '核对已有发布记录'
    await findExistingTasks(list)
    notice.value = list.some(r => r.taskId) ? '已核对发布记录，之前提交过的视频已排除。其余素材可继续预览发布。' : '素材准备完成；尚未向 YouTube 发布。失败项可重新准备，或取消勾选后继续。'
  } catch (e) {
    error.value = message(e)
    for (const row of list.filter(r => !r.taskId)) row.failure = '发布记录核对失败，请重新准备后再继续'
  } finally { busy.value = false }
}

async function reviewAppliedAi() {
  if (!accountId.value) { notice.value = '文案与列表名已保存，请选择目标频道后点击准备并预览发布'; return }
  await review()
}

async function review() {
  if (aiBusy.value || busy.value || !chosen.value.length || !accountId.value || !snapshot.value) return
  if (aiTools.value?.hasPreview) { error.value = '请先应用或丢弃 AI 预览，再继续发布'; return }
  if (!playlistTitle.value.trim() || playlistTitle.value.length > 150 || /[<>\r\n]/.test(playlistTitle.value)) { error.value = '请填写有效列表名称（1–150 字符）'; return }
  playlistTitle.value = playlistTitle.value.trim()
  if (aiTools.value && !await aiTools.value.saveDraft()) { error.value = '请先保存草稿再继续'; return }
  await prepare()
  if (!chosen.value.length) { notice.value = '选中视频均已有发布记录，已显示原任务结果，没有重复上传。'; return }
  if (chosen.value.some(r => !r.upload || !r.width || r.failure)) { error.value = '请处理或取消勾选准备失败的文件'; return }
  busy.value = true; phase.value = '读取播放列表'; error.value = ''
  try {
    matches.value = (await getYoutubePlaylists(accountId.value, true)).data.data.filter(p => p.title === playlistTitle.value)
    playlistId.value = matches.value.length === 1 ? matches.value[0].id : null
    confirmOpen.value = true
  } catch (e) { error.value = message(e) }
  finally { busy.value = false }
}

async function publish() {
  if (aiBusy.value || busy.value || !accountId.value || !snapshot.value || !chosen.value.length) return
  confirmOpen.value = false; busy.value = true; progress.value = 0; error.value = ''; notice.value = ''
  const list = [...chosen.value], target = accountId.value, title = playlistTitle.value.trim()
  try {
    phase.value = '确认播放列表'
    playlistId.value = await resolveFolderPlaylist(title, playlistId.value,
      async () => (await getYoutubePlaylists(target, true)).data.data,
      async () => (await createYoutubePlaylist({ accountId: target, title, privacyStatus: privacy.value })).data.data)
    phase.value = `提交 ${list.length} 个发布任务（同批次相同内容自动去重）`
    try {
      const result = await createPublishTaskBatch(list.map(row => folderVideoPayload(row, target, playlistId.value!)))
      for (const item of result.data.results) {
        const row = list[item.index]
        if (item.ok) { row.taskId = item.taskId; row.selected = false; row.failure = '' }
        else row.failure = item.message || '创建任务失败'
      }
      progress.value = 1
    } catch (e: any) {
      if (!e.response || e.response.status >= 500) {
        list.forEach(row => { row.uncertain = true; row.selected = false; row.failure = '提交结果待核对，请先检查发布记录，勿重复发布' })
        throw new Error('网络中断或服务器异常：批次可能已部分提交，请先在发布记录中核对，不要重新发送')
      }
      throw e
    }
    notice.value = `已提交 ${list.filter(r => r.taskId).length} 个任务。最终发布结果请到“发布记录”查看。`
    await refreshResults()
  } catch (e) { error.value = message(e) }
  finally { busy.value = false }
}

onMounted(async () => {
  statusTimer = setInterval(() => { if (activeRows.value.length || statusError.value) void refreshResults() }, 5000)
  void scan('')
  try {
    const [a, p] = await Promise.all([getYoutubeAccounts(), getPlatformConfigs()])
    const youtube = p.data.find(item => item.code === 'youtube')
    accounts.value = youtube && isPublishPlatformReady(youtube, a.data) ? a.data : []
  } catch (e) { error.value = message(e) }
})
</script>

<style scoped>
.folder-page { background: #f5f7fb; padding: 28px 32px 120px; color: #23344f; }
.workspace { max-width: 1480px; margin: auto; }
.folder-hero { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; }
.hero-heading { display:flex; align-items:center; gap:16px; }
.hero-icon { display:grid; place-items:center; background:#e6efff; color:#2563c5; width:64px; height:64px; border-radius:20px; }
.eyebrow { color:#6683ac; font-size:11px; letter-spacing:1.6px; font-weight:700; }
h1 { font-size:28px; line-height:1.4; color:#172b4d; font-weight:750; margin:3px 0 4px; }
.folder-hero p { color:#718096; margin:0; font-size:13px; }
.hero-actions { display:flex; gap:8px; }
.workflow { display:flex; align-items:center; justify-content:space-between; background:#fff; border:1px solid #e4eaf3; border-radius:16px; padding:18px 28px; margin-bottom:22px; gap:18px; }
.workflow>div { display:flex; align-items:center; gap:12px; flex:1; }
.workflow strong { display:block; font-size:14px; }.workflow small { display:block; margin-top:4px; color:#7c899d; font-size:12px; }
.step-number { width:32px; height:32px; display:grid; place-items:center; border-radius:50%; background:#edf2fa; color:#647a9d; font-weight:700; flex-shrink:0; }
.done .step-number { background:#e7f3ee; color:#238568; }.step-arrow { color:#b6c2d5; }
.setup-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.panel { border-radius:16px; border-color:#e1e7f0; box-shadow:0 4px 18px #21385803; overflow:hidden; }
.panel>.q-card__section { padding:22px; }.panel .text-h6 { font-size:16px; font-weight:700; }
.folder-location { padding:9px 12px; background:#f2f6fc; border-radius:8px; overflow-wrap:anywhere; color:#536b8d; font-size:12px; }
.folder-links { max-height:150px; overflow-y:auto; }.folder-links :deep(.q-btn) { background:#edf4ff; color:#3166b3; border-radius:8px; margin:4px; }
.mapping { margin-top:14px; }.playlist-hint { display:flex; align-items:center; gap:6px; color:#8390a4; font-size:12px; margin-top:8px; }
.list-heading { display:flex; justify-content:space-between; align-items:center; gap:18px; }.section-title { font-size:18px; font-weight:700; margin-bottom:6px; }
.list-controls { display:flex; align-items:center; gap:12px; }.list-search { width:290px; }.list-summary { display:flex; align-items:center; flex-wrap:wrap; gap:24px; padding:0 22px 18px; color:#7b889c; font-size:12px; }.list-summary strong { color:#344e73; margin-right:5px; }
.video-table :deep(thead tr) { background:#f5f8fc; }.video-table :deep(th) { color:#708198; font-size:12px; font-weight:600; }.video-table :deep(td) { padding-top:18px; padding-bottom:18px; border-color:#edf1f7; }
.video-table :deep(tbody tr:hover) { background:#f8fbff; }.video-copy { display:flex; gap:14px; align-items:flex-start; }.video-file-icon { display:grid; place-items:center; width:42px; height:48px; border-radius:9px; background:#eef3fb; color:#7593bc; flex-shrink:0; }.video-copy-body { flex:1; min-width:0; }
.video-table :deep(table) { min-width:680px; }.video-copy { min-width:280px; }.dock-summary > div { min-width:0; }
.video-title { display:block; border:0; background:none; padding:0; text-align:left; color:#29496e; font-size:14px; font-weight:600; line-height:1.5; cursor:pointer; overflow-wrap:anywhere; }.video-title:hover { color:#1976d2; }.video-title:focus-visible { outline:2px solid #1976d2; outline-offset:3px; }
.source-name { color:#96a1b1; font-size:11px; margin-top:4px; overflow-wrap:anywhere; }.video-description { color:#728198; font-size:12px; line-height:1.6; margin-top:7px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; }.video-description.expanded { display:block; }.missing-description { color:#a3adbc; font-size:12px; }
.empty-videos { width:100%; padding:50px 20px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; color:#889ab4; }.empty-videos strong { font-size:16px; color:#536b8d; }.empty-videos span { font-size:13px; }
.publish-dock { position:sticky; bottom:14px; z-index:10; max-width:1480px; margin:24px auto -90px; background:#ffffffed; backdrop-filter:blur(12px); border:1px solid #dce5f1; box-shadow:0 8px 28px #233d681c; border-radius:14px; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; }.dock-summary { display:flex; align-items:center; gap:12px; min-width:0; }.dock-summary strong { display:block; font-size:14px; }.dock-summary span { display:block; font-size:12px; color:#8090a5; margin-top:3px; overflow-wrap:anywhere; }.dock-actions { display:flex; gap:8px; flex-shrink:0; }.dock-actions .q-btn { border-radius:8px; }
.copy-dialog { width:700px; max-width:95vw; border-radius:16px; }.copy-dialog h2 { font-size:19px; line-height:1.5; margin:6px 0; overflow-wrap:anywhere; }.full-description { white-space:pre-wrap; line-height:1.8; overflow-wrap:anywhere; }
@media(max-width:1050px) { .list-heading { align-items:flex-start; flex-direction:column; }.list-controls { width:100%; }.list-search { flex:1; } }
@media(max-width:750px) { .folder-page { padding:18px 12px 140px; }.setup-grid { grid-template-columns:1fr; }.folder-hero { align-items:flex-start; }.hero-heading { gap:10px; }.hero-icon { display:none; }.hero-actions { flex-direction:column; }h1{font-size:24px;}.workflow { padding:14px; gap:8px; }.workflow>div { flex-direction:column; align-items:flex-start; gap:6px; }.workflow strong { font-size:12px; }.workflow small,.step-arrow { display:none; }.publish-dock { flex-direction:column; align-items:stretch; bottom:8px; padding:12px; margin-bottom:-112px; }.dock-actions { justify-content:flex-end; }.list-controls { flex-wrap:wrap; }.list-search { min-width:180px; }.video-file-icon { display:none; }.video-copy { gap:6px; }.panel>.q-card__section { padding:16px; } }
</style>
