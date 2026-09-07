<template>
  <div class="detail-panel">
    <template v-if="selectedPhase">
      <div class="phase-detail">
        <div class="detail-header">
          <div class="header-left">
            <h3>{{ getPhaseLabel(selectedPhase.phaseName) }}</h3>
            <span class="version-tag">v{{ selectedPhase.phaseVersion }}</span>
          </div>
          <el-tag :type="statusTagType(selectedPhase.status)" size="small">
            {{ selectedPhase.status }}
          </el-tag>
        </div>

        <div class="detail-tabs">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="Output" name="output">
              <div class="output-section">
                <h4>{{ t('common.rawOutput') }}</h4>
                <pre class="output-pre">{{ selectedPhase.agentOutput || 'No output' }}</pre>
              </div>
            </el-tab-pane>

            <el-tab-pane
              v-if="selectedPhase.toolCalls && selectedPhase.toolCalls.length > 0"
              label="Tool Calls"
              name="tools"
            >
              <div class="tool-calls-section">
                <div
                  v-for="(call, idx) in selectedPhase.toolCalls"
                  :key="idx"
                  class="tool-call-card"
                >
                  <el-collapse>
                    <el-collapse-item :name="'tc-' + idx">
                      <template #title>
                        <div class="tool-call-header">
                          <span class="tool-name">{{ call.toolName }}</span>
                          <el-tag size="small">{{ Object.keys(call.input).length }} params</el-tag>
                        </div>
                      </template>
                      <div class="tool-input">
                        <strong>Input:</strong>
                        <pre>{{ JSON.stringify(call.input, null, 2) }}</pre>
                      </div>
                      <div class="tool-output">
                        <strong>Output:</strong>
                        <pre>{{ call.output }}</pre>
                      </div>
                    </el-collapse-item>
                  </el-collapse>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane
              v-if="selectedPhase.selfReview"
              label="Self-Review"
              name="review"
            >
              <div class="review-section">
                <div class="review-summary">
                  <el-tag :type="selectedPhase.selfReview.passed ? 'success' : 'danger'" size="small">
                    {{ selectedPhase.selfReview.passed ? 'PASSED' : 'ISSUES FOUND' }}
                  </el-tag>
                  <span class="review-rounds">{{ t('common.rounds') }}: {{ selectedPhase.selfReview.rounds }}</span>
                </div>
                <div
                  v-if="selectedPhase.selfReview.issues && selectedPhase.selfReview.issues.length > 0"
                  class="review-issues"
                >
                  <div
                    v-for="(issue, idx) in selectedPhase.selfReview.issues"
                    :key="idx"
                    class="issue-item"
                  >
                    <el-tag :type="severityTagType(issue.severity)" size="small">
                      {{ issue.severity }}
                    </el-tag>
                    <span class="issue-category">{{ issue.category }}</span>
                    <span class="issue-message">{{ issue.message }}</span>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="Versions" name="versions">
              <VersionCards
                :versions="versionData"
                :project-id="projectId"
                :phase-name="selectedPhase.phaseName"
                @select="onVersionSelect"
              />
            </el-tab-pane>

            <el-tab-pane label="Papers" name="papers">
              <PaperLibrary
                :papers="papers"
                :project-id="projectId"
              />
            </el-tab-pane>
          </el-tabs>
        </div>

        <ApprovalPanel
          v-if="showApproval && selectedPhase.status === 'WAITING_APPROVAL'"
          :phase-name="selectedPhase.phaseName"
          :summary="selectedPhase.agentOutput"
          :self-review="selectedPhase.selfReview"
          @approve="$emit('approve')"
          @modify="$emit('modify', $event)"
          @reject="$emit('reject', $event)"
        />
      </div>
    </template>

    <template v-else>
      <div class="empty-detail">
        <div class="empty-icon">📋</div>
        <p>Select a phase to view details</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PhaseRun, Paper, SelfReview } from '../api/types';
import ApprovalPanel from './ApprovalPanel.vue';
import VersionCards from './VersionCards.vue';
import PaperLibrary from './PaperLibrary.vue';
import client from '../api/client';

const { t } = useI18n();

const props = defineProps<{
  selectedPhase: PhaseRun | null;
  showApproval: boolean;
  showVersions: boolean;
  showPapers?: boolean;
  papers?: Paper[];
  approvalPhase?: string;
  approvalRunId?: string;
  projectId?: string;
}>();

const emit = defineEmits<{
  approve: [];
  modify: [feedback: string];
  reject: [reason: string];
  close: [];
  'show-papers': [];
  'show-versions': [];
}>();

const activeTab = ref('output');
const versionData = ref<Array<{
  runId: string;
  version: number;
  summary: string;
  status: string;
  active: boolean;
  createdAt: string;
}>>([]);

watch(
  () => props.selectedPhase,
  async (phase) => {
    if (phase && props.projectId) {
      activeTab.value = 'output';
      try {
        const { data } = await client.get(
          `/projects/${props.projectId}/phases/${phase.phaseName}/compare`
        );
        if (data && data.versions) {
          versionData.value = data.versions;
        }
      } catch {
        versionData.value = [];
      }
    }
  }
);

const papers = computed(() => props.papers ?? []);

function getPhaseLabel(phaseName: string): string {
  const key = `phases.${phaseName}`;
  const translated = t(key);
  return translated !== key ? translated : phaseName;
}

function statusTagType(status: string): string {
  const map: Record<string, string> = {
    COMPLETED: 'success',
    RUNNING: '',
    ERROR: 'danger',
    WAITING_APPROVAL: 'warning',
    REJECTED: 'danger',
    MODIFY_REQUESTED: 'warning',
    PENDING: 'info',
  };
  return map[status] || 'info';
}

function severityTagType(severity: string): string {
  const s = severity.toLowerCase();
  if (s.includes('critical') || s.includes('high')) return 'danger';
  if (s.includes('medium')) return 'warning';
  return 'info';
}

function onVersionSelect(version: unknown) {
  console.log('Version selected:', version);
}
</script>

<style scoped>
.detail-panel {
  width: 400px;
  min-width: 400px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #fff;
  border-left: 1px solid #e4e7ed;
}

.phase-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  flex-wrap: wrap;
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-header h3 {
  font-size: 15px;
  font-weight: 600;
}

.version-tag {
  font-size: 12px;
  color: #909399;
}

.detail-tabs {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
}

.output-section h4,
.tool-calls-section h4,
.review-section h4 {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.output-pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}

.tool-call-card {
  margin-bottom: 8px;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-weight: 600;
  font-size: 13px;
}

.tool-input,
.tool-output {
  margin-top: 6px;
}

.tool-input pre,
.tool-output pre {
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  margin: 4px 0 0;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.review-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.review-rounds {
  font-size: 13px;
  color: #606266;
}

.issue-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  margin-bottom: 4px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
}

.issue-category {
  font-weight: 500;
  color: #606266;
}

.issue-message {
  flex: 1;
  color: #909399;
}

.empty-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #c0c4cc;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
}
</style>
