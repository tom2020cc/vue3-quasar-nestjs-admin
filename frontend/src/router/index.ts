import { createRouter, createWebHashHistory } from 'vue-router'
import { useMyTokenStore } from '@/stores/myToken'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/IndexView.vue') },
        { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue') },
        { path: 'menus', name: 'menus', component: () => import('@/views/MenusView.vue') },
        { path: 'upload', name: 'upload', component: () => import('@/views/UploadView.vue') },
        { path: 'publish-records', name: 'publish-records', component: () => import('@/views/PublishRecordsView.vue') },
        { path: 'publish', name: 'publish', component: () => import('@/views/VideoPublishView.vue') },
        { path: 'ai-models', component: () => import('@/views/AiModelsView.vue') },
        { path: 'folder-publish', name: 'folder-publish', component: () => import('@/views/FolderPublishView.vue') },
        { path: 'tiktok-browser-publish', component: () => import('@/views/TiktokBrowserPublishView.vue') },
        { path: 'platform-config', name: 'platform-config', component: () => import('@/views/PlatformConfigView.vue') },
        { path: 'platform-tutorial', name: 'platform-tutorial', component: () => import('@/views/PlatformTutorialView.vue') },
        { path: 'video-library', name: 'video-library', component: () => import('@/views/VideoLibraryView.vue') },
        { path: 'youtube-videos', name: 'youtube-videos', component: () => import('@/views/YoutubeVideosView.vue') },
        { path: 'tiktok-videos', name: 'tiktok-videos', component: () => import('@/views/TiktokVideosView.vue') },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/404.vue'),
    },
  ],
})

// 路由守卫：需要登录的路由未携带 token 时跳转登录页
router.beforeEach((to, _from, next) => {
  if (to.matched.some((r) => r.meta?.requiresAuth)) {
    const tokenStore = useMyTokenStore()
    if (!tokenStore.token) {
      next({ path: '/login', query: { redirect: to.fullPath } })
      return
    }
  }
  next()
})

export default router
