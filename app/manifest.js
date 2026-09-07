export default function manifest() {
  return {
    name: 'Asuk Tech Wi-Fi Hotspot',
    short_name: 'Asuk Wi-Fi',
    description: 'Instant Wi-Fi hotspot passes, live session countdown tracker, and wallet manager.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#141417',
    theme_color: '#141417',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable any',
      },
    ],
  };
}
