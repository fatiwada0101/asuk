import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth } from '@/lib/admin-auth';
import { validateUserAuth } from '@/lib/user-auth';

// GET — Fetch user's notifications (requires Bearer token auth)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Verify the requester is the owner of these notifications
    const authUser = await validateUserAuth(request);
    if (!authUser || authUser.id !== userId) {
      return NextResponse.json({ notifications: [], unread_count: 0 });
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Fetch notifications error:', error);
      return NextResponse.json({ notifications: [] });
    }

    const unreadCount = (data || []).filter(n => !n.is_read).length;

    return NextResponse.json({
      notifications: data || [],
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error('Notifications error:', error);
    return NextResponse.json({ notifications: [], unread_count: 0 });
  }
}

// PATCH — Mark notifications as read (requires Bearer token auth)
export async function PATCH(request) {
  try {
    const { notification_ids, user_id, mark_all } = await request.json();

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Verify the requester owns these notifications
    const authUser = await validateUserAuth(request);
    if (!authUser || authUser.id !== user_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (mark_all) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user_id)
        .eq('is_read', false);
    } else if (notification_ids && notification_ids.length > 0) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .in('id', notification_ids)
        .eq('user_id', user_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — Create a notification (internal/admin use only)
export async function POST(request) {
  // Restrict to super admin — user-facing routes insert notifications server-side
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { user_id, title, message, type } = await request.json();

    if (!user_id || !title) {
      return NextResponse.json({ error: 'Missing user_id or title' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id,
        title,
        message: message || '',
        type: type || 'general',
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Create notification error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, notification: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
