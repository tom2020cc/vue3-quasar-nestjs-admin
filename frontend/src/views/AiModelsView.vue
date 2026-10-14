<template>
  <q-page class="model-page"><div class="workspace">
    <header class="row items-center q-gutter-md q-mb-lg">
      <q-avatar rounded color="primary" text-color="white" size="52px" icon="auto_awesome" />
      <div><h1>AI 模型管理</h1><p>配置一次，在翻译标题和补充 SEO 文案时自由选择。</p></div>
      <q-space /><q-btn outline color="primary" to="/folder-publish" label="文件夹发布" /><q-btn unelevated color="primary" icon="add" label="添加模型" @click="edit()" />
    </header>
    <div class="stats"><q-card flat bordered v-for="s in stats" :key="s.label"><q-card-section><div class="text-grey-7">{{ s.label }}</div><strong>{{ s.value }}</strong></q-card-section></q-card></div>
    <q-banner rounded class="bg-blue-1 text-primary q-my-lg">密钥保存在本机后端，编辑时不回显。保存后可测试连接；测试和生成会调用所选厂商，可能产生费用。模型 ID 和额度以厂商控制台为准。</q-banner>
    <q-banner v-if="error" rounded class="bg-red-1 text-negative q-mb-md">{{ error }}</q-banner>
    <div class="provider-grid">
      <q-card v-for="p in aiProviders" :key="p.id" flat bordered class="provider-card">
        <q-card-section>
          <div class="row items-center no-wrap q-gutter-md"><div class="provider-icon" :style="{ background: p.color + '15', color: p.color }">{{ p.short }}</div><div><div class="text-subtitle1 text-weight-bold">{{ p.name }}</div><div class="text-caption text-grey-7">{{ models.filter(m => m.provider === p.id).length }} 个已保存模型</div></div><q-space /><q-badge :color="models.some(m => m.provider === p.id) ? 'green-1' : 'grey-2'" :text-color="models.some(m => m.provider === p.id) ? 'positive' : 'grey-7'">{{ models.some(m => m.provider === p.id) ? '已配置' : '未配置' }}</q-badge></div>
          <p class="provider-note">{{ p.note }}</p>
          <div class="row items-center q-gutter-xs"><q-btn v-if="p.link" flat dense no-caps color="primary" :href="p.link" target="_blank" rel="noopener noreferrer" label="获取 API Key ↗" /><q-btn v-if="p.docs" flat dense color="grey-7" :href="p.docs" target="_blank" rel="noopener noreferrer" label="官方文档" /><q-space /><q-btn outline color="primary" icon="add" label="配置模型" @click="edit(undefined, p.id)" /></div>
        </q-card-section>
      </q-card>
    </div>
    <q-card flat bordered class="model-list q-mt-lg">
      <q-card-section class="row items-center"><div><div class="text-h6">已配置模型</div><div class="text-caption text-grey-7">每家厂商可添加多个模型。只有启用且已保存密钥的模型会出现在文字工具中。</div></div><q-space /><q-btn flat round icon="refresh" aria-label="刷新模型列表" :loading="loading" @click="load" /></q-card-section>
      <q-separator />
      <div v-if="!models.length" class="empty"><q-icon name="auto_awesome" size="36px" color="blue-3" /><div class="q-mt-sm">还没有模型，从上方选择一家厂商开始配置</div></div>
      <q-list separator><q-item v-for="m in models" :key="m.id" class="q-pa-md"><q-item-section><q-item-label class="text-weight-bold">{{ m.name }} <q-badge :color="m.enabled ? 'green-1' : 'grey-2'" :text-color="m.enabled ? 'positive' : 'grey-7'">{{ m.enabled ? '启用' : '停用' }}</q-badge></q-item-label><q-item-label caption>{{ aiProviders.find(p => p.id === m.provider)?.name }} · {{ m.model }}</q-item-label><q-item-label caption class="break-url">{{ m.baseUrl }}</q-item-label><q-item-label v-if="tests[m.id]" caption :class="tests[m.id].ok ? 'text-positive' : 'text-negative'">{{ tests[m.id].text }}</q-item-label></q-item-section><q-item-section side><div class="row q-gutter-xs"><q-btn flat color="primary" label="测试连接" :loading="testing === m.id" :disable="!!testing || !m.enabled" @click="test(m)" /><q-btn flat icon="edit" aria-label="编辑模型" :disable="!!testing" @click="edit(m)" /><q-btn flat color="negative" icon="delete_outline" aria-label="删除模型" :disable="!!testing" @click="remove(m)" /></div></q-item-section></q-item></q-list>
    </q-card>
    <LocalConfigBackup @imported="load" />
    <q-dialog v-model="opened" :persistent="saving" @hide="form.apiKey = ''"><q-card class="config-dialog">
      <q-card-section class="text-h6">{{ editId ? '编辑模型' : '添加模型' }}</q-card-section>
      <q-form @submit="save"><q-card-section class="q-gutter-md q-pt-none">
        <q-select v-model="form.provider" :options="aiProviders.map(p => ({ label: p.name, value: p.id }))" emit-value map-options outlined label="模型厂商" :disable="saving" @update:model-value="changeProvider" />
        <q-input v-model="form.name" outlined label="显示名称，例如 DeepSeek · 英文翻译" maxlength="100" :disable="saving" :rules="[required]" />
        <q-input v-model="form.baseUrl" outlined label="接口地址（Base URL）" hint="不包含 /chat/completions；自定义接口需支持该协议" :disable="saving" :rules="[required]" />
        <q-input v-model="form.model" outlined label="模型 ID" hint="填写厂商控制台提供的完整模型名称，可自定义" :disable="saving" :rules="[required]" />
        <q-input v-model="form.apiKey" outlined type="password" autocomplete="new-password" :label="editId ? 'API Key（留空保留原密钥）' : 'API Key'" :disable="saving" />
        <q-toggle v-model="form.enabled" label="启用此模型" :disable="saving" />
        <q-banner v-if="formError" class="bg-red-1 text-negative">{{ formError }}</q-banner>
      </q-card-section><q-card-actions align="right"><q-btn flat label="取消" :disable="saving" v-close-popup /><q-btn unelevated color="primary" type="submit" label="保存模型" :loading="saving" /></q-card-actions></q-form>
    </q-card></q-dialog>
  </div></q-page>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Dialog, Notify } from 'quasar'
import LocalConfigBackup from '@/components/LocalConfigBackup.vue'
import { aiProviders, listAiModels, saveAiModel, deleteAiModel, testAiModel, type AiModel } from '@/api/ai'
const models = ref<AiModel[]>([]), loading = ref(false), error = ref(''), opened = ref(false), saving = ref(false), editId = ref(''), formError = ref(''), testing = ref('')
const tests = reactive<Record<string, { ok: boolean; text: string }>>({})
const form = reactive({ name: '', provider: 'deepseek', model: '', baseUrl: '', apiKey: '', enabled: true })
const stats = computed(() => [{ label: '预设厂商', value: 4 }, { label: '已配置模型', value: models.value.length }, { label: '启用且已配置密钥', value: models.value.filter(m => m.enabled && m.hasKey).length }])
const required = (s: string) => !!s?.trim() || '请填写此项'
const message = (e: any) => e.response?.data?.message || '请求失败，请检查后端与网络'
async function load() { loading.value = true; error.value = ''; try { models.value = (await listAiModels()).data } catch (e) { error.value = message(e) } finally { loading.value = false } }
function changeProvider(id: string) { const p = aiProviders.find(p => p.id === id)!; Object.assign(form, { provider: id, name: p.name, model: p.model, baseUrl: p.baseUrl, apiKey: '' }) }
function edit(m?: AiModel, provider = 'deepseek') { editId.value = m?.id || ''; formError.value = ''; changeProvider(provider); form.enabled = true; if (m) Object.assign(form, { name: m.name, provider: m.provider, model: m.model, baseUrl: m.baseUrl, enabled: m.enabled, apiKey: '' }); opened.value = true }
async function save() { saving.value = true; formError.value = ''; try { await saveAiModel({ ...form }, editId.value || undefined); if (editId.value) delete tests[editId.value]; opened.value = false; form.apiKey = ''; await load(); Notify.create({ type: 'positive', message: '模型已保存，可点击测试连接' }) } catch (e) { formError.value = message(e) } finally { saving.value = false } }
async function test(m: AiModel) { testing.value = m.id; try { tests[m.id] = { ok: true, text: (await testAiModel(m.id)).data.message } } catch (e) { tests[m.id] = { ok: false, text: message(e) } } finally { testing.value = '' } }
function remove(m: AiModel) { Dialog.create({ title: '删除模型', message: `删除「${m.name}」的本地配置？`, cancel: true }).onOk(async () => { try { await deleteAiModel(m.id); await load() } catch (e) { error.value = message(e) } }) }
onMounted(load)
</script>
<style scoped>
.model-page{background:#f4f7fb;padding:28px}.workspace{max-width:1480px;margin:auto}h1{font-size:27px;line-height:1.4;font-weight:700;color:#172b4d;margin:0}header p{margin:6px 0 0;color:#71829a}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.stats strong{font-size:29px;color:#233d60}.stats .q-card,.model-list,.provider-card{border-radius:14px;border-color:#dfe7f1}.provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.provider-card .q-card__section{padding:22px}.provider-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:12px;font-weight:700;flex-shrink:0}.provider-note{color:#71829a;min-height:24px;margin:20px 0}.empty{padding:40px;text-align:center;color:#71829a}.config-dialog{width:600px;max-width:95vw;border-radius:16px}.break-url{overflow-wrap:anywhere}@media(max-width:800px){.model-page{padding:16px}.provider-grid{grid-template-columns:1fr}.stats{gap:8px}.q-item{flex-wrap:wrap}}
</style>
