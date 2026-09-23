import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ssrContextKey, type Ref } from 'vue'
import Subscription from './subscription.vue'

interface Plan { key: 'free' | 'plus' | 'pro'; monthlyPrice: number }
interface Checkout {
  billingCycle: Ref<'monthly' | 'yearly'>
  currentPlan: Ref<string>
  selectedPlan: Ref<string | null>
  paymentSuccess: Ref<string | null>
  cardHolder: Ref<string>
  cardNumber: Ref<string>
  expiry: Ref<string>
  cvc: Ref<string>
  agreed: Ref<boolean>
  canPay: Ref<boolean>
  paymentAmount: Ref<number>
  plans: Plan[]
  choosePlan: (plan: Plan) => void
  completePayment: () => void
}

function checkout(): Checkout {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 12))
  const component = Subscription as unknown as {
    setup: (props: object, context: { expose: () => void }) => Checkout
  }
  const app = createSSRApp({ render: () => null })
  app.provide(ssrContextKey, { modules: new Set<string>() })
  const state = app.runWithContext(() => component.setup({}, { expose: () => {} }))
  state.choosePlan(state.plans[1])
  state.cardHolder.value = 'Test User'
  state.cardNumber.value = '4242 4242 4242 4242'
  state.expiry.value = '09/26'
  state.cvc.value = '123'
  state.agreed.value = true
  return state
}

afterEach(() => vi.useRealTimers())

describe('subscription checkout', () => {
  it('accepts the current expiry month and clears card data after demo checkout', () => {
    const state = checkout()
    expect(state.canPay.value).toBe(true)
    state.completePayment()
    expect(state.currentPlan.value).toBe('plus')
    expect(state.paymentSuccess.value).toBe('plus')
    expect(state.selectedPlan.value).toBeNull()
    expect([state.cardHolder.value, state.cardNumber.value, state.expiry.value, state.cvc.value]).toEqual(['', '', '', ''])
    expect(state.agreed.value).toBe(false)
  })

  it.each(['08/26', '00/27', '13/27', '1/27', 'ab/cd'])('rejects invalid or expired date %s', expiry => {
    const state = checkout()
    state.expiry.value = expiry
    expect(state.canPay.value).toBe(false)
    state.completePayment()
    expect(state.currentPlan.value).toBe('free')
  })

  it('rejects a blank holder, nonnumeric card, invalid CVC and missing consent', () => {
    const state = checkout()
    state.cardHolder.value = '   '
    expect(state.canPay.value).toBe(false)
    state.cardHolder.value = 'Test User'
    state.cardNumber.value = 'abcdefghijklmnop'
    expect(state.canPay.value).toBe(false)
    state.cardNumber.value = '4242424242424242'
    state.cvc.value = 'abc'
    expect(state.canPay.value).toBe(false)
    state.cvc.value = '1234'
    expect(state.canPay.value).toBe(true)
    state.agreed.value = false
    expect(state.canPay.value).toBe(false)
  })

  it('shows the full annual charge for annual billing', () => {
    const state = checkout()
    expect(state.paymentAmount.value).toBe(299)
    state.billingCycle.value = 'yearly'
    expect(state.paymentAmount.value).toBe(2976)
    state.choosePlan(state.plans[2])
    expect(state.paymentAmount.value).toBe(5964)
  })

  it('switches back to Free without a checkout', () => {
    const state = checkout()
    state.completePayment()
    state.choosePlan(state.plans[0])
    expect(state.currentPlan.value).toBe('free')
    expect(state.selectedPlan.value).toBeNull()
    expect(state.paymentSuccess.value).toBeNull()
  })
})
