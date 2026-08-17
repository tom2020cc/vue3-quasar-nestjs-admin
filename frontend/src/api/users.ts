import request from '@/utils/request'

export interface LoginInfo {
  email: string
  password: string
}

export interface UserInfo {
  id: number
  email: string
  password?: string
  createTime?: string
  updateTime?: string
}

// 登录
export const login = (loginInfo: LoginInfo) =>
  request({ method: 'POST', url: '/auth/login', data: loginInfo })

// 注册
export const signup = (userInfo: LoginInfo) =>
  request({ method: 'POST', url: '/auth/signup', data: userInfo })

// 根据 token 获取当前用户信息
export const getInfo = () => request({ method: 'GET', url: '/auth/profile' })

// 获取用户列表
export const getUsers = () => request<UserInfo[]>({ method: 'GET', url: '/user' })

// 新增用户
export const createUser = (userInfo: LoginInfo) =>
  request<UserInfo>({ method: 'POST', url: '/user', data: userInfo })

// 根据 id 获取用户
export const getUserById = (id: number | string) =>
  request<UserInfo>({ method: 'GET', url: `/user/${id}` })

// 更新用户
export const updateUser = (id: number | string, userInfo: Partial<LoginInfo>) =>
  request<UserInfo>({ method: 'PATCH', url: `/user/${id}`, data: userInfo })

// 删除用户
export const removeUser = (id: number | string) =>
  request({ method: 'DELETE', url: `/user/${id}` })
