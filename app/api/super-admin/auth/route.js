import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    // Verify environment variables are present in runtime environment
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables on server');
      return NextResponse.json({
        error: 'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in Vercel Environment Variables. Please add them in Project Settings and redeploy.',
      }, { status: 500 });
    }

    // Read credentials from Supabase
    const { data, error: dbError } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'super_admin')
      .maybeSingle();

    if (dbError) {
      console.error('Admin auth DB query error:', dbError);
      return NextResponse.json({
        error: `Database error: ${dbError.message}`,
      }, { status: 500 });
    }

    if (!data?.value) {
      return NextResponse.json({
        error: 'Admin not configured in database table app_settings',
      }, { status: 404 });
    }

    const validUser = data.value.username;
    const validPass = data.value.password;

    if (username === validUser && password === validPass) {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      return NextResponse.json({ success: true, token });
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
