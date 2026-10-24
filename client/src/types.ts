export type Role = "ADMIN" | "MANAGER" | "STAFF";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hotelId: string | null;
  departmentId: string | null;
  mustChangePassword?: boolean;
}

/** Kept in step with the server's password policy (server/src/lib/password.ts). */
export const MIN_PASSWORD_LENGTH = 10;

export interface Hotel {
  id: string;
  name: string;
  code: string;
  address?: string | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Category {
  id: string;
  name: string;
  departmentId: string;
  parentId?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  quantityOnHand: number;
  reorderPoint: number;
  maxLevel?: number | null;
  unitCost?: string | null;
  location?: string | null;
  hotelId: string;
  departmentId: string;
  categoryId: string;
  category?: Category;
  hotel?: Hotel;
}

export type TransactionType = "RECEIVE" | "ISSUE" | "ADJUSTMENT";

export interface StockTransaction {
  id: string;
  type: TransactionType;
  quantity: number;
  notes?: string | null;
  createdAt: string;
  itemId: string;
  item?: InventoryItem;
  performedBy?: { id: string; name: string };
  workOrderId?: string | null;
}

export type WorkOrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED";

export interface WorkOrder {
  id: string;
  title: string;
  description?: string | null;
  status: WorkOrderStatus;
  createdAt: string;
  completedAt?: string | null;
  hotelId: string;
  departmentId: string;
  createdBy?: { id: string; name: string };
  assignedTo?: { id: string; name: string } | null;
  hotel?: Hotel;
}

export type PurchaseRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "RECEIVED";

export interface PurchaseRequestItem {
  id: string;
  quantityRequested: number;
  quantityReceived: number;
  estimatedCost?: string | null;
  itemId: string;
  item?: InventoryItem;
}

export interface PurchaseRequest {
  id: string;
  status: PurchaseRequestStatus;
  notes?: string | null;
  createdAt: string;
  hotelId: string;
  departmentId: string;
  requestedBy?: { id: string; name: string };
  approvedBy?: { id: string; name: string } | null;
  items: PurchaseRequestItem[];
  hotel?: Hotel;
}

export interface StockHealth {
  out: number;
  low: number;
  healthy: number;
  over: number;
}

export interface RunningOutItem {
  id: string;
  name: string;
  unit: string;
  hotelCode: string;
  quantityOnHand: number;
  reorderPoint: number;
  dailyUsage: number;
  daysOfCover: number;
}

export interface DashboardSummary {
  usageWindowDays: number;
  itemCount: number;
  stockValue: { total: number; itemsWithCost: number };
  health: StockHealth;
  openWorkOrders: { total: number; stale: number; staleAfterDays: number };
  pendingPurchaseRequests: number;
  runningOut: RunningOutItem[];
}

interface AnalyticsItem {
  id: string;
  name: string;
  unit: string;
  hotelCode: string;
  onHand: number;
  reorderPoint: number;
}

export interface ItemForecast extends AnalyticsItem {
  next7: number;
  next28: number;
  /** % change in usage, last 4 weeks vs the 4 before; null without 8 weeks of history. */
  change: number | null;
  /** null = lasts over a year at the forecast rate. */
  daysLeft: number | null;
  runOutDate: string | null;
  confidence: "normal" | "low";
  weeklyHistory: number[];
  weeklyForecast: number[];
  historyWeeks: number;
}

export interface ReorderPointAdvice extends AnalyticsItem {
  current: number;
  suggested: number;
  status: "too_low" | "too_high";
  leadTimeDays: number;
  leadTimeMeasured: boolean;
  leadTimeBasis: "item" | "department";
  dailyRate: number;
}

export interface UsageAnomaly {
  transactionId: string;
  date: string;
  itemId: string;
  itemName: string;
  hotelCode: string;
  quantity: number;
  performedBy: string;
  notes: string | null;
  kind: "large_issue" | "large_write_off";
  typical: number;
  reason: string;
}

export interface IdleStock extends AnalyticsItem {
  kind: "dead" | "slow";
  value: number | null;
  lastUsedAt: string | null;
  idleDays: number;
  daysOfCover: number | null;
}

export interface Analytics {
  generatedAt: string;
  historyDays: number;
  forecastDays: number;
  leadTime: { days: number; measured: boolean; samples: number };
  settings: { deadAfterDays: number; slowCoverDays: number; anomalyWindowDays: number };
  forecasts: ItemForecast[];
  reorderPoints: ReorderPointAdvice[];
  anomalies: UsageAnomaly[];
  deadStock: IdleStock[];
  deadStockValue: number;
}

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  ip: string | null;
  actor: { id: string; name: string; email: string } | null;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hotelId: string | null;
  departmentId: string | null;
  createdAt?: string;
  disabledAt?: string | null;
  lockedUntil?: string | null;
  mustChangePassword?: boolean;
}
