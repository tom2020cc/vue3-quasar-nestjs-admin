<template>
  <q-page padding>
    <q-card flat bordered class="q-pa-md">
      <div class="text-h6 q-mb-md">欢迎使用后台管理</div>
      <p class="text-grey-8">
        这是一个 Vue3 + Quasar + NestJS + SQLite 的前后端联通示例，包含登录鉴权以及用户、菜单的增删改查。
      </p>
      <div class="row q-gutter-md">
        <q-btn color="primary" icon="people" label="用户管理" :to="'/users'" />
        <q-btn color="secondary" icon="menu" label="菜单管理" :to="'/menus'" />
      </div>
    </q-card>
  </q-page>
</template>

<script setup lang="ts"></script>
