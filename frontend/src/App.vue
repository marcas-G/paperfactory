<template>
  <div class="app-container">
    <TopBar />
    <div class="main-body">
      <Sidebar />
      <div class="content-area">
        <router-view />
      </div>
    </div>
    <InputBar />
  </div>
</template>

<script setup lang="ts">
import TopBar from './components/TopBar.vue';
import Sidebar from './components/Sidebar.vue';
import InputBar from './components/InputBar.vue';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', Arial, sans-serif;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.main-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
