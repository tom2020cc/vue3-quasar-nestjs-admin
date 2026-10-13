<template>
  <q-page padding class="browser-page">
    <div class="browser-container">
      <div class="row items-center q-mb-lg">
        <div><div class="text-overline text-primary">TikTok · 官方网页发布</div><h1>TikTok 网页发布</h1><div class="text-grey-7">使用当前浏览器的 TikTok 登录状态，在官方网页完成上传和发布。</div></div>
        <q-space/><q-btn outline color="primary" label="发布记录" to="/publish-records"/>
      </div>
      <q-banner rounded class="bg-blue-1 text-primary q-mb-lg">TikTok 只从此入口进入官方网页发布，不再走项目 API 或独立 Chrome。请在已登录 TikTok 的 Chrome 中打开本项目；如果在内部浏览器打开，下面的链接也会在内部浏览器打开。</q-banner>
      <div class="row q-col-gutter-lg">
        <div class="col-12 col-md-5"><q-card flat bordered class="full-height"><q-card-section>
          <div class="step-number">1</div><h2>确认账号，准备文案</h2>
          <q-input v-model="username" outlined dense label="添加 TikTok 用户名" hint="例如 andjacktom1，支持粘贴带 @ 的用户名；不是昵称" :disable="busy"/>
          <q-btn class="q-my-md" outline color="primary" icon="person_add" label="保存账号" :disable="!validUsername || busy" @click="add"/>
          <q-select v-model="accountId" :options="accounts.map(a => ({label: '@' + a.username, value: a.id}))" emit-value map-options outlined label="本次发布账号" :disable="busy"/>
          <div class="text-caption q-mt-sm" :class="storageError ? 'text-negative' : 'text-positive'">{{ storageError ? '浏览器存储不可用，当前草稿无法自动保存。已保存账号仍保留在项目中。' : '账号保存在本机项目；最近选择和各账号草稿自动保存在此浏览器，刷新、关闭后重新打开可恢复。' }}</div>
          <div class="text-caption text-grey-7 q-mt-sm">这里只记录目标账号，不会登录或切换 TikTok。请在 TikTok 中确认本人主页有“编辑主页”按钮。</div>
          <q-btn class="q-mt-md" flat color="primary" icon="account_circle" label="打开目标主页核对" :disable="!selectedAccount" :href="profileUrl" target="_blank" rel="noopener noreferrer"/>
          <q-input v-model="caption" class="q-mt-md" outlined type="textarea" label="视频标题 / 发布文案" maxlength="2200" counter/>
          <q-btn flat color="primary" icon="content_copy" label="复制文案" :disable="!caption.trim()" @click="copyCaption"/>
        </q-card-section></q-card></div>
        <div class="col-12 col-md-7"><q-card flat bordered><q-card-section>
          <div class="step-number">2</div><h2>在 TikTok 网页上传、发布</h2>
          <ol class="steps"><li>打开下方官方上传页，确认登录的是本次目标账号。</li><li>在 TikTok 点击“选择视频”，选择电脑上的视频文件。</li><li>粘贴文案，核对预览、可见范围和内容声明。</li><li>等待检查完成，点击 TikTok 的“发布”，到“作品”列表确认结果。</li></ol>
          <q-btn unelevated color="primary" icon="open_in_new" label="打开 TikTok 官方上传页" href="https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video" target="_blank" rel="noopener noreferrer"/>
          <div class="text-caption text-grey-7 q-mt-md">会在当前浏览器新标签页打开，不创建独立 Chrome。不需要开发者 API 发布权限。打开页面和复制文案都不会自动发布视频。</div>
          <q-btn flat class="q-mt-sm" color="primary" label="查看图文教程" href="/guides/tiktok.html#browser-publish" target="_blank" rel="noopener noreferrer"/>
        </q-card-section></q-card>
        <q-card flat bordered class="q-mt-lg"><q-card-section>
          <div class="step-number">3</div><h2>发布后保存视频链接</h2>
          <p class="text-grey-7">在 TikTok 作品列表确认成功后，复制完整视频链接保存到项目。只登记结果，不会再次上传。</p>
          <q-input v-model="resultUrl" outlined label="TikTok 视频链接" placeholder="https://www.tiktok.com/@用户名/video/编号" :disable="busy"/>
          <q-checkbox v-model="resultConfirmed" :label="`我已在 TikTok 核对该视频属于 ${selectedAccount ? '@' + selectedAccount.username : '所选账号'}，且已发布`" :disable="busy"/>
          <div><q-btn unelevated color="primary" icon="save" label="保存发布记录" :loading="busy" :disable="!selectedAccount || !caption.trim() || !resultUrl.trim() || !resultConfirmed" @click="saveResult"/></div>
          <div class="text-caption text-grey-7 q-mt-sm">保存后标为“用户确认已发布”；系统只校验链接格式和目标账号，不会自动验证视频是否公开或仍可访问。旧 API 失败记录保持原样。</div>
        </q-card-section></q-card></div>
      </div>
      <q-banner v-if="message" rounded class="q-mt-md" :class="failed ? 'bg-red-1 text-negative' : 'bg-green-1 text-positive'">{{ message }}</q-banner>
      <TiktokBrowserRecords ref="records"/>
    </div>
  </q-page>
</template>
<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { copyToClipboard } from 'quasar'
import { getBrowserPublishing, addBrowserAccount, recordWebPublication, type BrowserAccount } from '@/api/browserPublish'
import TiktokBrowserRecords from '@/components/TiktokBrowserRecords.vue'
import { getInfo } from '@/api/users'
const accounts = ref<BrowserAccount[]>([]), accountId = ref(''), username = ref(''), caption = ref(''), resultUrl = ref(''), resultConfirmed = ref(false)
const busy = ref(false), message = ref(''), failed = ref(false), records = ref<InstanceType<typeof TiktokBrowserRecords>>()
const normalizedUsername = computed(() => username.value.trim().replace(/^@/, '').toLowerCase())
const validUsername = computed(() => /^[a-z0-9._]{2,24}$/.test(normalizedUsername.value))
const selectedAccount = computed(() => accounts.value.find(a => a.id === accountId.value))
const profileUrl = computed(() => selectedAccount.value ? 'https://www.tiktok.com/@' + selectedAccount.value.username : undefined)
const storageError = ref(false)
let storageKey = '', ready = false
type Draft = { caption: string; resultUrl: string }
let drafts: Record<string, Draft> = {}
function persist() {
  if (!ready || !storageKey) return
  if (selectedAccount.value) drafts[accountId.value] = { caption: caption.value, resultUrl: resultUrl.value }
  try {
    localStorage.setItem(storageKey, JSON.stringify({ accountId: accountId.value, username: username.value, drafts }))
    storageError.value = false
  } catch { storageError.value = true }
}
watch(accountId, () => {
  if (!ready) return
  const draft = drafts[accountId.value]
  ready = false
  caption.value = draft?.caption || ''
  resultUrl.value = draft?.resultUrl || ''
  resultConfirmed.value = false
  ready = true
  persist()
}, { flush: 'sync' })
watch([username, caption, resultUrl], persist, { flush: 'sync' })
watch([accountId, resultUrl], () => { resultConfirmed.value = false })
async function load() { accounts.value = (await getBrowserPublishing()).data.accounts }
async function restore() {
  const [profile] = await Promise.all([getInfo(), load()])
  const owner = profile.data.id ?? profile.data.userId ?? profile.data.email
  if (!owner) throw new Error('无法识别当前用户，未恢复草稿')
  storageKey = `tiktok-web-publish:draft:${owner}`
  let saved: any = {}
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {} } catch { storageError.value = true }
  for (const a of accounts.value) {
    const d = saved.drafts?.[a.id]
    if (d && typeof d.caption === 'string' && typeof d.resultUrl === 'string') drafts[a.id] = { caption: d.caption.slice(0, 2200), resultUrl: d.resultUrl.slice(0, 300) }
  }
  username.value = typeof saved.username === 'string' ? saved.username : ''
  accountId.value = accounts.value.some(a => a.id === saved.accountId) ? saved.accountId : accounts.value[0]?.id || ''
  caption.value = drafts[accountId.value]?.caption || ''
  resultUrl.value = drafts[accountId.value]?.resultUrl || ''
  ready = true
  persist()
}
async function run(action: () => Promise<void>) { if (busy.value) return; busy.value = true; message.value = ''; failed.value = false; try { await action() } catch (e: any) { failed.value = true; message.value = e.response?.data?.message || e.message || '操作失败' } finally { busy.value = false } }
function add() { const name = normalizedUsername.value; void run(async () => { await addBrowserAccount(name); await load(); accountId.value = accounts.value.find(a => a.username === name)?.id || ''; username.value = ''; message.value = '目标账号已保存。请在 TikTok 网页核对实际登录账号。' }) }
function copyCaption() { void run(async () => { await copyToClipboard(caption.value.trim()); message.value = '文案已复制，可粘贴到 TikTok 上传页。' }) }
function saveResult() { if (!selectedAccount.value || !resultConfirmed.value) return; const data = { accountId: accountId.value, caption: caption.value.trim(), url: resultUrl.value.trim() }; void run(async () => { await recordWebPublication(data); message.value = '发布链接已保存，标记为用户确认。没有发送或重复上传视频。'; resultUrl.value = ''; resultConfirmed.value = false; await records.value?.refresh() }) }
onMounted(() => { void run(restore) })
</script>
<style scoped>
.browser-page{background:#f4f7fb;padding:28px}.browser-container{max-width:1380px;margin:auto}h1{font-size:28px;font-weight:700;margin:0 0 8px;color:#172b4d}h2{font-size:19px;font-weight:650;line-height:1.5;margin:0 0 20px;color:#172b4d}.q-card{border-radius:16px}.q-card__section{padding:24px}.step-number{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;background:#e8f1ff;color:#1976d2;border-radius:50%;font-weight:700;margin-bottom:12px}.steps{padding-left:20px;line-height:1.9;margin-bottom:24px}.steps li{margin-bottom:10px}@media(max-width:600px){.browser-page{padding:16px}.q-card__section{padding:18px}}
</style>
