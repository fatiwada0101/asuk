import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    // Fetch all public-facing settings in one query
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', ['flutterwave', 'branding']);

    let flwPublicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
    let flwEnabled = false;
    let branding = {
      app_name: 'Asuk Tech',
      logo_url: '',
      theme: 'violet',
    };

    if (settings) {
      for (const s of settings) {
        if (s.key === 'flutterwave' && s.value) {
          if (s.value.public_key) flwPublicKey = s.value.public_key;
          flwEnabled = !!s.value.enabled;
        }
        if (s.key === 'branding' && s.value) {
          branding = {
            app_name: s.value.app_name || branding.app_name,
            logo_url: s.value.logo_url || branding.logo_url,
            theme: s.value.theme || branding.theme,
          };
        }
      }
    }


    return NextResponse.json({
      flutterwave: {
        publicKey: flwPublicKey,
        enabled: flwEnabled,
      },
      branding,
    });
  } catch (error) {
    return NextResponse.json({
      flutterwave: { publicKey: '', enabled: false },
      branding: { app_name: 'Asuk Tech', logo_url: '', theme: 'violet' },
    });
  }
}
