// ── Auth ──────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'DESIGNER' | 'STOCKER' | 'REVIEWER'
export type Status = 'ACTIVE' | 'INACTIVE'

export interface UserRoleEntry {
  role: Role
  status: Status
}

export interface User {
  id: string
  email: string
  name: string | null
  status: Status
  roles: UserRoleEntry[]
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

// ── Folders ───────────────────────────────────────────────────────────────────

export interface Folder {
  id: string
  name: string
  created_at: string
}

// ── Cores ─────────────────────────────────────────────────────────────────────

export type CoreType = 'TEXT' | 'MEDIA'
export type LanguageMode = 'TRANSLATION' | 'TRANSLITERATION'

export interface Core {
  id: string
  folder_id: string
  name: string
  core_type: CoreType
  content_type: string | null
  description: string | null
  language_mode: LanguageMode | null
  status: Status
  is_public: boolean
  legacy_core_id: string | null
  assigned_stocker_id: string | null
  created_at: string
}

export interface CoreLanguageConfig {
  id: string
  core_id: string
  language_code: string
}

export interface CoreProductTag {
  id: string
  core_id: string
  product_id: string
  entity_type_label: string | null
}

export type ValidationStatus = 'MACHINE_GENERATED' | 'EXPERT_VALIDATED'

export interface Translation {
  id: string
  item_id: string
  language_code: string
  translated_value: string
  validation_status: ValidationStatus
  validated_at: string | null
}

export interface CoreDataItem {
  id: string
  core_id: string
  english_value: string
  status: Status
  legacy_item_id: string | null
  created_by_name: string | null
  s3_url: string | null
  created_at: string
  translations: Translation[]
}

export interface BulkUploadReport {
  total_rows: number
  created: number
  skipped_duplicates: number
  translations_imported: number
  errors: string[]
}

// ── Connects ──────────────────────────────────────────────────────────────────

export interface Connect {
  id: string
  name: string
  description: string | null
  status: Status
  schema_finalised: boolean
  is_public: boolean
  assigned_stocker_id: string | null
  created_at: string
}

export type NodeType = 'CORE' | 'CONNECT'

export interface SchemaPosition {
  id: string
  connect_id: string
  position_number: number
  node_type: NodeType
  core_id: string | null
  core_name: string | null
  connect_ref_id: string | null
  connect_ref_name: string | null
  relationship_type_to_next: string | null
}

export interface ConnectDataPosition {
  id: string
  connect_data_item_id: string
  position_number: number
  core_data_item_id: string | null
  connect_data_item_ref_id: string | null
}

export interface ConnectDataItem {
  id: string
  connect_id: string
  status: Status
  created_by_name: string | null
  created_at: string
  positions: ConnectDataPosition[]
}

export interface ExcelUploadReport {
  total_rows: number
  resolved: number
  unresolved: number
  skipped_duplicates: number
  unresolved_details: { row: number; errors: string[] }[]
}

// ── Registries ────────────────────────────────────────────────────────────────

export interface Language {
  id: string
  language_code: string
  language_name_en: string
  language_name_native: string
  script: string
  direction: 'LTR' | 'RTL'
  status: Status
}

export interface RelationshipType {
  id: string
  label: string
  display_name: string
  description: string | null
  example: string | null
  usage_count: number
}

export interface Product {
  id: string
  name: string
  display_name: string
  sync_endpoint_url: string | null
  status: Status
}

// ── Similarity ────────────────────────────────────────────────────────────────

export type SimilarityStatus = 'PENDING' | 'KEEP_BOTH' | 'REMOVE_ONE' | 'MERGED' | 'IGNORED'
export type SimilarityReason = 'EXACT_DUPLICATE' | 'FORMAT_DIFFERENCE' | 'SPELLING_ERROR' | 'REARRANGED_WORDS' | 'MISSING_WORDS'

export interface SimilarityPair {
  id: string
  item_id_a: string
  item_id_b: string
  english_value_a: string | null
  english_value_b: string | null
  core_name: string | null
  similarity_score: number
  similarity_reason: SimilarityReason | null
  status: SimilarityStatus
  detected_at: string
}

export interface SimilarityQueue {
  total_pending: number
  pairs: SimilarityPair[]
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export interface ProductSyncState {
  product_id: string
  product_name: string
  last_successful_sync_at: string | null
  last_sync_mode: string | null
  pending_changes: number
}

export interface ChangeTableEntry {
  entity_id: string
  entity_name: string
  entity_category: string
  change_types: string[]
  item_count: number
}

export interface ChangeTable {
  product_id: string
  product_name: string
  total_changed_entities: number
  entities: ChangeTableEntry[]
}

export interface SyncHistory {
  id: string
  product_id: string
  sync_mode: string
  status: 'DISPATCHED' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
  initiated_by: string | null
  initiated_at: string
  completed_at: string | null
  total_items: number | null
  items_inserted: number | null
  items_updated: number | null
  items_failed: number | null
}

// ── Migration ─────────────────────────────────────────────────────────────────

export interface MigrationStatus {
  postgresql: {
    cores: { name: string; type: string; active_items: number }[]
    total_core_data_items: number
    connects: { name: string; active_items: number }[]
    total_connect_data_items: number
  }
  translations: {
    text_core_items: number
    coverage_by_language: {
      language_code: string
      language_name: string
      translated: number
      expert_validated: number
      coverage_pct: number
    }[]
  }
  neo4j: {
    total_nodes?: number
    active_nodes?: number
    total_relationships?: number
    pg_neo4j_match?: boolean
    error?: string
  }
  similarity: Record<string, number>
  migration_ready: boolean
}
