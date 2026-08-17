<template>
  <q-page padding>
    <q-card flat bordered>
      <q-card-section class="row items-center">
        <div>
          <div class="text-h6">TikTok 视频</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            直接拉取当前已授权 TikTok 账号已发布的视频信息（封面 / 时长 / 分辨率 / 播放 / 点赞 / 评论 / 分享）。
          </div>
        </div>
        <q-space />
        <q-btn
          color="primary"
          icon="cloud_download"
          label="获取视频"
          unelevated
          :loading="loading"
          @click="load"
        />
      </q-card-section>
      <q-separator />

      <!-- 未授权提示 -->
      <q-banner v-if="error" class="bg-negative text-white" rounded>
        <template v-slot:avatar><q-icon name="error" /></template>
        {{ error }}
        <template v-slot:action>
          <q-btn flat dense color="white" label="去平台配置授权" :to="'/platform-config'" />
        </template>
      </q-banner>

      <!-- 视频卡片网格 -->
      <q-card-section v-if="!error">
        <div v-if="loading" class="row justify-center q-py-xl">
          <q-spinner color="primary" size="3em" />
        </div>
        <div v-else-if="videos.length === 0" class="text-center text-grey-6 q-py-xl">
          暂无视频，点击右上角「获取视频」拉取
        </div>
        <div v-else class="row q-col-gutter-md">
          <div v-for="v in videos" :key="v.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
            <q-card flat bordered class="full-height cursor-pointer" @click="openDetail(v)">
              <div v-if="v.cover" class="cover-wrap">
                <img :src="v.cover" :alt="v.title" class="cover-img" />
                <div class="absolute-bottom-right text-caption bg-dark q-px-xs rounded-borders">
                  {{ formatDuration(v.duration) }}
                </div>
              </div>
              <div v-else class="no-cover row items-center justify-center text-grey-5">
                <div class="text-center">
                  <q-icon name="movie" size="36px" />
                  <div class="text-caption">无封面</div>
                </div>
              </div>
              <q-card-section class="q-pa-sm">
                <div class="text-subtitle2 ellipsis-2-lines" style="min-height: 2.6em">{{ v.title }}</div>
                <div v-if="v.width && v.height" class="text-caption text-grey-6 q-mt-xs">{{ v.width }} × {{ v.height }} px</div>
                <div class="row q-gutter-sm q-mt-sm text-caption text-grey-7">
                  <span><q-icon name="play_arrow" size="16px" /> {{ formatCount(v.viewCount) }}</span>
                  <span><q-icon name="thumb_up" size="16px" /> {{ formatCount(v.likeCount) }}</span>
                  <span><q-icon name="chat_bubble_outline" size="16px" /> {{ formatCount(v.commentCount) }}</span>
                  <span><q-icon name="share" size="16px" /> {{ formatCount(v.shareCount) }}</span>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- 详情对话框 -->
    <q-dialog v-model="detailDialog">
      <q-card style="min-width: 560px; max-width: 720px">
        <q-card-section class="q-pa-none">
          <div v-if="detail?.cover" class="cover-wrap">
            <img :src="detail.cover" :alt="detail?.title" class="cover-img" />
          </div>
          <div v-else class="no-cover row items-center justify-center text-grey-5">
            <div class="text-center">
              <q-icon name="movie" size="48px" />
              <div class="text-caption">无封面</div>
            </div>
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-h6">{{ detail?.title || '（无标题）' }}</div>
          <div class="text-caption text-grey-7">
            {{ formatDateTime(detail?.createTime) }}
          </div>

          <div class="row q-gutter-xs">
            <q-badge color="primary" outline>{{ formatDuration(detail?.duration || 0) }}</q-badge>
            <q-badge v-if="detail?.width && detail?.height" color="info" outline>{{ detail.width }} × {{ detail.height }}</q-badge>
          </div>

          <div class="row q-gutter-md q-mt-sm">
            <div class="text-subtitle2"><q-icon name="play_arrow" /> {{ formatCount(detail?.viewCount) }} 播放</div>
            <div class="text-subtitle2"><q-icon name="thumb_up" /> {{ formatCount(detail?.likeCount) }} 点赞</div>
            <div class="text-subtitle2"><q-icon name="chat_bubble_outline" /> {{ formatCount(detail?.commentCount) }} 评论</div>
            <div class="text-subtitle2"><q-icon name="share" /> {{ formatCount(detail?.shareCount) }} 分享</div>
          </div>

          <q-separator />
          <div class="text-subtitle2">简介</div>
          <div class="text-body2 text-grey-9" style="white-space: pre-wrap; word-break: break-word">
            {{ detail?.description || '（无简介）' }}
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat color="primary" label="在 TikTok 打开" icon="open_in_new" @click="openUrl(detail?.url)" />
          <q-btn flat label="关闭" color="grey" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Notify } from 'quasar'
import { getTiktokVideos, type TiktokVideo } from '@/api/tiktok'
import { formatDuration, formatCount } from '@/utils/format'

const videos = ref<TiktokVideo[]>([])
const loading = ref(false)
const error = ref('')
const detailDialog = ref(false)
const detail = ref<TiktokVideo | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await getTiktokVideos()
    videos.value = res.data.data || []
  } catch (e: any) {
    const msg = e.response?.data?.message || '获取 TikTok 视频失败'
    error.value = msg
    Notify.create({ type: 'negative', message: msg })
  } finally {
    loading.value = false
  }
}
onMounted(load)

function openDetail(v: TiktokVideo) {
  detail.value = v
  detailDialog.value = true
}

function openUrl(url?: string) {
  if (url) window.open(url, '_blank')
}

function formatDateTime(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString()
}
</script>

<style scoped>
.cover-wrap {
  position: relative;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  background: #000;
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.no-cover {
  aspect-ratio: 9 / 16;
  background: #f5f5f5;
}
</style>
