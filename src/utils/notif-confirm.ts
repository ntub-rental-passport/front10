/**
 * 發送二次確認的文案。
 *
 * 角色群發（全部使用者／租客／房東）一次動輒發給幾十人，列名字既沒意義又會把對話框撐爆，
 * 只看人數就夠讓管理員意識到這是不可逆的大動作；指定使用者則相反——人少的時候，
 * 管理員真正想確認的是「有沒有選錯人」，所以直接列名字，5 位以內都列得下、可以一眼核對，
 * 超過 5 位再退回人數，避免對話框被姓名清單塞滿。
 */
export type SendConfirmationInput =
  | { kind: 'role'; count: number }
  | { kind: 'users'; names: string[] }

const NAME_LIST_LIMIT = 5

export function confirmSendCopy(input: SendConfirmationInput): string {
  if (input.kind === 'role') {
    return `即將發送給 ${input.count} 位使用者，此操作無法復原。`
  }

  const subject =
    input.names.length <= NAME_LIST_LIMIT
      ? input.names.join('、')
      : `${input.names.length} 位使用者`

  return `即將發送給 ${subject}，此操作無法復原。`
}
