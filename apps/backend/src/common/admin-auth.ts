import { UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export function requireAdmin(secret?: string) {
  const expected = process.env.ADMIN_REVIEW_SECRET;
  if (!expected || !secret) throw new UnauthorizedException();
  const a = Buffer.from(expected);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
}
