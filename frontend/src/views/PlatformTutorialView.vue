<template>
  <q-page padding>
    <div class="text-h6">平台接入教程</div>
    <div class="text-caption text-grey-7 q-mt-xs q-mb-md">
      六个平台从「申请应用 → 拿凭证 → 授权」的完整教程，以及通用防封号注意事项。可切换标签查看，也可点「新窗口打开」查看独立页面。
    </div>

    <q-tabs
      v-model="active"
      inline-label
      class="bg-white rounded-borders shadow-1 q-mb-md"
      no-caps
    >
      <q-tab
        v-for="t in tabs"
        :key="t.code"
        :name="t.code"
        :icon="t.icon"
        :label="t.name"
      />
    </q-tabs>

    <!-- 防封号标签：内联渲染共享指南 -->
    <PlatformGuideCard v-if="active === 'anti-ban'" />

    <!-- 平台教程标签：iframe 加载对应 HTML 教程 -->
    <template v-else>
      <div class="row items-center q-mb-sm q-gutter-sm">
        <q-badge color="grey-6" outline>{{ currentTab?.name }} 教程</q-badge>
        <q-space />
        <q-btn
          flat
          dense
          color="primary"
          icon="open_in_new"
          label="新窗口打开"
          @click="openInNew"
        />
      </div>

      <iframe
        :src="`/guides/${active}.html`"
        class="tutorial-frame"
        title="平台接入教程"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import PlatformGuideCard from '@/components/PlatformGuideCard.vue'

const tabs = [
  { code: 'video-upload', name: '上传与续传', icon: 'cloud_upload' },
  { code: 'douyin', name: '国产抖音', icon: 'music_note' },
  { code: 'youtube', name: '油管 YouTube', icon: 'smart_display' },
  { code: 'tiktok', name: 'TikTok', icon: 'music_video' },
  { code: 'kuaishou', name: '快手', icon: 'bolt' },
  { code: 'facebook', name: 'Facebook', icon: 'groups' },
  { code: 'instagram', name: 'Instagram', icon: 'photo_camera' },
  { code: 'anti-ban', name: '防封号 & 注意事项', icon: 'shield' },
]

const active = ref('youtube')
const currentTab = computed(() => tabs.find((t) => t.code === active.value))

function openInNew() {
  window.open(`/guides/${active.value}.html`, '_blank')
}
</script>

<style scoped>
.tutorial-frame {
  width: 100%;
  height: calc(100vh - 250px);
  min-height: 500px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
</style>
