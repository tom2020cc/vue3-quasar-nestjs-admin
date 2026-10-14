<template>
  <q-page padding class="youtube-page">
    <q-card flat bordered class="library-panel">
      <q-card-section class="library-header">
        <div class="library-heading">
          <div class="youtube-mark"><q-icon name="smart_display" size="28px" /></div>
          <div>
          <h1 class="page-title">油管视频</h1>
          <div class="page-description">
            浏览频道视频，按播放列表轻松查找。
          </div>
          </div>
        </div>
        <div class="channel-controls">
        <q-select v-model="accountId" :options="accountOptions" emit-value map-options outlined dense
          label="选择 YouTube 频道" class="channel-select" :disable="loading" @update:model-value="channelChanged" />
        <q-btn
          class="refresh-button"
          color="primary"
          icon="cloud_download"
          label="获取 / 刷新"
          unelevated
          :loading="loading"
          :disable="!accountId"
          @click="load"
        />
        </div>
      </q-card-section>
      <q-separator />

      <!-- 未授权提示 -->
      <q-banner v-if="error" class="bg-negative text-white" rounded>
        <template v-slot:avatar><q-icon name="error" /></template>
        {{ error }}
        <template v-slot:action>
          <q-btn flat dense color="white" label="去平台配置授权" :to="'/platform-config'" />
        </template>
      </q-banner>

      <q-banner v-if="playlistError" class="bg-orange-1 text-orange-10 q-ma-md" rounded>
        {{ playlistError }}；仍可查看全部视频，请点击「获取 / 刷新」重试。
      </q-banner>
      <q-tabs v-if="playlists.length" :model-value="view" @update:model-value="changeView" inline-label align="left" active-color="primary" indicator-color="primary" class="library-tabs">
        <q-tab name="playlists" label="播放列表" icon="playlist_play" />
        <q-tab name="videos" label="全部视频" icon="video_library" />
      </q-tabs>
      <q-card-section v-if="playlists.length && view === 'playlists' && !selectedPlaylist" class="library-content">
        <div class="section-toolbar">
          <h2 class="section-title">播放列表</h2>
          <q-badge class="total-badge">{{ playlists.length }} 个列表</q-badge>
          <q-space />
          <q-input v-model="playlistSearch" outlined dense clearable placeholder="搜索播放列表" aria-label="搜索播放列表" class="library-search">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <div class="playlist-grid">
          <button v-for="playlist in filteredPlaylists" :key="playlist.id" type="button" class="playlist-card" @click="openPlaylist(playlist)">
            <div class="playlist-cover">
              <img v-if="playlist.thumbnail" :src="playlist.thumbnail" :alt="playlist.title" />
              <q-icon v-else name="playlist_play" size="48px" color="grey-6" />
              <span class="playlist-count"><q-icon name="playlist_play" /> {{ playlist.itemCount }} 个视频</span>
            </div>
            <div class="playlist-title text-subtitle2 ellipsis-2-lines q-mt-sm" :title="playlist.title">{{ playlist.title }}</div>
            <div class="text-caption text-grey-7 q-mt-xs">播放列表 · {{ privacyLabel(playlist.privacyStatus) }}</div>
            <div class="text-caption text-primary q-mt-xs">查看完整播放列表 <q-icon name="chevron_right" /></div>
          </button>
        </div>
        <div v-if="!filteredPlaylists.length" class="text-grey-7 q-py-lg">没有匹配的播放列表</div>
      </q-card-section>
      <q-card-section v-else class="library-content">
        <div v-if="selectedPlaylist" class="selected-playlist q-mb-lg">
          <q-btn flat dense color="primary" icon="arrow_back" label="返回播放列表" @click="backToPlaylists" />
          <div class="text-h5 q-mt-md">{{ selectedPlaylist.title }}</div>
          <div class="text-caption text-grey-7 q-mt-xs">{{ selectedPlaylist.itemCount }} 个视频 · {{ privacyLabel(selectedPlaylist.privacyStatus) }} · 按播放列表顺序排列</div>
          <div v-if="selectedPlaylist.description" class="text-body2 q-mt-sm playlist-description">{{ selectedPlaylist.description }}</div>
          <q-btn flat dense color="primary" icon="open_in_new" label="在 YouTube 打开播放列表" @click="openUrl(selectedPlaylist.url)" />
        </div>
        <q-banner v-if="listError" class="bg-red-1 text-negative q-mb-md">{{ listError }}
          <template #action><q-btn v-if="selectedPlaylist" flat label="重试" @click="openPlaylist(selectedPlaylist)" /></template>
        </q-banner>
        <div class="section-toolbar">
          <h2 class="section-title">{{ selectedPlaylist ? '列表中的视频' : '视频列表' }}</h2>
          <q-badge class="total-badge">{{ displayedVideos.length }} 个视频</q-badge>
          <q-space />
          <q-input v-model="search" outlined dense clearable placeholder="搜索标题、所属列表或详情" aria-label="搜索标题、所属列表或详情" class="library-search">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <div class="row items-center q-gutter-sm q-mb-md">
          <q-btn outline color="primary" icon="auto_awesome" label="AI 批量更新视频描述" :disable="loading || listLoading || !filteredVideos.some(v => !v.unavailable)" @click="openAi(filteredVideos)" />
          <span class="text-caption text-grey-7">处理当前列表中搜索筛选后的全部视频，先生成预览，再确认同步。</span>
        </div>
        <q-table class="video-table" :rows="filteredVideos" :columns="videoColumns" :row-key="videoRowKey" :loading="loading || listLoading"
          :pagination="{ rowsPerPage: 10 }" :rows-per-page-options="[10, 20, 50]" flat bordered wrap-cells
          :no-data-label="listLoading ? '正在读取列表中的视频…' : selectedPlaylist ? '此播放列表暂无视频' : loaded ? '该频道暂无视频' : '请选择频道并点击获取 / 刷新'" no-results-label="没有匹配的视频">
          <template #body-cell-title="props">
            <q-td :props="props" class="title-cell">
              <div class="video-summary">
                <img v-if="props.row.thumbnail" :src="props.row.thumbnail" alt="视频封面" class="list-cover" />
                <div v-else class="list-cover cover-placeholder"><q-icon name="movie" size="24px" /></div>
                <div class="video-copy">
                  <button type="button" class="video-title" @click="openDetail(props.row)">{{ props.row.title || '（无标题）' }}</button>
                  <q-badge v-if="props.row.unavailable" color="grey" outline>视频不可用或无权查看</q-badge>
                </div>
              </div>
            </q-td>
          </template>
          <template #body-cell-playlists="props">
            <q-td :props="props" class="membership-cell">
              <div v-if="playlistError" class="text-grey-7">所属列表读取失败</div>
              <div v-else-if="videoPlaylists(props.row.id).length" class="column items-start q-gutter-xs">
                <q-btn v-for="playlist in videoPlaylists(props.row.id)" :key="playlist.id" flat dense no-caps
                  align="left" color="primary" class="membership-link" :label="playlist.title" @click="openPlaylist(playlist)" />
              </div>
              <span v-else class="text-grey-7">未加入播放列表</span>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props"><q-btn flat dense color="primary" class="detail-button" icon="visibility" label="视频详情" @click="openDetail(props.row)" /><q-btn flat dense color="primary" icon="auto_awesome" label="AI 更新视频描述" :disable="!!props.row.unavailable" @click="openAi([props.row])" /></q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <YoutubeAiDescriptions v-if="aiOpened" :account-id="aiAccount" :channel-label="aiChannelLabel" :videos="aiVideos" @close="aiOpened = false" @updated="descriptionUpdated" />
    <!-- 详情对话框 -->
    <q-dialog v-model="detailDialog">
      <q-card class="video-dialog" style="width: 720px; max-width: 95vw">
        <q-card-section class="row items-center"><div class="text-h6">视频详情</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭视频详情" v-close-popup /></q-card-section>
        <q-card-section class="q-pa-none">
          <div v-if="detail?.thumbnail" class="cover-wrap">
            <img :src="detail.thumbnail" :alt="detail?.title" class="cover-img" />
          </div>
          <div v-else class="no-cover row items-center justify-center text-grey-5">
            <div class="text-center">
              <q-icon name="movie" size="48px" />
              <div class="text-caption">无封面</div>
            </div>
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-caption text-grey-7">视频标题</div>
          <div class="text-h6" style="overflow-wrap: anywhere">{{ detail?.title }}</div>
          <div class="text-caption text-grey-7">视频 ID：{{ detail?.id }}</div>
          <div class="text-caption text-grey-7">
            <q-icon name="account_circle" size="16px" class="q-mr-xs" />
            {{ detail?.channelTitle || '—' }}
            <span class="q-mx-sm">·</span>
            {{ formatDateTime(detail?.publishedAt) }}
          </div>

          <div class="row q-gutter-xs">
            <q-badge color="primary" outline>{{ formatDuration(detail?.duration || 0) }}</q-badge>
            <q-badge v-if="detail?.definition" color="info" outline>{{ definitionLabel(detail.definition) }}</q-badge>
            <q-badge :color="privacyColor(detail?.privacyStatus || '')" outline>{{ privacyLabel(detail?.privacyStatus || '') }}</q-badge>
          </div>

          <div class="row q-gutter-md q-mt-sm">
            <div class="text-subtitle2"><q-icon name="play_arrow" /> {{ formatCount(detail?.viewCount) }} 播放</div>
            <div class="text-subtitle2"><q-icon name="thumb_up" /> {{ formatCount(detail?.likeCount) }} 点赞</div>
            <div class="text-subtitle2"><q-icon name="chat_bubble_outline" /> {{ formatCount(detail?.commentCount) }} 评论</div>
          </div>

          <q-separator />
          <div class="text-subtitle2">视频详情 / 描述</div>
          <div class="text-body2 text-grey-9" style="white-space: pre-wrap; word-break: break-word">
            {{ detail?.description || '（无简介）' }}
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat color="primary" label="在油管打开" icon="open_in_new" @click="openUrl(detail?.url)" />
          <q-btn flat label="关闭" color="grey" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import YoutubeAiDescriptions from '@/components/YoutubeAiDescriptions.vue'
import type { AiText } from '@/api/ai'
import { ref, computed, onMounted } from 'vue'
import { Notify } from 'quasar'
import { getYoutubePlaylists, getYoutubePlaylistVideos, type YoutubePlaylist, getYoutubeVideos, getYoutubeAccounts, youtubeAccountLabel, type YoutubeAccount, type YoutubeVideo } from '@/api/youtube'
import { formatDuration, formatCount } from '@/utils/format'

const aiOpened = ref(false), aiAccount = ref(''), aiChannelLabel = ref(''), aiVideos = ref<AiText[]>([])
function openAi(items: YoutubeVideo[]) {
  if (!accountId.value || loading.value || listLoading.value) return
  const seen = new Set<string>()
  aiVideos.value = items.filter(v => !v.unavailable && !seen.has(v.id) && !!seen.add(v.id)).map(v => ({ id: v.id, title: v.title, description: v.description || '' }))
  if (!aiVideos.value.length) return
  aiAccount.value = accountId.value
  aiChannelLabel.value = accountOptions.value.find(a => a.value === accountId.value)?.label || accountId.value
  aiOpened.value = true
}
function descriptionUpdated(id: string, description: string) {
  if (accountId.value !== aiAccount.value) return
  for (const v of [...videos.value, ...playlistVideos.value]) if (v.id === id) v.description = description
  if (detail.value?.id === id) detail.value.description = description
}
const search = ref('')
const videoColumns = [
  { name: 'title', label: '视频标题', field: 'title', align: 'left' as const, sortable: true },
  { name: 'playlists', label: '所属列表', field: 'id', align: 'left' as const },
  { name: 'duration', label: '时长', field: 'duration', format: formatDuration, sortable: true },
  { name: 'publishedAt', label: '发布时间', field: 'publishedAt', format: formatDateTime, sortable: true },
  { name: 'viewCount', label: '播放量', field: 'viewCount', format: formatCount, sortable: true },
  { name: 'actions', label: '操作', field: 'id', align: 'center' as const },
]
const videos = ref<YoutubeVideo[]>([])
const filteredVideos = computed(() => {
  const keyword = (search.value || '').trim().toLocaleLowerCase()
  return displayedVideos.value.filter(v => !keyword || `${v.title} ${v.description} ${videoPlaylists(v.id).map(p => p.title).join(' ')}`.toLocaleLowerCase().includes(keyword))
})
const playlists = ref<YoutubePlaylist[]>([])
function videoPlaylists(videoId: string) { return playlists.value.filter(p => p.videoIds?.includes(videoId)) }
const playlistSearch = ref('')
const filteredPlaylists = computed(() => {
  const keyword = (playlistSearch.value || '').trim().toLocaleLowerCase()
  return playlists.value.filter(p => !keyword || `${p.title} ${p.description}`.toLocaleLowerCase().includes(keyword))
})
const view = ref('videos')
const selectedPlaylist = ref<YoutubePlaylist | null>(null)
const playlistVideos = ref<YoutubeVideo[]>([])
const displayedVideos = computed(() => selectedPlaylist.value ? playlistVideos.value : videos.value)
const loaded = ref(false)
const listLoading = ref(false)
const listError = ref('')
const playlistError = ref('')
let requestVersion = 0
function videoRowKey(v: YoutubeVideo) { return v.playlistItemId || v.id }
function backToPlaylists() {
  requestVersion++
  selectedPlaylist.value = null
  playlistVideos.value = []
  listLoading.value = false
  listError.value = ''
  search.value = ''
  detailDialog.value = false
}
function changeView(value: string) { backToPlaylists(); view.value = value }
async function openPlaylist(playlist: YoutubePlaylist) {
  if (!accountId.value) return
  const version = ++requestVersion
  selectedPlaylist.value = playlist
  view.value = 'playlists'
  playlistVideos.value = []
  search.value = ''
  listError.value = ''
  listLoading.value = true
  detailDialog.value = false
  try {
    const response = await getYoutubePlaylistVideos(accountId.value, playlist.id)
    if (version === requestVersion) playlistVideos.value = response.data.data || []
  } catch (e: any) {
    if (version === requestVersion) listError.value = e.response?.data?.message || '获取播放列表视频失败'
  } finally {
    if (version === requestVersion) listLoading.value = false
  }
}
const loading = ref(false)
const error = ref('')
const detailDialog = ref(false)
const detail = ref<YoutubeVideo | null>(null)
const accounts = ref<YoutubeAccount[]>([])
const accountId = ref<string | null>(null)
const accountOptions = computed(() => accounts.value.filter((a) => a.enabled && a.verified).map((a) => ({ label: youtubeAccountLabel(a), value: a.id })))
const recentChannelKey = 'youtube-videos:last-channel'
function rememberChannel() {
  try {
    if (accountId.value) localStorage.setItem(recentChannelKey, accountId.value)
    else localStorage.removeItem(recentChannelKey)
  } catch { /* 浏览器禁用存储时，仍可正常切换频道 */ }
}
function channelChanged() {
  rememberChannel()
  backToPlaylists()
  videos.value = []; playlists.value = []; detail.value = null
  playlistSearch.value = ''; error.value = ''; playlistError.value = ''; loaded.value = false
  view.value = 'videos'
  if (accountId.value) void load()
}

async function load() {
  if (!accountId.value) return
  backToPlaylists()
  const version = ++requestVersion
  const selectedId = accountId.value
  loading.value = true
  error.value = ''; playlistError.value = ''; playlistSearch.value = ''
  videos.value = []; playlists.value = []; loaded.value = false
  const results = await Promise.allSettled([getYoutubeVideos(selectedId), getYoutubePlaylists(selectedId)])
  if (version !== requestVersion) return
  const [videoResult, playlistResult] = results
  if (videoResult.status === 'fulfilled') videos.value = videoResult.value.data.data || []
  else {
    error.value = videoResult.reason.response?.data?.message || '获取油管视频失败'
    Notify.create({ type: 'negative', message: error.value })
  }
  if (playlistResult.status === 'fulfilled') playlists.value = playlistResult.value.data.data || []
  else playlistError.value = playlistResult.reason.response?.data?.message || '播放列表读取失败'
  view.value = playlists.value.length ? 'playlists' : 'videos'
  loaded.value = videoResult.status === 'fulfilled'
  loading.value = false
}
onMounted(async () => {
  try {
    accounts.value = (await getYoutubeAccounts()).data
    let recentChannel: string | null = null
    try { recentChannel = localStorage.getItem(recentChannelKey) } catch { /* 存储不可用 */ }
    const availableRecent = accountOptions.value.find(a => a.value === recentChannel)
    if (availableRecent) accountId.value = availableRecent.value
    else if (accountOptions.value.length === 1) accountId.value = accountOptions.value[0].value
    // 已删除、停用或未验证的频道不恢复，避免显示另一个账号的数据。
    rememberChannel()
    if (accountId.value) await load()
    else if (!accountOptions.value.length) error.value = '请先在平台配置中添加账号并识别频道'
  } catch { error.value = '无法获取频道列表，请检查后端连接' }
})

function openDetail(v: YoutubeVideo) {
  detail.value = v
  detailDialog.value = true
}

function openUrl(url?: string) {
  if (url) window.open(url, '_blank')
}

function definitionLabel(d: string) {
  return d === 'hd' ? '高清' : d === 'sd' ? '标清' : d || ''
}

function privacyLabel(s: string) {
  return { public: '公开', private: '私享', unlisted: '不公开列出' }[s] || s || '—'
}

function privacyColor(s: string) {
  return { public: 'positive', private: 'negative', unlisted: 'warning' }[s] || 'grey'
}

function formatDateTime(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString()
}
</script>

<style scoped>
.youtube-page { background: #f5f7fb; color: #25334a; padding: 24px; }
.library-panel { border: 1px solid #e4e9f1; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px #243b5310; }
.library-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 24px; padding: 26px; }
.library-heading { display: flex; align-items: center; gap: 14px; }
.youtube-mark { display: grid; place-items: center; width: 50px; height: 50px; background: #fff0f0; color: #e53935; border-radius: 14px; flex-shrink: 0; }
.page-title { margin: 0; font-size: 23px; line-height: 1.4; font-weight: 700; letter-spacing: .3px; }
.page-description { margin-top: 5px; color: #788497; font-size: 13px; }
.channel-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.channel-select { width: 320px; max-width: 100%; }
.refresh-button { min-height: 40px; border-radius: 8px; padding: 0 16px; }
.library-panel :deep(.q-field__control) { border-radius: 9px; background: #fff; }
.library-panel :deep(.q-field--outlined .q-field__control:before) { border-color: #dce3ed; }
.library-tabs { padding: 8px 24px 0; border-bottom: 1px solid #edf0f5; }
.library-tabs :deep(.q-tab) { min-height: 50px; padding: 0 20px; color: #6e7c90; }
.library-tabs :deep(.q-tab--active) { background: #f0f6ff; border-radius: 8px 8px 0 0; }
.library-tabs :deep(.q-tab__icon) { font-size: 21px; }
.library-content { padding: 24px; }
.section-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 20px; }
.section-title { margin: 0; font-size: 17px; font-weight: 650; line-height: 28px; }
.total-badge { background: #eef3fa; color: #60728c; border-radius: 6px; padding: 5px 8px; }
.library-search { width: 300px; max-width: 100%; }
.library-search :deep(.q-icon) { color: #8a98ab; font-size: 22px; }
.playlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 22px; }
.playlist-card { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; width: 100%; min-width: 0; padding: 16px 12px 12px; border: 1px solid #e6ebf2; border-radius: 12px; background: #fff; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: border-color .18s, box-shadow .18s; }
.playlist-card:hover { border-color: #b5cbed; box-shadow: 0 5px 16px #23446912; }
.playlist-card > * { flex-shrink: 0; }
.playlist-title { height: 44px; line-height: 22px; overflow-wrap: anywhere; font-weight: 600; }
.playlist-card:focus-visible { outline: 3px solid var(--q-primary); outline-offset: 5px; border-radius: 10px; }
.playlist-cover { position: relative; aspect-ratio: 16 / 9; background: #edf1f7; border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: 0 -4px 0 -1px #d1dae7, 0 -8px 0 -3px #e9edf4; }
.playlist-cover img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.playlist-card:hover .playlist-cover { filter: brightness(.93); }
.playlist-count { position: absolute; bottom: 7px; right: 7px; background: #000b; color: white; border-radius: 4px; padding: 2px 6px; font-size: 12px; }
.playlist-description { white-space: pre-wrap; overflow-wrap: anywhere; }
.selected-playlist { padding: 18px 20px; border-radius: 12px; background: #f5f8fd; border: 1px solid #e6edf7; }
.video-table { border-color: #e7ecf3; border-radius: 10px; }
.video-table :deep(table) { min-width: 940px; }
.video-table :deep(thead tr) { background: #f6f8fc; }
.video-table :deep(th) { height: 46px; color: #6a7890; font-size: 12px; font-weight: 600; white-space: nowrap; }
.video-table :deep(tbody td) { padding: 16px 14px; border-color: #eef1f6; color: #536177; font-size: 13px; }
.video-table :deep(tbody tr:hover) { background: #f8fbff; }
.video-table :deep(th:nth-child(1)) { width: 43%; }
.video-table :deep(th:nth-child(2)) { width: 19%; }
.video-table :deep(td:nth-child(n+3)) { white-space: nowrap; font-variant-numeric: tabular-nums; }
.video-table :deep(.q-table__bottom) { color: #788497; border-color: #e7ecf3; min-height: 60px; }
.title-cell { min-width: 340px; max-width: 600px; }
.membership-cell { min-width: 155px; max-width: 270px; }
.video-summary { display: flex; align-items: center; gap: 14px; }
.video-copy { min-width: 0; }
.list-cover { width: 112px; height: 63px; object-fit: cover; border-radius: 7px; flex-shrink: 0; }
.cover-placeholder { display: grid; place-items: center; color: #9ba9bb; background: #edf1f7; }
.video-title { display: block; width: 100%; border: 0; padding: 0; background: none; color: #293b53; font: inherit; font-weight: 500; line-height: 1.65; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.video-title:hover { color: var(--q-primary); }
.video-title:focus-visible { outline: 2px solid var(--q-primary); outline-offset: 4px; border-radius: 3px; }
.membership-link { background: #eff5ff; border-radius: 6px; padding: 4px 8px; font-size: 12px; line-height: 1.5; }
.membership-link :deep(.q-btn__content) { justify-content: flex-start; text-align: left; overflow-wrap: anywhere; }
.detail-button { border-radius: 7px; font-size: 12px; padding: 5px 8px; }
.detail-button :deep(.q-btn__content) { flex-wrap: nowrap; white-space: nowrap; }
.detail-button :deep(.q-icon) { font-size: 18px; }
.video-dialog { border-radius: 16px; }
@media (max-width: 1100px) {
  .library-header { gap: 20px; }
  .channel-controls { width: 100%; }
  .channel-select { flex: 1; }
}
@media (max-width: 600px) {
  .youtube-page { padding: 12px; }
  .library-header, .library-content { padding: 16px; }
  .page-title { font-size: 20px; }
  .channel-select { width: 100%; flex-basis: 100%; }
  .library-tabs { padding-left: 8px; padding-right: 8px; }
  .library-search { width: 100%; }
  .playlist-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
}
.cover-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #000;
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.no-cover {
  aspect-ratio: 16 / 9;
  background: #f5f5f5;
}
</style>
