import { z } from 'zod';

export const ProductIn = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(2).max(200),
  brand: z.string().max(80).default('-'),
  category: z.string().max(80).default('General'),
  unit: z.string().max(16).default('pcs'),
  hsn: z.string().max(16).default(''),
  image: z.string().url().or(z.literal('')).default(''),
  rate_retail: z.number().int().min(0),
  rate_wholesale: z.number().int().min(0),
  gst_pct: z.union([z.literal(5), z.literal(12), z.literal(18), z.literal(28)]).default(18),
  stock: z.number().int().default(0),
  min_stock: z.number().int().min(0).default(5),
});

export const StockMove = z.object({
  delta: z.number().int().min(-100000).max(100000),
  reason: z.string().max(120).default('admin'),
});

export const InvoiceItem = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(10000),
  rate: z.number().int().min(0),
  gst_pct: z.number().min(0).max(28),
});

export const InvoiceIn = z.object({
  type: z.enum(['TAX', 'EST']).default('TAX'),
  customer: z.string().max(200).default(''),
  phone: z.string().max(15).default(''),
  items: z.array(InvoiceItem).min(1).max(200),
  discount: z.number().int().min(0).default(0),
  paid: z.number().int().min(0).default(0),
});

export const OrderIn = z.object({
  text: z.string().min(1).max(1000),
});

export const ContentIn = z.object({
  announcement: z.string().max(300),
  whatsapp: z.string().regex(/^[0-9]{10,15}$/),
  upi_id: z.string().max(80),
  phone: z.string().max(30),
  address: z.string().max(300),
}).partial().strict();

export const Email = z.string().trim().toLowerCase().max(120).pipe(z.email());

export const OtpRequestIn = z.object({ email: Email });

export const OtpVerifyIn = z.object({ email: Email, code: z.string().regex(/^[0-9]{6}$/) });

export const ProfileIn = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^$|^[6-9][0-9]{9}$/).default(''),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9A-Z]{15}$/).default(''),
  address: z.string().trim().max(400).default(''),
});
