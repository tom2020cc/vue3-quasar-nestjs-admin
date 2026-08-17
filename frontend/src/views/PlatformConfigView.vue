<template>
  <q-page padding>
    <q-card flat bordered>
      <q-card-section>
        <div class="text-h6">平台接入配置</div>
        <div class="text-caption text-grey-7 q-mt-xs">
          各平台需在官方开放平台申请应用并完成 OAuth 授权后填入凭证。未配置凭证时发布将走「模拟模式」，仅演示流程。
        </div>
        <div class="text-caption text-grey-6 q-mt-xs">
          授权前请先在「配置」中填好 <b>appId / appSecret</b>，并确保回调地址
          <b>{{ backendBase }}/platform/&lt;编码&gt;/oauth/callback</b> 已登记到各平台控制台。点击「授权」将跳转到平台授权页。
        </div>
      </q-card-section>
      <q-separator />

      <q-table
        :rows="rows"
        :columns="columns"
        row-key="code"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        flat
        bordered
      >
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
              <q-badge v-if="props.row.config?.enabled === false" color="grey" outline>已停用</q-badge>
              <q-badge v-else-if="hasCredential(props.row)" color="positive" outline>已配置凭证</q-badge>
              <q-badge v-else color="warning" outline>未配置（模拟）</q-badge>
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
              label="授权"
              :disable="props.row.available === false"
              :loading="oauthLoading === props.row.code"
              @click="onOAuth(props.row)"
            />
            <q-btn
              v-if="props.row.config?.refreshToken"
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

          <q-form @submit="onSubmit" class="q-gutter-md">
            <q-toggle v-model="form.enabled" label="启用该平台" color="primary" />
            <q-input v-model="form.appId" label="应用ID（client_key / client_id）" dense outlined />
            <q-input v-model="form.appSecret" label="应用密钥 client_secret" dense outlined :type="isPwd ? 'password' : 'text'">
              <template v-slot:append>
                <q-icon :name="isPwd ? 'visibility_off' : 'visibility'" class="cursor-pointer" @click="isPwd = !isPwd" />
              </template>
            </q-input>
            <q-input v-model="form.accessToken" label="访问令牌 access_token" dense outlined />
            <q-input v-model="form.refreshToken" label="刷新令牌 refresh_token（油管必填）" dense outlined />
            <q-input v-model="form.openId" label="授权用户 open_id（抖音必填）" dense outlined />
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
  { name: 'code', label: '编码', align: 'center' as const, field: 'code' },
  { name: 'orientations', label: '支持尺寸', align: 'center' as const, field: 'orientations' },
  { name: 'config', label: '凭证状态', align: 'center' as const, field: 'config' },
  { name: 'actions', label: '操作', align: 'center' as const, field: 'actions' },
]

async function load() {
  loading.value = true
  try {
    const res = await getPlatformConfigs()
    rows.value = res.data
  } catch (e: any) {
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
    Notify.create({ type: 'positive', message: `「${platformName(String(platform))}」授权成功，令牌已保存` })
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
  if (row.code === 'youtube') return !!c.refreshToken
  if (row.code === 'douyin_cn') return !!c.accessToken && !!c.openId
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
      accessToken: form.accessToken,
      refreshToken: form.refreshToken,
      openId: form.openId,
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
