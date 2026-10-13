<template>
  <q-card flat bordered class="q-mt-md">
    <q-card-section class="row items-center q-gutter-sm">
      <div class="text-h6">YouTube 多账号 / 频道管理</div>
      <q-space />
      <q-btn flat icon="refresh" label="刷新列表" :loading="loading" @click="load" />
      <q-btn color="primary" icon="person_add" label="添加 YouTube 账号" :loading="busy === 'new'" :disable="!!busy" @click="authorize()" />
    </q-card-section>
    <q-card-section class="q-pt-none text-grey-7">
      添加时在 Google 页面选择目标账号和频道。每个频道单独保存授权，不会覆盖其他频道；测试模式需先将该 Google 邮箱加入测试用户。
      旧授权已保留，首次使用请点击「识别频道」。发布时需明确选择目标频道。
    </q-card-section>
    <q-banner v-if="error" class="bg-red-1 text-negative">{{ error }}</q-banner>
    <q-list separator>
      <q-item v-for="a in accounts" :key="a.id" class="q-py-md">
        <q-item-section avatar><q-icon name="smart_display" color="red" size="32px" /></q-item-section>
        <q-item-section>
          <q-item-label>{{ a.label || a.channelTitle || '待识别频道' }}</q-item-label>
          <q-item-label caption>{{ a.channelTitle }} · {{ a.channelId || '频道尚未识别，暂不能发布' }}</q-item-label>
          <div class="q-mt-xs"><q-badge :color="!a.enabled ? 'grey' : a.verified && a.hasCredential ? 'positive' : 'orange'">{{ !a.enabled ? '已停用' : !a.hasCredential ? '需重新授权' : a.verified ? '可选择发布' : '待识别频道' }}</q-badge></div>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-xs">
            <q-btn flat color="primary" label="识别频道" :loading="busy === a.id" :disable="!!busy" @click="identify(a)" />
            <q-btn flat color="teal" label="重新授权" :disable="!!busy" @click="authorize(a.id)" />
            <q-btn flat label="备注名称" :disable="!!busy" @click="rename(a)" />
            <q-btn flat :color="a.enabled ? 'grey' : 'primary'" :label="a.enabled ? '停用' : '启用'" :disable="!!busy" @click="toggle(a)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>
    <q-card-section v-if="!loading && !accounts.length" class="text-grey-7">尚未添加账号。先配置 YouTube 应用 ID 和密钥，再添加账号。</q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Dialog, Notify } from 'quasar'
import { getOAuthUrl } from '@/api/platform'
import { getYoutubeAccounts, identifyYoutubeAccount, updateYoutubeAccount, type YoutubeAccount } from '@/api/youtube'
const accounts = ref<YoutubeAccount[]>([])
const emit = defineEmits<{ changed: [accounts: YoutubeAccount[]] }>()
const loading = ref(false), busy = ref(''), error = ref('')
const failure = (e: any) => { error.value = e.response?.data?.message || '账号操作失败，请检查后端和代理连接' }
async function load() {
  loading.value = true; error.value = ''
  try { accounts.value = (await getYoutubeAccounts()).data; emit('changed', accounts.value) } catch (e) { failure(e) }
  finally { loading.value = false }
}
async function authorize(id?: string) {
  busy.value = id || 'new'; error.value = ''
  try { window.location.href = (await getOAuthUrl('youtube', id)).data.url }
  catch (e) { failure(e) } finally { busy.value = '' }
}
async function identify(a: YoutubeAccount) {
  busy.value = a.id; error.value = ''
  try { await identifyYoutubeAccount(a.id); await load(); Notify.create({ type: 'positive', message: '频道已识别，可以在发布页选择' }) }
  catch (e) { failure(e) } finally { busy.value = '' }
}
async function toggle(a: YoutubeAccount) {
  busy.value = a.id
  try { await updateYoutubeAccount(a.id, { enabled: !a.enabled }); await load() }
  catch (e) { failure(e) } finally { busy.value = '' }
}
function rename(a: YoutubeAccount) {
  Dialog.create({ title: '账号备注名称', prompt: { model: a.label, maxlength: 100 }, cancel: true }).onOk(async (label: string) => {
    try { await updateYoutubeAccount(a.id, { label }); await load() } catch (e) { failure(e) }
  })
}
onMounted(load)
</script>
