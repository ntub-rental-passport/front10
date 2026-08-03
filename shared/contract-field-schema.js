export const CONTRACT_FIELD_GROUPS = [
  {
    id: 'review',
    order: 1,
    title: '契約審閱期',
    shortTitle: '審閱期',
    description: '至少三日的攜回審閱期間與雙方簽章。',
  },
  {
    id: 'parties',
    order: 2,
    title: '雙方基本資料',
    shortTitle: '雙方資料',
    description: '出租人與承租人的身分及聯絡資料。',
  },
  {
    id: 'authorization',
    order: 3,
    title: '代理或轉租資料',
    shortTitle: '代理／轉租',
    description: '偵測到代理或轉租情境時才列為必填。',
    conditional: true,
  },
  {
    id: 'property',
    order: 4,
    title: '租賃住宅標示',
    shortTitle: '住宅標示',
    description: '門牌、地號、建號與面積等標的資料。',
  },
  {
    id: 'scope',
    order: 5,
    title: '租賃範圍',
    shortTitle: '租賃範圍',
    description: '全部或部分出租、房間及車位範圍。',
  },
  {
    id: 'term',
    order: 6,
    title: '租賃期間',
    shortTitle: '租賃期間',
    description: '租期起訖日期；交屋時間列為建議確認。',
  },
  {
    id: 'rent',
    order: 7,
    title: '租金與繳納',
    shortTitle: '租金繳納',
    description: '租金、繳納期限與支付方式。',
  },
  {
    id: 'deposit',
    order: 8,
    title: '押金約定',
    shortTitle: '押金',
    description: '押金月數及金額，不得超過二個月租金。',
  },
  {
    id: 'expenses',
    order: 9,
    title: '相關費用',
    shortTitle: '相關費用',
    description: '管理、水電、瓦斯、網路及其他費用約定。',
  },
  {
    id: 'clauses',
    order: 10,
    title: '其他重要條款',
    shortTitle: '重要條款',
    description: '遺留物處理及訴訟管轄等契約約定。',
  },
]

export const CONTRACT_FIELD_DEFINITIONS = [
  field('review_date', 'review', '審閱日期', ['契約審閱期', '攜回審閱'], 'date', 'required', null, {
    placeholder: '例如：民國 114 年 7 月 14 日',
  }),
  field('review_days', 'review', '審閱日數', ['審閱期間', '審閱'], 'days', 'required', null, {
    placeholder: '例如：3 日',
  }),
  field('landlord_review_signature', 'review', '出租人審閱簽章', ['出租人簽章'], 'signature'),
  field('tenant_review_signature', 'review', '承租人審閱簽章', ['承租人簽章'], 'signature'),

  field('landlord', 'parties', '出租人姓名', ['出租人姓名', '出租人'], 'name', 'required', null, {
    placeholder: '請輸入中文或英文姓名／名稱',
  }),
  field('tenant', 'parties', '承租人姓名', ['承租人姓名', '承租人'], 'name', 'required', null, {
    placeholder: '請輸入中文或英文姓名／名稱',
  }),
  field('landlord_id', 'parties', '出租人統一編號', ['出租人', '身分證字號', '統一編號'], 'id', 'required', null, {
    placeholder: '身分證字號或 8 碼統一編號',
  }),
  field('tenant_id', 'parties', '承租人統一編號', ['承租人', '身分證字號', '統一編號'], 'id', 'required', null, {
    placeholder: '身分證字號或 8 碼統一編號',
  }),
  field('landlord_registered_address', 'parties', '出租人戶籍地址', ['出租人', '戶籍地址'], 'party_address'),
  field('tenant_registered_address', 'parties', '承租人戶籍地址', ['承租人', '戶籍地址'], 'party_address'),
  field('landlord_mailing_address', 'parties', '出租人通訊地址', ['出租人', '通訊地址'], 'party_address'),
  field('tenant_mailing_address', 'parties', '承租人通訊地址', ['承租人', '通訊地址'], 'party_address'),
  field('landlord_phone', 'parties', '出租人聯絡電話', ['出租人', '聯絡電話'], 'phone'),
  field('tenant_phone', 'parties', '承租人聯絡電話', ['承租人', '聯絡電話'], 'phone'),

  field(
    'agent_name',
    'authorization',
    '代理人姓名',
    ['代理人姓名', '代理人'],
    'name',
    'conditional',
    'agent',
  ),
  field(
    'agent_id',
    'authorization',
    '代理人統一編號',
    ['代理人', '身分證字號', '統一編號'],
    'id',
    'conditional',
    'agent',
  ),
  field(
    'authorization_document',
    'authorization',
    '代理授權證明',
    ['授權書', '授權證明'],
    'authorization_evidence',
    'conditional',
    'agent',
  ),
  field(
    'sublease_consent',
    'authorization',
    '出租人轉租同意',
    ['同意轉租', '轉租同意書'],
    'sublease_evidence',
    'conditional',
    'sublease',
  ),

  field(
    'address',
    'property',
    '房屋門牌地址',
    ['租賃住宅地址', '房屋所在地', '租屋地址', '房屋地址'],
    'address',
    'conditional',
    'door_number',
  ),
  field(
    'tax_id',
    'property',
    '房屋稅籍編號',
    ['房屋稅籍編號', '稅籍編號'],
    'tax_id',
    'conditional',
    'no_door_number',
  ),
  field('land_number', 'property', '基地地號', ['基地坐落', '地號'], 'land_number', 'required', null, {
    placeholder: '例如：中正段一小段 123 地號',
  }),
  field('building_number', 'property', '專有部分建號', ['專有部分建號', '建號'], 'building_number', 'required', null, {
    placeholder: '例如：00649-000 建號',
  }),
  field('exclusive_area', 'property', '專有部分面積', ['專有部分', '主建物面積'], 'area', 'required', null, {
    placeholder: '例如：30 平方公尺',
  }),
  field('accessory_available', 'property', '是否有附屬建物', ['附屬建物', '陽台', '平台', '花台', '露台', '雨遮'], 'choice', 'required', null, {
    control: 'choice',
    options: ['有', '無'],
  }),
  field(
    'accessory_purpose',
    'property',
    '附屬建物用途',
    ['附屬建物用途', '陽台', '平台', '花台', '露台', '雨遮'],
    'purpose',
    'conditional',
    'has_accessory',
    { placeholder: '例如：陽台、平台、花台、露台或雨遮' },
  ),
  field(
    'accessory_area',
    'property',
    '附屬建物面積',
    ['附屬建物用途', '附屬建物面積'],
    'area',
    'conditional',
    'has_accessory',
    { placeholder: '例如：5 平方公尺（約 1.51 坪）' },
  ),

  field(
    'rental_scope',
    'scope',
    '住宅出租範圍',
    ['租賃範圍', '住宅全部', '住宅部分'],
    'choice',
    'required',
    null,
    { control: 'choice', options: ['全部', '部分'] },
  ),
  field(
    'rental_room',
    'scope',
    '樓層／房間／室號',
    ['房間', '第', '室'],
    'rental_room',
    'conditional',
    'partial_scope',
  ),
  field(
    'rental_area',
    'scope',
    '實際租賃面積',
    ['租賃範圍', '面積'],
    'area',
    'conditional',
    'partial_scope',
  ),
  field('parking_available', 'scope', '是否包含車位', ['車位', '汽車停車位', '機車停車位'], 'choice', 'required', null, {
    control: 'choice',
    options: ['有', '無'],
  }),
  field('car_parking_count', 'scope', '汽車停車位數量', ['汽車停車位'], 'count', 'conditional', 'has_parking', {
    placeholder: '例如：1 個',
  }),
  field('car_parking_type', 'scope', '汽車停車位種類', ['平面式停車位', '機械式停車位'], 'choice', 'conditional', 'has_car_parking', {
    control: 'choice',
    options: ['平面式', '機械式'],
  }),
  field('car_parking_floor', 'scope', '汽車停車位樓層', ['汽車停車位', '地上', '地下'], 'floor', 'conditional', 'has_car_parking', {
    placeholder: '例如：地下 B1 層',
  }),
  field('car_parking_number', 'scope', '汽車停車位編號', ['汽車停車位', '編號'], 'parking_number', 'conditional', 'has_car_parking', {
    placeholder: '例如：第 20 號',
  }),
  field('motorcycle_parking_count', 'scope', '機車停車位數量', ['機車停車位'], 'count', 'conditional', 'has_parking', {
    placeholder: '例如：1 個',
  }),
  field('motorcycle_parking_floor', 'scope', '機車停車位樓層', ['機車停車位', '地上', '地下'], 'floor', 'conditional', 'has_motorcycle_parking', {
    placeholder: '例如：地下 B1 層',
  }),
  field('motorcycle_parking_number', 'scope', '機車停車位編號／位置', ['機車停車位', '編號', '位置示意圖'], 'parking_number', 'conditional', 'has_motorcycle_parking', {
    placeholder: '例如：第 M12 號或附件位置示意圖',
  }),
  field('parking_usage_time', 'scope', '車位使用時間', ['使用時間', '全日', '日間', '夜間'], 'choice', 'conditional', 'has_parking', {
    control: 'choice',
    options: ['全日', '日間', '夜間', '其他'],
  }),
  field('rental_equipment', 'scope', '租賃附屬設備', ['租賃附屬設備', '附件一租賃標的現況確認書'], 'choice', 'required', null, {
    control: 'choice',
    options: ['有', '無'],
  }),

  field('start_date', 'term', '租期起始', ['租賃期間', '租賃期限', '租期自'], 'date'),
  field('end_date', 'term', '租期結束', ['租賃期間', '租賃期限', '至民國'], 'date'),
  field(
    'handover_time',
    'term',
    '交屋／可入住時間',
    ['交屋日期', '入住日期', '可搬入'],
    'handover_time',
    'recommended',
  ),

  field('rent', 'rent', '每月租金', ['每月租金', '月租金', '租金每個月'], 'money'),
  field('payment_period', 'rent', '每期繳納月數', ['每期應繳納', '每期租金'], 'payment_period'),
  field('due_day', 'rent', '繳租期限', ['每月', '租金應於', '繳納'], 'due_day'),
  field('payment_method', 'rent', '租金支付方式', ['租金支付方式', '現金繳付', '轉帳繳付'], 'payment_method'),
  field(
    'bank_account',
    'rent',
    '轉帳帳戶',
    ['金融機構', '戶名', '帳號'],
    'bank_account',
    'conditional',
    'transfer',
  ),

  field('deposit_months', 'deposit', '押金月數', ['押金', '個月租金'], 'months'),
  field('deposit', 'deposit', '押金金額', ['押租保證金', '押金'], 'money'),

  field('management_fee', 'expenses', '管理費約定', ['管理費'], 'expense'),
  field('water_fee', 'expenses', '水費約定', ['水費'], 'expense'),
  field(
    'electricity_billing',
    'expenses',
    '電費計費方式',
    ['電費', '用電度數', '平均電價'],
    'expense',
  ),
  field(
    'electricity_rate',
    'expenses',
    '每度電費／限制',
    ['每度電費', '每度單價', '平均電價'],
    'expense',
    'recommended',
  ),
  field('gas_fee', 'expenses', '瓦斯費約定', ['瓦斯費'], 'expense', 'recommended'),
  field('internet_fee', 'expenses', '網路費約定', ['網路費'], 'expense', 'recommended'),
  field(
    'other_fee',
    'expenses',
    '其他費用及支付方式',
    ['其他費用', '清潔費'],
    'expense',
    'recommended',
  ),

  field(
    'leftover_handling',
    'clauses',
    '遺留物之處理',
    ['遺留物之處理', '視為拋棄其所有權'],
    'leftover_clause',
  ),
  field(
    'jurisdiction_court',
    'clauses',
    '第一審管轄法院',
    ['第一審管轄法院', '地方法院'],
    'court',
    'recommended',
    null,
    { placeholder: '例如：臺灣臺北地方法院（不得排除法定管轄）' },
  ),
]

function field(
  id,
  groupId,
  label,
  keywords,
  format = 'text',
  requirement = 'required',
  condition = null,
  config = {},
) {
  return {
    id,
    candidateKey: id,
    groupId,
    label,
    keywords,
    format,
    requirement,
    condition,
    control: config.control ?? 'text',
    options: config.options ?? [],
    placeholder: config.placeholder ?? '',
  }
}

export function detectContractConditions(text) {
  const source = String(text ?? '')
  return {
    agent: /代理人|代理簽約|授權書|授權證明/.test(source),
    sublease: /二房東|次承租|轉租契約|同意轉租|轉租同意書/.test(source),
    transfer: /轉帳繳付|轉帳支付|匯款|金融機構|銀行帳號/.test(source),
    door_number: !/無門牌/.test(source),
    no_door_number: /無門牌|房屋稅籍編號/.test(source),
    partial_scope:
      /住宅部分|租賃部分|分租|(?:租賃範圍|租賃住宅)[^\r\n]{0,60}(?:房間|第\s*[^\r\n]{0,12}\s*室)/.test(
        source,
      ),
    has_parking:
      /(?:車位[^\r\n]{0,30}?[■☑✓●◆]\s*有)|汽車停車位\s*\d+\s*個|機車停車位\s*\d+\s*個|平面式停車位|機械式停車位/.test(
        source,
      ) && !/(?:車位[^\r\n]{0,20}?[■☑✓●◆]\s*無)/.test(source),
    has_car_parking:
      /汽車停車位\s*[1-9]\d*\s*個|平面式停車位|機械式停車位/.test(source),
    has_motorcycle_parking: /機車停車位\s*[1-9]\d*\s*個|機車停車位[^\r\n]{0,60}編號/.test(
      source,
    ),
    has_accessory: /附屬建物(?:用途)?[^\r\n]{0,50}(?:平方公尺|陽台|平台|花台|露台|雨遮)/.test(
      source,
    ),
  }
}
