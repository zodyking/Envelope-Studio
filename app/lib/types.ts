export type SurfaceId = 'envelope' | 'back' | 'letter' | 'letterBack'
export type StyleId = 'plain' | 'single' | 'double'
export type Role = 'recipient' | 'sender'
export type Align = 'left' | 'center' | 'right'
export type FoldMode = 'front' | 'back' | 'none'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TextStyle {
  font: string
  size: number
  color: string
  align: Align
  bold: boolean
  italic: boolean
  underline: boolean
  lineHeight: number
}

export interface TextField {
  html: string
  style: TextStyle
  frame: Box
}

export interface DesignItem {
  id: string
  type: 'text' | 'rect' | 'line' | 'image'
  frame: Box
  html?: string
  style?: TextStyle
  color?: string
  stroke?: number
  filled?: boolean
  src?: string
  name?: string
}

export interface Stamp {
  src: string
  name: string
  dpi: number
  frame: Box
}

export interface MailDoc {
  version: 4
  title: string
  sizeId: string
  w: number
  h: number
  style: StyleId
  sortingAssist: boolean
  foldGuides: FoldMode
  cal: { x: number; y: number }
  insert: { sheet: 'letter' | 'a4'; panel: 0 | 1 | 2; left: number; top: number }
  windows: Record<Role, Box>
  windowShift: Record<Role, { x: number; y: number }>
  recipient: TextField
  sender: TextField
  surfaces: Record<SurfaceId, { bg: string; items: DesignItem[] }>
  stamp: Stamp | null
  batchText: string
  batchEnabled: boolean
  view: SurfaceId
}

export interface NormBox {
  x: number
  y: number
  w: number
  h: number
}
