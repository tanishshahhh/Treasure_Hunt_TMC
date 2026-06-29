import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// ─── GET /api/auth/me — Check current session ───
// The client calls this on page load to see if the httpOnly cookie holds a valid session.
// Returns the user info (username, role) if authenticated, 401 otherwise.
export async function GET(request) {
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  return NextResponse.json({
    success: true,
    user: { username: auth.user.username, role: auth.user.role },
  });
}
