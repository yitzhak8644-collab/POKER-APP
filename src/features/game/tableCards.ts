/** The cards printed on the real table. */
export const ACE_SUITS = ['spade', 'heart', 'diamond', 'club'] as const
export type Suit = (typeof ACE_SUITS)[number]

/** Fan angles (degrees) of the four aces printed at each end of the table. */
export const ACE_FAN_ANGLES = [-38, -13, 13, 38] as const

export type CommunityCard = 'flop' | 'turn' | 'river'

/**
 * The five community-card slots, stacked along the table: three for the flop (turned over together),
 * then one for the turn and one for the river. `dy` is the slot's top edge relative to the table's middle.
 */
export const COMMUNITY_SLOTS: readonly { card: CommunityCard; dy: number }[] = [
  { card: 'flop', dy: -44 },
  { card: 'flop', dy: -27 },
  { card: 'flop', dy: -10 },
  { card: 'turn', dy: 17 },
  { card: 'river', dy: 34 },
]

export const SLOT_W = 34
export const SLOT_H = 13
