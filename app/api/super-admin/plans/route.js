import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

// GET — fetch all plans (public, no auth required)
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Plans fetch error:', error);
    return NextResponse.json([], { status: 500 });
  }
}

// POST — create or update a plan (admin only)
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const plan = await request.json();

    if (!plan.id || !plan.name || !plan.price || !plan.duration) {
      return NextResponse.json({ error: 'Missing required plan fields (id, name, price, duration)' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('plans')
      .upsert({
        id: plan.id,
        name: plan.name,
        speed: plan.speed || '',
        price: Number(plan.price),
        duration: plan.duration,
        popular: plan.popular || false,
        active: plan.active !== undefined ? plan.active : true,
        sort_order: plan.sort_order || 0,
        devices: Number(plan.devices) || 1,
        upload_speed: plan.upload_speed || '12M',
        download_speed: plan.download_speed || '12M',
      }, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Plan save error:', error);
    return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 });
  }
}

// DELETE — deactivate or remove a plan (admin only)
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing plan id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('plans')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Plan delete error:', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
