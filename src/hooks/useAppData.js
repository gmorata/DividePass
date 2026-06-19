import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const getActiveMembers = (group) =>
  group.members?.filter(m => m.status === 'active').length || 0;

const getMaxSize = (group, service) =>
  service?.max_group_size || group.max_size;

const getAvailableSpots = (group, service) => {
  const maxSize = getMaxSize(group, service);
  return Math.max(0, maxSize - getActiveMembers(group));
};

const isGroupFull = (group, service) =>
  getAvailableSpots(group, service) === 0;

export function useAppData() {
  const { user } = useAuth();
  const [streamingServices, setStreamingServices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentUser = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email
    };
  }, [user]);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [servicesRes, groupsRes, subscriptionsRes] = await Promise.all([
        supabase.from('streaming_services').select('*').eq('status', 'active').order('name'),
        supabase.from('groups').select(`
          *,
          service:service_id (*),
          members:group_members (*),
          credential:group_credentials (*)
        `).eq('status', 'open'),
        supabase.from('user_subscriptions').select(`
          *,
          group:group_id (*),
          service:service_id (*)
        `).eq('user_id', user.id).eq('status', 'active')
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (groupsRes.error) throw groupsRes.error;
      if (subscriptionsRes.error) throw subscriptionsRes.error;

      setStreamingServices(servicesRes.data || []);
      setGroups(groupsRes.data || []);
      setActiveSubscriptions(subscriptionsRes.data || []);
    } catch (err) {
      console.error('Error fetching app data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setLoading(true);

      try {
        const [servicesRes, groupsRes, subscriptionsRes] = await Promise.all([
          supabase.from('streaming_services').select('*').eq('status', 'active').order('name'),
          supabase.from('groups').select(`
            *,
            service:service_id (*),
            members:group_members (*),
            credential:group_credentials (*)
          `).eq('status', 'open'),
          supabase.from('user_subscriptions').select(`
            *,
            group:group_id (*),
            service:service_id (*)
          `).eq('user_id', user.id).eq('status', 'active')
        ]);

        if (servicesRes.error) throw servicesRes.error;
        if (groupsRes.error) throw groupsRes.error;
        if (subscriptionsRes.error) throw subscriptionsRes.error;

        if (!cancelled) {
          setStreamingServices(servicesRes.data || []);
          setGroups(groupsRes.data || []);
          setActiveSubscriptions(subscriptionsRes.data || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        load();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const getServiceById = useCallback((id) => {
    return streamingServices.find(s => s.id === id);
  }, [streamingServices]);

  const getActiveServices = useCallback(() => {
    return activeSubscriptions.map(sub => ({
      ...sub,
      service: sub.service,
      group: {
        ...sub.group,
        credentials: sub.group?.credential || {}
      }
    }));
  }, [activeSubscriptions]);

  const getAvailableServices = useCallback(() => {
    return streamingServices.map(service => {
      const serviceGroups = groups.filter(g => g.service_id === service.id);
      return {
        ...service,
        groups: serviceGroups,
        availableGroups: serviceGroups.filter(g =>
          !isGroupFull(g, service) && !g.members?.some(m => m.user_id === user?.id && m.status === 'active')
        )
      };
    });
  }, [streamingServices, groups, user?.id]);

  const getServiceGroups = useCallback((serviceIdOrSlug) => {
    const service = streamingServices.find(s => s.id === serviceIdOrSlug || s.slug === serviceIdOrSlug);
    const serviceGroups = groups.filter(g => g.service_id === service?.id);
    return { service, groups: serviceGroups };
  }, [streamingServices, groups]);

  const getGroupDetails = useCallback((groupId) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    const service = getServiceById(group.service_id);
    return {
      group: {
        ...group,
        credentials: group.credential || {}
      },
      service,
      spots: getAvailableSpots(group, service)
    };
  }, [groups, getServiceById]);

  const isSubscribedToService = useCallback((serviceIdOrSlug) => {
    const service = streamingServices.find(s => s.id === serviceIdOrSlug || s.slug === serviceIdOrSlug);
    return activeSubscriptions.some(sub => sub.service_id === service?.id);
  }, [activeSubscriptions, streamingServices]);

  const getUserSubscriptionForService = useCallback((serviceIdOrSlug) => {
    const service = streamingServices.find(s => s.id === serviceIdOrSlug || s.slug === serviceIdOrSlug);
    return activeSubscriptions.find(sub => sub.service_id === service?.id);
  }, [activeSubscriptions, streamingServices]);

  const joinGroup = useCallback(async (groupId) => {
    if (!user) return { error: 'Usuário não autenticado' };

    try {
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select(`
          *,
          service:service_id (max_group_size),
          members:group_members (*)
        `)
        .eq('id', groupId)
        .single();

      if (groupError) throw groupError;

      const maxSize = groupData.service?.max_group_size || groupData.max_size;
      const activeMembers = groupData.members?.filter(m => m.status === 'active').length || 0;

      if (activeMembers >= maxSize) {
        throw new Error('Grupo está cheio');
      }

      const alreadySubscribed = activeSubscriptions.some(
        sub => sub.service_id === groupData.service_id
      );

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          profile_name: 'Membro',
          status: 'active'
        });

      if (memberError) throw memberError;

      if (!alreadySubscribed) {
        const { error: subError } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            group_id: groupId,
            service_id: groupData.service_id,
            status: 'active',
            started_at: new Date().toISOString().split('T')[0],
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          });

        if (subError) throw subError;
      }

      await fetchData();
      return { error: null };
    } catch (err) {
      console.error('Error joining group:', err);
      return { error: err.message };
    }
  }, [user, activeSubscriptions, fetchData]);

  return {
    streamingServices,
    groups,
    activeSubscriptions,
    currentUser,
    loading,
    error,
    getActiveServices,
    getAvailableServices,
    getServiceGroups,
    getGroupDetails,
    isSubscribedToService,
    getUserSubscriptionForService,
    joinGroup,
    refresh: fetchData
  };
}
