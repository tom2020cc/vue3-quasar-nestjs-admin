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
