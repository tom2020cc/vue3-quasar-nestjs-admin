<template>
  <q-page padding>
    <q-card flat bordered>
      <q-card-section class="row items-center q-gutter-md">
        <div class="text-h6">菜单管理</div>
        <q-space />
        <q-btn-toggle
          v-model="viewMode"
          toggle-color="primary"
          :options="[
            { label: '树形', value: 'tree' },
            { label: '表格', value: 'table' },
          ]"
        />
        <q-btn color="primary" icon="add" label="新增菜单" @click="openCreate(0)" />
      </q-card-section>
      <q-separator />

      <!-- 表格视图 -->
      <q-table
        v-if="viewMode === 'table'"
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        flat
        bordered
      >
        <template v-slot:body-cell-index="props">
          <q-td :props="props">{{ props.rowIndex + 1 }}</q-td>
        </template>
        <template v-slot:body-cell-icon="props">
          <q-td :props="props">
            <q-icon v-if="props.row.icon?.[0]" :name="'image'" class="q-mr-xs" />
            <span>{{ props.row.icon?.[0] || '-' }}</span>
          </q-td>
        </template>
        <template v-slot:body-cell-show="props">
          <q-td :props="props">
            <q-badge :color="props.row.show ? 'positive' : 'grey'" outline>
              {{ props.row.show ? '显示' : '隐藏' }}
            </q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-xs">
            <q-btn flat dense color="primary" icon="edit" label="编辑" @click="openEdit(props.row)" />
            <q-btn flat dense color="negative" icon="delete" label="删除" @click="confirmDelete(props.row)" />
          </q-td>
        </template>
      </q-table>

      <!-- 树形视图 -->
      <div v-else class="q-pa-md">
        <q-tree
          :nodes="treeData"
          node-key="id"
          default-expand-all
          no-connectors
        >
          <template v-slot:default-header="prop">
            <div class="row items-center no-wrap full-width q-py-xs">
              <q-icon name="folder" color="primary" class="q-mr-sm" />
              <span class="q-mr-md">{{ prop.node.label }}</span>
              <q-badge v-if="prop.node.show" color="positive" outline class="q-mr-sm">显示</q-badge>
              <q-badge v-else color="grey" outline class="q-mr-sm">隐藏</q-badge>
              <q-space />
              <q-btn
                flat dense color="primary" icon="add" label="子菜单"
                @click.stop="openCreate(prop.node.id)"
              />
              <q-btn
                flat dense color="primary" icon="edit" label="编辑"
                @click.stop="openEdit(prop.node)"
              />
              <q-btn
                flat dense color="negative" icon="delete" label="删除"
                @click.stop="confirmDelete(prop.node)"
              />
            </div>
          </template>
        </q-tree>
      </div>
    </q-card>

    <!-- 新增 / 编辑 对话框 -->
    <q-dialog v-model="dialog">
      <q-card style="min-width: 460px">
        <q-card-section class="text-h6">
          {{ isEdit ? '编辑菜单' : '新增菜单' }}
        </q-card-section>
        <q-card-section>
          <q-form @submit="onSubmit" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="菜单名称"
              dense
              outlined
              :rules="[(v) => !!v || '菜单名称不能为空']"
            />
            <q-input v-model="form.href" label="菜单路径" dense outlined />
            <q-select
              v-model="form.parentId"
              label="上级菜单"
              dense
              outlined
              :options="parentOptions"
              map-options
              emit-value
            />
            <q-input v-model.number="form.orderNum" label="排序" type="number" dense outlined />
            <q-input v-model="form.publisher" label="创建人" dense outlined />
            <q-toggle v-model="form.show" label="是否显示" color="primary" />

            <div class="text-subtitle2">菜单图标</div>
            <ImageUpload v-model="form.iconUrl" label="上传图标图片" />
            <div v-if="form.iconUrl" class="text-caption text-grey-7">
              当前地址：{{ form.iconUrl }}
            </div>

            <q-card-actions align="right">
              <q-btn flat label="取消" color="primary" v-close-popup />
              <q-btn type="submit" color="primary" label="保存" :loading="saving" />
            </q-card-actions>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Notify, Dialog } from 'quasar'
import { getAll, create, update, remove, type MenuInfo } from '@/api/menus'
import ImageUpload from '@/components/ImageUpload.vue'

interface TreeNode extends MenuInfo {
  id: number
  label: string
  children: TreeNode[]
}

const columns = [
  { name: 'index', label: '编号', align: 'center' as const, field: 'index' },
  { name: 'name', label: '栏目名称', align: 'center' as const, field: 'name' },
  { name: 'parentId', label: '父栏目ID', align: 'center' as const, field: 'parentId' },
  { name: 'href', label: '地址', align: 'center' as const, field: 'href' },
  { name: 'icon', label: '图标', align: 'center' as const, field: 'icon' },
  { name: 'orderNum', label: '排序', align: 'center' as const, field: 'orderNum' },
  { name: 'show', label: '是否显示', align: 'center' as const, field: 'show' },
  { name: 'actions', label: '操作', align: 'center' as const, field: 'actions' },
]

const rows = ref<MenuInfo[]>([])
const loading = ref(false)
const dialog = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const editId = ref<number | null>(null)
const viewMode = ref<'tree' | 'table'>('tree')

const form = reactive({
  name: '',
  href: '',
  parentId: 0,
  iconUrl: '',
  orderNum: 0,
  publisher: '',
  show: true,
})

const parentOptions = computed(() => [
  { label: '顶级菜单', value: 0 },
  ...rows.value
    .filter((m) => m.parentId === 0)
    .map((m) => ({ label: m.name, value: m.id as number })),
])

// 将扁平列表构建成树形结构
const treeData = computed<TreeNode[]>(() => {
  const map = new Map<number, TreeNode>()
  rows.value.forEach((m) => {
    const id = m.id as number
    map.set(id, {
      id,
      label: m.name,
      name: m.name,
      parentId: m.parentId,
      publisher: m.publisher,
      href: m.href,
      icon: m.icon || [],
      show: m.show,
      orderNum: m.orderNum,
      children: [],
    })
  })
  const roots: TreeNode[] = []
  rows.value.forEach((m) => {
    const id = m.id as number
    const node = map.get(id)!
    if (m.parentId === 0 || !map.has(m.parentId)) {
      roots.push(node)
    } else {
      map.get(m.parentId)!.children.push(node)
    }
  })
  return roots
})

async function loadMenus() {
  loading.value = true
  try {
    const res = await getAll()
    rows.value = res.data
  } catch (e: any) {
    Notify.create({
      type: 'negative',
      message: e.response?.data?.message || '获取菜单列表失败',
    })
  } finally {
    loading.value = false
  }
}
loadMenus()

function resetForm() {
  form.name = ''
  form.href = ''
  form.parentId = 0
  form.iconUrl = ''
  form.orderNum = 0
  form.publisher = ''
  form.show = true
}

function openCreate(parentId = 0) {
  isEdit.value = false
  editId.value = null
  resetForm()
  form.parentId = parentId
  dialog.value = true
}

function openEdit(row: MenuInfo) {
  isEdit.value = true
  editId.value = row.id as number
  form.name = row.name
  form.href = row.href
  form.parentId = row.parentId
  form.iconUrl = row.icon?.[0] || ''
  form.orderNum = row.orderNum
  form.publisher = row.publisher
  form.show = row.show
  dialog.value = true
}

async function onSubmit() {
  saving.value = true
  const payload = {
    name: form.name,
    href: form.href,
    parentId: Number(form.parentId),
    icon: form.iconUrl ? [form.iconUrl] : [],
    orderNum: Number(form.orderNum),
    publisher: form.publisher,
    show: form.show,
  }
  try {
    if (isEdit.value && editId.value != null) {
      await update(editId.value, payload)
      Notify.create({ type: 'positive', message: '修改菜单成功' })
    } else {
      await create(payload)
      Notify.create({ type: 'positive', message: '新增菜单成功' })
    }
    dialog.value = false
    loadMenus()
  } catch (e: any) {
    Notify.create({
      type: 'negative',
      message: e.response?.data?.message || '保存失败',
    })
  } finally {
    saving.value = false
  }
}

function confirmDelete(row: MenuInfo) {
  Dialog.create({
    title: '删除提醒',
    message: `确认删除菜单「${row.name}」吗？`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await remove(row.id as number)
      Notify.create({ type: 'positive', message: '删除成功' })
      loadMenus()
    } catch (e: any) {
      Notify.create({
        type: 'negative',
        message: e.response?.data?.message || '删除失败',
      })
    }
  })
}
</script>
