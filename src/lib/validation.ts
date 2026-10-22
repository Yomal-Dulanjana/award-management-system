// Zod validation schema — mirrors exact PHP submit.php rules server-side.
import { z } from 'zod';

const NATURE_OPTIONS = ['Manufacturing', 'Services', 'Trading', 'Mixed'] as const;
const GROSS_OPTIONS = [
  'Improved by more than 5%',
  'Improved by 3% to less than 5%',
  'Improved by 1% to less than 3%',
  'Improved by less than 1%',
  'Declined compared to last year',
] as const;

// Single product/service repeater row
const ProductRowSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(300),
  description: z.string().min(1, 'Description is required').max(2000),
});

// Single revenue repeater row (client-sent percent ignored — recalculated server-side)
const RevenueRowSchema = z.object({
  activity: z.string().min(1, 'Business activity is required').max(300),
  revenue: z.number({ invalid_type_error: 'Revenue must be a number' }).nonnegative(),
});

// Full application form schema
export const ApplicationSchema = z.object({
  // Step 1
  company_name: z.string().min(2, 'Company name is required').max(300),
  financial_year: z.string().min(1).max(20),
  nature_operations: z.enum(NATURE_OPTIONS, { errorMap: () => ({ message: 'Invalid nature of operations.' }) }),
  contact_name_designation: z.string().min(2, 'Contact name & designation is required').max(300),
  contact_email: z.string().email('Invalid email address'),
  contact_phone: z.string().min(5, 'Telephone is required').max(30),

  // Step 2
  new_products_services: z.literal(true, { errorMap: () => ({ message: 'New products/services must be confirmed.' }) }),
  new_market_entered: z.literal(true, { errorMap: () => ({ message: 'New market entered must be confirmed.' }) }),
  new_market_details: z.string().max(3000).optional(),
  products: z.array(ProductRowSchema).min(1, 'At least one product or service is required'),

  // Step 3
  total_company_revenue: z.number({ invalid_type_error: 'Revenue must be a number' }).positive('Total company revenue must be greater than zero'),
  revenue: z.array(RevenueRowSchema).min(1, 'At least one revenue activity is required'),

  // Step 4
  gross_profit_margin_option: z.enum(GROSS_OPTIONS, { errorMap: () => ({ message: 'Invalid gross profit margin option.' }) }),

  // Step 5
  total_investment: z.number({ invalid_type_error: 'Investment must be a number' }).nonnegative(),
  operating_profit: z.number({ invalid_type_error: 'Operating profit must be a number' }).nonnegative(),

  // Step 6
  declaration_name: z.string().min(2, 'Declaration name is required').max(200),
  declaration_designation: z.string().min(1, 'Designation is required').max(200),
  declaration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  declaration_confirmed: z.literal(true, { errorMap: () => ({ message: 'Please confirm the declaration before submitting.' }) }),
  signature_data: z
    .string()
    .min(100, 'Signature is required')
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Invalid signature format')
    .refine(v => v.length <= 2_800_000, 'Signature payload exceeds 2 MB limit'),
});

export type ApplicationInput = z.infer<typeof ApplicationSchema>;
