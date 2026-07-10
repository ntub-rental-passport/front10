export type FieldState = 'default' | 'valid' | 'error'

export const authEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const authPasswordUppercasePattern = /[A-Z]/
export const authPasswordNumberPattern = /\d/
export const authPasswordSpecialPattern = /[^A-Za-z0-9]/

export function isValidAuthEmail(email: string): boolean {
  return authEmailPattern.test(email.trim())
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8
    && password.length <= 20
    && authPasswordUppercasePattern.test(password)
    && authPasswordNumberPattern.test(password)
    && authPasswordSpecialPattern.test(password)
  )
}
