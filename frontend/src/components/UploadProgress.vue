<template>
  <div v-if="state.stage !== 'idle'" class="upload-progress" aria-live="polite">
    <div class="row items-center no-wrap q-gutter-sm">
      <q-avatar rounded :color="state.stage === 'error' ? 'red-1' : 'blue-1'" text-color="primary" icon="cloud_upload" />
      <div class="col"><div class="text-weight-medium">{{ labels[state.stage] }}</div><div class="text-caption text-grey-7 ellipsis">{{ state.count > 1 ? `${state.index} / ${state.count} · ` : '' }}{{ state.name }}</div></div>
      <strong>{{ state.stage === 'merging' ? '校验中' : `${state.percent}%` }}</strong>
    </div>
    <q-linear-progress :value="state.percent / 100" :indeterminate="state.stage === 'merging'" :color="state.stage === 'error' ? 'negative' : state.stage === 'done' ? 'positive' : 'primary'" rounded size="8px" class="q-my-md" :aria-label="labels[state.stage]" />
    <div class="row items-center justify-between q-gutter-sm">
      <div class="text-caption text-grey-7">
        <template v-if="state.stage !== 'hashing'">{{ size(state.bytes) }} / {{ size(state.total) }}</template>
        <span v-if="state.speed > 0 && state.stage === 'uploading'"> · {{ size(state.speed) }}/s · 约 {{ Math.max(1, Math.ceil((state.total - state.bytes) / state.speed)) }} 秒</span>
        <div v-if="state.resumed > 0">已恢复 {{ size(state.resumed) }}，跳过已传内容</div>
      </div>
      <q-btn v-if="['hashing', 'uploading'].includes(state.stage)" outline dense color="primary" icon="pause" label="暂停上传" @click="$emit('pause')" />
      <q-btn v-if="state.stage === 'paused'" unelevated dense color="primary" icon="play_arrow" label="继续上传" @click="$emit('resume')" />
      <q-btn v-if="state.stage === 'error'" outline dense color="primary" icon="refresh" label="重试本地上传" @click="$emit('retry')" />
    </div>
    <div v-if="state.message" class="text-caption q-mt-sm" :class="state.stage === 'error' ? 'text-negative' : 'text-grey-7'">{{ state.message }}</div>
    <div class="text-caption text-grey-7 q-mt-sm">这里显示电脑 → 本地服务的进度。平台发布结果请在“发布记录”查看。</div>
  </div>
</template>
<script setup lang="ts">
import type { UploadState } from '@/composables/useResumableUpload'
defineProps<{ state: UploadState }>()
defineEmits(['pause', 'resume', 'retry'])
const labels = { idle: '', hashing: '校验文件，查找可恢复进度', uploading: '正在上传到本地', paused: '上传已暂停', merging: '合并并校验视频', done: '本地上传完成', error: '上传中断，可继续' }
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
</script>
<style scoped>
.upload-progress { padding: 18px; border: 1px solid #d9e5f4; background: #f7faff; border-radius: 12px; }
</style>
