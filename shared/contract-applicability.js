// Only an actual property statement establishes whether a door number exists.
// A template's "無門牌者..." alternative is not such a statement.
export function getPropertyIdentification(text) {
  const compact = String(text ?? '').replace(/\s+/g, '')
  const address = compact.match(/(?:房屋門牌地址|租賃住宅地址|房屋地址|租屋地址)[：:]([^。；;\n]{3,100})/)?.[1] ?? ''
  const hasAddress = /(?:路|街|巷|弄).*[0-9０-９]+號/.test(address)
  const hasDoor = /(?:房屋|本屋|本住宅)(?:有門牌|設有門牌)|是否有門牌[：:](?:是|有)/.test(compact) || hasAddress
  const noDoor = /(?:房屋|本屋|本住宅)(?:無門牌|沒有門牌)|(?:^|[。；;])無門牌(?=[，,。；;]|$)|是否有門牌[：:](?:否|無)|(?:門牌|門牌地址)[：:](?:無|未編定)(?=[。；;，,]|$)/.test(compact)
  const taxId = compact.match(/(?:房屋)?稅籍編號[：:]([A-Za-z0-9０-９-]{3,40})/)?.[1] ?? ''
  const sketchReference = compact.match(/(?:位置略圖|位置示意圖)(?:[：:]|詳|見|如|載於|位於|附於)[^。；;]{1,60}/)?.[0] ?? ''
  return {
    state: hasDoor && noDoor ? 'unknown' : hasDoor ? 'has_door' : noDoor ? 'no_door' : 'unknown',
    address, taxId, sketchReference,
  }
}
