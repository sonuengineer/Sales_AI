import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function getCourse(base: string, cookie: string) {
  const response = await fetch(`${base}/api/courses`, { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return (await response.json()).course;
}

describe('course delivery', () => {
  it('exposes the full 10-module programme to any signed-in user', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const course = await getCourse(base, cookie);
      expect(course.modules.length).toBe(10);
      expect(course.lessonCount).toBe(10);
      expect(course.progressPercent).toBe(0);
      expect(course.modules[0].position).toBe(1);
      expect(course.modules.every((module: { lessons: unknown[] }) => module.lessons.length >= 1)).toBe(true);
      expect(course.modules.every((module: { lessons: { completed: boolean }[] }) => module.lessons.every((lesson) => lesson.completed === false))).toBe(true);
    });
  });

  it('requires authentication for course content', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/courses`)).status).toBe(401);
      expect((await fetch(`${base}/api/lessons/lesson-01`)).status).toBe(401);
    });
  });

  it('students cannot manage content but can complete lessons with server-side progress', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const forbidden = await fetch(`${base}/api/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ moduleId: 'mod-01', title: 'Not allowed' }) });
      expect(forbidden.status).toBe(403);
      const complete = await fetch(`${base}/api/lessons/lesson-01/complete`, { method: 'POST', headers: { Cookie: cookie } });
      expect(complete.status).toBe(200);
      const progress = await (await fetch(`${base}/api/learning/progress`, { headers: { Cookie: cookie } })).json();
      expect(progress.completedLessonCount).toBe(1);
      expect(progress.lessonCount).toBe(10);
      expect(progress.progressPercent).toBe(10);
      const course = await getCourse(base, cookie);
      expect(course.modules[0].lessons[0].completed).toBe(true);
      expect(course.modules[0].completedLessons).toBe(1);
      const lesson = await (await fetch(`${base}/api/lessons/lesson-01`, { headers: { Cookie: cookie } })).json();
      expect(lesson.lesson.completed).toBe(true);
    });
  });

  it('instructors can add and edit modules and lessons without changing code', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      const moduleResponse = await fetch(`${base}/api/modules`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ title: 'Bonus Module', summary: 'Extra practice' }) });
      expect(moduleResponse.status).toBe(201);
      const { module } = await moduleResponse.json();
      const lessonResponse = await fetch(`${base}/api/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ moduleId: module.id, title: 'Bonus lesson', summary: 'Extra lesson summary', objectives: ['First objective', 'Second objective'], content: 'Lesson body text', videoUrl: 'https://example.com/video', videoRequired: 1, durationMinutes: 9 }) });
      expect(lessonResponse.status).toBe(201);
      const { lesson } = await lessonResponse.json();
      expect(lesson.objectives).toEqual(['First objective', 'Second objective']);
      expect(lesson.content).toBe('Lesson body text');
      expect(lesson.videoRequired).toBe(1);
      const updated = await fetch(`${base}/api/lessons/${lesson.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ title: 'Renamed lesson', objectives: ['Only objective'], videoRequired: 0 }) });
      expect(updated.status).toBe(200);
      expect((await updated.json()).lesson.title).toBe('Renamed lesson');
      const renamedModule = await fetch(`${base}/api/modules/${module.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ title: 'Renamed module' }) });
      expect(renamedModule.status).toBe(200);
      expect((await renamedModule.json()).module.title).toBe('Renamed module');
      const course = await getCourse(base, cookie);
      expect(course.modules.length).toBe(11);
      expect(course.lessonCount).toBe(11);
      const bonus = course.modules.find((entry: { id: string }) => entry.id === module.id)!.lessons[0] as { title: string; videoRequired: boolean };
      expect(bonus.title).toBe('Renamed lesson');
      expect(bonus.videoRequired).toBe(false);
      const detail = await (await fetch(`${base}/api/lessons/${lesson.id}`, { headers: { Cookie: cookie } })).json();
      expect(detail.lesson.videoRequired).toBe(false);
    });
  });

  it('the seeded lesson-01 video is marked required and surfaces on lesson detail', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const course = await getCourse(base, cookie);
      const first = course.modules[0].lessons[0] as { videoUrl: string; videoRequired: boolean };
      expect(first.videoUrl).toContain('youtube');
      expect(first.videoRequired).toBe(true);
      const detail = await (await fetch(`${base}/api/lessons/lesson-01`, { headers: { Cookie: cookie } })).json();
      expect(detail.lesson.videoRequired).toBe(true);
    });
  });

  it('admins can edit the course title and summary', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'admin@nexaflow.demo');
      const response = await fetch(`${base}/api/courses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ title: 'Renamed programme', summary: 'Updated summary' }) });
      expect(response.status).toBe(200);
      const course = await getCourse(base, cookie);
      expect(course.title).toBe('Renamed programme');
      expect(course.summary).toBe('Updated summary');
    });
  });

  it('every lesson ships downloadable starter files with metadata', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const course = await getCourse(base, cookie);
      for (const module of course.modules) {
        for (const lesson of module.lessons) {
          expect(lesson.files.length).toBeGreaterThan(0);
          for (const file of lesson.files) {
            expect(typeof file.id).toBe('string');
            expect(file.id.length).toBeGreaterThan(0);
            expect(typeof file.name).toBe('string');
            expect(file.label.length).toBeGreaterThan(0);
            expect(typeof file.contentType).toBe('string');
            expect('content' in file).toBe(false); // bodies are not leaked into list views
          }
        }
      }
    });
  });

  it('lesson files download with the right content type and require authentication', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/lesson-files/file-l1-1`)).status).toBe(401);
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const response = await fetch(`${base}/api/lesson-files/file-l1-1`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      const body = await response.text();
      expect(body).toContain('lead_id,company,contact');
      expect(body).toContain('AtlasHR');
      const markdown = await fetch(`${base}/api/lesson-files/file-l1-2`, { headers: { Cookie: cookie } });
      expect(markdown.status).toBe(200);
      expect(markdown.headers.get('content-type')).toContain('text/markdown');
      expect((await fetch(`${base}/api/lesson-files/file-nope`, { headers: { Cookie: cookie } })).status).toBe(404);
    });
  });

  it('lesson content includes a worked example and practice questions with answers', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const course = await getCourse(base, cookie);
      for (const module of course.modules) {
        for (const lesson of module.lessons) {
          expect(lesson.content).toContain('## Worked example');
          expect(lesson.content).toContain('## Practice questions');
          expect(lesson.content).toContain('### Check your answers');
        }
      }
    });
  });

  it('instructors can attach files to lessons and they download back', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      const response = await fetch(`${base}/api/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ moduleId: 'mod-01', title: 'Lesson with files', files: [{ id: 'file-custom-1', name: 'handout.csv', label: 'Custom handout', contentType: 'text/csv', content: 'a,b\n1,2' }] }) });
      expect(response.status).toBe(201);
      const { lesson } = await response.json();
      expect(lesson.files[0].name).toBe('handout.csv');
      const download = await fetch(`${base}/api/lesson-files/file-custom-1`, { headers: { Cookie: cookie } });
      expect(download.status).toBe(200);
      expect(await download.text()).toBe('a,b\n1,2');
      const detail = await fetch(`${base}/api/lessons/${lesson.id}`, { headers: { Cookie: cookie } });
      expect((await detail.json()).lesson.files[0].name).toBe('handout.csv');
    });
  });

  it('instructors can attach resources per lesson and students see and download them', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      // Students cannot modify a lesson's resources.
      const forbidden = await fetch(`${base}/api/lessons/lesson-01/resources`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: student }, body: JSON.stringify({ resources: [] }) });
      expect(forbidden.status).toBe(403);
      // Attach two resources — ids are optional on input and assigned server-side.
      const attach = await fetch(`${base}/api/lessons/lesson-01/resources`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: instructor }, body: JSON.stringify({ resources: [{ name: 'extra-reading.md', label: 'Additional reading', contentType: 'text/markdown', content: '# Extra reading\n\nDeep dive.' }, { name: 'cheatsheet.pdf', label: 'Cheat sheet' }] }) });
      expect(attach.status).toBe(200);
      const { resources } = await attach.json();
      expect(resources.length).toBe(2);
      expect(resources[0].id).toBeTruthy();
      expect(resources[1].id).toBeTruthy();
      expect('content' in resources[0]).toBe(false); // bodies are not leaked
      // Lesson detail exposes the resources to any signed-in user.
      const detail = await (await fetch(`${base}/api/lessons/lesson-01`, { headers: { Cookie: student } })).json();
      expect(detail.lesson.resources.length).toBe(2);
      expect(detail.lesson.resources[0].name).toBe('extra-reading.md');
      // The course list carries them too (used by the Resources page).
      const course = await getCourse(base, student);
      expect(course.modules[0].lessons[0].resources.length).toBe(2);
      // Downloads work with auth and 404 once removed.
      const fileId = resources[0].id;
      expect((await fetch(`${base}/api/lesson-resources/${fileId}`)).status).toBe(401);
      const download = await fetch(`${base}/api/lesson-resources/${fileId}`, { headers: { Cookie: student } });
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toContain('text/markdown');
      expect(download.headers.get('content-disposition')).toContain('attachment');
      expect(await download.text()).toContain('Deep dive.');
      const remove = await fetch(`${base}/api/lessons/lesson-01/resources`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: instructor }, body: JSON.stringify({ resources: resources.slice(1) }) });
      expect(remove.status).toBe(200);
      expect((await remove.json()).resources.length).toBe(1);
      expect((await fetch(`${base}/api/lesson-resources/${fileId}`, { headers: { Cookie: student } })).status).toBe(404);
      expect((await fetch(`${base}/api/lesson-resources/does-not-exist`, { headers: { Cookie: student } })).status).toBe(404);
    });
  });
});
