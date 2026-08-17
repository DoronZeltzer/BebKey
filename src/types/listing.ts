export interface Listing {
  id: string
  source: string | null
  source_url: string | null
  price: number | null
  city: string | null
  street: string | null
  neighborhood: string | null
  size_m2: number | null
  rooms: number | null
  floor: number | null
  total_floors?: number | null
  property_type: string | null
  condition?: string | null
  deal_type: 'forsale' | 'rent' | null
  lat: number | null
  lng: number | null
  description: string | null
  description_en: string | null
  description_ru: string | null
  description_ar: string | null
  description_fr: string | null
  images: string[]
  is_active: boolean
  is_locked?: boolean
  contact_phone?: string | null
  agent_user_id?: string | null
  agent_email?: string | null
  agent_name?: string | null
  posted_by_user_id?: string | null
  created_at?: string
  scraped_at?: string
  source_id?: string | null
  title?: string | null
  view_count?: number | null
  has_image?: boolean | null
  quality_score?: number | null
  previous_price?: number | null
  deactivated_at?: string | null
  ai_summary?: string | null
  is_featured?: boolean | null
  featured_until?: string | null
  // Listing boosts (see src/lib/boosts.ts)
  spotlight_until?: string | null
  bump_until?: string | null
  tag_kind?: 'hot' | 'reduced' | null
  tag_until?: string | null
  // Upcoming open-house event (parsed from descriptions by extract_open_houses.py)
  open_house_at?: string | null
  open_house_note?: string | null
  // Israeli feature flags
  tabu?: boolean | null
  pinui_binui?: boolean | null
  tama_38?: boolean | null
  mamad?: boolean | null
  parking?: boolean | null
  elevator?: boolean | null
  balcony?: boolean | null
  storage_room?: boolean | null
  animals_allowed?: boolean | null
  furnished?: boolean | null
  air_conditioning?: boolean | null
  accessible?: boolean | null
}
