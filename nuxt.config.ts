export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/studio.css'],
  app: {
    head: {
      title: 'Envelope Studio',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'application-name', content: 'Envelope Studio' },
        { name: 'theme-color', content: '#185ABD' },
        { name: 'color-scheme', content: 'light' },
      ],
      link: [{ rel: 'icon', href: '/favicon.svg' }],
    },
  },
  devServer: { port: 3000 },
  vite: {
    optimizeDeps: {
      include: ['pdfjs-dist'],
    },
  },
})
