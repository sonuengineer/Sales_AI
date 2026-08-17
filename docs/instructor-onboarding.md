# Instructor Onboarding Guide

This guide shows you how to deliver the course, review student work and manage cohorts on the **Sales Intelligence, CRM & AI Automation Mastery** platform.

## 1. Sign in

Use the instructor demo account:

- Email: `instructor@nexaflow.demo`
- Password: `demo123`

Instructors can manage learning content, review submitted work and guide cohorts. Admin-only actions (deleting cohorts, managing users) stay with the admin account.

## 2. Deliver the course

Open **Courses** to view the 10 modules. You can edit module titles and summaries and add lessons, or create new modules. The seeded programme already includes one lesson per module with objectives and content.

## 3. Run the labs

- **CRM Lab** — create and edit leads, change stages, assign owners and add activities. Every change is recorded in stage history and the activity timeline.
- **Workflow Lab** — adjust scoring factors and assignment rules, apply assignments, and use the sandbox for student exercises. Changes you apply here update the shared CRM data.
- **AI Practice Lab** — review AI follow-up drafts that students create. Drafts must be approved before they can be marked sent (simulated — nothing sends automatically).

## 4. Review student work

- **Quizzes** — auto-scored; students see feedback after each attempt. You can add or edit quizzes per module.
- **Assignments** — open **Assignments**, pick an assignment, then grade each submission with a score and feedback, or return it for revision.
- **Capstones** — open **Capstones** for the review queue. Grade each of the ten deliverables, then approve the capstone or return it for revision. Approving requires all deliverables graded and produces the student's portfolio summary.

## 5. Manage cohorts

Open **Cohorts** to create a cohort with dates and an instructor, enroll students, update student status (active / pending / completed / dropped) and remove enrollments. Certificates are tied to enrollments.

## 6. Watch the reports

Open **Reports** for platform health: enrollment stats, per-student lesson progress, quiz results, submission status and capstone completion.

## 7. Issue certificates

Certificates are issued by students once they meet the criteria (80% lessons, 70% assessment, approved capstone) — you don't issue them manually. Use **Certificates** to verify a student's verification ID or view the printable certificate.

## Reset the demo

To start every cohort from clean training data, run:

```bash
npm run db:seed
```

This clears all learning progress, submissions, capstones and certificates and reloads the fictional demo data.
