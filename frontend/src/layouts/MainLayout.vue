<template>
  <q-layout view="hHh LpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="leftDrawerOpen = !leftDrawerOpen" />
        <q-toolbar-title>Quasar + NestJS 后台管理</q-toolbar-title>

        <q-btn-dropdown flat no-caps no-icon>
          <template #label>
            <div class="row items-center no-wrap">
              <q-avatar size="32px" color="white" text-color="primary" class="q-mr-sm">
                {{ avatarLetter }}
              </q-avatar>
              <span>{{ userEmail || '未登录' }}</span>
            </div>
          </template>
          <q-list>
            <q-item clickable v-close-popup>
              <q-item-section>
                <q-item-label>当前账号：{{ userEmail }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-separator />
            <q-item clickable v-close-popup @click="handleLogout">
              <q-item-section class="text-negative">
                <q-item-label>退出登录</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      :width="220"
      :breakpoint="768"
    >
      <q-scroll-area class="fit">
        <q-list padding>
          <q-item class="q-mb-sm">
            <q-item-section avatar>
              <q-icon name="dashboard" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-bold">后台导航</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable v-ripple :to="'/'">
            <q-item-section avatar><q-icon name="home" /></q-item-section>
            <q-item-section>首页</q-item-section>
          </q-item>
          <q-item clickable v-ripple :to="'/users'">
            <q-item-section avatar><q-icon name="people" /></q-item-section>
            <q-item-section>用户管理</q-item-section>
          </q-item>
          <q-item clickable v-ripple :to="'/menus'">
            <q-item-section avatar><q-icon name="menu" /></q-item-section>
            <q-item-section>菜单管理</q-item-section>
          </q-item>
          <q-item clickable v-ripple :to="'/upload'">
            <q-item-section avatar><q-icon name="cloud_upload" /></q-item-section>
            <q-item-section>图片上传</q-item-section>
          </q-item>

          <q-separator class="q-my-sm" />
          <q-item clickable v-ripple :href="apiDocsUrl" target="_blank" rel="noopener">
            <q-item-section avatar><q-icon name="description" /></q-item-section>
            <q-item-section>接口文档</q-item-section>
            <q-item-section side><q-icon name="open_in_new" size="16px" /></q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Dialog, Notify } from 'quasar'
import { useRouter } from 'vue-router'
import { useMyTokenStore } from '@/stores/myToken'
import { getInfo } from '@/api/users'
import { API_BASE_URL } from '@/utils/request'

const leftDrawerOpen = ref(true)
const router = useRouter()
const tokenStore = useMyTokenStore()
const userEmail = ref('')

// 后端 Swagger 接口文档地址（跟随 .env 中的 VITE_API_BASE_URL）
const apiDocsUrl = `${API_BASE_URL}/api-docs`

const avatarLetter = computed(() =>
  userEmail.value ? userEmail.value[0].toUpperCase() : 'U'
)

async function loadUser() {
  try {
    const res = await getInfo()
    userEmail.value = res?.data?.email || ''
  } catch (e) {
    // 获取失败时忽略，仅在头部展示“未登录”
  }
}
onMounted(loadUser)

function handleLogout() {
  Dialog.create({
    title: '退出询问',
    message: '确定要退出登录吗？',
    cancel: true,
    persistent: true,
  }).onOk(() => {
    tokenStore.saveToken('')
    Notify.create({ type: 'positive', message: '已退出登录' })
    router.push('/login')
  })
}
</script>
