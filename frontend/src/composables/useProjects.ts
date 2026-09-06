import { ref } from 'vue';
import client from '../api/client';

export interface Project {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export function useProjects() {
  const projects = ref<Project[]>([]);
  const loading = ref(false);

  async function fetchProjects() {
    loading.value = true;
    try {
      const { data } = await client.get('/projects');
      projects.value = data;
    } finally {
      loading.value = false;
    }
  }

  async function createProject(question: string) {
    const { data } = await client.post('/projects', { question });
    projects.value.unshift(data);
    return data;
  }

  async function deleteProject(id: string) {
    await client.delete(`/projects/${id}`);
    projects.value = projects.value.filter((p) => p.id !== id);
  }

  return { projects, loading, fetchProjects, createProject, deleteProject };
}
