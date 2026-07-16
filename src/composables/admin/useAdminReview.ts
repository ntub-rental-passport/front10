import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedListings,
  seedRatings,
  type ListingSubmission,
  type RatingSubmission,
} from '@/src/mocks/admin-seed'

const listings = createAdminCollection<ListingSubmission[]>('listings', seedListings)
const ratings = createAdminCollection<RatingSubmission[]>('ratings', seedRatings)

export function useAdminReview() {
  const { logAction } = useAdminAudit()

  const pendingListings = computed(() =>
    listings.value.filter((item) => item.status === 'pending'),
  )
  const pendingRatings = computed(() => ratings.value.filter((item) => item.status === 'pending'))

  function approveListing(id: string): void {
    const listing = listings.value.find((item) => item.id === id)
    if (!listing) return
    listing.status = 'approved'
    listing.rejectReason = null
    logAction('審核', listing.title, '物件審核通過')
  }

  function rejectListing(id: string, reason: string): void {
    const listing = listings.value.find((item) => item.id === id)
    if (!listing) return
    listing.status = 'rejected'
    listing.rejectReason = reason
    logAction('審核', listing.title, `退回物件：${reason}`)
  }

  function approveRating(id: string): void {
    const rating = ratings.value.find((item) => item.id === id)
    if (!rating) return
    rating.status = 'approved'
    rating.rejectReason = null
    logAction('審核', `${rating.listingTitle} 的評價`, '評價審核通過並公開')
  }

  function rejectRating(id: string, reason: string): void {
    const rating = ratings.value.find((item) => item.id === id)
    if (!rating) return
    rating.status = 'rejected'
    rating.rejectReason = reason
    logAction('審核', `${rating.listingTitle} 的評價`, `退回評價：${reason}`)
  }

  return {
    listings,
    ratings,
    pendingListings,
    pendingRatings,
    approveListing,
    rejectListing,
    approveRating,
    rejectRating,
  }
}
