import { api, type User } from './api/client';
import { registerNavHandler, setDefaultNavHandler, setRenderApp } from './shell';
import { dashboardView, loginView } from './views';
import { courseView } from './views-course';
import { crmView } from './views-crm';
import { analyticsView } from './views-analytics';
import { workflowLabView } from './views-workflow';
import { aiLabView } from './views-ai';
import { activitiesView, quizzesView } from './views-activities';
import { capstoneView, capstonesReviewView } from './views-capstone';
import { cohortCoverageView, curriculumCoverageView } from './views-curriculum';
import { resourcesView } from './views-resources';
import { glossaryView } from './views-glossary';
import { cohortsView } from './views-cohorts';
import { certificatesView } from './views-certificates';
import { reportsView } from './views-reports';

registerNavHandler('Courses', courseView);
registerNavHandler('My Learning', courseView);
registerNavHandler('Curriculum', curriculumCoverageView);
registerNavHandler('Coverage', cohortCoverageView);
registerNavHandler('Resources', resourcesView);
registerNavHandler('Glossary', glossaryView);
registerNavHandler('CRM Lab', crmView);
registerNavHandler('Workflow Lab', workflowLabView);
registerNavHandler('Analytics', analyticsView);
registerNavHandler('AI Practice Lab', aiLabView);
registerNavHandler('Assignments', activitiesView);
registerNavHandler('Quizzes', quizzesView);
registerNavHandler('Capstone', capstoneView);
registerNavHandler('Capstones', capstonesReviewView);
registerNavHandler('Cohorts', cohortsView);
registerNavHandler('Certificates', certificatesView);
registerNavHandler('Reports', reportsView);
setDefaultNavHandler(dashboardView);

export async function render() {
  const app = document.querySelector('#app') as HTMLElement;
  app.innerHTML = '<div class="loading">Loading your workspace…</div>';
  try {
    const { user } = await api<{ user: User | null }>('/api/session');
    if (user) dashboardView(user);
    else loginView();
  } catch {
    loginView('The service is unavailable. Please try again.');
  }
}

setRenderApp(render);
