export {}

declare global {
  interface Window {
    envelopeDesktop?: {
      saveFile: (name: string, content: string) => Promise<boolean>
      openFile: () => Promise<string | null>
      loadAuto: () => Promise<string | null>
      saveAuto: (content: string) => Promise<void>
    }
  }
}
