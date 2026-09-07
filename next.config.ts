import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      /**
       * `beforeFiles` matters here. A plain array of rewrites is treated as
       * `afterFiles`, which only runs when no file route matched - so any
       * app/page.tsx at "/" would win and the landing page would never show.
       */
      beforeFiles: [
        // Serve the hand-built landing page at "/".
        //
        // It stays as plain HTML on purpose. The design is a large amount of
        // hand-written CSS and inline SVG; rewriting it as React components
        // would risk breaking it for no benefit today. Its forms call the same
        // /api routes as the rest of the app, so the database is fully wired
        // in either way, and it can be moved to components later one section
        // at a time without changing anything behind it.
        {
          source: '/',
          destination: '/landing.html',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
