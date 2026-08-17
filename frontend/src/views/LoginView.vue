<template>
  <div class="loginbg row items-center justify-center">
    <q-card class="login-card" square bordered>
      <q-card-section>
        <div class="text-h5 text-weight-bold q-mb-md">登录后台管理</div>
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
            :rules="[
              (v) => !!v || '密码不能为空',
              (v) => (v && v.length >= 3) || '密码长度至少 3 位',
            ]"
          >
            <template v-slot:append>
              <q-icon
                :name="isPwd ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="isPwd = !isPwd"
              />
            </template>
          </q-input>
          <q-btn
            type="submit"
            color="primary"
            label="登录"
            class="full-width"
            :loading="loading"
          />
          <q-btn
            flat
            color="primary"
            label="没有账号？去注册"
            class="full-width"
            @click="onSignup"
          />
        </q-form>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Notify } from 'quasar'
import { login, signup } from '@/api/users'
import { useMyTokenStore } from '@/stores/myToken'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()
const tokenStore = useMyTokenStore()

const form = reactive({ email: 'admin@qq.com', password: 'admin123' })
const isPwd = ref(true)
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    const res = await login(form)
    tokenStore.saveToken(res.data.access_token)
    Notify.create({ type: 'positive', message: '登录成功' })
    router.push((route.query.redirect as string) || '/')
  } catch (e: any) {
    Notify.create({
      type: 'negative',
      message: e.response?.data?.message || '登录失败',
    })
  } finally {
    loading.value = false
  }
}

async function onSignup() {
  loading.value = true
  try {
    await signup(form)
    Notify.create({ type: 'positive', message: '注册成功，正在自动登录...' })
    await onSubmit()
  } catch (e: any) {
    Notify.create({
      type: 'negative',
      message: e.response?.data?.message || '注册失败',
    })
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.loginbg {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(51deg, #b3eb98, #fcd3d3, #f7f58c);

  .login-card {
    width: 420px;
    max-width: 92vw;
    border-radius: 12px;
    box-shadow: 0 0 8px 0 rgba(0, 0, 0, 0.1);
  }
}
</style>
