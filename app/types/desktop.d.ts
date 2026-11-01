export {}

declare global {
  interface Window {
    envelopeDesktop?: {
      saveFile: (name: string, content: string) => Promise<boolean>
      openFile: () => Promise<string | null>
      loadAuto: () => Promise<string | null>
      saveAuto: (content: string) => Promise<void>
      listPrinters: () => Promise<{ name: string; displayName: string }[]>
      printDocument: (options: {
        deviceName: string
        copies: number
        paper: 'Letter' | 'A4' | 'custom'
        widthMicrons: number
        heightMicrons: number
        landscape: boolean
        duplexMode: 'simplex' | 'shortEdge' | 'longEdge'
        color: boolean
        collate: boolean
        pageRanges?: { from: number; to: number }[]
      }) => Promise<{ success: boolean; failureReason: string }>
    }
  }
}
