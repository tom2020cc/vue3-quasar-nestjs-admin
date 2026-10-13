<template>
  <q-card flat bordered class="q-mt-lg">
    <q-card-section class="row items-center"><div class="text-h6">TikTok 网页发布记录</div><q-space/><q-btn flat round icon="refresh" aria-label="刷新浏览器发布记录" :loading="busy" @click="refresh"/></q-card-section>
    <q-banner v-if="error" class="bg-red-1 text-negative">{{ error }}</q-banner>
    <q-list separator>
      <q-item v-for="job in jobs" :key="job.id">
        <q-item-section>
          <q-item-label class="text-weight-medium" style="white-space: pre-wrap">{{ job.caption }}</q-item-label>
          <q-item-label caption>@{{ job.username }} · 登记时间 {{ new Date(job.createdAt).toLocaleString() }}</q-item-label>
          <div class="q-my-sm"><q-badge :color="job.status === 'success' ? 'positive' : job.status === 'needs_attention' ? 'warning' : 'primary'">{{ labels[job.status] }}</q-badge></div>
          <div>{{ job.message }}</div>
          <div class="q-gutter-sm q-mt-sm">
            <q-btn v-if="job.hasScreenshot" flat color="primary" label="查看操作截图" :disable="busy" @click="showScreenshot(job)"/>
            <q-btn v-if="job.status !== 'preparing' && !job.externalUrl" flat color="primary" label="已在网页发布，保存链接" :disable="busy" @click="resultJob = job; resultUrl = ''; resultOpen = true"/>
            <q-btn v-if="job.externalUrl" flat color="primary" label="打开视频" :href="job.externalUrl" target="_blank" rel="noopener noreferrer"/>
          </div>
        </q-item-section>
      </q-item>
      <q-item v-if="!jobs.length"><q-item-section class="text-grey-7">暂无网页发布记录。请先在 TikTok 发布，再返回网页发布入口保存视频链接。旧 API 记录保留在原列表。</q-item-section></q-item>
    </q-list>
  </q-card>
  <q-dialog v-model="screenshotOpen" @hide="clearScreenshot"><q-card style="width:1100px;max-width:95vw"><q-img :src="screenshotUrl"/><q-card-actions align="right"><q-btn flat label="关闭" v-close-popup/></q-card-actions></q-card></q-dialog>
  <q-dialog v-model="resultOpen"><q-card style="width:560px;max-width:95vw"><q-card-section class="text-h6">保存人工核对结果</q-card-section><q-card-section>请先在 TikTok 确认视频已发布，再粘贴 @{{ resultJob?.username }} 下的视频链接。记录会明确标注“用户确认”。<q-input class="q-mt-md" v-model="resultUrl" outlined label="完整 TikTok 视频链接"/></q-card-section><q-card-actions align="right"><q-btn flat label="取消" v-close-popup/><q-btn color="primary" label="我已核对，保存链接" :disable="!resultUrl.trim() || busy" @click="saveResult"/></q-card-actions></q-card></q-dialog>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getBrowserPublishing, confirmBrowserResult, getBrowserScreenshot, type BrowserJob } from '@/api/browserPublish'
const jobs = ref<BrowserJob[]>([]), busy = ref(false), error = ref('')
const screenshotOpen = ref(false), screenshotUrl = ref('')
const resultJob = ref<BrowserJob>(), resultUrl = ref(''), resultOpen = ref(false)
const labels = { preparing: '上传准备中', review: '待核对发布', submitting: '已点击发布 · 待核实', success: '网页确认发布', needs_attention: '需要处理', confirmed_by_user: '用户确认已发布' }
let timer: ReturnType<typeof setInterval> | undefined
async function refresh() { try { jobs.value = (await getBrowserPublishing()).data.jobs; error.value = '' } catch { error.value = '发布记录加载失败，请重试' } }
async function run(action: () => Promise<unknown>) { if (busy.value) return; busy.value = true; error.value = ''; try { await action(); await refresh() } catch (e: any) { error.value = e.response?.data?.message || e.message } finally { busy.value = false } }
function saveResult() { if (!resultJob.value) return; const id = resultJob.value.id; void run(async () => { await confirmBrowserResult(id, resultUrl.value.trim()); resultOpen.value = false }) }
async function showScreenshot(job: BrowserJob) { await run(async () => { clearScreenshot(); screenshotUrl.value = URL.createObjectURL((await getBrowserScreenshot(job.id)).data); screenshotOpen.value = true }) }
function clearScreenshot() { if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value); screenshotUrl.value = '' }
onMounted(() => { void refresh(); timer = setInterval(() => { if (!busy.value) void refresh() }, 5000) })
onUnmounted(() => { clearInterval(timer); clearScreenshot() })
defineExpose({ refresh })
</script>