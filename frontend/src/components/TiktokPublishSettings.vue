<template>
  <div class="tiktok-settings q-pa-md rounded-borders">
    <div class="row items-center q-mb-sm"><b>TikTok 发布检查</b><q-space />
      <q-btn flat dense color="primary" label="重新检查" :loading="loading" :disable="disabled || !accountId" @click="load" />
    </div>
    <q-linear-progress v-if="loading" indeterminate class="q-mb-sm" />
    <div v-if="error" class="text-negative q-mb-sm" role="alert">{{ error }}</div>
    <template v-if="creator">
      <div class="q-mb-sm">发布账号：{{ creator.nickname }} <span v-if="creator.username">@{{ creator.username }}</span> · 最长 {{ creator.maxDuration }} 秒</div>
      <div v-if="creator.privacyLevels.includes('PUBLIC_TO_EVERYONE')" class="text-brown-9 q-mb-sm">平台返回的选项表明当前账号为公开账号；未审核应用使用该账号直发会受限。</div>
      <div v-else-if="creator.privacyLevels.includes('FOLLOWER_OF_CREATOR')" class="text-grey-8 q-mb-sm">平台返回的选项表明当前账号为私密账号。</div>
      <q-select :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :options="options"
        emit-value map-options outlined label="TikTok 视频可见性（必选）" :disable="disabled || loading" />
      <div v-if="tooLong" class="text-negative q-mt-sm">所选视频超过账号允许的 {{ creator.maxDuration }} 秒，请更换视频。</div>
      <div v-if="invalidDuration" class="text-negative q-mt-sm">请先选择视频并等待时长读取完成。</div>
    </template>
    <div class="q-mt-sm text-grey-8">当前发布关闭评论、合拍和拼接。</div>
    <q-banner dense class="bg-amber-1 text-brown-9 q-mt-sm rounded-borders">
      未审核应用测试直发：账号须为私密账号，视频选择“仅自己可见”。此处不会修改账号整体隐私；只选“仅自己可见”仍可能被 TikTok 拒绝。公开自动发布需通过应用审核。
      <a href="https://developers.tiktok.com/docs/en/content-sharing-guidelines" target="_blank" rel="noopener">查看官方规则</a>
    </q-banner>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { getTiktokCreatorInfo, tiktokPrivacyLabel, type TiktokCreatorInfo } from '@/api/tiktok'
const props = defineProps<{ accountId?: string | null; modelValue?: string | null; duration?: number; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string | null): void; (e: 'ready', value: boolean): void }>()
const creator = ref<TiktokCreatorInfo | null>(null)
const error = ref('')
const loading = ref(false)
let requestId = 0
onBeforeUnmount(() => { requestId++ })
const options = computed(() => creator.value?.privacyLevels.map(value => ({ value, label: tiktokPrivacyLabel(value) })) || [])
const tooLong = computed(() => !!creator.value && (props.duration || 0) > creator.value.maxDuration)
const invalidDuration = computed(() => !Number.isFinite(props.duration) || (props.duration || 0) <= 0)
watch(() => [loading.value, error.value, creator.value, props.modelValue, tooLong.value, invalidDuration.value], () => {
  emit('ready', !loading.value && !error.value && !!creator.value && !tooLong.value && !invalidDuration.value && creator.value.privacyLevels.includes(props.modelValue || ''))
}, { immediate: true })
async function load() {
  const id = ++requestId
  creator.value = null; error.value = ''; emit('ready', false)
  if (!props.accountId) { loading.value = false; return }
  loading.value = true
  try {
    const { data } = await getTiktokCreatorInfo(props.accountId)
    if (id !== requestId) return
    creator.value = data
    if (!data.privacyLevels.includes(props.modelValue || '')) emit('update:modelValue', null)
  } catch (e: any) {
    if (id === requestId) error.value = e.response?.data?.message || '账号发布检查失败，请重新检查'
  } finally { if (id === requestId) loading.value = false }
}
watch(() => props.accountId, () => { emit('update:modelValue', null); load() }, { immediate: true })
</script>
<style scoped>.tiktok-settings { border: 1px solid #dce4ee; background: #f8faff; }</style>
