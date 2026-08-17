import request from '@/utils/request'

export interface MenuInfo {
  id?: number
  name: string
  parentId: number
  publisher: string
  href: string
  icon: string[]
  show: boolean
  orderNum: number
  createTime?: string
  updateTime?: string
}

// 获取所有菜单栏目
export const getAll = () => request<MenuInfo[]>({ method: 'GET', url: '/menus' })

// 新建一个菜单栏目
export const create = (postObj: object) =>
  request({ method: 'POST', url: '/menus', data: postObj })

// 删除一个菜单栏目
export const remove = (id: number | string) =>
  request({ method: 'DELETE', url: `/menus/${id}` })

// 根据 id 获取一条栏目信息
export const getMenuById = (id: number | string) =>
  request<MenuInfo>({ method: 'GET', url: `/menus/${id}` })

// 更新菜单栏目
export const update = (id: number | string, postObj: object) =>
  request({ method: 'PATCH', url: `/menus/${id}`, data: postObj })
