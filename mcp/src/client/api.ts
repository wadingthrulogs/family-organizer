import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

import type { Env } from '../config/env.js';

interface RetryConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

export class OrganizerApiClient {
  private readonly axios: AxiosInstance;
  private readonly jar: CookieJar;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private loginPromise: Promise<void> | null = null;

  constructor(env: Pick<Env, 'ORGANIZER_BASE_URL' | 'ORGANIZER_USERNAME' | 'ORGANIZER_PASSWORD'>) {
    this.baseUrl = env.ORGANIZER_BASE_URL.replace(/\/+$/, '');
    this.username = env.ORGANIZER_USERNAME;
    this.password = env.ORGANIZER_PASSWORD;
    this.jar = new CookieJar();

    const instance = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      withCredentials: true,
      timeout: 15_000,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    // axios-cookiejar-support augments AxiosRequestConfig with `jar`, but
    // CreateAxiosDefaults / AxiosDefaults in axios 1.x don't pick up the
    // augmentation. Casting once here keeps the rest of the file strictly typed.
    (instance.defaults as Record<string, unknown>).jar = this.jar;
    this.axios = wrapper(instance);

    this.axios.interceptors.response.use(undefined, async (err: AxiosError) => {
      const cfg = err.config as RetryConfig | undefined;
      // Don't loop on /auth/login itself.
      const isLoginCall = (cfg?.url ?? '').includes('/auth/login');
      if (err.response?.status === 401 && cfg && !cfg._retried && !isLoginCall) {
        cfg._retried = true;
        // Force a fresh login: clear the dedup so we don't await a stale resolved promise.
        this.loginPromise = null;
        await this.login();
        return this.axios.request(cfg);
      }
      throw err;
    });
  }

  /** POST /auth/login. Deduplicates concurrent callers. */
  private login(): Promise<void> {
    if (!this.loginPromise) {
      this.loginPromise = this.axios
        .post('/auth/login', { username: this.username, password: this.password })
        .then(() => undefined)
        .catch((e) => {
          this.loginPromise = null;
          throw e;
        });
    }
    return this.loginPromise;
  }

  private async ensureSession(): Promise<void> {
    const cookies = await this.jar.getCookies(`${this.baseUrl}/api/v1`);
    if (!cookies.some((c) => c.key === 'connect.sid')) {
      await this.login();
    }
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensureSession();
    const res = await this.axios.get<T>(url, { params });
    return res.data;
  }

  async post<T>(url: string, body?: unknown): Promise<T> {
    await this.ensureSession();
    const res = await this.axios.post<T>(url, body);
    return res.data;
  }

  async patch<T>(url: string, body?: unknown): Promise<T> {
    await this.ensureSession();
    const res = await this.axios.patch<T>(url, body);
    return res.data;
  }

  async del<T>(url: string): Promise<T> {
    await this.ensureSession();
    const res = await this.axios.delete<T>(url);
    return res.data;
  }
}
