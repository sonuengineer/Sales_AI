# Data Model — Phase 0

## Principles

- All records are fictional training data. `isDemoData` is retained on seeded records and displayed in the product.
- IDs are immutable UUIDs in production; concise IDs appear in seed data only for readability.
- Data is scoped to an organisation. Students receive a cohort and sandbox scope; they do not alter shared base data.
- Timestamps are stored in UTC. Money uses an ISO currency code and integer minor units in the database.

## Identity and learning

| Entity | Key fields | Relationships |
| --- | --- | --- |
| Role | id, name (`ADMIN`, `INSTRUCTOR`, `STUDENT`) | assigned to users |
| User | id, name, email, passwordHash, roleId, status | enrollments, submissions, quiz attempts, owned CRM records |
| Course | id, title, summary, status | modules, cohorts, certificates |
| Module | id, courseId, position, title, summary | lessons, quizzes, assignments |
| Lesson | id, moduleId, title, objectives, content, videoUrl, files, durationMinutes | completion records by enrollment |
| Cohort | id, courseId, instructorId, name, startDate, endDate, status | enrollments |
| Enrollment | id, cohortId, studentId, progressPercent, status | lesson completion, quiz attempts, submissions |
| Quiz | id, moduleId, title, passScore | questions, attempts |
| QuizQuestion | id, quizId, prompt, options, correctOption, explanation | belongs to a quiz |
| QuizAttempt | id, quizId, enrollmentId, answers, score, submittedAt | belongs to a student enrollment |
| Assignment | id, moduleId, instructions, dueDate, rubric, starterFiles | submissions |
| Submission | id, assignmentId, enrollmentId, body, links, files, score, feedback, status | reviewed by an instructor |
| Certificate | id, enrollmentId, verificationId, issuedAt | issued only after criteria are met |

## Training CRM

| Entity | Key fields | Relationships |
| --- | --- | --- |
| Company | id, name, industry, employeeSize, region, website, isDemoData | leads, opportunities |
| Lead | id, companyId, contactName, jobTitle, email, source, ownerId, stage, score, createdAt, lastActivityAt, nextActionAt, expectedValue | activities, stage history; optionally becomes an opportunity |
| Activity | id, leadId, type, subject, occurredAt, ownerId, notes | timeline event for a lead |
| Opportunity | id, companyId, leadId, ownerId, stage, amount, currency, expectedCloseDate, closedAt, lostReason | follows a qualified lead |
| Salesperson | id, userId, territory, capacity | owns leads and opportunities |
| LeadStageHistory | id, leadId, fromStage, toStage, changedById, changedAt, reason | audit trail; required for every stage change |

Lead stages are `NEW`, `MQL`, `SQL`, `OPPORTUNITY`, `PROPOSAL`, `CLOSED_WON`, and `CLOSED_LOST`.

## Teaching assets and automation

| Entity | Key fields | Relationships |
| --- | --- | --- |
| Dataset | id, name, description, storagePath, isDemoData | used in labs and assignments |
| Workflow | id, name, trigger, rules, active, sandboxOnly | uses lead and activity data |
| SOP | id, title, purpose, ownerId, version, content | linked to modules/capstone work |

## Rules to enforce in later phases

1. A user has one platform role for V1; authorisation occurs server-side for every request.
2. A student can access only their enrollment, cohort resources and assigned CRM sandbox.
3. `LeadStageHistory` and `Activity` records are append-only audit records.
4. A certificate requires 80% lesson completion, 70% assessment score, and approved capstone.
5. Simulated AI follow-ups remain drafts until explicitly approved by a learner or instructor.
