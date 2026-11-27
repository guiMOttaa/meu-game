import { Segment, Vec2 } from './types';

interface RayHit {
  x: number;
  y: number;
  angle: number;
  distSq: number;
}

function raySegmentIntersection(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  seg: Segment
): { x: number; y: number; t: number } | null {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-8) return null;

  const qpx = seg.x1 - ox;
  const qpy = seg.y1 - oy;

  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;

  if (t >= 0 && u >= -1e-5 && u <= 1 + 1e-5) {
    return {
      x: ox + t * dx,
      y: oy + t * dy,
      t,
    };
  }
  return null;
}

/**
 * Computes a 2D raycasted visibility polygon around `origin` occluded by `segments`.
 * Closed walls and locked doors cleanly block sightlines to unseen areas.
 */
export function computeVisibilityPolygon(
  origin: Vec2,
  segments: Segment[],
  maxRadius: number
): Vec2[] {
  const boundMinX = origin.x - maxRadius;
  const boundMaxX = origin.x + maxRadius;
  const boundMinY = origin.y - maxRadius;
  const boundMaxY = origin.y + maxRadius;

  // Bounding box segments ensure every ray terminates cleanly
  const allSegments: Segment[] = [
    ...segments,
    { x1: boundMinX, y1: boundMinY, x2: boundMaxX, y2: boundMinY },
    { x1: boundMaxX, y1: boundMinY, x2: boundMaxX, y2: boundMaxY },
    { x1: boundMaxX, y1: boundMaxY, x2: boundMinX, y2: boundMaxY },
    { x1: boundMinX, y1: boundMaxY, x2: boundMinX, y2: boundMinY },
  ];

  const angles: number[] = [];
  const eps = 0.00045;

  for (let i = 0; i < allSegments.length; i++) {
    const s = allSegments[i];
    // Quick distance cull for far segments outside bounding box
    if (
      Math.max(s.x1, s.x2) < boundMinX ||
      Math.min(s.x1, s.x2) > boundMaxX ||
      Math.max(s.y1, s.y2) < boundMinY ||
      Math.min(s.y1, s.y2) > boundMaxY
    ) {
      continue;
    }
    const a1 = Math.atan2(s.y1 - origin.y, s.x1 - origin.x);
    const a2 = Math.atan2(s.y2 - origin.y, s.x2 - origin.x);
    angles.push(a1 - eps, a1, a1 + eps, a2 - eps, a2, a2 + eps);
  }

  // Also sample a gentle ring of angles to keep circular falloff smooth
  const ringSteps = 24;
  for (let i = 0; i < ringSteps; i++) {
    angles.push(-Math.PI + (i / ringSteps) * Math.PI * 2);
  }

  const hits: RayHit[] = [];

  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestT = maxRadius;
    let hitX = origin.x + dx * maxRadius;
    let hitY = origin.y + dy * maxRadius;

    for (let j = 0; j < allSegments.length; j++) {
      const res = raySegmentIntersection(origin.x, origin.y, dx, dy, allSegments[j]);
      if (res && res.t < closestT) {
        closestT = res.t;
        hitX = res.x;
        hitY = res.y;
      }
    }

    hits.push({
      x: hitX,
      y: hitY,
      angle,
      distSq: closestT * closestT,
    });
  }

  hits.sort((a, b) => a.angle - b.angle);

  // Deduplicate nearly identical vertices
  const polygon: Vec2[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const prev = polygon[polygon.length - 1];
    if (!prev || Math.abs(prev.x - h.x) > 0.4 || Math.abs(prev.y - h.y) > 0.4) {
      polygon.push({ x: h.x, y: h.y });
    }
  }

  return polygon;
}
