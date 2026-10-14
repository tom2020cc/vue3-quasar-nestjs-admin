<template>
  <q-dialog :model-value="true" :persistent="busy || saving" @update:model-value="value => { if (!value) emit('close') }">
    <q-card class="description-dialog">
      <q-card-section class="row items-center"><div><div class="text-h6">{{ videos.length > 1 ? 'AI 批量更新视频描述' : 'AI 更新视频描述' }}</div><div class="text-caption text-grey-7 q-mt-xs">目标频道：{{ channelLabel }} · {{ videos.length }} 个视频</div></div><q-space /><q-btn flat round icon="close" aria-label="关闭 AI 描述更新" :disable="busy || saving" @click="emit('close')" /></q-card-section>
      <q-card-section class="q-pt-none">
        <q-banner rounded class="bg-blue-1 text-primary q-mb-md">根据文字参数与每条当前标题分别生成描述。保留原标题、分类、标签和可见性；先预览并确认，再同步至 YouTube。</q-banner>
        <AiTextTools :items="videos" description-only :disabled="saving || pending.length > 0" apply-label="加入同步预览" applied-message="已加入同步预览，尚未修改 YouTube。" @busy="busy = $event" @apply="stage" />
        <template v-if="pending.length">
          <div class="text-h6 q-mt-lg">同步预览</div>
          <p class="text-caption text-grey-7">确认后只更新以下视频的描述。失败或结果待核对的项目不会自动重发，请先刷新视频列表核对。</p>
          <q-list bordered separator class="rounded-borders">
            <q-expansion-item v-for="r in pending" :key="r.id" :label="r.sourceTitle" :caption="r.status + (r.error ? '：' + r.error : '')" icon="description">
              <q-card-section><div class="text-caption text-grey-7">原描述</div><div class="description-text">{{ r.sourceDescription || '（空）' }}</div><q-separator class="q-my-md" /><div class="text-caption text-primary">新描述</div><div class="description-text">{{ r.description }}</div></q-card-section>
            </q-expansion-item>
          </q-list>
          <q-linear-progress v-if="saving" :value="done / pending.length" class="q-mt-md" />
          <div v-if="summary" class="q-mt-md text-primary" aria-live="polite">{{ summary }}</div>
          <q-banner v-if="error" class="bg-red-1 text-negative q-mt-md">{{ error }}</q-banner>
          <div class="row justify-end q-gutter-sm q-mt-md"><q-btn v-if="!attempted" flat label="返回重新生成" :disable="saving" @click="pending = []; error = ''" /><q-btn unelevated color="primary" :label="`确认更新 ${pending.length} 个视频到 YouTube`" :disable="saving || attempted" :loading="saving" @click="sync" /></div>
        </template>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import AiTextTools from './AiTextTools.vue'
import type { AiResult, AiText } from '@/api/ai'
import { updateYoutubeDescription } from '@/api/youtube'
import { duplicateDescription } from '@/utils/aiDescriptions'
const props = defineProps<{ accountId: string; channelLabel: string; videos: AiText[] }>()
const emit = defineEmits<{ close: []; updated: [id: string, description: string] }>()
const busy = ref(false), saving = ref(false), attempted = ref(false), done = ref(0), summary = ref(''), error = ref('')
const pending = ref<(AiResult & { status: string; error: string })[]>([])
function stage(items: AiResult[]) { pending.value = items.map(r => ({ ...r, status: '待确认', error: '' })); error.value = ''; summary.value = ''; attempted.value = false }
async function sync() {
  if (saving.value || attempted.value || !pending.value.length) return
  const list = pending.value
  if (list.some(r => !r.description.trim() || new TextEncoder().encode(r.description).length > 5000 || /[<>]/.test(r.description) || duplicateDescription(r.description, list.filter(x => x.id !== r.id).map(x => x.description)))) { error.value = '描述为空、重复、含尖括号或超过 YouTube 的 5000 字节限制，请返回修改'; return }
  saving.value = true; attempted.value = true; done.value = 0; error.value = ''
  try {
    for (const r of list) {
      r.status = '更新中'
      try {
        const response = await updateYoutubeDescription({ accountId: props.accountId, videoId: r.id, sourceTitle: r.sourceTitle, sourceDescription: r.sourceDescription, description: r.description })
        r.status = '已更新'; emit('updated', r.id, response.data.data.description)
      } catch (e: any) { r.status = '失败 / 待核对'; r.error = e.response?.data?.message || '网络中断，结果待核对，请刷新列表确认' }
      done.value++
    }
    summary.value = `已确认更新 ${list.filter(r => r.status === '已更新').length} / ${list.length} 个视频。`
  } finally { saving.value = false }
}
onBeforeRouteLeave(() => !busy.value && !saving.value)
</script>
<style scoped>
.description-dialog{width:920px;max-width:96vw;border-radius:16px}.description-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;margin-top:6px}
</style>
