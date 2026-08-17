import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMyTokenStore = defineStore('myTokenBox', () => {
  // 从浏览器本地缓存中获取 token，没有则取空字符串
  const token = ref(localStorage.getItem('localToken') || '')

  function saveToken(data: string) {
    token.value = data
    localStorage.setItem('localToken', token.value)
  }

  return { token, saveToken }
})
