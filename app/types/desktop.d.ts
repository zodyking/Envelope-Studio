export {}

declare global {
  interface Window {
    envelopeDesktop?: {
      saveFile: (name: string, content: string) => Promise<boolean>
      openFile: () => Promise<string | null>
      loadAuto: () => Promise<string | null>
      saveAuto: (content: string) => Promise<void>
      listPrinters: () => Promise<{ name: string; displayName: string }[]>
      printDocument: (options: { deviceName: string; copies: number; widthMicrons: number; heightMicrons: number }) => Promise<{ success: boolean; failureReason: string }>
    }
  }
}
