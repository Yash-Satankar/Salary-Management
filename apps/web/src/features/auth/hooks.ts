import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, login, logout } from './api';

export function useLogin() {
  return useMutation({ mutationFn: login });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    // Salary data must not linger in the cache after signing out.
    onSettled: () => queryClient.clear(),
  });
}

export function useCurrentUser() {
  return useQuery({ queryKey: ['auth', 'me'], queryFn: fetchCurrentUser });
}
