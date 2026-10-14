<template>
  <q-card flat bordered class="ai-tools" :class="{ 'folder-ai': folderName !== undefined }">
    <q-card-section>
      <div class="row items-center q-gutter-sm"><q-icon name="auto_awesome" color="primary" size="24px" /><div class="text-subtitle1 text-weight-bold">{{ folderName !== undefined ? 'AI 文案助手' : descriptionOnly ? 'AI 更新视频描述' : 'AI 翻译与 SEO' }}</div><q-badge color="blue-1" text-color="primary">{{ items.length }} 个标题</q-badge><q-space /><q-btn v-if="folderName !== undefined" flat dense color="primary" :icon="controlsExpanded ? 'expand_less' : 'tune'" :label="controlsExpanded ? '收起参数' : '编辑参数'" :aria-expanded="controlsExpanded" @click="controlsExpanded = !controlsExpanded" /><q-btn flat dense color="primary" to="/ai-models" label="管理模型" :disable="running" /></div>
      <p class="text-caption text-grey-7 q-mt-sm">{{ folderName !== undefined ? '填写共同的真实参数，AI 会结合每个视频当前标题分别写介绍，并翻译列表名。一次生成、统一预览；不会自动修改线上内容。' : '仅将标题、已有详情及补充事实发送到所选模型。每条根据自己的标题生成，先预览，再确认应用。' }}</p>
      <div v-if="draftKey !== undefined" class="row items-center q-gutter-sm q-mb-md">
        <q-icon name="cloud_done" :color="draftError ? 'negative' : 'primary'" />
        <span class="text-caption" :class="draftError ? 'text-negative' : 'text-grey-7'">{{ draftError || (draftLoading ? '正在读取数据库草稿…' : savingDraft ? '正在保存草稿…' : dirtyDraft ? '草稿有未保存修改' : draftSavedAt ? `草稿已保存 · ${new Date(draftSavedAt).toLocaleString()}` : '编辑和生成结果会自动保存到数据库') }}</span>
        <q-btn flat dense color="primary" label="保存草稿" :loading="savingDraft" :disable="draftLoading || draftConflict" @click="saveDraft" />
        <q-btn v-if="draftError" flat dense color="primary" label="重新读取草稿" :disable="running || savingDraft" @click="restoreDraft" />
      </div>
      <div v-if="folderName !== undefined && !controlsExpanded" class="ai-compact-summary"><q-icon name="check_circle" color="positive" size="16px" /><span>{{ models.find(m => m.id === modelId)?.name || '选择模型' }} · {{ settingsSummary }}</span><q-badge v-if="context" color="blue-1" text-color="primary">已填写产品参数</q-badge></div>
      <div v-show="folderName === undefined || controlsExpanded">
      <div class="ai-controls">
        <q-select v-model="modelId" :options="models.map(m => ({ label: `${m.name} · ${m.model}`, value: m.id }))" emit-value map-options outlined dense label="选择已配置模型" :disable="running || disabled"><template #after><q-btn flat round icon="refresh" aria-label="刷新可用模型" :disable="running" @click="load" /></template></q-select>
        <q-select v-model="language" :options="languages" emit-value map-options outlined dense label="目标语言" :disable="running || disabled" />
      </div>
      <q-input v-model="context" outlined dense type="textarea" :rows="4" label="文字参数 / 真实产品信息 / 关键词" maxlength="2000" class="q-mt-md" :disable="running || disabled" />
      <q-expansion-item v-if="folderName !== undefined" icon="tune" label="自定义设置" :caption="settingsSummary" class="q-mt-sm">
        <div class="q-pa-md">
          <div class="ai-controls">
            <q-select v-model="writing.titleMode" outlined dense emit-value map-options label="视频标题处理" :options="[{label:'保留当前标题',value:'keep'},{label:'翻译成目标语言',value:'translate'},{label:'优化为 SEO 标题',value:'seo'}]" :disable="running || disabled" />
            <q-select v-model="writing.length" outlined dense emit-value map-options label="介绍长度" :options="[{label:'简短：1–2 句',value:'brief'},{label:'适中：一个段落',value:'standard'},{label:'详细：2–3 段（资料充足时）',value:'detailed'}]" :disable="running || disabled" />
            <q-select v-model="writing.tone" outlined dense emit-value map-options label="介绍语气" :options="[{label:'客观自然',value:'neutral'},{label:'专业技术',value:'technical'},{label:'通俗易懂',value:'accessible'}]" :disable="running || disabled" />
          </div>
          <q-input v-model="writing.instructions" outlined dense type="textarea" :rows="2" maxlength="1000" label="补充写作要求（可选）" placeholder="例如：先介绍设备用途，再简述特点；不要使用表情符号。" class="q-mt-md" :disable="running || disabled" />
          <div class="text-caption text-grey-7 q-mt-sm">只使用与本条标题明确对应的参数；资料少时简短介绍，不编造、不重复套模板、不突出公司品牌。设置仅用于当前文件夹。</div>
        </div>
      </q-expansion-item>
      </div>
      <div v-if="folderName !== undefined" class="row q-gutter-sm q-mt-sm">
        <q-btn unelevated color="primary" icon="auto_awesome" label="生成列表名和视频介绍" :disable="unavailable" @click="generate('metadata')" />
        <q-btn v-if="canResume" outline color="primary" label="继续生成剩余介绍" :disable="unavailable" @click="generate('metadata', true)" />
        <q-btn v-if="running" flat color="negative" label="停止后续生成" :disable="stopping" @click="stopping = true" />
      </div>
      <div v-else class="row q-gutter-sm q-mt-sm"><q-btn v-if="!descriptionOnly" outline color="primary" icon="translate" label="翻译标题" :disable="unavailable" @click="generate('translate')" /><q-btn v-if="!descriptionOnly" unelevated color="primary" icon="auto_awesome" label="生成 SEO 标题与详情" :disable="unavailable" @click="generate('seo')" /><q-btn unelevated color="primary" icon="edit_note" :label="items.length > 1 ? 'AI 批量更新视频描述' : 'AI 更新视频描述'" :disable="unavailable" @click="generate('description')" /><q-btn v-if="running" flat color="negative" :label="stopping ? '将在本条完成后停止' : '停止后续生成'" :disable="stopping" @click="stopping = true" /></div>
      <q-linear-progress v-if="running" :value="total ? completed / total : 0" class="q-mt-md" />
      <div v-if="running" class="text-caption q-mt-sm">已处理 {{ completed }} / {{ total }}，请保持页面打开。</div>
      <q-banner v-if="message" rounded class="bg-blue-1 text-primary q-mt-md">{{ message }}</q-banner>
      <div v-if="!models.length && !loading" class="text-caption text-grey-7 q-mt-sm">还没有启用的模型，请先到模型管理填写 API Key。</div>
    </q-card-section>
    <template v-if="results.length || playlistPreview">
      <q-separator /><q-card-section>
        <div class="row items-center q-mb-md"><div class="text-subtitle2">生成结果 · 可修改后应用</div><q-space /><q-btn flat label="丢弃预览" :disable="running" @click="results = []; playlistPreview = ''; message = ''" /></div>
        <q-input v-if="playlistPreview" v-model="playlistPreview" outlined dense label="AI 列表名称（可修改）" maxlength="150" counter :disable="running || disabled" class="q-mb-md" />
        <div class="ai-previews">
          <div v-for="r in results" :key="r.id" class="ai-result">
            <div class="row items-start no-wrap"><q-checkbox v-model="r.selected" :disable="!!r.error || running || disabled" aria-label="应用此条生成结果" /><div class="col"><div class="text-caption text-grey-7">原始标题：{{ r.sourceTitle }}</div><div v-if="r.error" class="text-negative q-mt-sm">{{ r.error }}（原文保留）</div><template v-else><q-input v-if="lastMode !== 'description' && !(lastMode === 'metadata' && generatedTitleMode === 'keep')" v-model="r.title" outlined dense autogrow maxlength="100" counter label="生成标题" class="q-mt-sm" :disable="running || disabled" /><q-input v-if="lastMode !== 'translate'" v-model="r.description" outlined dense type="textarea" autogrow maxlength="5000" counter label="生成详情" class="q-mt-sm" :disable="running || disabled" /></template></div></div>
          </div>
        </div>
        <q-btn unelevated color="primary" class="q-mt-md" :label="applyLabel || (folderName !== undefined ? '应用列表名和勾选介绍' : '应用勾选结果')" :disable="running || disabled || (!applicable.length && !playlistPreview)" @click="apply" />
      </q-card-section>
    </template>
  </q-card>
</template>
<script setup lang="ts">
import { duplicateDescription, generateDistinctDescription } from '@/utils/aiDescriptions'
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { getAiFolderDraft, saveAiFolderDraft, type AiDraftData, type AiWritingOptions } from '@/api/ai'
import { reconcileAiDraft } from '@/utils/aiDraft'
import { listAiModels, generateAiText, type AiModel, type AiText, type AiResult } from '@/api/ai'
const props = defineProps<{ items: AiText[]; disabled?: boolean; descriptionOnly?: boolean; applyLabel?: string; appliedMessage?: string; draftKey?: string; draftItems?: AiText[]; folderName?: string; playlistTitle?: string }>()
const emit = defineEmits<{ apply: [items: AiResult[]]; busy: [value: boolean]; restore: [items: AiText[]]; playlist: [title: string]; review: [] }>()
const models = ref<AiModel[]>([]), modelId = ref(''), language = ref('English'), context = ref(''), message = ref(''), loading = ref(false)
const languages = [{ label: '英文', value: 'English' }, { label: '简体中文', value: '简体中文' }, { label: '西班牙文', value: 'Español' }, { label: '法文', value: 'Français' }, { label: '德文', value: 'Deutsch' }, { label: '日文', value: '日本語' }]
const controlsExpanded = ref(true)
const settingsSummary = computed(() => `${languages.find(l => l.value === language.value)?.label || language.value} · ${{ keep: '保留标题', translate: '翻译标题', seo: '优化标题' }[writing.value.titleMode]} · ${{ brief: '简短介绍', standard: '适中介绍', detailed: '详细介绍' }[writing.value.length]} · ${{ neutral: '客观自然', technical: '专业技术', accessible: '通俗易懂' }[writing.value.tone]}`)
const writing = ref<AiWritingOptions>({ titleMode: 'keep', length: 'standard', tone: 'neutral', instructions: '' })
const generatedTitleMode = ref<AiWritingOptions['titleMode']>('keep')
const playlistPreview = ref(''), playlistSource = ref('')
const running = ref(false), stopping = ref(false), completed = ref(0), total = ref(0), lastMode = ref<'translate' | 'seo' | 'description' | 'metadata'>('translate')
const results = ref<(AiResult & { selected: boolean; error?: string })[]>([])
const unavailable = computed(() => running.value || draftLoading.value || draftConflict.value || props.disabled || !modelId.value || !props.items.length)
const canResume = computed(() => props.folderName !== undefined && lastMode.value === 'metadata' && !!playlistPreview.value && playlistSource.value === (props.playlistTitle || props.folderName || '') && props.items.some(i => !results.value.some(r => !r.error && r.id === i.id && r.sourceTitle === i.title && r.sourceDescription === i.description)))
const applicable = computed(() => results.value.filter(r => r.selected && !r.error))
let controller: AbortController | undefined
let unmounted = false
const draftLoading = ref(props.draftKey !== undefined), savingDraft = ref(false), dirtyDraft = ref(false)
const draftError = ref(''), draftConflict = ref(false), draftSavedAt = ref('')
let draftRevision = 0, draftReady = false, draftTimer: ReturnType<typeof setTimeout> | undefined
let savePromise: Promise<boolean> | undefined
function draftData(): AiDraftData {
  const clean = (r: AiText) => ({ id: r.id, title: r.title, description: r.description, fingerprint: r.fingerprint, originalTitle: r.originalTitle })
  return { version: 1, modelId: modelId.value, language: language.value, context: context.value, mode: lastMode.value,
    ...(props.folderName !== undefined ? { folderAi: { playlistTitle: props.playlistTitle || props.folderName, playlistPreview: playlistPreview.value, playlistSource: playlistSource.value, previewTitleMode: generatedTitleMode.value, options: writing.value } } : {}),
    rows: (props.draftItems || props.items).map(clean),
    results: results.value.map(r => ({ ...clean(r), sourceTitle: r.sourceTitle, sourceDescription: r.sourceDescription, selected: r.selected, error: r.error || '' })) }
}
async function restoreDraft() {
  if (props.draftKey === undefined) return
  clearTimeout(draftTimer); draftReady = false; draftLoading.value = true
  try {
    const saved = (await getAiFolderDraft(props.draftKey)).data
    if (saved) {
      const restored = reconcileAiDraft(saved.data, props.draftItems || props.items)
      modelId.value = saved.data.modelId; language.value = saved.data.language; context.value = saved.data.context; lastMode.value = saved.data.mode
      if (props.folderName !== undefined && saved.data.folderAi) {
        writing.value = { ...saved.data.folderAi.options }; generatedTitleMode.value = saved.data.folderAi.previewTitleMode || writing.value.titleMode
        playlistPreview.value = saved.data.folderAi.playlistPreview; playlistSource.value = saved.data.folderAi.playlistSource
        emit('playlist', saved.data.folderAi.playlistTitle || props.folderName)
      }
      results.value = restored.results; emit('restore', restored.rows)
      if (props.folderName !== undefined) controlsExpanded.value = !restored.rows.some(r => r.description?.trim())
      draftRevision = saved.revision; draftSavedAt.value = saved.updatedAt
      message.value = `已恢复 ${restored.results.length} 条预览及 ${restored.rows.length} 条视频文案。${restored.skipped ? `${restored.skipped} 项文件或原文已变化，未自动恢复。` : ''}恢复草稿不会触发发布。`
    } else { draftRevision = 0; draftSavedAt.value = '' }
    await nextTick()
    dirtyDraft.value = false; draftError.value = ''; draftConflict.value = false; draftReady = true
  } catch { draftError.value = '读取草稿失败，请重新读取后再保存，以免覆盖已有内容' }
  finally { draftLoading.value = false }
}
function saveDraft(): Promise<boolean> {
  clearTimeout(draftTimer)
  if (props.draftKey === undefined) return Promise.resolve(true)
  if (!draftReady || draftConflict.value) return Promise.resolve(false)
  if (savePromise) return savePromise
  savePromise = (async () => {
    savingDraft.value = true
    try {
      do {
        dirtyDraft.value = false
        const saved = (await saveAiFolderDraft(props.draftKey!, draftRevision, draftData())).data
        draftRevision = saved.revision; draftSavedAt.value = saved.updatedAt; draftError.value = ''
      } while (dirtyDraft.value && !unmounted)
      return true
    } catch (e: any) {
      dirtyDraft.value = true; draftConflict.value = e.response?.status === 409
      draftError.value = e.response?.data?.message || '草稿保存失败，内容仍保留在页面，请点击保存草稿重试'
      return false
    } finally { savingDraft.value = false; savePromise = undefined }
  })()
  return savePromise
}
watch([modelId, language, context, lastMode, results, writing, playlistPreview, () => props.playlistTitle, () => props.draftItems], () => {
  if (!draftReady || unmounted || props.draftKey === undefined) return
  dirtyDraft.value = true; clearTimeout(draftTimer)
  if (!draftConflict.value) draftTimer = setTimeout(() => { void saveDraft() }, 800)
}, { deep: true })
function protectUnsaved(e: BeforeUnloadEvent) { if (props.draftKey !== undefined && (dirtyDraft.value || savingDraft.value)) { e.preventDefault(); e.returnValue = '' } }
onBeforeRouteLeave(async () => props.draftKey === undefined || (!dirtyDraft.value && !savingDraft.value) || await saveDraft())
const hasPreview = computed(() => !!playlistPreview.value || results.value.length > 0)
defineExpose({ saveDraft, hasPreview })
async function load() { loading.value = true; try { models.value = (await listAiModels()).data.filter(m => m.enabled && m.hasKey); if (!models.value.some(m => m.id === modelId.value)) modelId.value = models.value.find(m => m.provider === 'deepseek')?.id || models.value[0]?.id || '' } catch { message.value = '模型列表读取失败，请重试' } finally { loading.value = false } }
async function generate(mode: 'translate' | 'seo' | 'description' | 'metadata', resume = false) {
  if (unavailable.value) return
  const saved = resume ? results.value.filter(r => !r.error && props.items.some(i => i.id === r.id && i.title === r.sourceTitle && i.description === r.sourceDescription)) : []
  const list = props.items.filter(i => !saved.some(r => r.id === i.id)).map(i => ({ ...i })), chosenModel = modelId.value, chosenLanguage = language.value, facts = context.value
  const settings = { ...writing.value }; generatedTitleMode.value = settings.titleMode
  if (!resume) { playlistPreview.value = ''; playlistSource.value = props.playlistTitle || props.folderName || '' }
  results.value = saved; message.value = ''; running.value = true; stopping.value = false; completed.value = saved.length; total.value = list.length + saved.length; lastMode.value = mode; emit('busy', true)
  controller = new AbortController()
  const signal = controller.signal
  try {
    if (mode === 'metadata' && props.folderName !== undefined && !resume) {
      try {
        const result = (await generateAiText({ modelId: chosenModel, mode: 'playlist', language: chosenLanguage, title: playlistSource.value, description: '', context: ('Videos: ' + list.map(i => i.title).join('; ')).slice(0, 2000) }, signal)).data
        playlistPreview.value = result.title
        if (props.draftKey !== undefined && !await saveDraft()) { message.value = '列表预览保存失败，请先保存草稿'; return }
      } catch (e: any) { message.value = e.response?.data?.message || '列表名称生成失败，请重试'; return }
    }
    for (const item of list) {
      if (stopping.value || unmounted) break
      const r = { ...item, sourceTitle: item.title, sourceDescription: item.description, selected: true, error: '' }
      try {
        const call = async (avoidDescriptions: string[]) => (await generateAiText({ modelId: chosenModel, mode, language: chosenLanguage, title: item.title, description: item.description, context: facts, avoidDescriptions, ...(mode === 'metadata' ? { options: settings } : {}) }, signal)).data
        const previous = results.value.filter(r => !r.error).map(r => r.description)
        Object.assign(r, mode === 'translate' ? await call([]) : await generateDistinctDescription(call, previous))
      }
      catch (e: any) { r.error = e.response?.data?.message || e.message || '生成失败，请检查网络后重试'; r.selected = false; if ([400, 404, 409, 502].includes(e.response?.status)) stopping.value = true }
      if (unmounted) break
      results.value.push(r); completed.value++
      if (props.draftKey !== undefined) { await nextTick(); if (!await saveDraft()) { stopping.value = true; break } }
    }
    message.value = `已生成 ${results.value.filter(r => !r.error).length} 条结果，尚未修改视频清单。${completed.value < total.value ? '其余项目未处理。' : ''}`
  } finally { running.value = false; emit('busy', false) }
}
async function apply() {
  if (playlistPreview.value && (!playlistPreview.value.trim() || playlistPreview.value.length > 150 || /[<>\r\n]/.test(playlistPreview.value))) { message.value = '请填写有效列表名称（1–150 字符）'; return }
  if (playlistPreview.value && playlistSource.value !== (props.playlistTitle || props.folderName || '')) { message.value = '列表名称已变化，请重新生成以免覆盖'; return }
  if (applicable.value.some(r => !r.title.trim() || r.title.length > 100 || /[<>\r\n]/.test(r.title) || r.description.length > 5000)) { message.value = '请填写有效标题（1–100 字符，不含尖括号或换行），详情不超过 5000 字符'; return }
  if (lastMode.value !== 'translate') {
    const selected = new Map(applicable.value.map(r => [r.id, r.description]))
    const finalItems = props.items.map(i => ({ id: i.id, description: selected.get(i.id) ?? i.description }))
    if (applicable.value.some(r => !r.description.trim() || duplicateDescription(r.description, finalItems.filter(i => i.id !== r.id).map(i => i.description)))) { message.value = '存在空描述或重复描述，请修改后再应用；每条视频需要独立描述'; return }
  }
  const current = new Map(props.items.map(i => [i.id, i]))
  const valid = applicable.value.filter(r => current.get(r.id)?.title === r.sourceTitle && current.get(r.id)?.description === r.sourceDescription)
  const skipped = applicable.value.length - valid.length
  emit('apply', valid.map(r => ({ id: r.id, sourceTitle: r.sourceTitle, sourceDescription: r.sourceDescription, title: lastMode.value === 'description' ? r.sourceTitle : r.title.trim(), description: r.description })))
  if (playlistPreview.value) { emit('playlist', playlistPreview.value.trim()); playlistPreview.value = '' }
  results.value = []; message.value = (props.appliedMessage || `已应用 ${valid.length} 条结果。`) + `${skipped ? `${skipped} 条原文已变化或已取消选择，为避免覆盖未应用。` : ''}`
  if (props.folderName !== undefined) { await nextTick(); if (await saveDraft()) emit('review') }
}
onMounted(async () => { window.addEventListener('beforeunload', protectUnsaved); await restoreDraft(); await load() })
onBeforeUnmount(() => { clearTimeout(draftTimer); window.removeEventListener('beforeunload', protectUnsaved); unmounted = true; controller?.abort(); emit('busy', false) })
</script>
<style scoped>
.ai-tools{border-radius:16px;border-color:#dfe7f1;background:#fff}.ai-tools>.q-card__section{padding:22px}.ai-controls{display:grid;grid-template-columns:2fr 1fr;gap:16px}.ai-previews{max-height:550px;overflow:auto}.ai-result{padding:14px 0;border-top:1px solid #edf0f5}@media(max-width:650px){.ai-controls{grid-template-columns:1fr}}
.folder-ai{border-color:#dce6f4;box-shadow:0 4px 18px #21385803}.folder-ai>.q-card__section{padding:20px 22px}.folder-ai :deep(.q-expansion-item){background:#f6f8fc;border-radius:10px}.ai-compact-summary{display:flex;align-items:center;flex-wrap:wrap;gap:8px;color:#6d7f98;font-size:12px;margin-bottom:18px;padding:12px 14px;background:#f4f8ff;border-radius:10px}.folder-ai :deep(.q-btn--unelevated){border-radius:8px}.folder-ai .ai-result{background:#f9fbfe;border:1px solid #e7edf6;border-radius:12px;padding:14px;margin-bottom:10px}.folder-ai :deep(.q-banner){font-size:12px;line-height:1.7;padding:10px 14px}
</style>
