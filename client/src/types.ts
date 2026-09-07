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

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hotelId: string | null;
  departmentId: string | null;
  createdAt?: string;
}
