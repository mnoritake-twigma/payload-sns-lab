import type { CollectionConfig } from 'payload'
const privateAccess = { create: () => false, read: () => false, update: () => false, delete: () => false }
export const AuthIdentities: CollectionConfig = {
  slug: 'auth-identities', admin: { hidden: true }, access: privateAccess,
  indexes: [{ fields: ['issuer', 'subject'], unique: true }],
  fields: [
    { name: 'issuer', type: 'text', required: true },
    { name: 'subject', type: 'text', required: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
  ],
}
export const OidcSessions: CollectionConfig = {
  slug: 'oidc-sessions', admin: { hidden: true }, access: privateAccess,
  fields: [
    { name: 'tokenHash', type: 'text', required: true, unique: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}
// A unique consumed-state marker prevents callback replay, including simultaneous callbacks.
export const OidcFlows: CollectionConfig = {
  slug: 'oidc-flows', admin: { hidden: true }, access: privateAccess,
  fields: [
    { name: 'stateHash', type: 'text', required: true, unique: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}
