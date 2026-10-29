import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@payloadcms/drizzle'
import { setTimeout as delay } from 'node:timers/promises'
import { createLocalReq, commitTransaction, killTransaction, type Payload } from 'payload'
import { hash, issueSession } from './session'

// Only call after OIDC signature, issuer, audience, expiry and nonce validation.
// Internal writes intentionally bypass public collection access, inside one transaction.
type Identity = { issuer: string; subject: string; name?: string }
let queue: Promise<unknown> = Promise.resolve()
export function loginIdentity(payload: Payload, identity: Identity) {
  const result = queue.then(() => provision(payload, identity))
  queue = result.catch(() => {})
  return result
}
async function provision(payload: Payload, identity: Identity) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const req = await createLocalReq({}, payload)
    try {
      // SQLite's adapter defaults to no transactions. Explicitly open one for this
      // multi-collection operation using the pinned Payload Drizzle adapter API.
      const transactionID = await beginTransaction.call(payload.db, { behavior: 'immediate' })
      if (!transactionID) throw new Error('OIDC provisioning requires transactions')
      req.transactionID = transactionID
      const found = await payload.find({ collection: 'auth-identities', where: { and: [{ issuer: { equals: identity.issuer } }, { subject: { equals: identity.subject } }] }, depth: 0, limit: 1, overrideAccess: true, req })
      let userId: number
      if (found.docs[0]) {
        const relation = found.docs[0].user
        userId = typeof relation === 'object' ? relation.id : relation
      } else {
        // OIDC names/emails never determine identity or grant an admin role.
        const username = `okta_${hash(`${identity.issuer}\0${identity.subject}`).slice(0, 20)}${randomBytes(3).toString('hex')}`
        const user = await payload.create({ collection: 'users', data: {
          username, displayName: identity.name?.trim().slice(0, 60) || 'Oktaユーザー', role: 'member', authProvider: 'okta',
          password: randomBytes(48).toString('base64url'),
        }, overrideAccess: true, req })
        userId = user.id
        await payload.create({ collection: 'auth-identities', data: { ...identity, user: userId }, overrideAccess: true, req })
      }
      const user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true, req })
      if (user.authProvider !== 'okta') throw new Error('Identity is not an Okta account')
      const token = await issueSession(payload, userId, req)
      await commitTransaction(req)
      return { token, userId }
    } catch (e) {
      await killTransaction(req)
      if (attempt === 2) throw e
      await delay(40 * (attempt + 1))
      // Retry a uniqueness/write conflict with a new transaction and re-read identity.
    }
  }
  throw new Error('Identity provisioning failed')
}
