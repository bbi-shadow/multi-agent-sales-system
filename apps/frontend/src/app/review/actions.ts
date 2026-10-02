'use server';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'salesmind_review';
const EIGHT_HOURS = 8 * 60 * 60;

function adminSecret(): string {
  const secret = process.env.ADMIN_REVIEW_SECRET;
  if (!secret) throw new Error('ADMIN_REVIEW_SECRET chưa được cấu hình');
  return secret;
}

function signature(expires: string): string {
  return createHmac('sha256', adminSecret())
    .update(`review:${expires}`)
    .digest('hex');
}

function equalText(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export async function isReviewer(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return false;

  const parts = value.split('.');
  if (parts.length !== 2) return false;

  const [expires, received] = parts;
  if (!/^\d{13}$/.test(expires) || !/^[a-f0-9]{64}$/.test(received)) {
    return false;
  }
  if (Number(expires) <= Date.now()) return false;

  return equalText(received, signature(expires));
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (!equalText(password, adminSecret())) {
    redirect('/review?error=login');
  }

  const expires = String(Date.now() + EIGHT_HOURS * 1000);
  (await cookies()).set(COOKIE_NAME, `${expires}.${signature(expires)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false, // Máy ảo hiện dùng HTTP nội bộ
    path: '/review',
    maxAge: EIGHT_HOURS,
  });

  redirect('/review');
}

export async function logoutAction() {
  (await cookies()).set(COOKIE_NAME, '', {
    path: '/review',
    maxAge: 0,
  });
  redirect('/review');
}

export async function reviewAction(formData: FormData) {
  if (!(await isReviewer())) redirect('/review');

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!/^[a-f0-9]{24}$/i.test(id)) redirect('/review?error=invalid');
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    redirect('/review?error=invalid');
  }
  if (status === 'REJECTED' && !note) {
    redirect('/review?error=note');
  }

  const response = await fetch(
    `http://backend:4000/api/v1/drafts/${id}/review`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-review-secret': adminSecret(),
      },
      body: JSON.stringify({ status, note }),
      cache: 'no-store',
    },
  );

  if (!response.ok) redirect('/review?error=update');
  redirect('/review');
}
