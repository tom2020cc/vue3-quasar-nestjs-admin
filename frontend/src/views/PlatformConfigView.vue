<template>
  <q-page padding class="platform-page">
    <div class="platform-container">
    <header class="platform-heading">
      <div><div class="text-overline text-primary">频道与授权</div><h1>平台管理</h1><p>管理已接入的频道，让每一次发布都有明确的目标。</p></div>
      <q-btn unelevated color="primary" icon="movie" label="发布视频" to="/publish" />
    </header>
    <section class="connection-summary" aria-label="接入概况">
      <div class="connection-brand"><q-avatar rounded size="56px" color="red-1" text-color="red" icon="smart_display" /><div><h2>YouTube 工作台</h2><div class="text-grey-7">横屏 / 竖屏 · 多频道 · 播放列表</div></div></div>
      <div class="connection-metric"><strong>{{ loading ? '—' : readyRows.length }}</strong><span>已接入平台</span></div>
      <div class="connection-metric"><strong>{{ loading ? '—' : readyAccounts.length }}</strong><span>已授权频道</span></div>
      <q-btn outline color="primary" label="浏览频道视频" icon="video_library" to="/youtube-videos" />
    </section>
    <q-banner v-if="loadError" rounded class="bg-red-1 text-negative q-mb-md">{{ loadError }}<template #action><q-btn flat label="重新加载" @click="load" /></template></q-banner>
    <q-card flat bordered class="connection-card">
      <q-card-section class="row items-center q-gutter-sm">
        <div><div class="text-h6">{{ showOtherPlatforms ? '全部平台设置' : '已接入平台' }}</div><div class="text-caption text-grey-7">默认只展示已完成接入的平台，其他平台的配置仍然保留。</div></div>
        <q-space />
        <q-btn flat color="grey-7" :icon="showOtherPlatforms ? 'visibility_off' : 'tune'" :label="showOtherPlatforms ? '收起其他平台' : '管理其他平台'" @click="showOtherPlatforms = !showOtherPlatforms" />
        <q-btn flat round color="primary" icon="refresh" aria-label="刷新平台状态" :loading="loading" @click="load" />
      </q-card-section>
      <q-separator />

      <q-table
        :rows="visibleRows"
        :columns="columns"
        row-key="code"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        hide-bottom
        no-data-label="暂无已接入平台，可在下方添加 YouTube 账号，或展开其他平台设置。"
        flat
        bordered
      >
        <template #body-cell-name="props"><q-td :props="props"><div class="row items-center no-wrap q-gutter-sm"><q-avatar rounded size="36px" :color="props.row.code === 'youtube' ? 'red-1' : 'grey-2'" :text-color="props.row.code === 'youtube' ? 'red' : 'grey-7'" :icon="props.row.code === 'youtube' ? 'smart_display' : 'apps'" /><span class="text-weight-medium">{{ props.row.name }}</span></div></q-td></template>
        <template v-slot:body-cell-orientations="props">
          <q-td :props="props">
            <q-badge
              v-for="o in props.row.orientations"
              :key="o"
              :color="o === 'landscape' ? 'info' : 'purple'"
              outline
              class="q-mr-xs"
            >
              {{ o === 'landscape' ? '宽屏' : '窄屏' }}
            </q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-config="props">
          <q-td :props="props">
            <div v-if="props.row.available === false">
              <q-badge color="negative" outline>暂不可用</q-badge>
              <div class="text-caption text-negative">{{ props.row.unavailableReason }}</div>
            </div>
            <template v-else>
              <q-badge v-if="isPublishPlatformReady(props.row, accounts)" color="positive" outline>频道已授权</q-badge>
              <q-badge v-else-if="props.row.config?.enabled === false" color="grey" outline>已停用</q-badge>
              <q-badge v-else-if="hasCredential(props.row)" color="positive" outline>{{ ['youtube', 'tiktok'].includes(props.row.code) ? '应用已配置' : '已配置凭证' }}</q-badge>
              <q-badge v-else color="grey-6" outline>尚未接入</q-badge>
            </template>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-xs">
            <q-btn
              flat
              dense
              color="primary"
              icon="edit"
              label="配置"
              :disable="props.row.available === false"
              @click="openEdit(props.row)"
            />
            <q-btn
              flat
              dense
              color="teal"
              icon="link"
              :label="['youtube', 'tiktok'].includes(props.row.code) ? '添加账号' : '授权'"
              :disable="props.row.available === false"
              :loading="oauthLoading === props.row.code"
              @click="onOAuth(props.row)"
            />
            <q-btn
              v-if="!['youtube', 'tiktok'].includes(props.row.code) && (props.row.config?.refreshToken || (props.row.code === 'instagram' && props.row.config?.extra?.authType === 'instagram_login' && props.row.config?.accessToken))"
              flat
              dense
              color="indigo"
              icon="refresh"
              label="刷新令牌"
              @click="onRefresh(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <YoutubeAccounts :key="`youtube-${accountVersion}`" @changed="accounts = $event" />
    <template v-if="showOtherPlatforms">
      <q-banner class="q-mt-md bg-blue-1 text-primary" rounded>TikTok 授权仅用于读取视频，网页发布需在 TikTok 中手动完成。<template #action><q-btn flat color="primary" label="TikTok 视频" to="/tiktok-videos" /><q-btn flat color="primary" label="TikTok 网页发布" to="/tiktok-browser-publish" /></template></q-banner>
      <TiktokAccounts :key="`tiktok-${accountVersion}`" />
    </template>

    <!-- 接入注意事项 & 防封号指南 -->
    <q-expansion-item class="settings-expansion q-mt-md" icon="backup" label="本机配置备份与导入" caption="保存应用配置和账号授权，便于恢复">
      <div class="q-pa-md"><LocalConfigBackup @imported="onConfigImported" /></div>
    </q-expansion-item>
    <q-expansion-item class="settings-expansion q-mt-md" icon="help_outline" label="接入帮助与注意事项">
      <div class="q-pa-md text-grey-7">新增账号前请先配置应用，并将回调地址 {{ backendBase }}/platform/&lt;编码&gt;/oauth/callback 登记到平台控制台。</div>
      <PlatformGuideCard />
    </q-expansion-item>
    </div>

    <!-- 配置对话框 -->
    <q-dialog v-model="dialog">
      <q-card style="min-width: 520px">
        <q-card-section class="text-h6">{{ editing?.name }} · 接入配置</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-banner class="bg-grey-2 text-grey-9">
            <template v-slot:avatar><q-icon name="info" color="primary" /></template>
            <div>{{ editing?.description }}</div>
            <div class="text-caption">接口地址：{{ editing?.apiBase }}</div>
            <div class="text-caption">所需配置：{{ (editing?.requiredFields || []).join('、') }}</div>
          </q-banner>

          <q-banner v-if="editing?.code === 'instagram'" class="bg-blue-1 text-primary">
            <div>支持创作者和企业账号，使用 Instagram 直接授权，无需绑定 Facebook 公共主页。</div>
            <div class="q-mt-sm">在 Meta 应用的「Instagram → API setup with Instagram login」获取 Instagram App ID / App Secret，填入下面后保存，再点击本行「授权」。请勿填写 Facebook App ID 或账号密码。</div>
            <div class="q-mt-sm">回调地址：{{ backendBase }}/platform/instagram/oauth/callback（须与控制台登记完全一致）。若控制台要求 HTTPS，需先配置匹配的 HTTPS 回调。</div>
            <div class="q-mt-sm">当前视频发布仍需对象存储提供平台可读取的视频地址；授权成功不等于视频发布成功。</div>
            <q-btn flat color="primary" label="Meta 应用控制台" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" />
          </q-banner>

          <q-form @submit="onSubmit" class="q-gutter-md">
            <q-toggle v-model="form.enabled" label="启用该平台" color="primary" />
            <q-input v-model="form.appId" :label="editing?.code === 'instagram' ? 'Instagram App ID' : '应用ID（client_key / client_id）'" autocomplete="off" dense outlined />
            <q-input v-model="form.appSecret" :label="editing?.code === 'instagram' ? 'Instagram App Secret' : '应用密钥 client_secret'" autocomplete="new-password" dense outlined :type="isPwd ? 'password' : 'text'">
              <template v-slot:append>
                <q-icon :name="isPwd ? 'visibility_off' : 'visibility'" class="cursor-pointer" @click="isPwd = !isPwd" />
              </template>
            </q-input>
            <div v-if="['youtube', 'tiktok'].includes(editing?.code || '')" class="text-caption">此处配置用于添加新账号的 OAuth 应用。各账号令牌在下方多账号管理中分别保存。</div>
            <template v-else>
              <q-input v-model="form.accessToken" label="访问令牌 access_token" autocomplete="new-password" dense outlined type="password" />
              <q-input v-if="editing?.code !== 'instagram'" v-model="form.refreshToken" label="刷新令牌 refresh_token" dense outlined type="password" />
              <q-input v-model="form.openId" :label="editing?.code === 'instagram' ? 'Instagram 用户 ID（授权后自动保存）' : '授权用户 open_id（抖音必填）'" autocomplete="off" dense outlined />
            </template>
            <q-input v-model="form.remark" label="备注" dense outlined />
          </q-form>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="取消" color="primary" v-close-popup />
          <q-btn color="primary" label="保存" :loading="saving" @click="onSubmit" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Notify } from 'quasar'
import {
  getPlatformConfigs,
  updatePlatformConfig,
  getOAuthUrl,
  refreshOAuthToken,
  type PlatformWithConfig,
} from '@/api/platform'
import { API_BASE_URL } from '@/utils/request'
import PlatformGuideCard from '@/components/PlatformGuideCard.vue'
import LocalConfigBackup from '@/components/LocalConfigBackup.vue'
import TiktokAccounts from '@/components/TiktokAccounts.vue'
import YoutubeAccounts from '@/components/YoutubeAccounts.vue'
import { getYoutubeAccounts, type YoutubeAccount } from '@/api/youtube'
import { isPublishPlatformReady, isReadyYoutubeAccount } from '@/utils/platformAvailability'
const accounts = ref<YoutubeAccount[]>([])
const showOtherPlatforms = ref(false)
const loadError = ref('')
const readyAccounts = computed(() => accounts.value.filter(isReadyYoutubeAccount))
const readyRows = computed(() => rows.value.filter(row => isPublishPlatformReady(row, accounts.value)))
const visibleRows = computed(() => showOtherPlatforms.value ? rows.value : readyRows.value)
const accountVersion = ref(0)
function onConfigImported() { accountVersion.value++; load() }

const rows = ref<PlatformWithConfig[]>([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const isPwd = ref(true)
const editing = ref<PlatformWithConfig | null>(null)
const editId = ref<number | null>(null)
const oauthLoading = ref('')
const route = useRoute()
const router = useRouter()
// 回调地址基地址（后端地址，需登记到各平台控制台）
const backendBase = computed(() => API_BASE_URL)

const form = reactive({
  enabled: true,
  appId: '',
  appSecret: '',
  accessToken: '',
  refreshToken: '',
  openId: '',
  remark: '',
})

const columns = [
  { name: 'name', label: '平台', align: 'left' as const, field: 'name' },
  { name: 'orientations', label: '支持尺寸', align: 'center' as const, field: 'orientations' },
  { name: 'config', label: '凭证状态', align: 'center' as const, field: 'config' },
  { name: 'actions', label: '操作', align: 'center' as const, field: 'actions' },
]

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [res, accountRes] = await Promise.all([getPlatformConfigs(), getYoutubeAccounts()])
    rows.value = res.data
    accounts.value = accountRes.data
  } catch (e: any) {
    rows.value = []
    accounts.value = []
    loadError.value = '平台状态加载失败，请重试。'
    Notify.create({ type: 'negative', message: e.response?.data?.message || '获取平台配置失败' })
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  load()
  handleOAuthCallback()
})

// 处理 OAuth 授权回调结果（后端重定向回来携带 query 参数）
function handleOAuthCallback() {
  const { oauth, platform, message } = route.query
  if (oauth === 'success') {
    Notify.create({ type: 'positive', message: platform === 'youtube' ? 'YouTube 频道授权已保存，其他频道授权保持不变' : `「${platformName(String(platform))}」授权成功，令牌已保存` })
    router.replace({ path: '/platform-config' })
  } else if (oauth === 'error') {
    Notify.create({ type: 'negative', message: `授权失败：${message || ''}` })
    router.replace({ path: '/platform-config' })
  }
}

function platformName(code: string) {
  return rows.value.find((r) => r.code === code)?.name || code
}

// 跳转到平台授权页
async function onOAuth(row: PlatformWithConfig) {
  oauthLoading.value = row.code
  try {
    const res = await getOAuthUrl(row.code)
    window.location.href = res.data.url
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '获取授权地址失败' })
  } finally {
    oauthLoading.value = ''
  }
}

// 刷新访问令牌
async function onRefresh(row: PlatformWithConfig) {
  try {
    await refreshOAuthToken(row.code)
    Notify.create({ type: 'positive', message: '令牌刷新成功' })
    load()
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '刷新失败' })
  }
}

// 判断该平台是否已配置了发布所需的主要凭证
function hasCredential(row: PlatformWithConfig) {
  const c = row.config
  if (!c) return false
  if (['youtube', 'tiktok'].includes(row.code)) return !!c.appId && !!c.appSecret
  if (row.code === 'douyin_cn') return !!c.accessToken && !!c.openId
  if (row.code === 'facebook') return !!c.accessToken && !!(c.extra?.pageId || c.openId)
  if (row.code === 'instagram') return !!c.accessToken && !!(c.extra?.igUserId || c.openId)
  return !!c.accessToken
}

function openEdit(row: PlatformWithConfig) {
  editing.value = row
  const c = row.config
  editId.value = c?.id ?? null
  form.enabled = c?.enabled ?? true
  form.appId = c?.appId || ''
  form.appSecret = c?.appSecret || ''
  form.accessToken = c?.accessToken || ''
  form.refreshToken = c?.refreshToken || ''
  form.openId = c?.openId || ''
  form.remark = c?.remark || ''
  dialog.value = true
}

async function onSubmit() {
  if (editId.value == null) {
    Notify.create({ type: 'negative', message: '缺少配置ID' })
    return
  }
  saving.value = true
  try {
    await updatePlatformConfig(editId.value, {
      enabled: form.enabled,
      appId: form.appId,
      appSecret: form.appSecret,
      ...(editing.value?.code === 'youtube' ? {} : { accessToken: form.accessToken, refreshToken: form.refreshToken, openId: form.openId }),
      remark: form.remark,
    })
    Notify.create({ type: 'positive', message: '保存成功' })
    dialog.value = false
    load()
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '保存失败' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.platform-page { background: #f5f7fb; color: #1d304b; }
.platform-container { max-width: 1320px; margin: 8px auto 32px; }
.platform-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.platform-heading h1 { font-size: 28px; font-weight: 700; line-height: 1.4; margin: 4px 0 8px; }
.platform-heading p { margin: 0; color: #738197; }
.connection-summary { display: flex; align-items: center; gap: 36px; padding: 28px; background: linear-gradient(115deg, #fff, #edf4ff); border: 1px solid #dce6f5; border-radius: 18px; margin-bottom: 24px; }
.connection-brand { display: flex; align-items: center; gap: 16px; flex: 1; }
.connection-brand h2 { font-size: 20px; font-weight: 650; line-height: 1.5; margin: 0 0 4px; }
.connection-metric { display: flex; flex-direction: column; gap: 6px; white-space: nowrap; }
.connection-metric strong { font-size: 30px; line-height: 1.2; color: #2466bc; }
.connection-metric span { color: #738197; font-size: 12px; }
.connection-card, .settings-expansion, :deep(.platform-container > .q-card) { border-radius: 16px; border-color: #e1e7f0; overflow: hidden; background: white; }
.settings-expansion { border: 1px solid #e1e7f0; }
:deep(.q-table thead) { background: #f7f9fc; color: #6b7d95; }
:deep(.q-table tbody td) { padding-top: 18px; padding-bottom: 18px; }
@media (max-width: 800px) {
  .connection-summary { flex-wrap: wrap; gap: 22px; padding: 20px; }
  .connection-brand { flex-basis: 100%; }
  .platform-heading { align-items: flex-start; }
  .platform-heading h1 { font-size: 24px; }
}
</style>
