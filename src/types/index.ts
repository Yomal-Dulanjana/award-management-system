// Shared TypeScript interfaces and data models for Astro Award Management

export interface ApplicationBundle {
  reference: string;
  companyName: string;
  financialYear: string;
  contactEmail: string;
  contactName: string;
  roi: number;
  payback: number | null;
  diversificationTotal: number;
  combinedPercent: number;
  downloadUrl: string;
  baseUrl?: string;
  adminDetailUrl?: string;
}

export interface EvidenceFileAttachment {
  originalName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ProductServiceItem {
  name: string;
  description: string;
}

export interface RevenueRowItem {
  activity: string;
  revenue: number;
}

export interface StoredFormData {
  nature_operations?: string;
  new_products_services?: boolean;
  new_market_entered?: boolean;
  new_market_details?: string;
  products?: ProductServiceItem[];
  gross_profit_margin_option?: string;
  contact_name?: string;
  contact_designation?: string;
  declaration_name?: string;
  declaration_designation?: string;
  declaration_date?: string;
  signature_data?: string;
  metrics?: {
    diversificationTotal?: number;
    combinedPercent?: number;
    revenueRows?: RevenueRowItem[];
  };
}

export interface ApplicationMetrics {
  totalCount: number;
  pendingCount: number;
  underReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export interface AdminSession {
  id: number;
  email: string;
  name: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
}
