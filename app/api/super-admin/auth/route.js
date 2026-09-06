import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    // Read credentials from Supabase only
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'super_admin')
      .maybeSingle();

    if (!data?.value) {
      return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
