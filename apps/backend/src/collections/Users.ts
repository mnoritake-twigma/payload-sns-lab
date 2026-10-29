import { APIError } from 'payload'
import { oktaStrategy, oidcMe, oidcLogout } from '../oidc/session'
import type { Access, CollectionConfig, FieldAccess } from 'payload'

const adminOnly: Access = ({ req }) => req.user?.role === 'admin'
const adminField: FieldAccess = ({ req }) => req.user?.role === 'admin'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'ユーザー', plural: 'ユーザー' },
  admin: { useAsTitle: 'username', defaultColumns: ['username', 'displayName', 'role'] },
  hooks: {
    me: [oidcMe], afterLogout: [oidcLogout],
    beforeLogin: [({ user }) => { if (user.authProvider === 'okta') throw new APIError('Oktaでログインしてください。', 401); return user }],
  },
  auth: {
    strategies: [oktaStrategy],
    loginWithUsername: { allowEmailLogin: false, requireEmail: false },
    tokenExpiration: 3600,
    useSessions: true,
    removeTokenFromResponses: true,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
  },
  access: {
    admin: ({ req }) => req.user?.role === 'admin',
    create: adminOnly,
    read: ({ req }) => Boolean(req.user),
    update: adminOnly,
    delete: () => false,
  },
  fields: [
    { name: 'authProvider', type: 'select', required: true, defaultValue: 'local', options: ['local', 'okta'], admin: { readOnly: true }, access: { create: () => false, update: () => false } },
    {
      name: 'username', type: 'text', required: true, unique: true,
      hooks: { beforeValidate: [({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value] },
      validate: (value: unknown) => typeof value === 'string' && /^[a-z0-9_]{3,32}$/.test(value)
        ? true : 'ユーザー名は小文字の英数字とアンダースコアで3〜32文字です。',
      access: { create: adminField, update: adminField },
    },
    { name: 'displayName', label: '表示名', type: 'text', required: true, maxLength: 60 },
    {
      name: 'role', label: '権限', type: 'select', required: true, defaultValue: 'member',
      options: [{ label: '一般ユーザー', value: 'member' }, { label: '管理者', value: 'admin' }],
      saveToJWT: true,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'email', type: 'email',
      access: {
        read: ({ req, doc }) => req.user?.role === 'admin' || (Boolean(req.user) && req.user?.id === doc?.id),
        create: adminField, update: adminField,
      },
    },
    {
      name: 'password', type: 'text', hidden: true,
      access: { create: adminField, update: adminField },
      validate: (value: unknown) => !value || (typeof value === 'string' && value.length >= 12)
        ? true : 'パスワードは12文字以上にしてください。',
    },
  ],
}
