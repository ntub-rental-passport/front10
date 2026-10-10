export interface SpaceUsage {
  id: number
  name: string
  ownerId: number
  ownerName: string | null
  memberCount: number
}

export interface AccountUsage {
  landlord: { properties: number, rooms: number, seats: number } | null
  tenant: { ownedSpaces: SpaceUsage[], joinedSpaces: SpaceUsage[] } | null
}
