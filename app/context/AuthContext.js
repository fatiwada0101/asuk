'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch profile + wallet for a given user id
  const fetchUserData = async (userId) => {
    try {
      const [profileRes, walletRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle(),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (walletRes.data) setWallet(walletRes.data);
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  // Refresh wallet balance from DB
  const refreshWallet = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) setWallet(data);
  };

  // Listen for auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchUserData(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setWallet(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Real-time wallet balance subscription (updates UI instantaneously on webhook/deposit)
  useEffect(() => {
    if (!user?.id) return;

    const walletChannel = supabase
      .channel(`realtime-wallet-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setWallet(payload.new);
          }
        }
      )
      .on('broadcast', { event: 'wallet_update' }, (msg) => {
        if (msg?.payload && typeof msg.payload.balance !== 'undefined') {
          setWallet((prev) => ({
            ...(prev || {}),
            user_id: user.id,
            balance: msg.payload.balance,
            updated_at: msg.payload.timestamp || new Date().toISOString(),
          }));
        } else {
          refreshWallet();
        }
      })
      .subscribe();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshWallet();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', refreshWallet);
    }

    return () => {
      supabase.removeChannel(walletChannel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', refreshWallet);
      }
    };
  }, [user?.id]);

  // Sign up with email + password
  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) throw error;
    return data;
  };

  // Sign in with email + password
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
    setWallet(null);
  };

  const value = {
    user,
    profile,
    wallet,
    loading,
    signUp,
    signIn,
    signOut,
    refreshWallet,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
