import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/research/:projectId',
      name: 'Research',
      component: () => import('./views/ResearchView.vue'),
    },
    {
      path: '/projects',
      name: 'Projects',
      component: () => import('./views/ProjectsView.vue'),
    },
    {
      path: '/',
      redirect: '/projects',
    },
  ],
});

export default router;
