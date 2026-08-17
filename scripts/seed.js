import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'node:url';
import { computeScoreForAll } from '../src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'));

export function seedDatabase(db) {
  const nexaflow = readJson('data/nexaflow.seed.json');
  const course = readJson('data/course.seed.json');
  const activities = readJson('data/activities.seed.json');
  const capstone = readJson('data/capstone.seed.json');
  const demoPasswordHash = bcrypt.hashSync('demo123', 10);
  const tables = ['ai_followups', 'ai_runs', 'capstone_submissions', 'capstones', 'capstone_deliverables', 'submissions', 'assignments', 'quiz_attempts', 'quiz_questions', 'quizzes', 'enrollments', 'cohorts', 'lesson_completions', 'lesson_objectives', 'lessons', 'modules', 'courses', 'sandbox_runs', 'workflow_steps', 'assignment_rules', 'scoring_factors', 'stage_history', 'activities', 'opportunities', 'leads', 'companies', 'salespeople', 'users', 'platform_settings', 'platform_meta'];
  const clear = db.transaction(() => { for (const table of tables) db.prepare(`DELETE FROM ${table}`).run(); });
  const insert = db.transaction(() => {
    db.prepare('INSERT INTO platform_meta (key, value) VALUES (?, ?)').run('referenceDate', nexaflow.metadata.referenceDate || new Date().toISOString());
    db.prepare('INSERT INTO platform_meta (key, value) VALUES (?, ?)').run('isDemoData', String(nexaflow.metadata.isDemoData));
    db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?)').run('targetIndustries', JSON.stringify(nexaflow.targetIndustries || []));
    const insertFactor = db.prepare('INSERT INTO scoring_factors (id, category, label, field, operator, value, points, position, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const factor of nexaflow.scoringFactors || []) insertFactor.run(factor.id, factor.category, factor.label, factor.field, factor.operator, Array.isArray(factor.value) ? JSON.stringify(factor.value) : String(factor.value), factor.points, factor.position, factor.enabled === false ? 0 : 1);
    const insertRule = db.prepare('INSERT INTO assignment_rules (id, name, priority, field, operator, value, assign_to, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const rule of nexaflow.assignmentRules || []) insertRule.run(rule.id, rule.name, rule.priority, rule.field, rule.operator, Array.isArray(rule.value) ? JSON.stringify(rule.value) : String(rule.value), rule.assignTo || null, rule.enabled === false ? 0 : 1);
    const insertWorkflowStep = db.prepare('INSERT INTO workflow_steps (id, workflow, position, name, description, actor, condition) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const step of nexaflow.workflows || []) insertWorkflowStep.run(step.id, step.workflow, step.position, step.name, step.description || null, step.actor || null, step.condition || null);
    const insertUser = db.prepare('INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)');
    for (const user of nexaflow.users) insertUser.run(user.id, user.name, user.email, demoPasswordHash, user.role, 'ACTIVE');
    const insertSalesperson = db.prepare('INSERT INTO salespeople (id, user_id, name, territory, capacity) VALUES (?, ?, ?, ?, ?)');
    for (const salesperson of nexaflow.salespeople) insertSalesperson.run(salesperson.id, salesperson.userId || null, salesperson.name || null, salesperson.territory || null, salesperson.capacity ?? null);
    const insertCompany = db.prepare('INSERT INTO companies (id, name, industry, employee_size, region, website, is_demo_data) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const company of nexaflow.companies) insertCompany.run(company.id, company.name, company.industry || null, company.employeeSize || null, company.region || null, company.website || null, company.isDemoData ? 1 : 0);
    const insertLead = db.prepare('INSERT INTO leads (id, company_id, contact_name, job_title, email, source, owner_id, stage, score, created_at, last_activity_at, next_action_at, expected_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const lead of nexaflow.leads) insertLead.run(lead.id, lead.companyId, lead.contactName, lead.jobTitle || null, lead.email || null, lead.source || null, lead.ownerId || null, lead.stage, lead.score || 0, lead.createdAt, lead.lastActivityAt || null, lead.nextActionAt || null, lead.expectedValue || 0);
    const insertActivity = db.prepare('INSERT INTO activities (id, lead_id, type, subject, occurred_at, owner_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const activity of nexaflow.activities) insertActivity.run(activity.id, activity.leadId, activity.type, activity.subject, activity.occurredAt, activity.ownerId || null, activity.notes || null);
    const insertOpportunity = db.prepare('INSERT INTO opportunities (id, company_id, lead_id, owner_id, stage, amount, currency, expected_close_date, closed_at, lost_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const opportunity of nexaflow.opportunities) insertOpportunity.run(opportunity.id, opportunity.companyId, opportunity.leadId || null, opportunity.ownerId || null, opportunity.stage, opportunity.amount || 0, opportunity.currency || null, opportunity.expectedCloseDate || null, opportunity.closedAt || null, opportunity.lostReason || null);
    const insertHistory = db.prepare('INSERT INTO stage_history (id, lead_id, from_stage, to_stage, changed_by_id, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const entry of nexaflow.stageHistory || []) insertHistory.run(entry.id, entry.leadId, entry.fromStage || null, entry.toStage, entry.changedById || null, entry.changedAt, entry.reason || null);
    const insertCourse = db.prepare('INSERT INTO courses (id, title, summary) VALUES (?, ?, ?)');
    insertCourse.run(course.id, course.title, course.summary || null);
    const insertModule = db.prepare('INSERT INTO modules (id, course_id, position, title, summary) VALUES (?, ?, ?, ?, ?)');
    const insertLesson = db.prepare('INSERT INTO lessons (id, module_id, position, title, summary, content, video_url, video_required, files, instructor_resources, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertObjective = db.prepare('INSERT INTO lesson_objectives (id, lesson_id, position, text) VALUES (?, ?, ?, ?)');
    for (const module of course.modules) {
      insertModule.run(module.id, course.id, module.position, module.title, module.summary || null);
      const lessons = module.lessons || (module.lesson ? [module.lesson] : []);
      lessons.forEach((lesson, index) => {
        insertLesson.run(lesson.id, module.id, index + 1, lesson.title, lesson.summary || null, lesson.content || null, lesson.videoUrl || null, lesson.videoRequired ? 1 : 0, JSON.stringify(lesson.files || []), JSON.stringify(lesson.instructorResources || []), lesson.durationMinutes || 0);
        (lesson.objectives || []).forEach((text, position) => insertObjective.run(`obj-${lesson.id}-${position + 1}`, lesson.id, position + 1, text));
      });
    }
    db.prepare('INSERT OR REPLACE INTO cohorts (id, course_id, instructor_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run('cohort-beta-001', course.id, 'usr-instructor-001', 'Beta Cohort', '2026-08-01', '2026-10-31', 'active');
    const insertEnrollment = db.prepare('INSERT OR REPLACE INTO enrollments (id, cohort_id, student_id, progress_percent, status) VALUES (?, ?, ?, 0, ?)');
    nexaflow.users.filter((user) => user.role === 'STUDENT').forEach((student, index) => insertEnrollment.run(`enroll-${String(index + 1).padStart(3, '0')}`, 'cohort-beta-001', student.id, 'active'));
    const insertQuiz = db.prepare('INSERT OR REPLACE INTO quizzes (id, module_id, title, pass_score) VALUES (?, ?, ?, ?)');
    const insertQuestion = db.prepare('INSERT OR REPLACE INTO quiz_questions (id, quiz_id, prompt, options, correct_option, explanation, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const quiz of activities.quizzes || []) {
      insertQuiz.run(quiz.id, quiz.moduleId, quiz.title, quiz.passScore ?? 70);
      for (const question of quiz.questions || []) {
        insertQuestion.run(question.id, quiz.id, question.prompt, JSON.stringify(question.options), question.correctOption, question.explanation || null, question.position);
      }
    }
    const insertAssignment = db.prepare('INSERT OR REPLACE INTO assignments (id, module_id, title, instructions, due_date, rubric, starter_files) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const assignment of activities.assignments || []) {
      insertAssignment.run(assignment.id, assignment.moduleId, assignment.title, assignment.instructions || null, assignment.dueDate || null, assignment.rubric || null, JSON.stringify(assignment.starterFiles || []));
    }
    const insertCapstoneDeliverable = db.prepare('INSERT OR REPLACE INTO capstone_deliverables (id, position, title, summary, rubric, related_links, deadline, lesson_id, instructor_files) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const deliverable of capstone.deliverables || []) {
      insertCapstoneDeliverable.run(deliverable.id, deliverable.position, deliverable.title, deliverable.summary || null, deliverable.rubric || null, JSON.stringify(deliverable.relatedLinks || []), deliverable.deadline || null, deliverable.lessonId || null, JSON.stringify(deliverable.instructorFiles || []));
    }
  });
  clear();
  insert();
  computeScoreForAll(db, new Date(nexaflow.metadata.referenceDate || Date.now()));
  return db;
}
