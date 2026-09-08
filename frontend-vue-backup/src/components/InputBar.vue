<template>
  <div class="input-bar">
    <el-input
      v-model="localQuestion"
      :placeholder="t('common.enterQuestion')"
      :disabled="disabled"
      @keyup.enter="onSend"
      clearable
    />
    <el-button
      v-if="!isRunning"
      type="primary"
      :disabled="disabled || !localQuestion.trim()"
      @click="onSend"
    >
      {{ t('btn.startResearch') }}
    </el-button>
    <el-button
      v-else
      type="danger"
      @click="$emit('stop')"
    >
      {{ t('btn.stop') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  question?: string;
  disabled?: boolean;
  isRunning?: boolean;
}>();

const emit = defineEmits<{
  'update:question': [value: string];
  send: [question: string];
  stop: [];
}>();

const localQuestion = computed({
  get: () => props.question ?? '',
  set: (val: string) => emit('update:question', val),
});

const disabled = computed(() => props.disabled ?? false);

function onSend() {
  const q = localQuestion.value.trim();
  if (q && !disabled.value) {
    emit('send', q);
    emit('update:question', '');
  }
}
</script>

<style scoped>
.input-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
  flex-shrink: 0;
}

.input-bar .el-input {
  flex: 1;
}
</style>
