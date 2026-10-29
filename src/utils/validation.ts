// Form and input validation schemas using Zod
import { z } from 'zod';

export const NATURE_OPTIONS = ['Manufacturing', 'Services', 'Trading', 'Mixed'] as const;
export const GROSS_OPTIONS = [
  'Improved by more than 5%',
  'Improved by 3% to less than 5%',
  'Improved by 1% to less than 3%',
  'Improved by less than 1%',
  'Declined compared to last year',
] as const;

// Strict 10-digit Sri Lankan phone validator: 07XXXXXXXX or landlines
export const SRI_LANKAN_PHONE_REGEX = /^0(7[0-24-8]|11|2[1-7]|3[1-8]|4[157]|5[12457]|6[35-7]|81|91)[0-9]{7}$/;

export function isValidSriLankanMobile(phone: string): boolean {
  return SRI_LANKAN_PHONE_REGEX.test(phone.trim());
}

const ProductRowSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(300),
  description: z.string().trim().min(1, 'Description is required').max(2000),
});

const RevenueRowSchema = z.object({
  activity: z.string().min(1, 'Business activity is required').max(300),
  revenue: z.number({ invalid_type_error: 'Revenue must be a number' }).nonnegative(),
});

export const ApplicationSchema = z.object({
  // Step 1: Company & Contact
  company_name: z.string().min(2, 'Company name is required').max(300),
  financial_year: z.string().min(1).max(20),
  nature_operations: z.enum(NATURE_OPTIONS, { errorMap: () => ({ message: 'Invalid nature of operations.' }) }),
  contact_name: z.string().min(2, 'Contact person name is required').max(255),
  contact_designation: z.string().min(2, 'Designation is required').max(255),
  contact_email: z.string().email('Invalid email address'),
  contact_phone: z
    .string()
    .trim()
    .regex(SRI_LANKAN_PHONE_REGEX, 'Please enter a valid 10-digit Sri Lankan phone number (e.g., 07XXXXXXXX)'),

  // Step 2: Qualification & Products
  new_products_services: z.literal(true, { errorMap: () => ({ message: 'New products/services must be confirmed.' }) }),
  new_market_entered: z.literal(true, { errorMap: () => ({ message: 'New market entered must be confirmed.' }) }),
  new_market_details: z.string().max(3000).optional(),
  products: z.array(ProductRowSchema).min(1, 'At least one product or service with description is required'),

  // Step 3: Revenue Breakdown
  total_company_revenue: z.number({ invalid_type_error: 'Revenue must be a number' }).positive('Total company revenue must be greater than zero'),
  revenue: z.array(RevenueRowSchema).min(1, 'At least one revenue activity is required'),

  // Step 4: Gross Profit Margin
  gross_profit_margin_option: z.enum(GROSS_OPTIONS, { errorMap: () => ({ message: 'Invalid gross profit margin option.' }) }),

  // Step 5: ROI Inputs
  total_investment: z.number({ invalid_type_error: 'Investment must be a number' }).nonnegative(),
  operating_profit: z.number({ invalid_type_error: 'Operating profit must be a number' }).nonnegative(),

  // Step 6: Declaration & Signature
  declaration_name: z.string().min(2, 'Name of Authorized Person is required').max(255),
  declaration_designation: z.string().min(1, 'Designation / Title is required').max(255),
  declaration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  declaration_confirmed: z.literal(true, { errorMap: () => ({ message: 'Please confirm the declaration before submitting.' }) }),
  signature_data: z
    .string()
    .min(100, 'Signature is required')
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Invalid signature format')
    .refine(v => v.length <= 2_800_000, 'Signature payload exceeds 2 MB limit'),
});

export type ApplicationInput = z.infer<typeof ApplicationSchema>;
