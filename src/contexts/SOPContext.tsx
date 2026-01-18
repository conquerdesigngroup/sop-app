import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { SOP, SOPStatus } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { logActivity } from '../utils/activityLogger';

interface SOPContextType {
  sops: SOP[];
  addSOP: (sop: Omit<SOP, 'id' | 'createdAt'>) => Promise<void>;
  updateSOP: (id: string, sop: Partial<SOP>) => Promise<void>;
  deleteSOP: (id: string) => Promise<void>;
  getSOPById: (id: string) => SOP | undefined;
  getSOPsByCategory: (category: string) => SOP[];
  updateSOPStatus: (id: string, status: SOPStatus) => Promise<void>;
  archiveSOP: (id: string) => Promise<void>;
  restoreSOP: (id: string) => Promise<void>;
  createFromTemplate: (templateId: string) => Promise<void>;
  saveAsTemplate: (id: string) => Promise<void>;
  loading: boolean;
}

const SOPContext = createContext<SOPContextType | undefined>(undefined);

export const useSOPs = () => {
  const context = useContext(SOPContext);
  if (!context) {
    throw new Error('useSOPs must be used within a SOPProvider');
  }
  return context;
};

// Helper function to convert Supabase SOP to App SOP type
const mapSupabaseSOPToSOP = (dbSOP: any): SOP => {
  return {
    id: dbSOP.id,
    title: dbSOP.title,
    description: dbSOP.description,
    department: dbSOP.department,
    category: dbSOP.category,
    icon: dbSOP.icon,
    imageUrl: dbSOP.image_url,
    steps: dbSOP.steps || [],
    tags: dbSOP.tags || [],
    status: dbSOP.status as SOPStatus,
    isTemplate: dbSOP.is_template || false,
    templateOf: dbSOP.template_of,
    createdAt: dbSOP.created_at,
    createdBy: dbSOP.created_by,
    updatedAt: dbSOP.updated_at,
  };
};

interface SOPProviderProps {
  children: ReactNode;
}

// Default SOPs
const defaultSOPs: SOP[] = [
  {
    id: 'sop_default_accounts_receivable',
    title: 'Remote Accounts Receivable Assistant',
    description: 'Standard operating procedures for managing accounts receivable, tuition, fees, and financial records.',
    department: 'Admin',
    category: 'Finance & Accounting',
    icon: 'box',
    tags: ['finance', 'accounting', 'receivables', 'tuition'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Post Tuition and Fees',
        description: 'Review and post all incoming tuition and fee payments to student accounts. Verify payment amounts match invoices and ensure proper allocation to correct accounts. Document any discrepancies immediately.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Manage Autopay and Manual Payments',
        description: 'Process recurring autopay transactions and manual payment submissions. Verify payment methods are valid, confirm successful transactions, and send payment confirmation receipts to students.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Monitor Outstanding Balances',
        description: 'Review aging reports daily to identify outstanding balances. Flag accounts with overdue payments and prioritize follow-up based on balance age and amount.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Send Reminders and Follow-ups',
        description: 'Send payment reminders to students with upcoming or overdue balances. Use email templates for initial reminders, and escalate to phone calls for accounts 30+ days overdue. Document all communication.',
      },
      {
        id: 'step_5',
        order: 5,
        title: 'Record Refunds, Discounts, and Credits',
        description: 'Process approved refunds, apply authorized discounts, and record account credits. Ensure all adjustments have proper documentation and approvals before posting to student accounts.',
      },
      {
        id: 'step_6',
        order: 6,
        title: 'Maintain Financial Records and Reporting',
        description: 'Generate and maintain accurate financial reports including aging reports, payment summaries, and collection metrics. Archive records according to retention policy and prepare monthly reconciliation reports.',
      },
    ],
  },
  {
    id: 'sop_default_reporting',
    title: 'Monthly Reporting and Reconciliation',
    description: 'Standard operating procedures for generating monthly income reports and class tuition reconciliation.',
    department: 'Admin',
    category: 'Finance & Accounting',
    icon: 'box',
    tags: ['reporting', 'reconciliation', 'income', 'tuition'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Monthly Income Report',
        description: 'Generate Income by Category Report and Payment Report. Export and upload to shared drive by the 5th of each month. Include screenshot placeholder for Monthly Income Report documentation.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Class Tuition Reconciliation',
        description: 'Verify posted tuition matches enrollment. Use Tuition Charges by Class Report for audit to ensure accuracy and identify any discrepancies between enrolled students and posted charges.',
      },
    ],
  },
  {
    id: 'sop_tuition_posting_billing',
    title: 'Tuition Posting & Billing',
    description: 'Procedures for posting monthly tuition and processing additional charges in DSP.',
    department: 'Admin',
    category: 'Finance & Accounting',
    icon: 'box',
    tags: ['tuition', 'billing', 'DSP', 'charges'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Monthly Tuition Posting',
        description: '1. Log in to DSP\n2. Go to Finances > Ledger / Transactions\n3. Select Batch Post Tuition\n4. Choose: Month/Date, Programs or Classes, Post Tuition to All Active Students\n5. Review and click Post\n\n💡 Double-check class fees and any prorated amounts before posting.\n📸 Screenshot Placeholder: DSP Batch Post Tuition Screen',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Processing Additional Charges',
        description: 'Manually post other charges like:\n• Registration Fees\n• Competition Fees\n• Costume Deposits\n\nSteps:\n1. Go to Ledger > Add Transaction\n2. Select student/family, add amount, category, and description\n\n📸 Screenshot Placeholder: Add Transaction in DSP',
      },
    ],
  },
  {
    id: 'sop_payment_processing',
    title: 'Payment Processing',
    description: 'Comprehensive procedures for processing autopay, manual payments, refunds, and credits.',
    department: 'Admin',
    category: 'Finance & Accounting',
    icon: 'box',
    tags: ['payments', 'autopay', 'refunds', 'credits'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Autopay (Auto-Charge)',
        description: '• Review the Autopay Summary before the 1st of each month\n• Communicate with families with expired cards or failed charges\n• Run Auto-Charge via Finances > Auto-Pay on the 1st or as scheduled\n\n⚠️ Follow up on failed charges within 2 business days.\n📸 Screenshot Placeholder: Auto-Pay Management Screen',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Manual Payments',
        description: 'For checks, Venmo, PayPal, or cash:\n1. Go to Ledger > Add Transaction > Payment\n2. Enter amount, date, and payment method\n3. Add notes if needed (e.g., "July Tuition Check #1034")',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Refunds or Credits',
        description: 'Process only upon approval by studio director.\n\nSteps:\n1. Enter in DSP via: Ledger > Add Transaction > Credit or Refund\n2. Include reason in description field',
      },
    ],
  },
  {
    id: 'sop_outstanding_balances',
    title: 'Follow-up on Outstanding Balances',
    description: 'Procedures for monitoring, communicating, and managing overdue accounts and late fees.',
    department: 'Admin',
    category: 'Finance & Accounting',
    icon: 'box',
    tags: ['collections', 'overdue', 'late fees', 'follow-up'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Weekly Review',
        description: '1. Go to Finances > Reports > Aged Accounts\n2. Export and filter by families with balances 15+ days overdue\n3. Send friendly reminder email with statement\n\n📸 Screenshot Placeholder: Aged Accounts Report',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Monthly Final Notices',
        description: 'On the 25th of the month, send final payment notices.\n\nInclude:\n• Balance due\n• Last day to pay before late fee\n• Payment methods accepted',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Late Fees',
        description: 'On the 1st of the following month:\n1. Go to Batch Post Late Fees\n2. Filter students over X days past due\n3. Post late fee (e.g., $10)',
      },
    ],
  },
  {
    id: 'sop_communication',
    title: 'Communication Protocols',
    description: 'Guidelines for communicating with families regarding account inquiries and billing matters.',
    department: 'Admin',
    category: 'Operations',
    icon: 'box',
    tags: ['communication', 'customer service', 'messaging', 'inquiries'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Communication Channels',
        description: '• Use studio email or DSP messaging for family account inquiries\n• Respond to messages within 48 hours\n• Forward unresolved billing disputes to the studio director',
      },
    ],
  },
  {
    id: 'sop_file_storage_backup',
    title: 'File Storage & Backup',
    description: 'Procedures for organizing and storing financial reports and documentation.',
    department: 'Admin',
    category: 'Operations',
    icon: 'box',
    tags: ['storage', 'backup', 'documentation', 'google drive'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Monthly Report Storage',
        description: 'Save reports monthly in Google Drive:\n• Path: /Finance/Accounts Receivable/YYYY-MM/\n• Keep all refund requests and approvals in a shared log',
      },
    ],
  },
  {
    id: 'sop_confidentiality',
    title: 'Confidentiality Policy',
    description: 'Guidelines for maintaining confidentiality of family financial records and communications.',
    department: 'Admin',
    category: 'Policy & Compliance',
    icon: 'box',
    tags: ['confidentiality', 'privacy', 'security', 'compliance'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Confidentiality Requirements',
        description: 'All family financial records and communication are confidential. Do not share access or account information with unauthorized parties.',
      },
    ],
  },
  {
    id: 'sop_review_updates',
    title: 'Review & Updates',
    description: 'Guidelines for reviewing and updating standard operating procedures.',
    department: 'Admin',
    category: 'Policy & Compliance',
    icon: 'box',
    tags: ['review', 'updates', 'maintenance', 'policy'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Quarterly Review Process',
        description: 'This SOP will be reviewed quarterly. Updates may be required after software updates or policy changes. Ensure all procedures remain current and aligned with studio operations.',
      },
    ],
  },
  // Teachers Department SOPs
  {
    id: 'sop_teachers_classroom_management',
    title: 'Classroom Management',
    description: 'Best practices for managing classroom behavior, student engagement, and creating a positive learning environment.',
    department: 'Teachers',
    category: 'Teaching & Instruction',
    icon: 'box',
    tags: ['classroom', 'management', 'behavior', 'engagement'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Set Clear Expectations',
        description: 'Establish and communicate classroom rules and expectations at the beginning of each class. Review behavioral expectations regularly and ensure all students understand the standards.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Positive Reinforcement',
        description: 'Use positive reinforcement techniques to encourage desired behaviors. Recognize and praise students for following instructions, showing effort, and demonstrating good behavior.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Redirect Disruptive Behavior',
        description: 'Address disruptive behavior promptly and professionally. Use non-verbal cues, proximity control, and private conversations to redirect students without disrupting the entire class.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Maintain Consistent Routines',
        description: 'Establish consistent classroom routines for entering class, transitions between activities, and ending class. Predictable structure helps students feel secure and focused.',
      },
    ],
  },
  {
    id: 'sop_teachers_lesson_planning',
    title: 'Lesson Planning & Preparation',
    description: 'Guidelines for creating effective lesson plans that align with curriculum goals and student needs.',
    department: 'Teachers',
    category: 'Teaching & Instruction',
    icon: 'box',
    tags: ['lesson planning', 'curriculum', 'preparation', 'instruction'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Define Learning Objectives',
        description: 'Identify clear, measurable learning objectives for each lesson. Ensure objectives align with curriculum standards and student skill levels.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Plan Instructional Activities',
        description: 'Design engaging activities that help students achieve the learning objectives. Include a mix of demonstration, practice, and application activities.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Prepare Materials and Resources',
        description: 'Gather all necessary materials, equipment, and resources before class. Test any technology or equipment to ensure everything is functioning properly.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Plan for Assessment',
        description: 'Include formative assessment strategies to check for student understanding throughout the lesson. Plan how you will evaluate whether learning objectives were met.',
      },
    ],
  },
  {
    id: 'sop_teachers_parent_communication',
    title: 'Parent Communication',
    description: 'Best practices for maintaining positive, professional communication with parents and guardians.',
    department: 'Teachers',
    category: 'Communication',
    icon: 'box',
    tags: ['parents', 'communication', 'engagement', 'updates'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Regular Progress Updates',
        description: 'Provide regular updates on student progress, both positive achievements and areas for improvement. Share specific examples and observations.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Respond Promptly to Inquiries',
        description: 'Respond to parent emails or messages within 24-48 hours. If unable to provide a complete answer immediately, acknowledge receipt and provide a timeline for full response.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Document All Communications',
        description: 'Keep records of all parent communications, including dates, topics discussed, and any action items or follow-up needed.',
      },
    ],
  },
  // Directors Department SOPs
  {
    id: 'sop_directors_staff_management',
    title: 'Staff Management & Supervision',
    description: 'Guidelines for managing teaching staff, conducting evaluations, and maintaining team performance.',
    department: 'Directors',
    category: 'Human Resources',
    icon: 'box',
    tags: ['staff', 'management', 'supervision', 'HR'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Conduct Regular Staff Meetings',
        description: 'Hold weekly or bi-weekly staff meetings to discuss updates, address concerns, and maintain team cohesion. Create agendas in advance and distribute meeting notes afterward.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Perform Staff Evaluations',
        description: 'Conduct formal performance evaluations at least twice per year. Provide constructive feedback, recognize achievements, and set goals for professional development.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Address Performance Issues',
        description: 'Address performance concerns promptly and professionally. Document issues, meet privately with staff members, and create improvement plans with clear expectations and timelines.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Support Professional Development',
        description: 'Provide opportunities for staff training and professional growth. Encourage attendance at workshops, conferences, and continuing education programs.',
      },
    ],
  },
  {
    id: 'sop_directors_program_development',
    title: 'Program Development & Curriculum',
    description: 'Procedures for developing, reviewing, and updating programs and curriculum offerings.',
    department: 'Directors',
    category: 'Academic Planning',
    icon: 'box',
    tags: ['curriculum', 'program development', 'planning', 'academics'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Assess Current Programs',
        description: 'Review enrollment data, student feedback, and industry trends to evaluate the effectiveness of current programs. Identify gaps and opportunities for improvement.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Research and Plan New Offerings',
        description: 'Research market demand, competitor offerings, and industry best practices. Develop proposals for new programs including objectives, curriculum outline, and resource requirements.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Pilot and Test Programs',
        description: 'Launch new programs as pilot offerings. Gather feedback from students and instructors, monitor enrollment and retention, and make adjustments as needed.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Review and Update Curriculum',
        description: 'Review curriculum annually to ensure it remains current and aligned with learning objectives. Update materials, techniques, and resources to reflect best practices.',
      },
    ],
  },
  {
    id: 'sop_directors_strategic_planning',
    title: 'Strategic Planning & Goal Setting',
    description: 'Framework for developing strategic plans, setting organizational goals, and tracking progress.',
    department: 'Directors',
    category: 'Leadership & Strategy',
    icon: 'box',
    tags: ['strategic planning', 'goals', 'leadership', 'vision'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Define Vision and Mission',
        description: 'Articulate the organization\'s vision and mission. Ensure these statements reflect core values and long-term aspirations.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Set SMART Goals',
        description: 'Establish Specific, Measurable, Achievable, Relevant, and Time-bound goals. Include both short-term (quarterly) and long-term (annual) objectives.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Create Action Plans',
        description: 'Develop detailed action plans for each goal including specific tasks, responsible parties, deadlines, and required resources.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Monitor and Adjust',
        description: 'Track progress monthly. Review key performance indicators, celebrate wins, address obstacles, and adjust strategies as needed to stay on track.',
      },
    ],
  },
  // Student Accounts Department SOPs
  {
    id: 'sop_student_accounts_registration',
    title: 'Student Registration & Enrollment',
    description: 'Complete procedures for registering new students, collecting required documentation, and setting up student accounts in the system.',
    department: 'Student Accounts',
    category: 'Enrollment & Registration',
    icon: 'user',
    tags: ['registration', 'enrollment', 'new students', 'documentation'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Collect Required Documentation',
        description: 'Gather all necessary documents including birth certificate, immunization records, proof of residence, emergency contact information, and any special needs documentation.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Create Student Account',
        description: 'Enter student information into the management system including personal details, guardian information, medical information, and any special accommodations needed.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Process Enrollment Forms',
        description: 'Review and process all enrollment forms including tuition agreements, policy acknowledgments, photo release forms, and transportation authorization.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Finalize and Confirm',
        description: 'Verify all information is complete and accurate. Send welcome packet to family with account information, class assignment, start date, and important contact information.',
      },
    ],
  },
  {
    id: 'sop_student_accounts_billing',
    title: 'Billing & Payment Processing',
    description: 'Guidelines for managing student account billing, processing payments, handling payment plans, and addressing account issues.',
    department: 'Student Accounts',
    category: 'Financial Management',
    icon: 'settings',
    tags: ['billing', 'payments', 'tuition', 'accounts receivable'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Generate Monthly Invoices',
        description: 'Create and distribute monthly invoices to all active student accounts by the 1st of each month. Include tuition, fees, and any additional charges.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Process Incoming Payments',
        description: 'Record all payments received (cash, check, credit card, ACH) in the system. Apply payments to correct accounts and send payment confirmations to families.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Manage Payment Plans',
        description: 'Set up and monitor payment plans for families who need alternative payment schedules. Track payment plan compliance and follow up on missed payments.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Handle Past Due Accounts',
        description: 'Send reminder notices for past due accounts at 7, 14, and 30 days. Contact families to discuss payment options and escalate to management if needed.',
      },
    ],
  },
  {
    id: 'sop_student_accounts_records',
    title: 'Records Management & Compliance',
    description: 'Procedures for maintaining accurate student records, ensuring data privacy, and meeting regulatory compliance requirements.',
    department: 'Student Accounts',
    category: 'Compliance & Documentation',
    icon: 'layout',
    tags: ['records', 'compliance', 'privacy', 'documentation'],
    status: 'published',
    isTemplate: false,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Maintain Accurate Records',
        description: 'Ensure all student records are complete, up-to-date, and properly filed. Update records promptly when receiving new information from families.',
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Ensure Data Security',
        description: 'Protect student information according to privacy laws (FERPA). Limit access to authorized personnel only and use secure systems for storing sensitive data.',
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Process Records Requests',
        description: 'Handle requests for student records from families, schools, or authorized parties. Verify authorization and follow proper procedures for releasing information.',
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Conduct Regular Audits',
        description: 'Perform quarterly audits of student records to ensure compliance with regulations. Review immunization records, update emergency contacts, and verify all required documents are on file.',
      },
    ],
  },
];

export const SOPProvider: React.FC<SOPProviderProps> = ({ children }) => {
  const [sops, setSOPs] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Load SOPs from database
  const loadSOPs = useCallback(async () => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const stored = localStorage.getItem('mediamaple_sops');
      if (stored) {
        const parsedSOPs = JSON.parse(stored);
        // Check which default SOPs are missing
        const existingIds = parsedSOPs.map((sop: SOP) => sop.id);
        const missingDefaults = defaultSOPs.filter(sop => !existingIds.includes(sop.id));

        if (missingDefaults.length > 0) {
          // Add missing default SOPs
          const combined = [...missingDefaults, ...parsedSOPs];
          setSOPs(combined);
          localStorage.setItem('mediamaple_sops', JSON.stringify(combined));
        } else {
          setSOPs(parsedSOPs);
        }
      } else {
        // If no stored SOPs, return default SOPs
        setSOPs(defaultSOPs);
        localStorage.setItem('mediamaple_sops', JSON.stringify(defaultSOPs));
      }
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('sops')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading SOPs:', error);
        setLoading(false);
        return;
      }

      if (data) {
        const mappedSOPs = data.map(mapSupabaseSOPToSOP);
        setSOPs(mappedSOPs);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading SOPs:', error);
      setLoading(false);
    }
  }, [useSupabase]);

  // Initialize: Load SOPs only after auth is ready
  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (authLoading) return;

    // Only load data if authenticated (Supabase requires auth for RLS)
    if (useSupabase && !isAuthenticated) {
      setLoading(false);
      return;
    }

    loadSOPs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSupabase, authLoading, isAuthenticated]);

  // Subscribe to real-time SOP changes
  useEffect(() => {
    if (!useSupabase) return;

    const channel = supabase
      .channel('sops_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sops',
        },
        () => {
          // Reload SOPs when table changes
          loadSOPs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase, loadSOPs]);

  // Save to localStorage when SOPs change (for non-Supabase mode)
  useEffect(() => {
    if (!useSupabase && sops.length > 0) {
      localStorage.setItem('mediamaple_sops', JSON.stringify(sops));
    }
  }, [sops, useSupabase]);

  const addSOP = async (sopData: Omit<SOP, 'id' | 'createdAt'>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const newSOP: SOP = {
        ...sopData,
        id: `sop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...sops, newSOP];
      setSOPs(updated);
      localStorage.setItem('mediamaple_sops', JSON.stringify(updated));

      // Log activity
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: sopData.isTemplate ? 'template_created' : 'sop_created',
          entityType: sopData.isTemplate ? 'template' : 'sop',
          entityId: newSOP.id,
          entityTitle: sopData.title,
          details: { department: sopData.department, category: sopData.category },
        });
      }
      return;
    }

    try {
      const { data, error } = await supabase.from('sops').insert({
        title: sopData.title,
        description: sopData.description,
        department: sopData.department,
        category: sopData.category,
        icon: sopData.icon,
        image_url: sopData.imageUrl,
        steps: sopData.steps,
        tags: sopData.tags || [],
        status: sopData.status,
        is_template: sopData.isTemplate,
        created_by: currentUser?.id || 'system',
      }).select().single();

      if (error) {
        console.error('Error adding SOP:', error);
        throw error;
      }

      // Log activity
      if (currentUser && data) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: sopData.isTemplate ? 'template_created' : 'sop_created',
          entityType: sopData.isTemplate ? 'template' : 'sop',
          entityId: data.id,
          entityTitle: sopData.title,
          details: { department: sopData.department, category: sopData.category },
        });
      }

      // Reload SOPs to get the new one with its ID
      await loadSOPs();
    } catch (error) {
      console.error('Error adding SOP:', error);
      throw error;
    }
  };

  const updateSOP = async (id: string, sopData: Partial<SOP>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const updated = sops.map(sop =>
        sop.id === id
          ? { ...sop, ...sopData, updatedAt: new Date().toISOString() }
          : sop
      );
      setSOPs(updated);
      localStorage.setItem('mediamaple_sops', JSON.stringify(updated));
      return;
    }

    try {
      const updateData: any = {};
      if (sopData.title) updateData.title = sopData.title;
      if (sopData.description) updateData.description = sopData.description;
      if (sopData.department) updateData.department = sopData.department;
      if (sopData.category) updateData.category = sopData.category;
      if (sopData.icon !== undefined) updateData.icon = sopData.icon;
      if (sopData.imageUrl !== undefined) updateData.image_url = sopData.imageUrl;
      if (sopData.steps) updateData.steps = sopData.steps;
      if (sopData.tags) updateData.tags = sopData.tags;
      if (sopData.status) updateData.status = sopData.status;
      if (sopData.isTemplate !== undefined) updateData.is_template = sopData.isTemplate;

      const { error } = await supabase
        .from('sops')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating SOP:', error);
        throw error;
      }

      // Update local state optimistically
      setSOPs(prev =>
        prev.map(sop =>
          sop.id === id ? { ...sop, ...sopData, updatedAt: new Date().toISOString() } : sop
        )
      );
    } catch (error) {
      console.error('Error updating SOP:', error);
      throw error;
    }
  };

  const deleteSOP = async (id: string) => {
    const sopToDelete = sops.find(s => s.id === id);

    if (!useSupabase) {
      // Fallback to localStorage mode
      const updated = sops.filter(sop => sop.id !== id);
      setSOPs(updated);
      localStorage.setItem('mediamaple_sops', JSON.stringify(updated));

      // Log activity
      if (currentUser && sopToDelete) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: sopToDelete.isTemplate ? 'template_deleted' : 'sop_deleted',
          entityType: sopToDelete.isTemplate ? 'template' : 'sop',
          entityId: id,
          entityTitle: sopToDelete.title,
        });
      }
      return;
    }

    try {
      const { error } = await supabase
        .from('sops')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting SOP:', error);
        throw error;
      }

      // Log activity
      if (currentUser && sopToDelete) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: sopToDelete.isTemplate ? 'template_deleted' : 'sop_deleted',
          entityType: sopToDelete.isTemplate ? 'template' : 'sop',
          entityId: id,
          entityTitle: sopToDelete.title,
        });
      }

      // Update local state
      setSOPs(prev => prev.filter(sop => sop.id !== id));
    } catch (error) {
      console.error('Error deleting SOP:', error);
      throw error;
    }
  };

  const getSOPById = (id: string) => {
    return sops.find(sop => sop.id === id);
  };

  const getSOPsByCategory = (category: string) => {
    return sops.filter(sop => sop.category === category);
  };

  const updateSOPStatus = async (id: string, status: SOPStatus) => {
    const sop = sops.find(s => s.id === id);

    // Determine the action type based on status change
    const getActionType = () => {
      if (status === 'archived') return 'sop_archived';
      if (status === 'published') return 'sop_published';
      if (sop?.status === 'archived') return 'sop_restored';
      return 'sop_updated';
    };

    if (!useSupabase) {
      // Fallback to localStorage mode
      const updated = sops.map(s =>
        s.id === id
          ? { ...s, status, updatedAt: new Date().toISOString() }
          : s
      );
      setSOPs(updated);
      localStorage.setItem('mediamaple_sops', JSON.stringify(updated));

      // Log activity
      if (currentUser && sop) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: getActionType(),
          entityType: 'sop',
          entityId: id,
          entityTitle: sop.title,
          details: { previousStatus: sop.status, newStatus: status },
        });
      }
      return;
    }

    try {
      const { error } = await supabase
        .from('sops')
        .update({ status })
        .eq('id', id);

      if (error) {
        console.error('Error updating SOP status:', error);
        throw error;
      }

      // Log activity
      if (currentUser && sop) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: getActionType(),
          entityType: 'sop',
          entityId: id,
          entityTitle: sop.title,
          details: { previousStatus: sop.status, newStatus: status },
        });
      }

      // Update local state
      setSOPs(prev =>
        prev.map(s =>
          s.id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s
        )
      );
    } catch (error) {
      console.error('Error updating SOP status:', error);
      throw error;
    }
  };

  const archiveSOP = async (id: string) => {
    await updateSOPStatus(id, 'archived');
  };

  const restoreSOP = async (id: string) => {
    await updateSOPStatus(id, 'draft');
  };

  const createFromTemplate = async (templateId: string) => {
    const template = sops.find(sop => sop.id === templateId);
    if (!template) return;

    if (!useSupabase) {
      // Fallback to localStorage mode
      const newSOP: SOP = {
        ...template,
        id: `sop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: `${template.title} (Copy)`,
        status: 'draft',
        isTemplate: false,
        templateOf: templateId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...sops, newSOP];
      setSOPs(updated);
      localStorage.setItem('mediamaple_sops', JSON.stringify(updated));
      return;
    }

    try {
      const { error } = await supabase.from('sops').insert({
        title: `${template.title} (Copy)`,
        description: template.description,
        department: template.department,
        category: template.category,
        icon: template.icon,
        image_url: template.imageUrl,
        steps: template.steps,
        tags: template.tags || [],
        status: 'draft',
        is_template: false,
        created_by: currentUser?.id || template.createdBy,
      });

      if (error) {
        console.error('Error creating from template:', error);
        throw error;
      }

      // Reload SOPs
      await loadSOPs();
    } catch (error) {
      console.error('Error creating from template:', error);
      throw error;
    }
  };

  const saveAsTemplate = async (id: string) => {
    const sourceSOP = sops.find(sop => sop.id === id);
    if (!sourceSOP) return;

    if (!useSupabase) {
      // Fallback to localStorage mode - CREATE A COPY as template, don't modify original
      const newTemplate: SOP = {
        ...sourceSOP,
        id: `sop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: `${sourceSOP.title} (Template)`,
        isTemplate: true,
        templateOf: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...sops, newTemplate];
      setSOPs(updated);
      localStorage.setItem('mediamaple_sops', JSON.stringify(updated));
      return;
    }

    try {
      // CREATE A COPY as template, don't modify original
      const { error } = await supabase.from('sops').insert({
        title: `${sourceSOP.title} (Template)`,
        description: sourceSOP.description,
        department: sourceSOP.department,
        category: sourceSOP.category,
        icon: sourceSOP.icon,
        image_url: sourceSOP.imageUrl,
        steps: sourceSOP.steps,
        tags: sourceSOP.tags || [],
        status: sourceSOP.status,
        is_template: true,
        created_by: currentUser?.id || sourceSOP.createdBy,
      });

      if (error) {
        console.error('Error saving as template:', error);
        throw error;
      }

      // Reload SOPs to get the new template
      await loadSOPs();
    } catch (error) {
      console.error('Error saving as template:', error);
      throw error;
    }
  };

  return (
    <SOPContext.Provider
      value={{
        sops,
        addSOP,
        updateSOP,
        deleteSOP,
        getSOPById,
        getSOPsByCategory,
        updateSOPStatus,
        archiveSOP,
        restoreSOP,
        createFromTemplate,
        saveAsTemplate,
        loading,
      }}
    >
      {children}
    </SOPContext.Provider>
  );
};
