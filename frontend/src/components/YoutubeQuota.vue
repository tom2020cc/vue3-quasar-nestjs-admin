<template>
  <q-card flat bordered class="quota-card q-mt-md" aria-label="YouTube 配额概览">
    <q-card-section class="row items-center q-gutter-sm">
      <q-avatar rounded color="blue-1" text-color="primary" icon="data_usage" />
      <div><div class="text-h6">YouTube 自动配额</div><div class="text-caption text-grey-7">按 Google Cloud 项目共享 · 页面打开时每分钟自动刷新</div></div>
      <q-space /><q-btn flat round icon="refresh" aria-label="刷新 Google Cloud 配额" :loading="loading" @click="load" />
    </q-card-section>
    <q-card-section class="q-pt-none">
      <q-banner rounded class="bg-blue-1 text-primary q-mb-md">无需手动填写。连接项目管理员的 Google Cloud 只读授权后，自动获取每日上限和用量。Google 监控可能延迟数分钟，页面会显示数据时间。</q-banner>
      <q-banner v-if="loadError" class="bg-red-1 text-negative q-mb-md">{{ loadError }}</q-banner>
      <div v-if="!loading && !data?.groups.length && !loadError" class="text-grey-7">添加 YouTube 账号后，即可连接对应项目的配额。</div>
      <section v-for="group in data?.groups || []" :key="group.key" class="quota-project">
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="text-subtitle1 text-weight-bold">{{ group.projectNumber ? `项目 ${group.projectNumber}` : '尚未识别 Google Cloud 项目' }}</div>
          <q-badge color="blue-1" text-color="primary">{{ group.channels.length }} 个频道共享</q-badge>
          <q-space /><q-btn flat color="primary" icon="open_in_new" label="Google Cloud 配额" :href="group.consoleUrl" target="_blank" rel="noopener noreferrer" />
          <q-btn unelevated color="primary" icon="link" :label="group.cloud?.connected ? '重新连接只读授权' : '连接自动获取'" :disable="!group.projectNumber || connecting" @click="selected = group; dialog = true" />
        </div>
        <q-banner rounded :class="['error', 'billing_required'].includes(group.cloud?.status) ? 'bg-orange-1 text-orange-10' : 'bg-blue-1 text-primary'" class="q-mb-md">{{ group.cloud?.message || '正在获取状态' }}</q-banner>
        <div v-if="group.cloud?.checkedAt" class="text-caption text-grey-7 q-mb-md">最近查询：{{ date(group.cloud.checkedAt) }}（北京时间）</div>
        <div v-for="metric in group.cloud?.metrics || []" :key="metric.metric + metric.name" class="q-mb-lg">
          <div class="text-subtitle2 q-mb-sm">{{ metric.name }}</div>
          <div class="quota-metrics">
            <div><span>每日额度上限</span><strong>{{ format(metric.dailyLimit) }}</strong></div>
            <div><span>当日用量（监控数据）</span><strong>{{ format(metric.used) }}</strong></div>
            <div><span>估算剩余（含监控延迟）</span><strong class="text-primary">{{ format(metric.remaining) }}</strong></div>
          </div>
          <q-linear-progress v-if="metric.used !== null && metric.dailyLimit" rounded size="9px" :value="Math.min(1, metric.used / metric.dailyLimit)" :color="metric.used / metric.dailyLimit >= .9 ? 'warning' : 'primary'" class="q-my-md" />
          <div v-if="metric.stale && metric.observedAt" class="text-caption text-orange-10">监控采样已超过 10 分钟，剩余值仅供参考。</div>
          <div class="text-caption text-grey-7">{{ metric.observedAt ? `最新采样：${date(metric.observedAt)}（北京时间）` : 'Google 尚未返回该指标的用量，余额未知。' }}</div>
        </div>
        <div v-if="group.cloud?.status === 'billing_required'" class="q-mb-md">
          <q-btn outline color="primary" icon="open_in_new" label="查看项目结算设置" :href="`https://console.cloud.google.com/billing/linkedaccount?project=${group.projectNumber}`" target="_blank" rel="noopener noreferrer" />
          <div class="text-caption text-grey-7 q-mt-sm">仅打开设置页，不会自动绑定结算账户。是否启用由你决定，费用以 Google 页面说明为准。</div>
        </div>
        <div v-if="group.cloud?.status === 'error'" class="q-mb-md row q-gutter-sm">
          <q-btn flat color="primary" label="Service Usage API" :href="apiUrl(group, 'serviceusage.googleapis.com')" target="_blank" rel="noopener noreferrer" />
          <q-btn flat color="primary" label="Cloud Monitoring API" :href="apiUrl(group, 'monitoring.googleapis.com')" target="_blank" rel="noopener noreferrer" />
        </div>
        <div class="quota-channels" role="table" aria-label="频道共享额度">
          <div class="quota-channel quota-channel-head" role="row"><span role="columnheader">频道</span><span role="columnheader">配额归属</span></div>
          <div v-for="channel in group.channels" :key="channel.id" class="quota-channel" role="row"><div role="cell"><strong>{{ channel.title }}</strong><q-badge v-if="!channel.enabled" color="grey" class="q-ml-sm">已停用</q-badge><div class="text-caption text-grey-7">{{ channel.channelId || '频道待识别' }}</div></div><div role="cell">共用项目额度<div class="text-caption text-grey-7">无独立的每日余额</div></div></div>
        </div>
      </section>
      <div v-if="data?.groups.length" class="text-caption text-grey-7 q-mt-md">每日按太平洋时间 00:00 重置，下次：{{ date(data.nextResetAt) }}（北京时间）。未返回用量时不会填零；实际能否调用以 YouTube 响应为准。<a href="https://developers.google.com/youtube/v3/determine_quota_cost" target="_blank" rel="noopener noreferrer">官方配额规则</a></div>
    </q-card-section>
    <q-dialog v-model="dialog" :persistent="connecting"><q-card class="quota-editor"><q-card-section><div class="text-h6">连接 Google Cloud 只读授权</div><p>请使用能管理项目 {{ selected?.projectNumber }} 的 Google 账号，不需要选择 YouTube 品牌频道。</p><p>申请 Cloud 数据只读和监控只读权限，用于查询该项目额度。此授权与视频发布授权单独保存，不会更改频道或视频。</p><p class="text-caption text-grey-7">授权后自动读取；若 Google 提示 API 未启用，页面会给出对应启用入口。</p><q-banner v-if="connectError" class="bg-red-1 text-negative">{{ connectError }}</q-banner></q-card-section><q-card-actions align="right"><q-btn flat label="取消" :disable="connecting" v-close-popup /><q-btn unelevated color="primary" label="前往 Google 授权" :loading="connecting" @click="connect" /></q-card-actions></q-card></q-dialog>
  </q-card>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getYoutubeQuota, connectYoutubeQuota, type YoutubeQuotaGroup, type YoutubeQuotaOverview } from '@/api/youtube'
const data = ref<YoutubeQuotaOverview | null>(null), loading = ref(false), loadError = ref(''), dialog = ref(false), connecting = ref(false), connectError = ref('')
const selected = ref<YoutubeQuotaGroup | null>(null)
const format = (v: number | null) => v === null ? '未知' : v.toLocaleString('zh-CN')
const date = (v: string) => new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const apiUrl = (group: YoutubeQuotaGroup, api: string) => `https://console.cloud.google.com/apis/library/${api}?project=${group.projectNumber}`
async function load() { if (loading.value) return; loading.value = true; loadError.value = ''; try { data.value = (await getYoutubeQuota()).data } catch { data.value = null; loadError.value = '配额查询失败，稍后自动重试。' } finally { loading.value = false } }
async function connect() {
  if (!selected.value || connecting.value) return
  connecting.value = true; connectError.value = ''
  try { const { data } = await connectYoutubeQuota(selected.value.channels[0].id); window.location.assign(data.url) }
  catch (e: any) { connectError.value = e.response?.data?.message || '无法发起授权，请重试' }
  finally { connecting.value = false }
}
let timer: ReturnType<typeof setInterval>
onMounted(() => { load(); timer = setInterval(() => { if (!document.hidden && !dialog.value) load() }, 60000) })
onUnmounted(() => clearInterval(timer))
</script>
<style scoped>
.quota-card{border-radius:18px;border-color:#dce6f2}.quota-project{border:1px solid #e1e8f1;border-radius:14px;padding:20px;margin-top:16px}.quota-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.quota-metrics>div{background:#f5f8fc;border-radius:12px;padding:16px}.quota-metrics span{display:block;color:#637991;font-size:13px}.quota-metrics strong{display:block;font-size:28px;margin-top:6px;font-variant-numeric:tabular-nums}.quota-metrics small{font-size:12px;font-weight:400}.quota-channel{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,1fr);gap:16px;padding:12px 16px;border-bottom:1px solid #e8eef5;overflow-wrap:anywhere}.quota-channel:last-child{border-bottom:0}.quota-channel-head{background:#f5f8fc;font-size:12px;color:#60778f}.quota-channels{border:1px solid #e1e8f1;border-radius:10px;overflow:hidden}.quota-empty{background:#f5f8fc;padding:18px;border-radius:10px;margin-bottom:16px;color:#687d95}.quota-editor{width:540px;max-width:94vw;border-radius:16px}a{color:#1976d2;margin-left:6px}@media(max-width:600px){.quota-metrics{grid-template-columns:1fr}.quota-project{padding:12px}.quota-channel{grid-template-columns:1fr;gap:5px}.quota-channel-head{display:none}}
</style>
