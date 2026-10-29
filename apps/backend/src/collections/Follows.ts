import { APIError, type CollectionConfig } from 'payload'

export const Follows: CollectionConfig = {
  slug: 'follows',
  labels: { singular: 'フォロー', plural: 'フォロー' },
  admin: { defaultColumns: ['follower', 'following', 'createdAt'] },
  indexes: [{ fields: ['follower', 'following'], unique: true }],
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: () => false,
    delete: ({ req }) => req.user ? { follower: { equals: req.user.id } } : false,
  },
  hooks: {
    beforeValidate: [async ({ data, req, operation }) => {
      if (operation !== 'create') return data
      if (!req.user) throw new APIError('ログインしてください。', 401)
      if (data?.follower !== undefined && data.follower !== req.user.id) throw new APIError('他人の名義ではフォローできません。', 403)
      if (!Number.isSafeInteger(data?.following) || data!.following <= 0) throw new APIError('対象ユーザーを指定してください。', 400)
      if (data!.following === req.user.id) throw new APIError('自分自身はフォローできません。', 400)
      const target = await req.payload.find({ collection: 'users', where: { id: { equals: data!.following } }, limit: 1, depth: 0, req, overrideAccess: false })
      if (!target.docs.length) throw new APIError('対象ユーザーが見つかりません。', 404)
      return { ...data, follower: req.user.id }
    }],
  },
  fields: [
    { name: 'follower', label: 'フォローする人', type: 'relationship', relationTo: 'users', required: true, admin: { readOnly: true } },
    { name: 'following', label: 'フォローされる人', type: 'relationship', relationTo: 'users', required: true, index: true },
  ],
}
