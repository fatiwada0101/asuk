'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function StatusRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      router.replace(`/vouchers/status?code=${encodeURIComponent(code)}`);
    } else {
      router.replace('/vouchers/status');
    }
  }, [router, searchParams]);

  return (
    <div className="app-shell" style={{ textAlign: 'center', padding: '100px 20px', color: '#8E8E93' }}>
      Loading Hotspot Status...
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={null}>
      <StatusRedirect />
    </Suspense>
  );
}
