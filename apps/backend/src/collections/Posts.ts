import { APIError, type CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: '投稿', plural: '投稿' },
  admin: { useAsTitle: 'body', defaultColumns: ['body', 'author', 'createdAt'] },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: () => false,
    delete: ({ req }) => req.user ? { author: { equals: req.user.id } } : false,
  },
  hooks: {
    beforeValidate: [({ data, req, operation }) => {
      if (operation !== 'create') return data
      if (!req.user) throw new APIError('ログインしてください。', 401)
      if (data?.author !== undefined && data.author !== req.user.id) {
        throw new APIError('投稿者を変更することはできません。', 403)
      }
      // The authenticated identity, never a client-supplied profile, owns the post.
      return { ...data, author: req.user.id }
    }],
  },
  fields: [
    {
      name: 'body', label: '本文', type: 'textarea', required: true, maxLength: 500,
      validate: (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 500
        ? true : '本文は空白以外を含む1〜500文字で入力してください。',
    },
    { name: 'author', label: '投稿者', type: 'relationship', relationTo: 'users', required: true, index: true, admin: { readOnly: true } },
    { name: 'createdAt', type: 'date', index: true, admin: { readOnly: true }, access: { create: () => false, update: () => false } },
  ],
}
