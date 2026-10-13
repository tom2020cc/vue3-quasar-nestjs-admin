<template>
  <q-card flat bordered class="q-mt-md">
    <q-card-section class="row items-center q-gutter-sm">
      <div class="text-h6">TikTok 视频读取账号</div>
      <q-space />
      <q-btn flat icon="refresh" label="刷新列表" :loading="loading" @click="load" />
      <q-btn color="primary" icon="person_add" label="添加 TikTok 账号" :loading="busy === 'new'" :disable="!!busy" @click="authorize()" />
    </q-card-section>
    <q-card-section class="q-pt-none text-grey-7">
      此处授权用于读取视频；网页发布不依赖这里的应用配置。每个 TikTok 账号独立保存授权。添加前请在 TikTok 登录目标账号，并核对授权页显示的身份；重新授权不会替换成其他账号。
      沙盒模式需先在开发者后台将目标账号加入 Target Users。已有授权已保留，可识别资料或设置备注，发布时明确选择账号。
      <a href="https://developers.tiktok.com/app/7694477039620999188/sandbox/7694444996972922901" target="_blank" rel="noopener noreferrer">打开沙盒配置</a>
    </q-card-section>
    <q-banner v-if="error" class="bg-red-1 text-negative">{{ error }}</q-banner>
    <q-list separator>
      <q-item v-for="a in accounts" :key="a.id" class="q-py-md">
        <q-item-section avatar><q-icon name="music_note" color="dark" size="32px" /></q-item-section>
        <q-item-section>
          <q-item-label>{{ a.label || a.displayName || '待识别资料' }}</q-item-label>
          <q-item-label caption>{{ a.displayName }} · {{ a.openId || '账号尚未识别，暂不能发布' }}</q-item-label>
          <div class="q-mt-xs"><q-badge :color="!a.enabled ? 'grey' : a.verified ? 'positive' : 'orange'">{{ !a.enabled ? '已停用' : a.verified ? '已绑定账号' : '待识别资料' }}</q-badge></div>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-xs">
            <q-btn flat color="primary" label="识别资料" :loading="busy === a.id" :disable="!!busy" @click="identify(a)" />
            <q-btn flat color="teal" label="重新授权" :disable="!!busy" @click="authorize(a.id)" />
            <q-btn flat label="备注名称" :disable="!!busy" @click="rename(a)" />
            <q-btn flat :color="a.enabled ? 'grey' : 'primary'" :label="a.enabled ? '停用' : '启用'" :disable="!!busy" @click="toggle(a)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>
    <q-card-section v-if="!loading && !accounts.length" class="text-grey-7">尚未添加账号。先配置 TikTok 应用 ID 和密钥，再添加账号。</q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Dialog, Notify } from 'quasar'
import { getOAuthUrl } from '@/api/platform'
import { getTiktokAccounts, identifyTiktokAccount, updateTiktokAccount, type TiktokAccount } from '@/api/tiktok'
const accounts = ref<TiktokAccount[]>([])
const loading = ref(false), busy = ref(''), error = ref('')
const failure = (e: any) => { error.value = e.response?.data?.message || '账号操作失败，请检查后端和代理连接' }
async function load() {
  loading.value = true; error.value = ''
  try { accounts.value = (await getTiktokAccounts()).data } catch (e) { failure(e) }
  finally { loading.value = false }
}
async function authorize(id?: string) {
  busy.value = id || 'new'; error.value = ''
  try { window.location.href = (await getOAuthUrl('tiktok', id)).data.url }
  catch (e) { failure(e) } finally { busy.value = '' }
}
async function identify(a: TiktokAccount) {
  busy.value = a.id; error.value = ''
  try { await identifyTiktokAccount(a.id); await load(); Notify.create({ type: 'positive', message: '账号已识别，可以在发布页选择' }) }
  catch (e) { failure(e) } finally { busy.value = '' }
}
async function toggle(a: TiktokAccount) {
  busy.value = a.id
  try { await updateTiktokAccount(a.id, { enabled: !a.enabled }); await load() }
  catch (e) { failure(e) } finally { busy.value = '' }
}
function rename(a: TiktokAccount) {
  Dialog.create({ title: '账号备注名称', prompt: { model: a.label, maxlength: 100 }, cancel: true }).onOk(async (label: string) => {
    try { await updateTiktokAccount(a.id, { label }); await load() } catch (e) { failure(e) }
  })
}
onMounted(load)
</script>
