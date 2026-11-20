import type { PublicUser } from '../../../shared/schema.ts';

const COLORS = ['#3b6cf6', '#12a150', '#e8590c', '#9c36b5', '#0c8599', '#d6336c', '#5c7cfa', '#f08c00'];

export function Avatar({ user, size = 40 }: { user: Pick<PublicUser, 'id' | 'name'>; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.45, background: COLORS[user.id % COLORS.length] }}
      aria-hidden="true"
    >
      {Array.from(user.name)[0] ?? '?'}
    </span>
  );
}
