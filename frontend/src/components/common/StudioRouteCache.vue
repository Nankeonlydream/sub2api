<template>
  <!-- Only the studio survives navigation. A logout/account change discards
       the cache so another session never inherits its keys or task state. -->
  <KeepAlive :key="sessionKey" include="CreatorStudioView" :max="1">
    <component :is="view" />
  </KeepAlive>
</template>

<script setup lang="ts">
import type { Component, VNode } from 'vue'

defineProps<{ sessionKey: string | number; view: Component | VNode | undefined }>()
</script>
