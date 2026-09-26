export * from './client.js'
export * as schema from './schema.js'

/**
 * Fallback tenant for dev/POC when no JWT is attached to the request.
 * This is the tenant the lms-service seed script created. Do NOT rely on
 * this in production — production code MUST derive tenantId from the JWT.
 */
export const DEV_TENANT_ID = '8daf17bc-7c43-44b7-ba3b-67d8a439e072'
