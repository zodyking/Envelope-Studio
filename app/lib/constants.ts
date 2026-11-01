import type { Box, SurfaceId, TextStyle } from './types'

export const MM = 96 / 25.4
export const PT = 72 / 25.4
export const STORAGE_KEY = 'envelope-studio-v4'
export const LEGACY_KEY = 'envelope-studio-v3'

export const FONTS = [
  'Arial',
  'Calibri',
  'Segoe UI',
  'Verdana',
  'Georgia',
  'Cambria',
  'Times New Roman',
  'Courier New',
] as const

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36]

export interface EnvelopeSize {
  id: string
  name: string
  w: number
  h: number
}

export const ENVELOPE_SIZES: EnvelopeSize[] = [
  { id: '10', name: '#10 Commercial', w: 241.3, h: 104.775 },
  { id: '9', name: '#9 Commercial', w: 225.425, h: 98.425 },
  { id: 'monarch', name: 'Monarch', w: 190.5, h: 98.425 },
  { id: '6_3_4', name: '#6¾', w: 165.1, h: 92.075 },
  { id: 'dl', name: 'DL', w: 220, h: 110 },
  { id: 'c6', name: 'C6', w: 162, h: 114 },
  { id: 'c5', name: 'C5', w: 229, h: 162 },
  { id: 'a2', name: 'A2 Invitation', w: 146.05, h: 111.125 },
  { id: 'a6', name: 'A6 Invitation', w: 165.1, h: 120.65 },
  { id: 'a7', name: 'A7 Invitation', w: 184.15, h: 133.35 },
  { id: 'square', name: 'Square 6 × 6', w: 152.4, h: 152.4 },
  { id: 'custom', name: 'Custom', w: 241.3, h: 104.775 },
]

export const SURFACE_LABEL: Record<SurfaceId, string> = {
  envelope: 'Envelope front',
  back: 'Envelope back',
  letter: 'Letter',
  letterBack: 'Letter back',
}

export const DEFAULT_WINDOWS: Record<'recipient' | 'sender', Box> = {
  recipient: { x: 22.2, y: 63.5, w: 114.3, h: 28.6 },
  sender: { x: 12.7, y: 12.7, w: 63.5, h: 19.05 },
}

export const DEFAULT_FRAMES: Record<'recipient' | 'sender' | 'stamp', Box> = {
  recipient: { x: 83, y: 49, w: 125, h: 43 },
  sender: { x: 13, y: 13, w: 111, h: 28 },
  stamp: { x: 197, y: 10, w: 35, h: 25 },
}

export function textStyle(partial: Partial<TextStyle> = {}): TextStyle {
  return {
    font: 'Arial',
    size: 12,
    color: '#242424',
    align: 'left',
    bold: false,
    italic: false,
    underline: false,
    lineHeight: 1.3,
    ...partial,
  }
}

export function uid(prefix = 'o') {
  return prefix + Math.random().toString(36).slice(2, 10)
}
