import request from '@/utils/request'

export interface UploadResult {
  filename: string
  url: string
}

// 单文件上传
export const uploadImage = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request<{ msg: string; data: UploadResult }>({
    method: 'POST',
    url: '/img-upload/img',
    data: formData,
  })
}

// 多文件上传
export const uploadImages = (files: File[]) => {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))
  return request<{ msg: string; data: UploadResult[] }>({
    method: 'POST',
    url: '/img-upload/imgs',
    data: formData,
  })
}
