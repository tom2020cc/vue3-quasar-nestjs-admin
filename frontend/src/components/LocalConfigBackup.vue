<template>
  <div class="q-mt-md">
    <div class="row q-gutter-sm">
      <q-btn outline color="primary" icon="save" label="备份到根目录" :loading="backingUp" @click="backup" />
      <q-btn outline color="primary" icon="file_upload" label="导入配置" @click="openImport" />
    </div>
    <div class="text-caption text-grey-7 q-mt-sm">
      本机私密配置文件：local-config.private.json（已排除 Git 提交）。包含 AI 模型与密钥、平台凭证、所有 YouTube / TikTok 账号授权、服务地址、存储及代理配置。
    </div>
    <q-banner v-if="result" rounded :class="resultError ? 'bg-red-1 text-negative q-mt-sm' : 'bg-green-1 text-green-10 q-mt-sm'" aria-live="polite">{{ result }}</q-banner>
    <q-dialog v-model="opened" :persistent="importing" @hide="clearFile">
      <q-card style="width: 660px; max-width: 95vw">
        <q-card-section class="text-h6">导入本机配置</q-card-section>
        <q-card-section class="q-gutter-md">
          <div>选择项目根目录的 local-config.private.json，或 .private-config 中的历史备份。</div>
          <q-file v-model="file" outlined label="选择 JSON 配置文件" accept=".json,application/json" :max-file-size="1048576"
            :disable="importing" clearable @update:model-value="readFile" @rejected="error = '请选择不超过 1 MB 的 JSON 文件'">
            <template #prepend><q-icon name="description" /></template>
          </q-file>
          <q-linear-progress v-if="reading" indeterminate />
          <q-banner v-if="error" class="bg-red-1 text-negative" role="alert">{{ error }}</q-banner>
          <template v-if="preview">
            <div class="text-subtitle2">将导入以下配置（密钥内容不展示）</div>
            <div v-for="p in preview.platforms" :key="p.code">{{ p.name }}：{{ p.fields.join('、') }}</div>
            <div v-for="(a, index) in preview.tiktokAccounts" :key="`tiktok-${index}`">TikTok 账号：{{ a.name }}（{{ a.openId || '待识别' }}）</div>
            <div v-for="(a, index) in preview.youtubeAccounts" :key="index">YouTube 频道：{{ a.name }}（{{ a.channelId || '待识别' }}）</div>
            <div v-for="a in preview.aiModels" :key="a.name + a.model">AI 模型：{{ a.name }}（{{ a.model }}），本地用户 #{{ a.ownerId }}</div>
            <div>后端环境：{{ preview.backendKeys.join('、') || '未提供，保持现状' }}</div>
            <div>前端环境：{{ preview.frontendKeys.join('、') || '未提供，保持现状' }}</div>
            <q-banner class="bg-blue-1 text-blue-10">
              按平台编码更新。未提供的字段保留，空值会覆盖现有值；extra 对象整体替换。导入前自动备份到 .private-config。
              <div>YouTube 账号按频道合并，未列出的账号保留；旧版备份导入后需识别频道。</div>
              <div v-if="preview.restartRequired" class="q-mt-sm">环境配置有变化：导入后请重启前后端；登录密钥变化后需重新登录。</div>
            </q-banner>
          </template>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="取消" :disable="importing" v-close-popup />
          <q-btn color="primary" label="导入并保存" :disable="!preview || reading" :loading="importing" @click="importFile" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import request from '@/utils/request'

interface Preview {
  aiModels: { name: string; model: string; ownerId: number }[]
  platforms: { code: string; name: string; fields: string[] }[]
  backendKeys: string[]
  frontendKeys: string[]
  restartRequired: boolean
  tiktokAccounts: { openId: string | null; name: string }[]
  youtubeAccounts: { channelId: string | null; name: string }[]
}
const emit = defineEmits<{ imported: [] }>()
const opened = ref(false)
const file = ref<File | null>(null)
const preview = ref<Preview | null>(null)
const reading = ref(false)
const importing = ref(false)
const backingUp = ref(false)
const error = ref('')
const result = ref('')
const resultError = ref(false)
let document: unknown = null
let readVersion = 0
function message(e: any, fallback: string) {
  return e.response?.status === 404 ? '后端尚未加载导入功能，请重启后端后重试' : e.response?.data?.message || fallback
}
function clearFile() {
  readVersion++
  file.value = null
  preview.value = null
  document = null
  reading.value = false
  error.value = ''
}
function openImport() { clearFile(); opened.value = true }
async function backup() {
  backingUp.value = true
  resultError.value = false
  try {
    const { data } = await request.post('/local-config/backup')
    result.value = `已备份 ${data.platformCount} 个平台、${data.youtubeAccountCount} 个 YouTube 账号、${data.tiktokAccountCount} 个 TikTok 账号、${data.aiModelCount || 0} 个 AI 模型及环境配置到项目根目录 ${data.filename}。`
  } catch (e) { resultError.value = true; result.value = message(e, '备份失败，请检查后端是否运行') }
  finally { backingUp.value = false }
}
async function readFile(selected: File | null) {
  const version = ++readVersion
  preview.value = null
  document = null
  error.value = ''
  reading.value = false
  if (!selected) return
  reading.value = true
  try {
    if (selected.size > 1048576) throw new Error()
    const parsed = JSON.parse((await selected.text()).replace(/^\uFEFF/, ''))
    const { data } = await request.post<Preview>('/local-config/preview', parsed)
    if (version !== readVersion) return
    document = parsed
    preview.value = data
  } catch (e) {
    if (version === readVersion) error.value = message(e, '无法读取配置，请选择有效的 JSON 备份文件')
  } finally { if (version === readVersion) reading.value = false }
}
async function importFile() {
  if (!preview.value || !document) return
  importing.value = true
  error.value = ''
  try {
    const { data } = await request.post<Preview & { recoveryFile: string }>('/local-config/import', document)
    resultError.value = false
    result.value = `导入成功，根目录备份已更新。原配置备份：${data.recoveryFile}。` +
      (data.restartRequired ? '环境配置已写入，请重启前后端；若修改了登录密钥，请重新登录。' : '平台配置已生效。')
    opened.value = false
    emit('imported')
  } catch (e) { error.value = message(e, '导入失败，请检查后端是否运行') }
  finally { importing.value = false }
}
</script>
