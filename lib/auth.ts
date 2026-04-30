import api from './api'
import type { User, LoginResponse } from '@/types'

export async function requestOtp(email: string): Promise<void> {
  await api.post('/auth/request-otp', { email })
}

export async function verifyOtp(email: string, otp_code: string): Promise<void> {
  const { data } = await api.post<LoginResponse>('/auth/verify-otp', { email, otp_code })
  localStorage.setItem('cosh_token', data.access_token)
  const me = await api.get<User>('/auth/me')
  localStorage.setItem('cosh_user', JSON.stringify(me.data))
}

export async function login(email: string, password: string): Promise<void> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
  localStorage.setItem('cosh_token', data.access_token)
  const me = await api.get<User>('/auth/me')
  localStorage.setItem('cosh_user', JSON.stringify(me.data))
}

export function logout(): void {
  localStorage.removeItem('cosh_token')
  localStorage.removeItem('cosh_user')
  window.location.href = '/login'
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('cosh_user')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('cosh_token')
}

export function hasRole(user: User | null, ...roles: string[]): boolean {
  if (!user) return false
  return user.roles.some((r) => r.status === 'ACTIVE' && roles.includes(r.role))
}

export function isAdmin(user: User | null): boolean {
  return hasRole(user, 'ADMIN')
}
