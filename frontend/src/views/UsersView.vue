<template>
  <q-page padding>
    <q-card flat bordered>
      <q-card-section class="row items-center">
        <div class="text-h6">用户管理</div>
        <q-space />
        <q-btn color="primary" icon="add" label="新增用户" @click="openCreate" />
      </q-card-section>
      <q-separator />

      <q-table
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
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-xs">
            <q-btn
              flat
              dense
              color="primary"
              icon="edit"
              label="编辑"
              @click="openEdit(props.row)"
            />
            <q-btn
              flat
              dense
              color="negative"
              icon="delete"
              label="删除"
              @click="confirmDelete(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- 新增 / 编辑 对话框 -->
    <q-dialog v-model="dialog">
      <q-card style="min-width: 420px">
        <q-card-section class="text-h6">
          {{ isEdit ? '编辑用户' : '新增用户' }}
        </q-card-section>
        <q-card-section>
          <q-form @submit="onSubmit" class="q-gutter-md">
            <q-input
              v-model="form.email"
              label="邮箱"
              type="email"
              dense
              outlined
              :rules="[(v) => !!v || '邮箱不能为空']"
            />
            <q-input
              v-model="form.password"
              label="密码"
              :type="isPwd ? 'password' : 'text'"
              dense
              outlined
              :hint="isEdit ? '留空则不修改密码' : ''"
              :rules="isEdit ? [] : [(v) => !!v || '密码不能为空']"
            >
              <template v-slot:append>
                <q-icon
                  :name="isPwd ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  @click="isPwd = !isPwd"
                />
              </template>
            </q-input>
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
import { ref, reactive } from 'vue'
import { Notify, Dialog } from 'quasar'
import { getUsers, createUser, updateUser, removeUser } from '@/api/users'

interface Row {
  id: number
  email: string
  createTime?: string
}

const columns = [
  { name: 'index', label: '编号', align: 'center' as const, field: 'index' },
  { name: 'id', label: 'ID', align: 'center' as const, field: 'id' },
  { name: 'email', label: '邮箱', align: 'center' as const, field: 'email' },
  { name: 'createTime', label: '创建时间', align: 'center' as const, field: 'createTime' },
  { name: 'actions', label: '操作', align: 'center' as const, field: 'actions' },
]

const rows = ref<Row[]>([])
const loading = ref(false)
const dialog = ref(false)
const isEdit = ref(false)
const isPwd = ref(true)
const saving = ref(false)
const editId = ref<number | null>(null)
const form = reactive({ email: '', password: '' })

async function loadUsers() {
  loading.value = true
  try {
    const res = await getUsers()
    rows.value = res.data
  } catch (e: any) {
    Notify.create({
      type: 'negative',
      message: e.response?.data?.message || '获取用户列表失败',
    })
  } finally {
    loading.value = false
  }
}
loadUsers()

function openCreate() {
  isEdit.value = false
  editId.value = null
  form.email = ''
  form.password = ''
  dialog.value = true
}

function openEdit(row: Row) {
  isEdit.value = true
  editId.value = row.id
  form.email = row.email
  form.password = ''
  dialog.value = true
}

async function onSubmit() {
  saving.value = true
  try {
    if (isEdit.value && editId.value != null) {
      // 编辑：密码留空则不修改
      const payload: { email: string; password?: string } = { email: form.email }
      if (form.password) payload.password = form.password
      await updateUser(editId.value, payload)
      Notify.create({ type: 'positive', message: '修改用户成功' })
    } else {
      await createUser({ email: form.email, password: form.password })
      Notify.create({ type: 'positive', message: '新增用户成功' })
    }
    dialog.value = false
    loadUsers()
  } catch (e: any) {
    Notify.create({
      type: 'negative',
      message: e.response?.data?.message || '保存失败',
    })
  } finally {
    saving.value = false
  }
}

function confirmDelete(row: Row) {
  Dialog.create({
    title: '删除提醒',
    message: `确认删除用户「${row.email}」吗？`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await removeUser(row.id)
      Notify.create({ type: 'positive', message: '删除成功' })
      loadUsers()
    } catch (e: any) {
      Notify.create({
        type: 'negative',
        message: e.response?.data?.message || '删除失败',
      })
    }
  })
}
</script>
