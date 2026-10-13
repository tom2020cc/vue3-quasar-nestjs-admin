import request from '@/utils/request'
export interface BrowserAccount { id: string; username: string }
export interface BrowserJob {
  id: string; username: string; caption: string; videoFilename: string;
  status: 'preparing' | 'review' | 'submitting' | 'success' | 'needs_attention' | 'confirmed_by_user';
  message: string; createdAt: string; externalUrl?: string; hasScreenshot?: boolean
}
export const getBrowserPublishing = () => request<{accounts: BrowserAccount[]; jobs: BrowserJob[]}>({ url: '/browser-publish' })
export const addBrowserAccount = (username: string) => request({ method: 'POST', url: '/browser-publish/accounts', data: { username } })
export const confirmBrowserResult = (id: string, url: string) => request({ method: 'POST', url: `/browser-publish/jobs/${id}/confirm-result`, data: { url } })
export const getBrowserScreenshot = (id: string) => request<Blob>({ url: `/browser-publish/jobs/${id}/screenshot`, responseType: 'blob' })
export const recordWebPublication = (data: {accountId: string; caption: string; url: string}) => request<BrowserJob>({ method: 'POST', url: '/browser-publish/web-records', data })
