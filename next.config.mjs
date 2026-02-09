/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self' https: wss:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https:",
              "style-src 'self' 'unsafe-inline' https:",
              "img-src 'self' data: blob: https: *",
              "font-src 'self' data: https:",
              "connect-src 'self' https: wss: blob: data:",
              "media-src 'self' blob: https: data:",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
              "frame-src 'self' https:",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
