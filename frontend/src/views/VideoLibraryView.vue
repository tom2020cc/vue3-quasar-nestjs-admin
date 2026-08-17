<template>
  <q-page padding>
    <q-card flat bordered>
      <q-card-section class="row items-center">
        <div>
          <div class="text-h6">视频库</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            已上传视频的集中记录（大小 / 封面 / 横竖屏 / 分辨率 / 时长 / 内容哈希），发布时自动入库并按内容去重。
          </div>
        </div>
        <q-space />
        <q-btn flat dense round icon="refresh" @click="load" :loading="loading" />
      </q-card-section>
      <q-separator />

      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        flat
        bordered
      >
        <template v-slot:body-cell-cover="props">
          <q-td :props="props">
            <img
              v-if="props.row.cover"
              :src="props.row.cover"
              alt="封面"
              style="width: 96px; height: 54px; object-fit: cover; border-radius: 4px; background: #000"
            />
            <div v-else class="text-grey-6 text-caption">无封面</div>
          </q-td>
        </template>

        <template v-slot:body-cell-orientation="props">
          <q-td :props="props">
            <q-badge :color="props.row.orientation === 'landscape' ? 'info' : 'purple'" outline>
              {{ props.row.orientation === 'landscape' ? '宽屏' : '窄屏' }}
            </q-badge>
            <div class="text-caption text-grey-7 q-mt-xs">{{ props.row.width }} × {{ props.row.height }} px</div>
          </q-td>
        </template>

        <template v-slot:body-cell-size="props">
          <q-td :props="props">{{ formatSize(props.row.videoSize) }}</q-td>
        </template>

        <template v-slot:body-cell-duration="props">
          <q-td :props="props">{{ formatDuration(props.row.duration || 0) }}</q-td>
        </template>

        <template v-slot:body-cell-hash="props">
          <q-td :props="props">
            <span class="text-caption" style="font-family: monospace">
              {{ (props.row.videoHash || '').slice(0, 12) }}{{ props.row.videoHash ? '…' : '' }}
            </span>
          </q-td>
        </template>

        <template v-slot:body-cell-createTime="props">
          <q-td :props="props">
            <span class="text-caption">{{ formatTime(props.row.createTime) }}</span>
          </q-td>
        </template>

        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-xs">
            <q-btn flat dense color="primary" icon="visibility" label="详情" @click="openDetail(props.row)" />
            <q-btn flat dense color="negative" icon="delete" label="删除" @click="onDelete(props.row)" />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- 详情对话框 -->
    <q-dialog v-model="detailDialog">
      <q-card style="min-width: 560px">
        <q-card-section class="text-h6">视频详情</q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="row items-start q-col-gutter-md">
            <div v-if="detail?.cover">
              <img :src="detail.cover" alt="封面" style="max-width: 200px; border-radius: 6px" />
            </div>
            <div class="col" style="min-width: 0">
              <div><b>标题：</b>{{ detail?.title }}</div>
              <div v-if="detail?.description"><b>描述：</b>{{ detail.description }}</div>
              <div><b>尺寸：</b>{{ detail?.orientation === 'landscape' ? '宽屏' : '窄屏' }}（{{ detail?.width }} × {{ detail?.height }}）</div>
              <div><b>大小：</b>{{ formatSize(detail?.videoSize || 0) }}</div>
              <div><b>时长：</b>{{ formatDuration(detail?.duration || 0) }}</div>
              <div class="row items-center no-wrap">
                <span class="no-wrap"><b>哈希：</b></span>
                <span class="text-caption" style="font-family: monospace; word-break: break-all">{{ detail?.videoHash || '—' }}</span>
              </div>
              <div>
                <b>视频：</b>
                <a :href="fullVideoUrl(detail?.videoUrl || '')" target="_blank">{{ detail?.videoFilename }}</a>
              </div>
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="关闭" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Notify, Dialog } from 'quasar'
import { getVideoLibrary, getVideoItem, removeVideoItem, type VideoItem } from '@/api/videoLibrary'
import { formatSize, formatDuration } from '@/utils/format'
import { API_BASE_URL } from '@/utils/request'

const rows = ref<VideoItem[]>([])
const loading = ref(false)
const detailDialog = ref(false)
const detail = ref<VideoItem | null>(null)

const columns = [
  { name: 'cover', label: '封面', align: 'center' as const, field: 'cover' },
  { name: 'title', label: '标题', align: 'left' as const, field: 'title' },
  { name: 'orientation', label: '尺寸', align: 'center' as const, field: 'orientation' },
  { name: 'size', label: '大小', align: 'center' as const, field: 'size' },
  { name: 'duration', label: '时长', align: 'center' as const, field: 'duration' },
  { name: 'hash', label: '内容哈希', align: 'center' as const, field: 'hash' },
  { name: 'createTime', label: '入库时间', align: 'center' as const, field: 'createTime' },
  { name: 'actions', label: '操作', align: 'center' as const, field: 'actions' },
]

async function load() {
  loading.value = true
  try {
    const res = await getVideoLibrary()
    rows.value = res.data
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '获取视频库失败' })
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function openDetail(row: VideoItem) {
  try {
    const res = await getVideoItem(row.id)
    detail.value = res.data
    detailDialog.value = true
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.response?.data?.message || '获取详情失败' })
  }
}

function onDelete(row: VideoItem) {
  Dialog.create({
    title: '删除确认',
    message: `确定从视频库删除「${row.title}」吗？（不影响已发布的视频文件）`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await removeVideoItem(row.id)
      Notify.create({ type: 'positive', message: '删除成功' })
      load()
    } catch (e: any) {
      Notify.create({ type: 'negative', message: e.response?.data?.message || '删除失败' })
    }
  })
}

function fullVideoUrl(url: string) {
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`
}

function formatTime(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString()
}
</script>
