import type { StaffRoleId } from '../erp/types';
import type { PlayLandRoleId } from '../playland/types';
import type { RestaurantRoleId } from '../restaurant/types';

export type ManagementSystemId = 'supermarket' | 'restaurant' | 'playland';

export interface UnifiedStaffAccount {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  branchId: string; // 'hyderabad' | 'karachi-p10' | 'karachi-p2' | 'all'
  active: boolean;
  isPublishedLeadership?: boolean;
  systems: ManagementSystemId[];
  supermarketRoleId?: StaffRoleId;
  restaurantRoleId?: RestaurantRoleId;
  playLandRoleId?: PlayLandRoleId;
  isDemoAccount?: boolean;
}

export interface UnifiedStaffCredentialSeed extends UnifiedStaffAccount {
  passwordHashOrDemoPin: string;
}

export interface PortalSessionPayload {
  uid: string;
  systems: ManagementSystemId[];
  supermarketRoleId?: StaffRoleId;
  restaurantRoleId?: RestaurantRoleId;
  playLandRoleId?: PlayLandRoleId;
  branchId: string;
  isDemoSession: boolean;
  iat: number;
  exp: number;
}

export interface InterBusinessRequest {
  id: string;
  requestNumber: string;
  sourceSystem: ManagementSystemId;
  targetSystem: ManagementSystemId;
  branchId: string;
  category: 'Ingredient Transfer' | 'Event Catering';
  title: string;
  itemsSummary: string;
  estimatedAmountPkr: number;
  requestedByName: string;
  requestedAt: string;
  status: 'Requested' | 'Accepted by Target' | 'Fulfilled' | 'Declined';
  referenceId?: string;
  notes?: string;
}
