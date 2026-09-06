<template>
  <div class="research-view">
    <div class="main-content">
      <PhaseTimeline :phases="phases" />
      <AgentLog :messages="logMessages" />
    </div>
    <DetailPanel
      :selected-phase="selectedPhase"
      :show-approval="showApproval"
      :show-versions="showVersions"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import PhaseTimeline from '../components/PhaseTimeline.vue';
import AgentLog from '../components/AgentLog.vue';
import DetailPanel from '../components/DetailPanel.vue';
import type { PhaseRun } from '../api/types';

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const phases = ref<PhaseRun[]>([]);
const selectedPhase = ref<PhaseRun | null>(null);
const showApproval = ref(false);
const showVersions = ref(false);

const logMessages = ref<Array<{ type: string; label: string; content: string }>>([]);
</script>

<style scoped>
.research-view {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
