import type { Box } from './types'

export type PageAlign = 'center' | 'centerX' | 'centerY' | 'left' | 'right' | 'top' | 'bottom'
export type PeerAlign = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

function quarter(value: number) {
  return Math.round(value * 4) / 4
}

function snapAxis(origin: number, size: number, stops: number[], threshold: number) {
  const points = [0, size / 2, size]
  let best: { dist: number; value: number; guide: number } | null = null
  for (const point of points) {
    for (const stop of stops) {
      const value = stop - point
      const dist = Math.abs(origin - value)
      if (dist <= threshold && (!best || dist < best.dist)) best = { dist, value, guide: stop }
    }
  }
  return best
}

export function snapMove(frame: Box, peers: Box[], page: { w: number; h: number }, threshold = 1.75) {
  const xs = [0, page.w / 2, page.w]
  const ys = [0, page.h / 2, page.h]
  for (const peer of peers) {
    xs.push(peer.x, peer.x + peer.w / 2, peer.x + peer.w)
    ys.push(peer.y, peer.y + peer.h / 2, peer.y + peer.h)
  }
  const x = snapAxis(frame.x, frame.w, xs, threshold)
  const y = snapAxis(frame.y, frame.h, ys, threshold)
  return {
    x: x ? x.value : quarter(frame.x),
    y: y ? y.value : quarter(frame.y),
    guideX: x ? x.guide : null,
    guideY: y ? y.guide : null,
  }
}

export function alignOnPage(frame: Box, page: { w: number; h: number }, how: PageAlign): Box {
  const next = { ...frame }
  if (how === 'left') next.x = 0
  if (how === 'right') next.x = page.w - frame.w
  if (how === 'center' || how === 'centerX') next.x = (page.w - frame.w) / 2
  if (how === 'top') next.y = 0
  if (how === 'bottom') next.y = page.h - frame.h
  if (how === 'center' || how === 'centerY') next.y = (page.h - frame.h) / 2
  return { ...next, x: quarter(next.x), y: quarter(next.y) }
}

export function alignToPeer(frame: Box, peer: Box, how: PeerAlign): Box {
  const next = { ...frame }
  if (how === 'left') next.x = peer.x
  if (how === 'right') next.x = peer.x + peer.w - frame.w
  if (how === 'centerX') next.x = peer.x + peer.w / 2 - frame.w / 2
  if (how === 'top') next.y = peer.y
  if (how === 'bottom') next.y = peer.y + peer.h - frame.h
  if (how === 'centerY') next.y = peer.y + peer.h / 2 - frame.h / 2
  return { ...next, x: quarter(next.x), y: quarter(next.y) }
}
