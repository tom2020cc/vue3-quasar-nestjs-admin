<template>
  <div class="column">
    <div v-if="modelValue" class="q-mb-sm relative-position" style="max-width: 160px">
      <q-img :src="fullUrl(modelValue)" :ratio="1" />
      <q-btn
        flat
        dense
        round
        color="negative"
        icon="close"
        class="absolute-top-right"
        @click="clear"
      />
    </div>
    <q-file
      v-model="file"
      accept="image/*"
      outlined
      dense
      :label="label"
      :loading="uploading"
      @update:model-value="onFile"
    >
      <template v-slot:prepend><q-icon name="cloud_upload" /></template>
    </q-file>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Notify } from 'quasar'
import { uploadImage } from '@/api/uploads'
import { API_BASE_URL } from '@/utils/request'

const props = withDefaults(
  defineProps<{ modelValue?: string; label?: string }>(),
  { modelValue: '', label: '选择图片' }
)
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const file = ref<File | null>(null)
const uploading = ref(false)

function fullUrl(url: string) {
  if (!url) return ''
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`
}

async function onFile(f: File | null) {
  if (!f) return
  uploading.value = true
  try {
    const res = await uploadImage(f)
    const url = res.data?.data?.url
    if (url) emit('update:modelValue', url)
    Notify.create({ type: 'positive', message: '上传成功' })
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '上传失败' })
  } finally {
    uploading.value = false
    file.value = null
  }
}

function clear() {
  emit('update:modelValue', '')
  file.value = null
}
</script>
