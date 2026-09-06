import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import router from './router';
import zh from './locales/zh.json';
import en from './locales/en.json';

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'en',
  messages: {
    zh,
    en,
  },
});

const app = createApp(App);
app.use(ElementPlus);
app.use(i18n);
app.use(router);
app.mount('#app');
