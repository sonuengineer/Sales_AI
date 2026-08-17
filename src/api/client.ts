export type Role = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
export interface User { id: string; name: string; email: string; role: Role; }

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data as T;
}
