import { ref, onMounted } from 'vue';
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
      projects.value = Array.isArray(data) ? data : [];
    } catch {
      projects.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createProject(question: string) {
    const payload = { name: question, question: question };
    const { data } = await client.post('/projects', payload);
    projects.value.unshift(data);
    return data;
  }

  async function deleteProject(id: string) {
    await client.delete(`/projects/${id}`);
    projects.value = projects.value.filter((p) => p.id !== id);
  }

  onMounted(() => {
    fetchProjects();
  });

  return { projects, loading, fetchProjects, createProject, deleteProject };
}
