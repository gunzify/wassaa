import { ProfessionCategory } from '../types';

/**
 * KB §18A taxonomy helpers shared by onboarding and settings: role inside a
 * uniformed organization (officer/soldier) and the trade/skill picker per
 * class of service (military, police, paramilitary) and civilian fields.
 */

/**
 * Cadre, not rank. WASSAA never asks for or displays rank titles — members
 * choose whether they are commissioned or non-commissioned, and that is the
 * only service distinction that reaches a profile.
 */
export const ORG_ROLES: { value: 'officer' | 'soldier'; label: string; desc: string }[] = [
  { value: 'officer', label: 'Commissioned officer', desc: 'Holds a commission' },
  { value: 'soldier', label: 'Non-commissioned officer', desc: 'Enlisted / NCO' },
];

export const SKILLS_BY_CATEGORY: Record<string, string[]> = {
  Military: ['Combat & Infantry', 'Engineering & Works', 'Medical & Health', 'Logistics & Supply', 'Communications & Signals', 'Aviation & Maritime', 'Legal & Provost', 'Education & Welfare'],
  Police: ['Investigations & Crime', 'Uniform Patrol & Response', 'Traffic & Road Safety', 'Intelligence & Surveillance', 'Forensics & Digital', 'Community Policing', 'Cybercrime Unit'],
  Paramilitary: ['Emergency Response & Rescue', 'Intelligence & Investigation', 'Road Safety & Traffic', 'Border & Migration Control', 'Disaster Management', 'Maritime Security', 'Civil Defence & Fire'],
  Healthcare: ['Medicine & Health', 'Nursing / Medical', 'Pharmacy', 'Laboratory Science', 'Physiotherapy & Rehab', 'Public Health'],
  Engineering: ['Civil / Structural Engineering', 'Software Engineering', 'Electrical & Electronics', 'Mechanical / Mechatronics', 'Data & AI', 'Product & UX Design'],
  Education: ['Teaching & Tutoring', 'Education Leadership', 'Curriculum & Training', 'Early Childhood'],
  'Business & Entrepreneurship': ['Sales & Customer Care', 'Finance & Banking', 'Marketing & Brand', 'Operations & Logistics', 'Founder / Business Owner'],
  'Law & Government': ['Legal Practice', 'Public Service', 'Policy & Governance', 'Compliance & Security'],
  Others: ['Creative & Media', 'Trades & Craft', 'Transport & Logistics', 'Hospitality & Events', 'Agriculture', 'Fashion & Beauty'],
};

export const skillsForCategory = (cat: string): string[] => SKILLS_BY_CATEGORY[cat] || [];

export const isUniformedCategory = (cat: string) =>
  ['Military', 'Police', 'Paramilitary'].includes(cat);
