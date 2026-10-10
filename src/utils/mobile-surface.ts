const landlordUnsupportedPaths = ['/landlord/finance', '/landlord/contracts']

const tenantUnsupportedContractPaths = [
  '/app/contract/scanner',
  '/app/contract-analysis',
  '/app/contract/editor',
  '/app/contract/combined',
  '/app/contract/document',
]

function normalizePath(path: string): string {
  return path.replace(/\/+$/, '')
}

function isPathOrChild(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`)
}

export function isMobileUnsupportedLandlordPath(path: string): boolean {
  const normalizedPath = normalizePath(path)
  return landlordUnsupportedPaths.some((parent) => isPathOrChild(normalizedPath, parent))
}

export function isMobileUnsupportedTenantPath(path: string): boolean {
  const normalizedPath = normalizePath(path)
  // contract 底下混了教學內容與 OCR 工具兩種東西，工具只能精確比對，避免誤擋文章；
  // subsidy 的子路由都是租補工具，所以整個路由分支都不提供手機操作。
  return tenantUnsupportedContractPaths.includes(normalizedPath)
    || isPathOrChild(normalizedPath, '/app/subsidy')
}
