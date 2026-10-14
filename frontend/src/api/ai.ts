import request from '@/utils/request'
export interface AiModel { id: string; name: string; provider: string; baseUrl: string; model: string; enabled: boolean; hasKey: boolean }
export interface AiText { id: string; title: string; description: string; fingerprint?: string; originalTitle?: string }
export interface AiResult extends AiText { sourceTitle: string; sourceDescription: string }
export interface AiWritingOptions { titleMode: 'keep' | 'translate' | 'seo'; length: 'brief' | 'standard' | 'detailed'; tone: 'neutral' | 'technical' | 'accessible'; instructions: string }
export interface AiFolderSettings { playlistTitle: string; playlistPreview: string; playlistSource: string; previewTitleMode?: AiWritingOptions['titleMode']; options: AiWritingOptions }
export interface AiDraftData {
  version: 1; modelId: string; language: string; context: string; mode: 'translate' | 'seo' | 'description' | 'metadata'
  folderAi?: AiFolderSettings
  rows: AiText[]; results: (AiResult & { selected: boolean; error?: string })[]
}
export const getAiFolderDraft = (folder: string) => request.get<{ revision: number; updatedAt: string; data: AiDraftData } | null>('/ai/folder-draft', { params: { folder } })
export const saveAiFolderDraft = (folder: string, revision: number, data: AiDraftData) => request.post<{ revision: number; updatedAt: string }>('/ai/folder-draft', { folder, revision, data })
export const aiProviders = [
  { id: 'deepseek', name: 'DeepSeek', short: 'DS', color: '#5369da', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', link: 'https://platform.deepseek.com/api_keys', docs: 'https://api-docs.deepseek.com/zh-cn/', note: '用于标题翻译、文案改写与 SEO 内容补充。' },
  { id: 'qwen', name: '千问 · 阿里云百炼', short: 'QW', color: '#865ce0', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', link: 'https://bailian.console.aliyun.com/', docs: 'https://help.aliyun.com/zh/model-studio/model-calling-in-sub-workspace', note: '预填北京地域接口；请确保密钥与接口地域一致。' },
  { id: 'glm', name: '智谱 GLM', short: 'GLM', color: '#1594ba', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: '', link: 'https://open.bigmodel.cn/', docs: 'https://docs.bigmodel.cn/', note: '填写控制台中已开通的文本模型 ID。' },
  { id: 'openai', name: 'OpenAI', short: 'GPT', color: '#15977f', baseUrl: 'https://api.openai.com/v1', model: '', link: 'https://platform.openai.com/api-keys', docs: 'https://platform.openai.com/docs/models', note: '填写支持 Chat Completions 的模型 ID。' },
  { id: 'custom', name: '自定义兼容接口', short: '+', color: '#69778d', baseUrl: '', model: '', link: '', docs: '', note: '支持 OpenAI 兼容的 Chat Completions 文本接口。' },
]
export const listAiModels = () => request.get<AiModel[]>('/ai/models')
export const saveAiModel = (data: Omit<AiModel, 'id' | 'hasKey'> & { apiKey: string }, id?: string) => id ? request.patch('/ai/models/' + id, data) : request.post('/ai/models', data)
export const deleteAiModel = (id: string) => request.delete('/ai/models/' + id)
export const testAiModel = (id: string) => request.post<{ message: string }>('/ai/models/' + id + '/test', {}, { timeout: 130000 })
export const generateAiText = (data: { modelId: string; mode: 'translate' | 'seo' | 'description' | 'metadata' | 'playlist'; options?: AiWritingOptions; avoidDescriptions?: string[]; language: string; title: string; description: string; context: string }, signal?: AbortSignal) => request.post<{ title: string; description: string }>('/ai/generate', data, { timeout: 130000, signal })
