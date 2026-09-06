<template>
  <div class="input-bar">
    <el-input
      v-model="question"
      :placeholder="t('common.enterQuestion')"
      @keyup.enter="onSend"
    />
    <el-button type="primary" @click="onSend">{{
      t('btn.startResearch')
    }}</el-button>
    <el-button type="danger" @click="onStop">{{ t('btn.stop') }}</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const question = ref('');

const emit = defineEmits<{
  send: [question: string];
  stop: [];
}>();

function onSend() {
  if (question.value.trim()) {
    emit('send', question.value);
    question.value = '';
  }
}

function onStop() {
  emit('stop');
}
</script>

<style scoped>
.input-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
}

.input-bar .el-input {
  flex: 1;
}
</style>
