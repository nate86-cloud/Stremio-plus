// Supabase's schema (schema.sql) types every user_id column as `uuid`,
// but this app authenticates against Stremio's own account system, not
// Supabase Auth — there is no real auth.users row and no real UUID for
// any user. This derives a stable, well-formed UUID from Stremio's
// opaque `_id` string, so the same Stremio account always produces the
// same uuid across sessions and devices, without requiring a Supabase
// Auth session to exist.
//
// This is UUIDv5 (SHA-1 name-based, RFC 4122 §4.3): deterministic and
// namespaced, as opposed to random UUIDv4 or a naive hash truncation —
// the same input always produces the same, valid, spec-conformant UUID.
// Requires WebCrypto's crypto.subtle.digest, available in Electron's
// renderer process same as any modern browser context.

// A fixed, arbitrary namespace UUID for this app (generated once, not
// derived from anything) — required by the UUIDv5 spec so this app's
// derived ids can't collide with UUIDv5s generated under a different
// namespace by an unrelated system hashing the same input string.
const APP_NAMESPACE_UUID = '6f0a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b'

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function uuidToBytes(uuid) {
  return hexToBytes(uuid.replace(/-/g, ''))
}

function bytesToUuid(bytes) {
  const hex = bytesToHex(bytes)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * Derives a UUIDv5 from a namespace UUID and a name string.
 * @param {string} namespaceUuid
 * @param {string} name
 * @returns {Promise<string>} a well-formed UUID string
 */
async function uuidv5(namespaceUuid, name) {
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || (typeof window !== 'undefined' && window.crypto?.subtle)
  if (!subtle) throw new Error('WebCrypto subtle not available — requires secure context (https or localhost)')
  const namespaceBytes = uuidToBytes(namespaceUuid)
  const nameBytes = new TextEncoder().encode(name)

  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length)
  combined.set(namespaceBytes, 0)
  combined.set(nameBytes, namespaceBytes.length)

  const hashBuffer = await subtle.digest('SHA-1', combined)
  const hashBytes = new Uint8Array(hashBuffer).slice(0, 16)

  // Per RFC 4122 §4.3: set version (5) and variant (RFC 4122) bits.
  hashBytes[6] = (hashBytes[6] & 0x0f) | 0x50 // version 5
  hashBytes[8] = (hashBytes[8] & 0x3f) | 0x80 // variant 10xx

  return bytesToUuid(hashBytes)
}

// Small in-memory cache so repeated calls within a session (e.g. once
// per cloudSync call) don't re-hash the same string every time.
const cache = new Map()

/**
 * Derives a stable Postgres-uuid-compatible id from a Stremio user id.
 * Same input always produces the same output — safe to call on every
 * login/sync without needing to persist the mapping anywhere.
 *
 * @param {string} stremioUserId - e.g. currentUser._id
 * @returns {Promise<string|null>} a UUID string, or null if no id given
 */
export async function deriveSupabaseUuid(stremioUserId) {
  if (!stremioUserId) return null
  if (cache.has(stremioUserId)) return cache.get(stremioUserId)

  const uuid = await uuidv5(APP_NAMESPACE_UUID, String(stremioUserId))
  cache.set(stremioUserId, uuid)
  return uuid
}
