<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">接入注意事项 &amp; 防封号指南</div>
      <div class="text-caption text-grey-7 q-mt-xs">
        使用官方 API 授权发布、并遵守以下规则，可有效避免账号被平台风控或封禁。
      </div>
    </q-card-section>
    <q-separator />
    <q-list separator>
      <q-expansion-item
        v-for="s in guideSections"
        :key="s.title"
        default-opened
        expand-separator
      >
        <template v-slot:header>
          <q-item-section avatar>
            <q-icon :name="s.icon" :color="s.color" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-subtitle1">{{ s.title }}</q-item-label>
          </q-item-section>
        </template>
        <q-card flat class="bg-grey-1">
          <q-card-section>
            <ul class="q-pl-md q-mb-none">
              <li v-for="(item, i) in s.items" :key="i" class="q-my-xs">{{ item }}</li>
            </ul>
          </q-card-section>
        </q-card>
      </q-expansion-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { guideSections } from '@/constants/platformGuide'
</script>
