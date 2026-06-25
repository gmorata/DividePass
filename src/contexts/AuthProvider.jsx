import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (name, email, phone, password, referralCode = null) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone
        }
      }
    });

    if (error) throw error;

    if (data?.user) {
      const code = data.user.id.substring(0, 8).toUpperCase();
      await supabase.from('user_referral_codes').insert({
        user_id: data.user.id,
        referral_code: code
      });

      // Register customers on all payment gateways (fire and forget)
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData?.session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ user_id: data.user.id }),
        });
      } catch (e) {
        console.error('Customer registration error (non-blocking):', e);
      }

      if (referralCode) {
        const { data: referrerData } = await supabase
          .from('user_referral_codes')
          .select('user_id')
          .eq('referral_code', referralCode)
          .maybeSingle();

        if (referrerData) {
          await supabase.from('referrals').insert({
            referrer_id: referrerData.user_id,
            invitee_id: data.user.id,
            referral_code: referralCode,
            status: 'pending',
            points: 5
          });

          const inviteeCode = data.user.id.substring(0, 8).toUpperCase();
          const { data: inviteeCodeData } = await supabase
            .from('user_referral_codes')
            .select('id')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (inviteeCodeData) {
            await supabase.from('referrals').insert({
              referrer_id: data.user.id,
              invitee_id: data.user.id,
              referral_code: inviteeCode,
              status: 'completed',
              points: 5,
              completed_at: new Date().toISOString()
            });
          }
        }
      }
    }

    return data;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAuthenticated: !!user,
    isAdmin: profile?.role === 'admin',
    signIn,
    signUp,
    signOut,
    refreshProfile: useCallback(() => user && fetchProfile(user.id), [user, fetchProfile])
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
