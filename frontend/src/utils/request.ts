import axios, { type AxiosRequestHeaders } from 'axios'
import { useMyTokenStore } from '@/stores/myToken'
import router from '@/router'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

// 请求拦截器：自动携带 Bearer Token
request.interceptors.request.use((config) => {
  if (!config.headers) {
    config.headers = {} as AxiosRequestHeaders
  }
  const store = useMyTokenStore()
  if (store.token) {
    config.headers.Authorization = `Bearer ${store.token}`
  }
  return config
})

// 响应拦截器：401 时清除 token 并跳转登录
request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const store = useMyTokenStore()
      store.saveToken('')
      router.push({ path: '/login' })
    }
    return Promise.reject(error)
  }
)

export default request
