import type { Timestamp } from 'firebase/firestore'
import type { ModerateReq } from '../lib/firebase'

export type Status = 'pending' | 'review' | 'approved' | 'rejected'
export type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY'

export type Contribution = {
  id: string
  uid: string
  participantNumber: number
  status: Status
  prefecture?: string | null
  country?: string | null
  kiosk?: boolean
  consent?: { minorSupervised?: boolean }
  type?: 'photo' | 'video'
  durationSec?: number | null
  files?: { original?: string; thumb?: string | null; public?: string | null; video?: string | null }
  thumbUrl?: string
  publicUrl?: string
  videoUrl?: string | null
  safeSearch?: Record<string, Likelihood> | null
  duplicateOf?: string | null
  reviewReason?: 'duplicate' | 'safesearch' | 'manual' | null
  reports?: number
  featured?: boolean
  personality?: boolean
  priority?: number
  createdAt?: Timestamp
  moderatedByEmail?: string | null
  moderatedAt?: Timestamp
  rejectReason?: string | null
}

export type HistoryEntry = { id: string; action: string; reason?: string | null; block?: boolean; by: string; byEmail?: string | null; at?: Timestamp }
export type Action = Omit<ModerateReq, 'id'>
export const FLAGGED: Likelihood[] = ['LIKELY', 'VERY_LIKELY']
