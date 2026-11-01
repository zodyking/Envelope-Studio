import type { FlapStyle } from './types'

export const FLAP_STYLES: { id: FlapStyle; name: string }[] = [
  { id: 'commercial', name: 'Commercial' },
  { id: 'square', name: 'Square' },
  { id: 'pointed', name: 'Pointed' },
  { id: 'contour', name: 'Contour' },
]

function n(value: number) {
  return Math.round(value * 100) / 100
}

/** One seal flap, drawn from the top edge. Side and bottom seams are not shown. */
export function flapPath(w: number, h: number, style: FlapStyle): string {
  if (style === 'square') {
    const depth = Math.min(h * 0.34, 38)
    return `M0 0 H${n(w)} V${n(depth)} H0 Z`
  }
  if (style === 'pointed') {
    const depth = Math.min(h * 0.62, 72)
    return `M0 0 H${n(w)} L${n(w / 2)} ${n(depth)} Z`
  }
  if (style === 'contour') {
    const depth = Math.min(h * 0.5, 56)
    return `M0 0 H${n(w)} Q${n(w)} ${n(depth * 0.72)}, ${n(w / 2)} ${n(depth)} Q0 ${n(depth * 0.72)}, 0 0 Z`
  }
  const depth = Math.min(h * 0.42, 46)
  const inset = Math.min(w * 0.08, 18)
  return `M0 0 H${n(w)} L${n(w - inset)} ${n(depth)} H${n(inset)} Z`
}
