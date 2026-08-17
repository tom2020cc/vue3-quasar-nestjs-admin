<template>
  <q-page padding>
    <q-card flat bordered class="q-pa-md">
      <div class="text-h6 q-mb-lg">图片上传</div>

      <div class="text-subtitle1 q-mb-sm">单文件上传</div>
      <ImageUpload v-model="singleUrl" label="选择一张图片" />
      <div class="q-mt-sm text-grey-7">
        返回地址：{{ singleUrl || '（未上传）' }}
      </div>

      <q-separator class="q-my-lg" />

      <div class="text-subtitle1 q-mb-sm">多文件上传（最多 3 张）</div>
      <q-file
        v-model="multiFiles"
        accept="image/*"
        multiple
        outlined
        dense
        label="选择多张图片"
        :loading="multiUploading"
        @update:model-value="onMultiFiles"
      >
        <template v-slot:prepend><q-icon name="cloud_upload" /></template>
      </q-file>
      <div v-if="multiUrls.length" class="row q-gutter-md q-mt-md">
        <div v-for="(u, i) in multiUrls" :key="i" class="text-center">
          <q-img :src="fullUrl(u)" style="width: 140px" :ratio="1" />
          <div class="text-caption text-grey-7 q-mt-xs">{{ u }}</div>
        </div>
      </div>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Notify } from 'quasar'
import { uploadImages } from '@/api/uploads'
import { API_BASE_URL } from '@/utils/request'
import ImageUpload from '@/components/ImageUpload.vue'

const singleUrl = ref('')
const multiFiles = ref<File[] | null>(null)
const multiUrls = ref<string[]>([])
const multiUploading = ref(false)

function fullUrl(url: string) {
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`
}

async function onMultiFiles(files: File[] | null) {
  if (!files || files.length === 0) return
  multiUploading.value = true
  try {
    const res = await uploadImages(files)
    multiUrls.value = res.data?.data?.map((d) => d.url) || []
    Notify.create({ type: 'positive', message: '上传成功' })
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '上传失败' })
  } finally {
    multiUploading.value = false
    multiFiles.value = null
  }
}
</script>
