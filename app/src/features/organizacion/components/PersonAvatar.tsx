import type { Crop } from '../crops';
import { initials } from '../lib';

/** A person's initials on the color of their branch (ADR-0002); neutral when they have none. */
export function PersonAvatar({ name, crop, size = 36 }: { name: string; crop?: Crop; size?: number }) {
  return (
    <span className="person-avatar" data-crop={crop} style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
