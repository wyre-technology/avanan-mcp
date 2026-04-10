/**
 * Shared types for the Checkpoint Harmony Email & Collaboration MCP server.
 * Based on the HEC Smart API v1.50.
 */

/**
 * Tool call result type
 */
export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Credentials extracted from environment or gateway headers
 */
export interface CheckpointCredentials {
  clientId: string;
  clientSecret: string;
  region?: string;
}

/**
 * Regional base URLs for the HEC Smart API
 */
export const REGIONAL_BASE_URLS: Record<string, string> = {
  eu: "https://cloudinfra-gw.portal.checkpoint.com",
  us: "https://cloudinfra-gw-us.portal.checkpoint.com",
  au: "https://cloudinfra-gw.ap.portal.checkpoint.com",
  in: "https://cloudinfra-gw.in.portal.checkpoint.com",
};

export const DEFAULT_BASE_URL = "https://cloudinfra-gw.portal.checkpoint.com";

/**
 * Standard API response envelope
 */
export interface ResponseEnvelope {
  requestId: string;
  responseCode: number;
  responseText: string;
  additionalText?: string;
  recordsNumber?: number;
  scrollId?: string;
}

export interface ApiResponse<T> {
  responseEnvelope: ResponseEnvelope;
  responseData: T[];
}

/**
 * Security event from event/query or event/{id}
 */
export interface HecEvent {
  eventId: string;
  customerId: string;
  saas: string;
  entityId: string;
  state: string;
  type: string;
  confidenceIndicator?: string;
  eventCreated: string;
  severity: string;
  description?: string;
  data: string;
  additionalData?: Record<string, unknown>;
  availableEventActions?: Array<{ actionName: string; actionParameter: Record<string, unknown> }>;
  actions?: Array<{ actionType: string; createTime: string; relatedEntityId: string }>;
}

/**
 * Email entity from search/query or search/entity/{id}
 */
export interface HecEntity {
  entityInfo: {
    entityId: string;
    customerId: string;
    saas: string;
    saasEntityType: string;
    entityCreated: string;
    entityUpdated: string;
    entityActionState?: string;
  };
  entityPayload: {
    internetMessageId?: string;
    subject?: string;
    received?: string;
    fromEmail?: string;
    fromName?: string;
    to?: string[];
    cc?: string[];
    recipients?: string[];
    attachmentCount?: number;
    attachments?: Array<{ name?: string; mimetype?: string; size?: number; MD5?: string }>;
    isQuarantined?: boolean;
    isRestored?: boolean;
    mode?: string;
    [key: string]: unknown;
  };
  entitySecurityResult?: {
    combinedVerdict?: Record<string, string>;
    [key: string]: unknown;
  };
  entityActions?: Array<{
    entityActionName: string;
    entityActionDate?: string;
    entityActionState?: string;
  }>;
  entityAvailableActions?: Array<{
    entityActionName: string;
    entityActionParam: string;
  }>;
}

/**
 * Exception entry (whitelist/blacklist)
 */
export interface HecException {
  entityId: string;
  senderEmail?: string;
  senderDomain?: string;
  senderName?: string;
  recipient?: string;
  subject?: string;
  attachmentMd5?: string;
  comment?: string;
  addedBy?: string;
  updateTime?: string;
  [key: string]: unknown;
}
