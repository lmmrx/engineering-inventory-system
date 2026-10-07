export type Role = "ADMIN" | "MANAGER" | "STAFF";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hotelId: string | null;
  departmentId: string | null;
}

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
}
