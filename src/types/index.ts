export interface DashboardData { heading: string; description: string; metrics: [string, string][]; }

export interface LessonFile { id: string; name: string; label: string; description: string; contentType: string; }
export interface LessonView {
  id: string; title: string; summary: string; objectives: string[]; content: string; videoUrl: string; videoRequired: boolean; files: LessonFile[]; resources: LessonFile[]; durationMinutes: number; completed?: boolean;
}
export interface ModuleView { id: string; position: number; title: string; summary: string; lessons: LessonView[]; completedLessons: number; }
export interface CourseView { id: string; title: string; summary: string; modules: ModuleView[]; progressPercent: number; completedLessonCount: number; lessonCount: number; }

export interface LeadView {
  id: string; companyId: string; contactName: string; jobTitle: string; email: string; source: string; ownerId: string | null;
  stage: string; score: number; createdAt: string; lastActivityAt: string | null; nextActionAt: string | null; expectedValue: number;
  companyName: string; industry: string; employeeSize: string; ownerName: string | null; staleBucket: string; daysSinceLastActivity: number | null;
}
export interface CompanyView { id: string; name: string; industry: string; employeeSize: string; region: string; website: string; leadCount: number; }
export interface OpportunityView {
  id: string; companyId: string; leadId: string | null; ownerId: string | null; stage: string; amount: number; currency: string | null;
  expectedCloseDate: string | null; closedAt: string | null; lostReason: string | null; companyName: string; leadContact: string | null; ownerName: string | null;
}
export interface StageHistoryEntry { id: string; leadId: string; fromStage: string | null; toStage: string; changedById: string | null; changedAt: string; reason: string; }
export interface ActivityEntry { id: string; leadId: string; type: string; subject: string; occurredAt: string; ownerId: string | null; notes: string; }

export interface Kpis { totalLeads: number; mql: number; sql: number; opportunities: number; proposals: number; wonDeals: number; pipelineValue: number; revenue: number; winRate: number; }
export interface FunnelEntry { stage: string; count: number; }
export interface BreakdownRow { label: string; leads: number; value: number; }
export interface TatRow { leadId: string; contactName: string; companyName: string; ownerName: string; stage: string; tatDays: number | null; }

export interface ScoringFactor { id: string; category: string; label: string; field: string; operator: string; points: number; position: number; enabled: boolean; }
export interface MatchedFactor { id: string; category: string; label: string; points: number; }
export interface LeadScoreRow { id: string; contactName: string; companyName: string; stage: string; score: number; matched: MatchedFactor[]; }
export interface AssignmentRule { id: string; name: string; priority: number; field: string; operator: string; value: string; assignTo: string | null; enabled: boolean; }
export interface SalespersonView { id: string; name: string; capacity: number | null; openLeads: number; }
export interface AssignmentResultRow { leadId: string; contactName: string; companyName: string; currentOwnerId: string | null; suggestedOwnerId: string | null; currentOwnerName: string | null; suggestedOwnerName: string | null; ruleName: string | null; reason: string; }
export interface WorkflowStep { id: string; workflow: string; position: number; name: string; description: string; actor: string; condition: string; }
export interface WorkflowView { id: string; name: string; description: string; steps: WorkflowStep[]; }
export interface SandboxRowResult { id: string; contactName: string; companyName: string; baseScore: number; newScore: number; baseOwnerId: string | null; baseOwnerName: string | null; newOwnerId: string | null; newOwnerName: string | null; ruleName: string | null; reason: string; }
export interface SandboxSummary { scoreUp: number; scoreDown: number; reassigned: number; }
export interface SandboxRun { id: string; name: string; creatorName: string; createdAt: string; summary: SandboxSummary; }
export interface SandboxRunDetail { id: string; name: string; createdAt: string; factors: ScoringFactor[]; rules: AssignmentRule[]; results: { results: SandboxRowResult[]; summary: SandboxSummary }; }

export interface AiTemplate { id: string; name: string; description: string; requires: string[]; }
export interface AiRunSummary { id: string; templateId: string; templateName: string; createdAt: string; }
export interface AiRunDetail { id: string; templateId: string; createdAt: string; input: { companyId: string | null; leadId: string | null; text: string }; output: Record<string, unknown>; }
export interface AiFollowup { id: string; leadId: string; contactName: string; companyName: string; draft: string; status: 'DRAFT' | 'APPROVED' | 'SENT'; createdAt: string; updatedAt: string; approvedAt: string | null; sentAt: string | null; }

export interface QuizSummary { id: string; moduleId: string; moduleTitle: string; modulePosition: number; title: string; passScore: number; questionCount: number; attempts: { taken: number; passed: boolean; bestScore: number | null }; }
export interface QuizQuestion { id: string; prompt: string; options: string[]; position: number; }
export interface QuizDetail { id: string; moduleTitle: string; modulePosition: number; title: string; passScore: number; questions: QuizQuestion[]; }
export interface QuizReviewItem { questionId: string; prompt: string; options: string[]; selected: number; correctOption: number; explanation: string | null; isCorrect: boolean; }
export interface QuizAttempt { id: string; quizId: string; score: number; passed: boolean; correct?: number; total?: number; submittedAt: string; review?: QuizReviewItem[]; }

export interface SubmissionView { id: string; assignmentId: string; body: string; links: string; score: number | null; feedback: string; status: string; submittedAt: string; gradedAt: string | null; }
export interface SubmissionReviewRow extends SubmissionView { studentName?: string; assignmentTitle?: string; }
export interface AssignmentSummary { id: string; moduleId: string; moduleTitle: string; modulePosition: number; title: string; dueDate: string | null; status: 'pending' | 'submitted' | 'reviewed' | 'returned' | 'overdue'; latestSubmission: SubmissionView | null; }
export interface AssignmentDetail { id: string; moduleTitle: string; modulePosition: number; title: string; instructions: string; dueDate: string | null; rubric: string; status: string; }
export interface ActivitiesProgress { quizzes: { total: number; taken: number; passed: number; pending: number }; assignments: { total: number; pending: number; submitted: number; reviewed: number; returned: number; overdue: number }; progressPercent: number; }

export interface CapstoneRelatedLink { label: string; target: string; }
export interface CapstoneLessonRef { id: string; title: string; moduleTitle: string; modulePosition: number; files: LessonFile[]; workedExample: string; }
export interface CapstoneDeliverable { id: string; position: number; title: string; summary: string; rubric: string; deadline: string | null; relatedLinks: CapstoneRelatedLink[]; lesson: CapstoneLessonRef | null; instructorFiles: LessonFile[]; }
export interface CapstoneSubmissionView { id: string; deliverableId: string; body: string; links: string; score: number | null; feedback: string; status: 'submitted' | 'graded' | 'returned'; submittedAt: string; gradedAt: string | null; }
export interface CapstoneItem extends CapstoneDeliverable { submission: CapstoneSubmissionView | null; }
export interface CapstonePortfolio { title: string; completedAt: string | null; finalScore: number | null; feedback: string; deliverables: { title: string; position: number; score: number | null }[]; }
export interface CapstoneWorkspace { capstone: { id: string; status: string; submittedAt: string | null; reviewedAt: string | null; finalScore: number | null; finalFeedback: string }; deliverables: CapstoneItem[]; progress: { total: number; submitted: number; graded: number; canSubmit: boolean }; portfolio: CapstonePortfolio | null; }
export interface CapstoneReviewRow { id: string; studentName: string; status: string; submitted: number; graded: number; total: number; finalScore: number | null; submittedAt: string | null; reviewedAt: string | null; }
export interface CapstoneReviewDetail { capstone: { id: string; status: string; finalScore: number | null; finalFeedback: string }; studentName: string; deliverables: CapstoneItem[]; }

export interface CohortSummary { id: string; name: string; courseId: string; instructorId: string | null; instructorName: string | null; startDate: string | null; endDate: string | null; status: string; createdAt: string; studentCount: number; }
export interface EnrollmentView { id: string; studentId: string; studentName: string; studentEmail: string; progressPercent: number; status: string; enrolledAt: string; completedAt: string | null; }
export interface CohortDetail extends CohortSummary { enrollments: EnrollmentView[]; }
export interface UserRow { id: string; name: string; email: string; role: string; }

export interface CertificateCriteria { value: number; required: number; met: boolean; }
export interface CertificateEligibility { lessons: CertificateCriteria; assessment: CertificateCriteria; capstone: CertificateCriteria; eligible: boolean; }
export interface CertificateView { id: string; verificationId: string; issuedAt: string; learnerName?: string; courseName?: string; }

export interface ReportData { generatedAt: string; enrollment: { total: number; active: number; completed: number; dropped: number; pending: number }; cohorts: { id: string; name: string; status: string; student_count: number }[]; lessonProgress: { studentId: string; studentName: string; completedLessons: number; totalLessons: number; percent: number }[]; quizzes: { total: number; taken: number; passed: number; avgBestScore: number | null }; submissions: { total: number; submitted: number; graded: number; returned: number; pendingReview: number }; capstones: { total: number; approved: number; submitted: number; avgFinalScore: number | null }; }
