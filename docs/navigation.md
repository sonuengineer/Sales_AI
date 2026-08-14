# Application Navigation — Phase 0

## Shared navigation

- **Sign in** is public.
- Authenticated users have a header with notifications, help, profile and sign out.
- Every page presents a title, plain-language description, loading state, empty state and error state.

## Admin

`Dashboard` · `Users` · `Courses` · `Cohorts` · `Reports` · `Certificates` · `Settings`

The admin dashboard focuses on enrollment, completion, assessment and capstone health. Admin can administer all platform content and reports but does not need to be a daily CRM operator.

## Instructor

`Dashboard` · `Courses` · `Cohorts` · `CRM Lab` · `Assignments` · `Quizzes` · `Capstones` · `Profile`

Instructor CRM Lab contains Companies, Leads, Activities and Opportunities. Instructors manage teaching content, review submitted work and guide assigned cohorts.

## Student

`My Learning` · `CRM Lab` · `Dashboard` · `Assignments` · `AI Practice Lab` · `Capstone` · `Profile`

Students see only their own learning progress, submitted work and assigned fictional CRM records. Navigation will clarify that CRM data and AI outputs are simulated training material.

## Route protection

| Route area | Allowed roles |
| --- | --- |
| `/admin/*` | Admin |
| `/instructor/*` | Admin, Instructor |
| `/learn/*`, `/student/*` | Admin, Instructor, Student with scoped content |
| `/crm/*` | Admin, Instructor, Student with record scope |
| `/profile` | Any authenticated user |

Unauthorized routes render an access-denied page and never return protected data.
