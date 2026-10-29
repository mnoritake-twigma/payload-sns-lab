import { withPayload } from '@payloadcms/next/withPayload'

export default withPayload({
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/\/api\/oidc\/callback/] } },
  // Keep development requests on the loopback interface.
  allowedDevOrigins: ['localhost', '127.0.0.1'],
})
